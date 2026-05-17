import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/db/prisma.js';
import { logger } from '../../infrastructure/logger/index.js';
import { createAuditEvent } from '../audit/helpers.js';
import { runBacktest, runMultiSymbolBacktest, type BacktestCandle, type BacktestParams } from '../../domain/backtest/engine.js';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import type { StrategyConfig } from '@cryptorsi/shared';

type BinanceEnv = 'demo' | 'testnet' | 'production';

function getBaseUrl(): string {
  const env = (process.env.BINANCE_ENV ?? 'demo') as BinanceEnv;
  return BINANCE_ENVIRONMENTS[env].restBaseUrl;
}

function intervalToMs(interval: string): number {
  const m = interval.match(/^(\d+)(m|h|d)$/);
  if (!m) return 3600000;
  const n = parseInt(m[1]!);
  if (m[2] === 'm') return n * 60000;
  if (m[2] === 'h') return n * 3600000;
  return n * 86400000;
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

    const lastOpenTime = data[data.length - 1]![0] as number;
    currentStart = lastOpenTime + 1;

    if (data.length < 1000) break;
  }

  return allCandles;
}

export async function backtestRoutes(app: FastifyInstance) {
  // POST /api/backtests - Run a new backtest with shared capital pool
  app.post('/api/backtests', async (request, reply) => {
    try {
      const body = request.body as {
        strategyId: string;
        strategyVersionId?: string;
        interval: string;
        startDate: string;
        endDate: string;
        initialCapital?: number;
        commissionRate?: number;
      };

      if (!body.strategyId || !body.interval || !body.startDate || !body.endDate) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'strategyId, interval, startDate, endDate are required' },
        });
      }

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
        config = version.config as unknown as StrategyConfig;
      } else {
        if (strategy.versions.length === 0) {
          return reply.code(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Strategy has no versions' },
          });
        }
        versionId = strategy.versions[0]!.id;
        config = strategy.versions[0]!.config as unknown as StrategyConfig;
      }

      const startDate = new Date(body.startDate);
      const endDate = new Date(body.endDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid date format' },
        });
      }

      const symbols = config.symbols;
      const initialCapital = body.initialCapital ?? 1000;
      const commissionRate = body.commissionRate ?? 0.001;

      // Calculate warm-up period based on strategy indicators
      const warmupCandles = Math.max(
        config.entry.useSmaFilter ? (config.entry.smaPeriod ?? 200) : 0,
        50, // minimum warm-up for RSI + divergence detection
      );
      const warmupMs = warmupCandles * intervalToMs(body.interval);

      // Fetch all symbols with warm-up data
      const symbolsData: Array<{ symbol: string; candles: BacktestCandle[] }> = [];
      for (const symbol of symbols) {
        try {
          const candles = await fetchHistoricalKlines(
            symbol, body.interval,
            startDate.getTime() - warmupMs,
            endDate.getTime(),
          );
          if (candles.length >= 20) {
            symbolsData.push({ symbol, candles });
          }
        } catch {
          // Skip symbols with fetch errors
        }
      }

      if (symbolsData.length === 0) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INSUFFICIENT_DATA', message: 'No candle data available for any symbol' },
        });
      }

      // Run multi-symbol backtest with shared capital
      const result = runMultiSymbolBacktest(config, symbolsData, {
        startTimestampMs: startDate.getTime(),
        initialCapital,
        commissionRate,
      });

      // Build per-symbol breakdown for display
      const perSymbol: Record<string, { trades: typeof result.trades; totalPnl: number }> = {};
      for (const trade of result.trades) {
        if (!perSymbol[trade.symbol]) {
          perSymbol[trade.symbol] = { trades: [], totalPnl: 0 };
        }
        perSymbol[trade.symbol]!.trades.push(trade);
        perSymbol[trade.symbol]!.totalPnl += trade.pnl;
      }

      // Save as audit event
      await createAuditEvent({
        actorType: 'user',
        eventType: 'backtest.run',
        entityType: 'strategy',
        entityId: strategy.id,
        payload: {
          strategyVersionId: versionId,
          symbols,
          interval: body.interval,
          startDate: body.startDate,
          endDate: body.endDate,
          initialCapital,
          commissionRate,
          totalTrades: result.metrics.totalTrades,
          totalPnl: result.metrics.totalPnl,
          winRate: result.metrics.winRate,
          maxDrawdown: result.metrics.maxDrawdown,
          sharpeRatio: result.metrics.sharpeRatio,
        },
      }).catch(() => {});

      return reply.code(200).send({
        success: true,
        data: {
          metrics: result.metrics,
          trades: result.trades,
          equityCurve: result.equityCurve,
          perSymbol,
          symbols,
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

      let results: Array<Record<string, unknown>> = events.map((e: { id: string; createdAt: Date; payload: unknown }) => ({
        id: e.id,
        createdAt: e.createdAt,
        ...(e.payload as Record<string, unknown>),
      }));

      if (symbol) {
        results = results.filter((r: Record<string, unknown>) => {
          const syms = r.symbols as string[] | undefined;
          return syms?.includes(symbol);
        });
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

      // Calculate warm-up for both configs
      const configA = versionA.config as unknown as StrategyConfig;
      const configB = versionB.config as unknown as StrategyConfig;
      const warmupA = Math.max(configA.entry.useSmaFilter ? (configA.entry.smaPeriod ?? 200) : 0, 50);
      const warmupB = Math.max(configB.entry.useSmaFilter ? (configB.entry.smaPeriod ?? 200) : 0, 50);
      const warmupMs = Math.max(warmupA, warmupB) * intervalToMs(query.interval);

      // Fetch candles with warm-up
      const candles = await fetchHistoricalKlines(
        query.symbol,
        query.interval,
        startDate.getTime() - warmupMs,
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

      const paramsA = { ...baseParams, strategyVersionId: versionA.id };
      const paramsB = { ...baseParams, strategyVersionId: versionB.id };

      const resultA = runBacktest(configA, candles, paramsA);
      const resultB = runBacktest(configB, candles, paramsB);

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
