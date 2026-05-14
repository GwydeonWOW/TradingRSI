import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/db/prisma.js';
import { logger } from '../../infrastructure/logger/index.js';
import { createAuditEvent } from '../audit/helpers.js';
import { runBacktest, type BacktestCandle, type BacktestParams } from '../../domain/backtest/engine.js';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import type { StrategyConfig } from '@cryptorsi/shared';

type BinanceEnv = 'demo' | 'testnet' | 'production';

function getBaseUrl(): string {
  const env = (process.env.BINANCE_ENV ?? 'demo') as BinanceEnv;
  return BINANCE_ENVIRONMENTS[env].restBaseUrl;
}

/**
 * Fetch historical klines from Binance REST API.
 * Paginates in chunks of up to 1000 candles.
 */
async function fetchHistoricalKlines(
  symbol: string,
  interval: string,
  startTimeMs: number,
  endTimeMs: number,
): Promise<BacktestCandle[]> {
  const baseUrl = getBaseUrl();
  const allCandles: BacktestCandle[] = [];
  let currentStart = startTimeMs;

  while (currentStart < endTimeMs) {
    const params = new URLSearchParams({
      symbol,
      interval,
      startTime: currentStart.toString(),
      endTime: endTimeMs.toString(),
      limit: '1000',
    });

    const url = `${baseUrl}/v3/klines?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Binance klines API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as (string | number)[][];

    if (data.length === 0) break;

    for (const k of data) {
      allCandles.push({
        openTime: k[0] as number,
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
      });
    }

    // Move start time past the last candle
    const lastOpenTime = data[data.length - 1]![0] as number;
    currentStart = lastOpenTime + 1;

    // If we got fewer than 1000, we've reached the end
    if (data.length < 1000) break;
  }

  return allCandles;
}

export async function backtestRoutes(app: FastifyInstance) {
  // POST /api/backtests - Run a new backtest
  app.post('/api/backtests', async (request, reply) => {
    try {
      const body = request.body as {
        strategyId: string;
        strategyVersionId?: string;
        symbol: string;
        interval: string;
        startDate: string;
        endDate: string;
        initialCapital?: number;
        commissionRate?: number;
      };

      if (!body.strategyId || !body.symbol || !body.interval || !body.startDate || !body.endDate) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'strategyId, symbol, interval, startDate, endDate are required' },
        });
      }

      // Fetch strategy and version
      const strategy = await prisma.strategy.findUnique({
        where: { id: body.strategyId },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      });

      if (!strategy) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Strategy not found' },
        });
      }

      // Determine version: use provided versionId or latest
      let versionId: string;
      let config: StrategyConfig;

      if (body.strategyVersionId) {
        const version = await prisma.strategyVersion.findUnique({
          where: { id: body.strategyVersionId },
        });
        if (!version || version.strategyId !== strategy.id) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid strategyVersionId' },
          });
        }
        versionId = version.id;
        config = version.config as StrategyConfig;
      } else {
        if (strategy.versions.length === 0) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Strategy has no versions' },
          });
        }
        versionId = strategy.versions[0]!.id;
        config = strategy.versions[0]!.config as StrategyConfig;
      }

      const startDate = new Date(body.startDate);
      const endDate = new Date(body.endDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid date format' },
        });
      }

      // Fetch historical klines
      const candles = await fetchHistoricalKlines(
        body.symbol,
        body.interval,
        startDate.getTime(),
        endDate.getTime(),
      );

      if (candles.length < 20) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INSUFFICIENT_DATA', message: `Only ${candles.length} candles available. Need at least 20.` },
        });
      }

      const params: BacktestParams = {
        strategyId: strategy.id,
        strategyVersionId: versionId,
        symbol: body.symbol,
        interval: body.interval,
        startDate,
        endDate,
        initialCapital: body.initialCapital ?? 1000,
        commissionRate: body.commissionRate ?? 0.001,
      };

      const result = runBacktest(config, candles, params);

      // Save as audit event
      await createAuditEvent({
        actorType: 'user',
        eventType: 'backtest.run',
        entityType: 'strategy',
        entityId: strategy.id,
        payload: {
          strategyVersionId: versionId,
          symbol: body.symbol,
          interval: body.interval,
          startDate: body.startDate,
          endDate: body.endDate,
          initialCapital: params.initialCapital,
          commissionRate: params.commissionRate,
          totalTrades: result.metrics.totalTrades,
          totalPnl: result.metrics.totalPnl,
          winRate: result.metrics.winRate,
          maxDrawdown: result.metrics.maxDrawdown,
          sharpeRatio: result.metrics.sharpeRatio,
        },
      });

      return reply.code(200).send({
        success: true,
        data: {
          metrics: result.metrics,
          trades: result.trades,
          equityCurve: result.equityCurve,
          candleCount: candles.length,
        },
      });
    } catch (err) {
      logger.error(err, 'Failed to run backtest');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to run backtest' },
      });
    }
  });

  // GET /api/backtests - List backtest results (from audit events)
  app.get('/api/backtests', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const limit = Math.min(100, Math.max(1, Number(query['limit']) || 20));
      const strategyId = query['strategyId'];
      const symbol = query['symbol'];

      const where: Record<string, unknown> = { eventType: 'backtest.run' };
      if (strategyId) where.entityId = strategyId;

      const events = await prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      // Filter by symbol in payload (Prisma Json filtering is limited)
      let results: Array<Record<string, unknown>> = events.map((e: { id: string; createdAt: Date; payload: unknown }) => ({
        id: e.id,
        createdAt: e.createdAt,
        ...(e.payload as Record<string, unknown>),
      }));

      if (symbol) {
        results = results.filter((r: Record<string, unknown>) => r.symbol === symbol);
      }

      return reply.code(200).send({
        success: true,
        data: results,
      });
    } catch (err) {
      logger.error(err, 'Failed to list backtests');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to list backtests' },
      });
    }
  });

  // GET /api/backtests/compare - Compare two strategy versions
  app.get('/api/backtests/compare', async (request, reply) => {
    try {
      const query = request.query as {
        strategyId?: string;
        versionA?: string;
        versionB?: string;
        symbol?: string;
        interval?: string;
        startDate?: string;
        endDate?: string;
      };

      if (!query.strategyId || !query.versionA || !query.versionB || !query.symbol || !query.interval || !query.startDate || !query.endDate) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'strategyId, versionA, versionB, symbol, interval, startDate, endDate are required' },
        });
      }

      // Fetch both versions
      const [versionA, versionB] = await Promise.all([
        prisma.strategyVersion.findUnique({ where: { id: query.versionA } }),
        prisma.strategyVersion.findUnique({ where: { id: query.versionB } }),
      ]);

      if (!versionA || !versionB) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'One or both versions not found' },
        });
      }

      if (versionA.strategyId !== query.strategyId || versionB.strategyId !== query.strategyId) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Version does not belong to the specified strategy' },
        });
      }

      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid date format' },
        });
      }

      // Fetch candles once (same market data for both)
      const candles = await fetchHistoricalKlines(
        query.symbol,
        query.interval,
        startDate.getTime(),
        endDate.getTime(),
      );

      if (candles.length < 20) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INSUFFICIENT_DATA', message: `Only ${candles.length} candles available. Need at least 20.` },
        });
      }

      const baseParams: BacktestParams = {
        strategyId: query.strategyId,
        strategyVersionId: '',
        symbol: query.symbol,
        interval: query.interval,
        startDate,
        endDate,
        initialCapital: 1000,
        commissionRate: 0.001,
      };

      // Run both backtests
      const paramsA = { ...baseParams, strategyVersionId: versionA.id };
      const paramsB = { ...baseParams, strategyVersionId: versionB.id };

      const resultA = runBacktest(versionA.config as StrategyConfig, candles, paramsA);
      const resultB = runBacktest(versionB.config as StrategyConfig, candles, paramsB);

      await createAuditEvent({
        actorType: 'user',
        eventType: 'backtest.compare',
        entityType: 'strategy',
        entityId: query.strategyId,
        payload: {
          versionA: query.versionA,
          versionB: query.versionB,
          symbol: query.symbol,
          interval: query.interval,
          startDate: query.startDate,
          endDate: query.endDate,
        },
      });

      return reply.code(200).send({
        success: true,
        data: {
          versionA: { versionId: versionA.id, version: versionA.version, metrics: resultA.metrics, trades: resultA.trades, equityCurve: resultA.equityCurve },
          versionB: { versionId: versionB.id, version: versionB.version, metrics: resultB.metrics, trades: resultB.trades, equityCurve: resultB.equityCurve },
          candleCount: candles.length,
        },
      });
    } catch (err) {
      logger.error(err, 'Failed to compare backtests');
      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to compare backtests' },
      });
    }
  });
}
