import { prisma } from '../../infrastructure/db/prisma.js';
import { logger } from '../../infrastructure/logger/index.js';
import { evaluateSignal, type MarketData } from '../../domain/strategy/evaluate.js';
import { evaluateRisk, type RiskContext } from '../../domain/risk/evaluate.js';
import { executeSimulation } from '../../domain/execution/simulation.js';
import { createAuditEvent } from '../audit/helpers.js';
import { getBotState, setBotState } from './state.js';
import type { StrategyConfig } from '@cryptorsi/shared';

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

    const config = strategy.versions[0]!.config as StrategyConfig;
    const versionId = strategy.versions[0]!.id;

    // Evaluate each symbol
    for (const symbol of config.symbols) {
      for (const timeframe of config.timeframes) {
        let marketData: MarketData;

        if (strategy.mode === 'simulation') {
          // Simulation mode: generate synthetic data
          marketData = generateSimulationData(symbol, timeframe);
        } else {
          // Real mode: fetch from Binance (will be implemented in Phase 3)
          // For now, fall back to simulation data
          marketData = generateSimulationData(symbol, timeframe);
        }

        // Evaluate signal
        const signal = evaluateSignal(config, marketData);

        // Save signal to DB
        const savedSignal = await prisma.signal.create({
          data: {
            strategyId: strategy.id,
            strategyVersionId: versionId,
            symbol,
            timeframe,
            signalType: signal.signalType,
            rsiValue: signal.rsiValue,
            price: signal.price,
            payload: { reasons: signal.reasons, smaValue: signal.smaValue },
          },
        });

        addEvent('signal', { symbol, timeframe, signalType: signal.signalType, rsi: signal.rsiValue });

        // If BUY or SELL signal, apply risk and execute
        if (signal.signalType === 'BUY_SIGNAL' || signal.signalType === 'SELL_SIGNAL') {
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

          const riskCtx: RiskContext = {
            config,
            symbol,
            strategyStatus: strategy.status,
            strategyMode: strategy.mode,
            environment: strategy.environment,
            openPositionsCount: openPositions.length,
            openPositionsBySymbol: openPositions.filter((p) => p.symbol === symbol).length,
            totalExposure: openPositions.reduce((sum, p) => sum + Number(p.investedQuote ?? 0), 0),
            dailyLoss: 0,
            dailyLossPct: 0,
            lastTradeTimestamp: null,
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
              riskResult: { allowed: riskResult.allowed, checks: riskResult.checks },
            },
          });

          if (!riskAllowed) {
            addEvent('risk_blocked', { symbol, reason: riskResult.reason });
            continue;
          }

          // Execute in simulation mode
          if (strategy.mode === 'simulation' || config.execution.dryRun) {
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
          }
        }

        setBotState({
          lastEvaluationAt: Date.now(),
          lastSignalType: signal.signalType,
          cycleCount: botState.cycleCount + 1,
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err }, 'Evaluation cycle failed');
    setBotState({ status: 'error', errorMessage: message });
    addEvent('error', { message });
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
  for (let i = 1; i < 50; i++) {
    const volatility = 0.02;
    const change = closes[i - 1]! * volatility * (Math.random() - 0.5) * 2;
    closes.push(closes[i - 1]! + change);
  }

  return {
    symbol,
    timeframe: _timeframe,
    closes,
    currentPrice: closes[closes.length - 1]!,
    timestamp: Date.now(),
  };
}
