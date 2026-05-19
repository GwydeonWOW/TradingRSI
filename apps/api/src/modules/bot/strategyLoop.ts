import { prisma } from '../../infrastructure/db/prisma.js';
import { logger } from '../../infrastructure/logger/index.js';
import { evaluateSignal, type MarketData } from '../../domain/strategy/evaluate.js';
import { evaluateRisk, type RiskContext } from '../../domain/risk/evaluate.js';
import { executeSimulation } from '../../domain/execution/simulation.js';
import {
  placeBinanceOrder,
  processOrderResponse,
  adjustQuantity,
  getSymbolInfo,
} from '../../domain/execution/binance.js';
import { assertLiveGuard, isLiveEnvironment } from '../../domain/guards/index.js';
import { createAuditEvent } from '../audit/helpers.js';
import { getBotState, setBotState } from './state.js';
import { getBinanceCredentials } from '../../infrastructure/credentials/index.js';
import type { StrategyConfig } from '@cryptorsi/shared';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import { calculateBtcStability } from '@cryptorsi/liquidity';
import { fetchBtcDailyKlines } from '../liquidity/collectors.js';

export interface BotEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// In-memory event log (last 100 events)
const eventLog: BotEvent[] = [];
const MAX_EVENTS = 100;

function addEvent(type: string, data: Record<string, unknown>) {
  eventLog.push({ type, timestamp: Date.now(), data });
  if (eventLog.length > MAX_EVENTS) eventLog.shift();
}

export function getEvents(limit = 50): BotEvent[] {
  return eventLog.slice(-limit);
}

/**
 * Ejecuta un ciclo de evaluacion de la estrategia activa.
 * En modo simulation usa datos simulados. En modo binance_demo usa datos reales de Binance.
 */
