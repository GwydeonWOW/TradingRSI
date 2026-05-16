import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/db/prisma.js';
import { logger } from '../../infrastructure/logger/index.js';
import { calculateLiquidityHealth, calculateBtcStability } from '@cryptorsi/liquidity';
import { collectLiquidityData, fetchBtcDailyKlines } from './collectors.js';

function validateSymbol(symbol: string): boolean {
  return /^[A-Z]{2,20}$/.test(symbol);
}

export async function liquidityRoutes(app: FastifyInstance) {
  // GET /api/liquidity/:symbol/current
  app.get('/api/liquidity/:symbol/current', async (request, reply) => {
    try {
      const { symbol } = request.params as { symbol: string };
      if (!validateSymbol(symbol)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION', message: 'Invalid symbol format' },
        });
      }

      const query = request.query as Record<string, string | undefined>;
      const side = query['side'] === 'SELL' ? 'SELL' : 'BUY';
      const quoteAmount = Math.max(1, Number(query['quoteAmount']) || 100);

      const { input, latencyMs } = await collectLiquidityData(symbol, side, quoteAmount);
      const result = calculateLiquidityHealth(input);

      // Save snapshot (non-blocking — don't fail the request if DB is down)
      prisma.liquiditySnapshot.create({
        data: {
          symbol,
          environment: process.env.BINANCE_ENV ?? 'demo',
          score: result.score,
          confidence: result.confidence,
          state: result.state,
          executionScore: result.execution.score,
          activityScore: result.activity.score,
          fragilityScore: result.fragility.score,
          spreadBps: result.execution.metrics['spreadBps'] ?? null,
          slippageBps: result.execution.metrics['slippageBps'] ?? null,
          depth25bpsQuote: result.execution.metrics['depth25bpsQuote'] ?? null,
          quoteVolume24h: result.activity.metrics['quoteVolume24h'] ?? null,
          relativeVolume: result.activity.metrics['relativeVolume'] ?? null,
          volatility1h: result.fragility.metrics['realizedVolatility'] ?? null,
          apiLatencyMs: latencyMs,
          reasons: result.reasons as any,
        },
      }).catch((err) => {
        logger.warn({ err }, 'Failed to save liquidity snapshot (non-critical)');
      });

      return reply.code(200).send({
        success: true,
        data: {
          symbol,
          score: result.score,
          state: result.state,
          confidence: result.confidence,
          decision: result.decision,
          liquidityMultiplier: result.liquidityMultiplier,
          execution: result.execution,
          activity: result.activity,
          fragility: result.fragility,
          dataQuality: result.dataQuality,
          cryptoSystemic: input.cryptoSystemic ?? null,
          macro: input.macro ?? null,
          reasons: result.reasons,
        },
      });
    } catch (err) {
      logger.error(err, 'Failed to calculate liquidity');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to calculate liquidity' },
      });
    }
  });

  // GET /api/liquidity/:symbol/history
  app.get('/api/liquidity/:symbol/history', async (request, reply) => {
    try {
      const { symbol } = request.params as { symbol: string };
      if (!validateSymbol(symbol)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION', message: 'Invalid symbol format' },
        });
      }

      const query = request.query as Record<string, string | undefined>;
      const hours = Math.min(168, Math.max(1, Number(query['hours']) || 24));
      const limit = Math.min(500, Number(query['limit']) || 200);

      const snapshots = await prisma.liquiditySnapshot.findMany({
        where: {
          symbol,
          createdAt: { gte: new Date(Date.now() - hours * 3600_000) },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return reply.code(200).send({ success: true, data: snapshots });
    } catch (err) {
      logger.error(err, 'Failed to fetch liquidity history');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch liquidity history' },
      });
    }
  });

  // POST /api/liquidity/:symbol/simulate-order
  app.post('/api/liquidity/:symbol/simulate-order', async (request, reply) => {
    try {
      const { symbol } = request.params as { symbol: string };
      if (!validateSymbol(symbol)) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION', message: 'Invalid symbol format' },
        });
      }

      const body = request.body as {
        side?: string;
        quoteAmount?: number;
      };

      const side = body.side === 'SELL' ? 'SELL' : 'BUY';
      const quoteAmount = Math.max(1, body.quoteAmount ?? 100);

      const { input } = await collectLiquidityData(symbol, side, quoteAmount);
      const result = calculateLiquidityHealth(input);

      const mid = (input.execution.bestBid + input.execution.bestAsk) / 2;

      return reply.code(200).send({
        success: true,
        data: {
          symbol,
          side,
          quoteAmount,
          mid,
          estimatedSlippageBps: result.execution.metrics['slippageBps'],
          depthCoverage: result.execution.metrics['depthCoverage'],
          score: result.score,
          state: result.state,
          decision: result.decision,
          recommendation: result.decision === 'ALLOW' ? 'ORDER CAN PROCEED' :
            result.decision === 'REDUCE' ? 'REDUCE ORDER SIZE' : 'ORDER BLOCKED',
        },
      });
    } catch (err) {
      logger.error(err, 'Failed to simulate order');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to simulate order' },
      });
    }
  });

  // GET /api/liquidity/btc-stability
  app.get('/api/liquidity/btc-stability', async (_request, reply) => {
    try {
      const candles = await fetchBtcDailyKlines(60);
      if (candles.length < 30) {
        return reply.code(503).send({
          success: false,
          error: { code: 'INSUFFICIENT_DATA', message: 'Not enough BTC daily data' },
        });
      }
      const result = calculateBtcStability(candles);
      return reply.code(200).send({ success: true, data: result });
    } catch (err) {
      logger.error(err, 'Failed to calculate BTC stability');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to calculate BTC stability' },
      });
    }
  });
}
