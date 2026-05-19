import type { StrategyConfig } from '@cryptorsi/shared';
import type { SignalResult } from '../strategy/evaluate.js';

export interface SimulatedPosition {
  id: string;
  symbol: string;
  side: 'BUY';
  entryPrice: number;
  quantity: number;
  investedQuote: number;
  openedAt: number;
  strategyId: string;
  strategyVersionId: string;
}

export interface SimulationResult {
  action: 'OPEN' | 'CLOSE' | 'NONE';
  position?: SimulatedPosition;
  realizedPnl?: number;
  realizedPnlPct?: number;
  reason: string;
}

/**
 * Ejecuta una senal en modo simulacion (sin conexion a Binance).
 */
export function executeSimulation(
  signal: SignalResult,
  config: StrategyConfig,
  existingPositions: SimulatedPosition[],
  currentCapital?: number,
): SimulationResult {
  if (signal.signalType === 'BUY_SIGNAL') {
    // Check if already have position for this symbol
    const existing = existingPositions.find(p => p.symbol === signal.symbol);
    if (existing) {
      return { action: 'NONE', reason: `Already have position for ${signal.symbol}` };
    }

    const tradeSize = config.risk.compoundInterest && currentCapital !== undefined
      ? (config.risk.quoteAmountPerTrade / config.risk.maxTotalExposureQuote) * currentCapital
      : config.risk.quoteAmountPerTrade;
    const investedQuote = Math.min(tradeSize, currentCapital ?? config.risk.quoteAmountPerTrade);
    const quantity = investedQuote / signal.price;

    const position: SimulatedPosition = {
      id: crypto.randomUUID(),
      symbol: signal.symbol,
      side: 'BUY',
      entryPrice: signal.price,
      quantity,
      investedQuote,
      openedAt: Date.now(),
      strategyId: '',
      strategyVersionId: '',
    };

    return {
      action: 'OPEN',
      position,
      reason: `Opened simulated position: ${quantity.toFixed(6)} ${signal.symbol} at ${signal.price}`,
    };
  }

  if (signal.signalType === 'SELL_SIGNAL') {
    const position = existingPositions.find(p => p.symbol === signal.symbol);
    if (!position) {
      return { action: 'NONE', reason: `No position to sell for ${signal.symbol}` };
    }

    const currentValue = position.quantity * signal.price;
    const realizedPnl = currentValue - position.investedQuote;
    const realizedPnlPct = (realizedPnl / position.investedQuote) * 100;

    return {
      action: 'CLOSE',
      position,
      realizedPnl,
      realizedPnlPct,
      reason: `Closed simulated position: PnL ${realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)} USDT (${realizedPnlPct.toFixed(2)}%)`,
    };
  }

  return { action: 'NONE', reason: `Signal type ${signal.signalType} requires no action` };
}