export async function runEvaluationCycle(): Promise<void> {
  const botState = getBotState();
  if (botState.status !== 'running' || !botState.activeStrategyId) {
    return;
  }

  try {
    // Fetch active strategy with latest version
    const strategy = await prisma.strategy.findUnique({
      where: { id: botState.activeStrategyId },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
      },
    });

    if (!strategy || strategy.status !== 'active' || strategy.versions.length === 0) {
      setBotState({ status: 'error', errorMessage: 'Active strategy not found or not active' });
      return;
    }

    const config = strategy.versions[0]!.config as unknown as StrategyConfig;
    const versionId = strategy.versions[0]!.id;

    // Hard guard: block live trading unless explicitly enabled
    if (isLiveEnvironment(strategy.environment)) {
      try {
        assertLiveGuard(strategy.environment);
      } catch {
        setBotState({ status: 'error', errorMessage: 'Live trading is blocked. Set ALLOW_LIVE_TRADING=true to enable.' });
        addEvent('guard_blocked', { reason: 'assertLiveGuard failed' });
        return;
      }
      if (process.env.ALLOW_LIVE_TRADING !== 'true') {
        setBotState({ status: 'error', errorMessage: 'Live trading is blocked. Set ALLOW_LIVE_TRADING=true to enable.' });
        addEvent('guard_blocked', { reason: 'ALLOW_LIVE_TRADING not set' });
        return;
      }
    }

    // Evaluate each symbol
    for (const symbol of config.symbols) {
      // Collect data for all timeframes (config + any multi-TF condition timeframes)
      const timeframeDataMap = new Map<string, number[]>();
      let primaryMarketData: MarketData | null = null;
      const primaryTimeframe = config.timeframes[0] ?? '1h';
      let fetchFailed = false;

      const extraTfs = (config.entry.multiTimeframeConditions ?? [])
        .map((c) => c.timeframe)
        .filter((tf) => !config.timeframes.includes(tf));
      const allTimeframes = [...config.timeframes, ...extraTfs];

      for (const timeframe of allTimeframes) {
        let marketData: MarketData;

        if (strategy.mode === 'simulation') {
          marketData = generateSimulationData(symbol, timeframe);
        } else {
          const env = (process.env.BINANCE_ENV ?? 'demo') as 'demo' | 'testnet' | 'production';
          const creds = await getBinanceCredentials(env);
          if (!creds) {
            addEvent('error', { message: 'Binance credentials not configured. Configure them in Settings.' });
            fetchFailed = true;
            break;
          }

          try {
            const envConfig = BINANCE_ENVIRONMENTS[env];
            const url = `${envConfig.restBaseUrl}/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=50`;
            const response = await fetch(url);
            if (!response.ok) {
              const body = await response.text();
              throw new Error(`Binance API error ${response.status}: ${body}`);
            }
            const raw = await response.json() as (string | number)[][];
            const closes = raw.map(k => parseFloat(k[4] as string));
            const opens = raw.map(k => parseFloat(k[1] as string));
            const currentPrice = parseFloat(raw[raw.length - 1]![4] as string);
            marketData = { symbol, timeframe, closes, opens, currentPrice, timestamp: Date.now() };
            addEvent('binance_data', { symbol, timeframe, price: currentPrice, candles: raw.length });
          } catch (err) {
            addEvent('error', { message: 'Failed to fetch Binance data' });
            logger.error({ err, symbol, timeframe }, 'Failed to fetch Binance klines, skipping cycle');
            fetchFailed = true;
            break;
          }
        }

        timeframeDataMap.set(timeframe, marketData.closes);
        if (timeframe === primaryTimeframe) {
          primaryMarketData = marketData;
        }
      }

      if (fetchFailed || !primaryMarketData) continue;

        // Evaluate signal on primary timeframe with all timeframe data
        let signal = evaluateSignal(config, primaryMarketData, timeframeDataMap);

        // Don't emit SELL if no open position for this symbol
        if (signal.signalType === 'SELL_SIGNAL') {
          const hasPosition = await prisma.position.findFirst({
            where: { strategyId: strategy.id, symbol, status: 'open' },
            select: { id: true },
          });
          if (!hasPosition) {
            signal = { ...signal, signalType: 'HOLD', reasons: [...signal.reasons, 'No open position to sell'] };
          }
        }

        // BTC stability gate: block BUY signals when BTC is unstable
        if (signal.signalType === 'BUY_SIGNAL' && config.btcStability?.enabled) {
          try {
            const btcCandles = await fetchBtcDailyKlines(60);
            if (btcCandles.length >= 30) {
              const stability = calculateBtcStability(btcCandles, { minScore: config.btcStability.minScore });
              if (!stability.passed) {
                addEvent('btc_stability_blocked', { symbol, score: stability.score, minScore: stability.minScore });
                signal = {
                  ...signal,
                  signalType: 'BLOCKED_BY_ENVIRONMENT',
                  reasons: [...signal.reasons, `BTC stability ${stability.score}/${stability.maxScore} < ${stability.minScore} required`],
                };
              } else {
                addEvent('btc_stability_ok', { symbol, score: stability.score });
              }
            }
          } catch (err) {
            logger.warn({ err }, 'BTC stability check failed, allowing trade');
          }
        }

        // Signal dedup: skip if same symbol+type was created within cooldown
        if (signal.signalType === 'BUY_SIGNAL' || signal.signalType === 'SELL_SIGNAL') {
          const cooldownMs = (config.risk?.cooldownMinutes ?? 0) * 60 * 1000;
          if (cooldownMs > 0) {
            const recentSignal = await prisma.signal.findFirst({
              where: {
                strategyId: strategy.id,
                symbol,
                signalType: signal.signalType,
                createdAt: { gte: new Date(Date.now() - cooldownMs) },
              },
              select: { id: true },
            });
            if (recentSignal) {
              addEvent('signal_cooldown', { symbol, signalType: signal.signalType, rsi: signal.rsiValue, reason: `Deduplicated: ${signal.signalType} for ${symbol} within ${config.risk.cooldownMinutes}min cooldown` });
              continue;
            }
          }
        }

        // Only persist actionable signals (BUY/SELL) to DB
        // HOLD/BLOCKED are ephemeral — shown in event log only
        addEvent('signal', { symbol, timeframe: primaryTimeframe, signalType: signal.signalType, rsi: signal.rsiValue });

        if (signal.signalType !== 'BUY_SIGNAL' && signal.signalType !== 'SELL_SIGNAL') continue;

        const savedSignal = await prisma.signal.create({
          data: {
            strategyId: strategy.id,
            strategyVersionId: versionId,
            symbol,
            timeframe: primaryTimeframe,
            signalType: signal.signalType,
            rsiValue: signal.rsiValue,
            price: signal.price,
            payload: { reasons: signal.reasons, smaValue: signal.smaValue },
          },
        });

        // Apply risk and execute
        {
          // Get current positions for risk context
          const openPositions: Array<{
            id: string;
            symbol: string;
            strategyId: string;
            strategyVersionId: string;
            entryPrice: { toString(): string } | null;
            quantity: { toString(): string } | null;
            investedQuote: { toString(): string } | null;
            openedAt: Date | null;
          }> = await prisma.position.findMany({
            where: { strategyId: strategy.id, status: 'open' },
          });

          // Lookup last order timestamp for cooldown
          const lastOrder = await prisma.exchangeOrder.findFirst({
            where: { strategyId: strategy.id, symbol },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          });
          const lastTradeTimestamp = lastOrder?.createdAt?.getTime() ?? null;

          // Calculate daily loss from positions closed in last 24h
          const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const closedToday = await prisma.position.findMany({
            where: {
              strategyId: strategy.id,
              status: 'closed',
              closedAt: { gte: dayAgo },
            },
            select: { realizedPnl: true, investedQuote: true },
          });
          const dailyLoss = closedToday.reduce((sum, p) => sum + Number(p.realizedPnl ?? 0), 0);
          const dailyInvested = closedToday.reduce((sum, p) => sum + Number(p.investedQuote ?? 0), 0);
          const dailyLossPct = dailyInvested > 0 ? (Math.abs(dailyLoss) / dailyInvested) * 100 : 0;

          const riskCtx: RiskContext = {
            config,
            symbol,
            strategyStatus: strategy.status,
            strategyMode: strategy.mode,
            environment: strategy.environment,
            openPositionsCount: openPositions.length,
            openPositionsBySymbol: openPositions.filter((p) => p.symbol === symbol).length,
            totalExposure: openPositions.reduce((sum, p) => sum + Number(p.investedQuote ?? 0), 0),
            dailyLoss,
            dailyLossPct,
            lastTradeTimestamp,
            allowLiveTrading: process.env.ALLOW_LIVE_TRADING === 'true',
          };

          const riskResult = evaluateRisk(riskCtx);

          // Save decision
          const riskAllowed = riskResult.allowed;
          await prisma.decision.create({
            data: {
              signalId: savedSignal.id,
              decision: riskAllowed ? 'execute' : 'blocked',
              reason: riskAllowed ? 'Risk checks passed' : (!riskAllowed ? riskResult.reason : 'Unknown'),
              riskResult: { allowed: riskResult.allowed, checks: riskResult.checks } as any,
            },
          });

          if (!riskAllowed) {
            addEvent('risk_blocked', { symbol, reason: riskResult.reason });
            continue;
          }

          // Execute
          if (strategy.mode === 'signal_only') {
            // Paper trading: track hypothetical positions using live data
            const simPositions = openPositions.map((p) => ({
              id: p.id,
              symbol: p.symbol,
              side: 'BUY' as const,
              entryPrice: Number(p.entryPrice ?? 0),
              quantity: Number(p.quantity ?? 0),
              investedQuote: Number(p.investedQuote ?? 0),
              openedAt: p.openedAt?.getTime() ?? Date.now(),
              strategyId: p.strategyId,
              strategyVersionId: p.strategyVersionId,
            }));

            const result = executeSimulation(signal, config, simPositions);

            if (result.action === 'OPEN' && result.position) {
              const pos = result.position;
              await prisma.position.create({
                data: {
                  strategyId: strategy.id,
                  strategyVersionId: versionId,
                  symbol: pos.symbol,
                  status: 'open',
                  source: 'signal_only',
                  entryPrice: pos.entryPrice,
                  quantity: pos.quantity,
                  investedQuote: pos.investedQuote,
                  openedAt: new Date(pos.openedAt),
                },
              });
              addEvent('position_opened', { symbol, price: pos.entryPrice, invested: pos.investedQuote, source: 'signal_only' });
              await createAuditEvent({
                actorType: 'bot',
                eventType: 'position_opened_signal_only',
                entityType: 'position',
                payload: { symbol, price: pos.entryPrice, invested: pos.investedQuote },
              });
            } else if (result.action === 'CLOSE' && result.position) {
              const pos = result.position;
              await prisma.position.update({
                where: { id: pos.id },
                data: {
                  status: 'closed',
                  exitPrice: signal.price,
                  realizedPnl: result.realizedPnl,
                  realizedPnlPct: result.realizedPnlPct,
                  closedAt: new Date(),
                },
              });
              addEvent('position_closed', { symbol, pnl: result.realizedPnl, pnlPct: result.realizedPnlPct, source: 'signal_only' });
              await createAuditEvent({
                actorType: 'bot',
                eventType: 'position_closed_signal_only',
                entityType: 'position',
                entityId: pos.id,
                payload: { symbol, pnl: result.realizedPnl, pnlPct: result.realizedPnlPct },
              });
            }
          } else if (strategy.mode === 'simulation') {
            const simPositions = openPositions.map((p) => ({
              id: p.id,
              symbol: p.symbol,
              side: 'BUY' as const,
              entryPrice: Number(p.entryPrice ?? 0),
              quantity: Number(p.quantity ?? 0),
              investedQuote: Number(p.investedQuote ?? 0),
              openedAt: p.openedAt?.getTime() ?? Date.now(),
              strategyId: p.strategyId,
              strategyVersionId: p.strategyVersionId,
            }));

            const result = executeSimulation(signal, config, simPositions);

            if (result.action === 'OPEN' && result.position) {
              const pos = result.position;
              await prisma.position.create({
                data: {
                  strategyId: strategy.id,
                  strategyVersionId: versionId,
                  symbol: pos.symbol,
                  status: 'open',
                  source: 'simulation',
                  entryPrice: pos.entryPrice,
                  quantity: pos.quantity,
                  investedQuote: pos.investedQuote,
                  openedAt: new Date(pos.openedAt),
                },
              });
              addEvent('position_opened', { symbol, price: pos.entryPrice, invested: pos.investedQuote });
              await createAuditEvent({
                actorType: 'bot',
                eventType: 'position_opened',
                entityType: 'position',
                payload: { symbol, price: pos.entryPrice, invested: pos.investedQuote },
              });
            } else if (result.action === 'CLOSE' && result.position) {
              const pos = result.position;
              await prisma.position.update({
                where: { id: pos.id },
                data: {
                  status: 'closed',
                  exitPrice: signal.price,
                  realizedPnl: result.realizedPnl,
                  realizedPnlPct: result.realizedPnlPct,
                  closedAt: new Date(),
                },
              });
              addEvent('position_closed', { symbol, pnl: result.realizedPnl, pnlPct: result.realizedPnlPct });
              await createAuditEvent({
                actorType: 'bot',
                eventType: 'position_closed',
                entityType: 'position',
                entityId: pos.id,
                payload: { symbol, pnl: result.realizedPnl, pnlPct: result.realizedPnlPct },
              });
            }
          } else if (
            strategy.mode === 'binance_demo' &&
            !config.execution.dryRun
          ) {
            // ── Real Binance Demo execution ──
            const env = (process.env.BINANCE_ENV ?? 'demo') as 'demo' | 'testnet' | 'production';

            const creds = await getBinanceCredentials(env);
            if (!creds) {
              addEvent('error', { message: 'Binance credentials not configured. Configure them in Settings.' });
              continue;
            }

            const { apiKey, apiSecret } = creds;

            // Hard guard before placing any real order in a live environment
            if (isLiveEnvironment(env)) {
              try {
                assertLiveGuard(env);
              } catch {
                throw new Error('Live trading blocked by hard guard');
              }
              if (process.env.ALLOW_LIVE_TRADING !== 'true') {
                throw new Error('Live trading blocked by hard guard');
              }
            }

            const envConfig = BINANCE_ENVIRONMENTS[env];
            const clientOrderId = `cryptorsi_${strategy.id.slice(0, 8)}_${Date.now()}`;

            try {
              if (signal.signalType === 'BUY_SIGNAL') {
                const orderResponse = await placeBinanceOrder({
                  baseUrl: envConfig.restBaseUrl,
                  apiKey,
                  apiSecret,
                  symbol,
                  side: 'BUY',
                  type: 'MARKET',
                  quoteOrderQty: config.risk.quoteAmountPerTrade.toString(),
                  clientOrderId,
                });

                const processed = processOrderResponse(orderResponse);
                addEvent('order_placed', {
                  symbol,
                  side: 'BUY',
                  status: processed.status,
                  executedQty: processed.executedQty,
                  avgPrice: processed.avgPrice,
                });

                // Persist ExchangeOrder
                const exchangeOrder = await prisma.exchangeOrder.create({
                  data: {
                    strategyId: strategy.id,
                    strategyVersionId: versionId,
                    exchange: 'binance',
                    environment: env,
                    symbol,
                    side: 'BUY',
                    type: 'MARKET',
                    status: processed.status,
                    clientOrderId: orderResponse.clientOrderId,
                    exchangeOrderId: orderResponse.orderId.toString(),
                    quoteAmount: config.risk.quoteAmountPerTrade as number,
                    executedQuantity: processed.executedQty as number,
                    cumulativeQuoteQuantity: processed.cumulativeQuoteQty as number,
                    avgPrice: processed.avgPrice as number,
                    rawResponse: orderResponse as any,
                  },
                });

                // Persist ExchangeFills
                for (const fill of processed.fills) {
                  await prisma.exchangeFill.create({
                    data: {
                      exchangeOrderId: exchangeOrder.id,
                      tradeId: fill.tradeId,
                      price: fill.price as number,
                      quantity: fill.quantity as number,
                      quoteQuantity: fill.quoteQuantity as number,
                      commission: fill.commission as number,
                      commissionAsset: fill.commissionAsset,
                      executedAt: new Date(orderResponse.transactTime),
                      rawEvent: fill as any,
                    },
                  });
                }

                // Open position from real fills
                if (processed.executedQty > 0) {
                  const position = await prisma.position.create({
                    data: {
                      strategyId: strategy.id,
                      strategyVersionId: versionId,
                      symbol,
                      status: 'open',
                      source: 'binance_demo',
                      entryOrderId: exchangeOrder.id,
                      entryPrice: processed.avgPrice as number,
                      quantity: processed.executedQty as number,
                      investedQuote: processed.cumulativeQuoteQty as number,
                      openedAt: new Date(orderResponse.transactTime),
                    },
                  });
                  addEvent('position_opened', {
                    symbol,
                    price: processed.avgPrice,
                    invested: processed.cumulativeQuoteQty,
                    source: 'binance_demo',
                    orderId: exchangeOrder.id,
                  });
                  await createAuditEvent({
                    actorType: 'bot',
                    eventType: 'position_opened_binance_demo',
                    entityType: 'position',
                    entityId: position.id,
                    payload: {
                      symbol,
                      price: processed.avgPrice,
                      invested: processed.cumulativeQuoteQty,
                      executedQty: processed.executedQty,
                      fillsCount: processed.fills.length,
                      orderId: exchangeOrder.id,
                    },
                  });
                }
              } else if (signal.signalType === 'SELL_SIGNAL') {
                // Find ALL open positions for this symbol
                const symbolPositions = openPositions.filter(p => p.symbol === symbol);
                if (symbolPositions.length === 0) {
                  addEvent('error', { message: `No open position to sell for ${symbol}` });
                  continue;
                }

                // Sum quantities across all open positions for this symbol
                const totalQty = symbolPositions.reduce((sum, p) => sum + Number(p.quantity ?? 0), 0);
                if (totalQty <= 0) {
                  addEvent('error', { message: `Total position quantity is 0 for ${symbol}` });
                  continue;
                }

                // Adjust quantity to LOT_SIZE
                const symbolInfo = await getSymbolInfo(envConfig.restBaseUrl, symbol);
                const adjustedQty = adjustQuantity(totalQty, symbolInfo.stepSize);

                if (adjustedQty <= 0) {
                  addEvent('error', { message: `Adjusted quantity is 0 for ${symbol} (stepSize: ${symbolInfo.stepSize})` });
                  continue;
                }

                const orderResponse = await placeBinanceOrder({
                  baseUrl: envConfig.restBaseUrl,
                  apiKey,
                  apiSecret,
                  symbol,
                  side: 'SELL',
                  type: 'MARKET',
                  quantity: adjustedQty.toString(),
                  clientOrderId,
                });

                const processed = processOrderResponse(orderResponse);
                addEvent('order_placed', {
                  symbol,
                  side: 'SELL',
                  status: processed.status,
                  executedQty: processed.executedQty,
                  avgPrice: processed.avgPrice,
                });

                // Persist ExchangeOrder
                const exchangeOrder = await prisma.exchangeOrder.create({
                  data: {
                    strategyId: strategy.id,
                    strategyVersionId: versionId,
                    exchange: 'binance',
                    environment: env,
                    symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    status: processed.status,
                    clientOrderId: orderResponse.clientOrderId,
                    exchangeOrderId: orderResponse.orderId.toString(),
                    requestedQuantity: adjustedQty as number,
                    executedQuantity: processed.executedQty as number,
                    cumulativeQuoteQuantity: processed.cumulativeQuoteQty as number,
                    avgPrice: processed.avgPrice as number,
                    rawResponse: orderResponse as any,
                  },
                });

                // Persist ExchangeFills
                for (const fill of processed.fills) {
                  await prisma.exchangeFill.create({
                    data: {
                      exchangeOrderId: exchangeOrder.id,
                      tradeId: fill.tradeId,
                      price: fill.price as number,
                      quantity: fill.quantity as number,
                      quoteQuantity: fill.quoteQuantity as number,
                      commission: fill.commission as number,
                      commissionAsset: fill.commissionAsset,
                      executedAt: new Date(orderResponse.transactTime),
                      rawEvent: fill as any,
                    },
                  });
                }

                // Close ALL positions for this symbol, distributing exit value proportionally
                if (processed.executedQty > 0) {
                  const exitPrice = processed.avgPrice as number;
                  const totalExitValue = processed.cumulativeQuoteQty;
                  const totalInvested = symbolPositions.reduce((sum, p) => sum + Number(p.investedQuote ?? 0), 0);

                  for (const pos of symbolPositions) {
                    const investedQuote = Number(pos.investedQuote ?? 0);
                    const shareRatio = totalInvested > 0 ? investedQuote / totalInvested : 1 / symbolPositions.length;
                    const positionExitValue = totalExitValue * shareRatio;
                    const realizedPnl = positionExitValue - investedQuote;
                    const realizedPnlPct = investedQuote > 0 ? (realizedPnl / investedQuote) * 100 : 0;

                    await prisma.position.update({
                      where: { id: pos.id },
                      data: {
                        status: 'closed',
                        exitOrderId: exchangeOrder.id,
                        exitPrice,
                        realizedPnl: realizedPnl as number,
                        realizedPnlPct: realizedPnlPct as number,
                        closedAt: new Date(),
                      },
                    });
                    addEvent('position_closed', {
                      symbol,
                      pnl: realizedPnl,
                      pnlPct: realizedPnlPct,
                      source: 'binance_demo',
                      orderId: exchangeOrder.id,
                    });
                    await createAuditEvent({
                      actorType: 'bot',
                      eventType: 'position_closed_binance_demo',
                      entityType: 'position',
                      entityId: pos.id,
                      payload: {
                        symbol,
                        pnl: realizedPnl,
                        pnlPct: realizedPnlPct,
                        exitPrice,
                        exitValue: positionExitValue,
                        orderId: exchangeOrder.id,
                      },
                    });
                  }
                }
              }
            } catch (err) {
              addEvent('order_error', { symbol, side: signal.signalType === 'BUY_SIGNAL' ? 'BUY' : 'SELL', message: 'Order execution failed' });
              logger.error({ err, symbol, signalType: signal.signalType }, 'Binance order execution failed');
              await createAuditEvent({
                actorType: 'bot',
                eventType: 'order_error',
                entityType: 'order',
                payload: { symbol, side: signal.signalType === 'BUY_SIGNAL' ? 'BUY' : 'SELL', error: 'Order execution failed' },
              });
            }
          } else if (strategy.mode === 'binance_demo_dry_run' || (strategy.mode !== 'simulation' && config.execution.dryRun)) {
            // Binance Demo dry-run: validate order with /api/v3/order/test
            const env = (process.env.BINANCE_ENV ?? 'demo') as 'demo' | 'testnet' | 'production';

            const creds = await getBinanceCredentials(env);
            if (!creds) {
              addEvent('error', { message: 'Binance credentials not configured. Configure them in Settings.' });
            } else if (signal.signalType === 'BUY_SIGNAL') {
              const { apiKey, apiSecret } = creds;
              try {
                const envConfig = BINANCE_ENVIRONMENTS[env];

                // Build signed test order request
                const orderParams: Record<string, string> = {
                  symbol,
                  side: 'BUY',
                  type: 'MARKET',
                  quoteOrderQty: config.risk.quoteAmountPerTrade.toString(),
                  newClientOrderId: `cryptorsi_test_${strategy.id}_${Date.now()}`,
                  newOrderRespType: 'FULL',
                  timestamp: Date.now().toString(),
                  recvWindow: '5000',
                };
                const qs = new URLSearchParams(orderParams).toString();
                const crypto = await import('node:crypto');
                const signature = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
                const signedQs = `${qs}&signature=${signature}`;

                const testUrl = `${envConfig.restBaseUrl}/v3/order/test?${signedQs}`;
                const testResponse = await fetch(testUrl, {
                  method: 'POST',
                  headers: { 'X-MBX-APIKEY': apiKey },
                });
                if (!testResponse.ok) {
                  const body = await testResponse.text();
                  throw new Error(`Binance order test error ${testResponse.status}: ${body}`);
                }

                addEvent('order_test_passed', { symbol, side: 'BUY', quoteAmount: config.risk.quoteAmountPerTrade });

                // Create simulated position (dry-run doesn't create real orders)
                const investedQuote = config.risk.quoteAmountPerTrade;
                const quantity = investedQuote / signal.price;
                await prisma.position.create({
                  data: {
                    strategyId: strategy.id,
                    strategyVersionId: versionId,
                    symbol,
                    status: 'open',
                    source: 'binance_demo_dry_run',
                    entryPrice: signal.price,
                    quantity,
                    investedQuote,
                    openedAt: new Date(),
                  },
                });
                addEvent('position_opened', { symbol, price: signal.price, source: 'dry_run' });
                await createAuditEvent({
                  actorType: 'bot',
                  eventType: 'position_opened_dry_run',
                  entityType: 'position',
                  payload: { symbol, price: signal.price, investedQuote, source: 'binance_demo_dry_run' },
                });
              } catch (err) {
                addEvent('order_test_failed', { symbol, message: 'Order test failed' });
                logger.error({ err, symbol }, 'Order test failed');
              }
            }
          }
        }

        setBotState({
          lastEvaluationAt: Date.now(),
          lastSignalType: signal.signalType,
          cycleCount: botState.cycleCount + 1,
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err }, 'Evaluation cycle failed');
    setBotState({ status: 'error', errorMessage: message });
    addEvent('error', { message: 'Evaluation cycle failed' });
  }
}

/**
 * Genera datos de mercado simulados para modo simulation.
 * Produce precios con movimiento browniano geometrico simple.
 */
function generateSimulationData(symbol: string, _timeframe: string): MarketData {
  // Base prices for known symbols
  const basePrices: Record<string, number> = {
    BTCUSDT: 65000,
    ETHUSDT: 3500,
    SOLUSDT: 150,
    BNBUSDT: 600,
  };
  const base = basePrices[symbol] ?? 100;

  // Generate 50 candles with random walk
  const closes: number[] = [base];
  const opens: number[] = [base];
  for (let i = 1; i < 50; i++) {
    const volatility = 0.02;
    const change = closes[i - 1]! * volatility * (Math.random() - 0.5) * 2;
    opens.push(closes[i - 1]!);
    closes.push(closes[i - 1]! + change);
  }

  return {
    symbol,
    timeframe: _timeframe,
    closes,
    opens,
    currentPrice: closes[closes.length - 1]!,
    timestamp: Date.now(),
  };
}
