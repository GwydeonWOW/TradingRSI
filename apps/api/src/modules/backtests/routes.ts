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
  // POST /api/backtests - Run a new backtest across all strategy symbols
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

      // Run backtest for each symbol and aggregate results
      const perSymbolResults: Record<string, { metrics: import('../../domain/backtest/engine.js').BacktestMetrics; trades: import('../../domain/backtest/engine.js').BacktestTrade[]; equityCurve: Array<{ time: number; equity: number }>; candleCount: number }> = {};
      const allTrades: import('../../domain/backtest/engine.js').BacktestTrade[] = [];

      for (const symbol of symbols) {
        try {
          const candles = await fetchHistoricalKlines(symbol, body.interval, startDate.getTime(), endDate.getTime());
          if (candles.length < 20) {
            perSymbolResults[symbol] = { metrics: emptyMetrics(), trades: [], equityCurve: [], candleCount: candles.length };
            continue;
          }

          const params: BacktestParams = {
            strategyId: strategy.id,
            strategyVersionId: versionId,
            symbol,
            interval: body.interval,
            startDate,
            endDate,
            initialCapital,
            commissionRate,
          };

          const result = runBacktest(config, candles, params);
          perSymbolResults[symbol] = { metrics: result.metrics, trades: result.trades, equityCurve: result.equityCurve, candleCount: candles.length };
          allTrades.push(...result.trades);
        } catch {
          perSymbolResults[symbol] = { metrics: emptyMetrics(), trades: [], equityCurve: [], candleCount: 0 };
        }
      }

      // Aggregate metrics across all symbols
      const totalTrades = allTrades.length;
      const winningTrades = allTrades.filter((t) => t.pnl > 0).length;
      const losingTrades = allTrades.filter((t) => t.pnl <= 0).length;
      const totalPnl = allTrades.reduce((sum, t) => sum + t.pnl, 0);
      const totalPnlPct = initialCapital > 0 ? (totalPnl / initialCapital) * 100 : 0;
      const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
      const grossProfit = allTrades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
      const grossLoss = Math.abs(allTrades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
      const pnlValues = allTrades.map((t) => t.pnlPct);
      const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
      const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;
      const sharpeRatio = totalTrades >= 2 ? calcSharpe(pnlValues) : 0;
      const maxDrawdown = Math.max(...Object.values(perSymbolResults).map((r) => r.metrics.maxDrawdown), 0);
      const finalCapital = initialCapital + totalPnl;

      const aggregatedMetrics: import('../../domain/backtest/engine.js').BacktestMetrics = {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate,
        totalPnl,
        totalPnlPct,
        maxDrawdown,
        maxDrawdownDuration: 0,
        profitFactor,
        avgTradeDuration: 0,
        bestTrade,
        worstTrade,
        avgWin: winningTrades > 0 ? allTrades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnlPct, 0) / winningTrades : 0,
        avgLoss: losingTrades > 0 ? allTrades.filter((t) => t.pnl <= 0).reduce((s, t) => s + t.pnlPct, 0) / losingTrades : 0,
        sharpeRatio,
        finalCapital,
      };

      // Build merged equity curve across all symbols
      const mergedCurve = mergeEquityCurves(Object.values(perSymbolResults).map((r) => r.equityCurve), initialCapital);

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
          totalTrades,
          totalPnl,
          winRate,
          maxDrawdown,
          sharpeRatio,
        },
      }).catch(() => {});

      return reply.code(200).send({
        success: true,
        data: {
          metrics: aggregatedMetrics,
          trades: allTrades.sort((a, b) => a.entryTime - b.entryTime),
          equityCurve: mergedCurve,
          perSymbol: perSymbolResults,
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

      const resultA = runBacktest(versionA.config as unknown as StrategyConfig, candles, paramsA);
      const resultB = runBacktest(versionB.config as unknown as StrategyConfig, candles, paramsB);

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

function emptyMetrics(): import('../../domain/backtest/engine.js').BacktestMetrics {
  return {
    totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
    totalPnl: 0, totalPnlPct: 0, maxDrawdown: 0, maxDrawdownDuration: 0,
    profitFactor: 0, avgTradeDuration: 0, bestTrade: 0, worstTrade: 0,
    avgWin: 0, avgLoss: 0, sharpeRatio: 0, finalCapital: 0,
  };
}

function calcSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  return (mean / stdDev) * Math.sqrt(252);
}

function mergeEquityCurves(
  curves: Array<Array<{ time: number; equity: number }>>,
  initialCapital: number,
): Array<{ time: number; equity: number }> {
  if (curves.length === 0) return [];
  if (curves.length === 1) return curves[0]!;

  // Each symbol's curve tracks capital + unrealizedPnl independently.
  // Since each run starts with the full initialCapital, the delta from
  // initial represents each symbol's contribution. We sum those deltas
  // to get the combined equity, but cap at one initialCapital base.
  const allTimes = new Set<number>();
  for (const curve of curves) {
    for (const point of curve) {
      allTimes.add(point.time);
    }
  }

  const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

  // Build per-curve time->equity maps with forward-fill for missing times
  const curveMaps = curves.map((curve) => {
    const map = new Map<number, number>();
    for (const point of curve) {
      map.set(point.time, point.equity);
    }
    return map;
  });

  const result: Array<{ time: number; equity: number }> = [];
  const lastKnown = new Array<number | null>(curves.length).fill(null);

  for (const t of sortedTimes) {
    let totalDelta = 0;
    for (let c = 0; c < curves.length; c++) {
      const val = curveMaps[c]!.get(t);
      if (val !== undefined) {
        lastKnown[c] = val;
      }
      // Delta from initial = this symbol's PnL contribution
      if (lastKnown[c] !== null) {
        totalDelta += lastKnown[c]! - initialCapital;
      }
    }
    result.push({ time: t, equity: initialCapital + totalDelta });
  }

  return result;
}
