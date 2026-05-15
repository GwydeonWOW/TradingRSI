import { calculateRsi, calculateSma, detectBullishDivergence, detectBearishDivergence } from '@cryptorsi/indicators';
import type { StrategyConfig, SignalType } from '@cryptorsi/shared';

export interface MarketData {
  symbol: string;
  timeframe: string;
  closes: number[];
  currentPrice: number;
  timestamp: number;
}

export interface SignalResult {
  signalType: SignalType;
  rsiValue: number;
  smaValue: number | null;
  price: number;
  symbol: string;
  timeframe: string;
  reasons: string[];
  timestamp: number;
}

/**
 * Evalua si hay senal de compra o venta basandose en la configuracion.
 */
export function evaluateSignal(
  config: StrategyConfig,
  marketData: MarketData,
  allTimeframeData?: Map<string, number[]>,
): SignalResult {
  const { entry, exit } = config;
  const { closes, currentPrice, symbol, timeframe } = marketData;

  const reasons: string[] = [];

  // Calculate RSI
  const rsiValues = calculateRsi(closes, 14);
  const rsiValue = rsiValues[rsiValues.length - 1];
  if (rsiValue === undefined || Number.isNaN(rsiValue)) {
    return {
      signalType: 'BLOCKED_BY_DATA',
      rsiValue: NaN,
      smaValue: null,
      price: currentPrice,
      symbol,
      timeframe,
      reasons: ['Insufficient data for RSI calculation'],
      timestamp: Date.now(),
    };
  }

  // Calculate SMA if filter is enabled
  let smaValue: number | null = null;
  if (entry.useSmaFilter) {
    const smaValues = calculateSma(closes, entry.smaPeriod);
    const lastSma = smaValues[smaValues.length - 1];
    if (lastSma !== undefined && !Number.isNaN(lastSma)) {
      smaValue = lastSma;
    }
  }

  // Check SELL signal first (priority: exit existing positions)
  if (rsiValue >= exit.rsiAbove) {
    reasons.push(`RSI ${rsiValue.toFixed(2)} >= ${exit.rsiAbove} (sell threshold)`);
    return {
      signalType: 'SELL_SIGNAL',
      rsiValue,
      smaValue,
      price: currentPrice,
      symbol,
      timeframe,
      reasons,
      timestamp: Date.now(),
    };
  }

  // Check bearish divergence exit
  if (exit.exitOnBearishDivergence && detectBearishDivergence(closes, entry.rsiPeriod ?? 14)) {
    reasons.push('Bearish divergence detected (sell signal)');
    return {
      signalType: 'SELL_SIGNAL',
      rsiValue,
      smaValue,
      price: currentPrice,
      symbol,
      timeframe,
      reasons,
      timestamp: Date.now(),
    };
  }

  const entryMode = entry.entryMode ?? (entry.useRsiDivergence ? 'divergence' : 'rsi_threshold');

  // Check BUY signal based on entry mode
  let buySignal = false;
  if (entryMode === 'divergence') {
    buySignal = detectBullishDivergence(closes, entry.rsiPeriod ?? 14);
    if (buySignal) reasons.push('Bullish divergence detected (buy signal)');
  } else {
    buySignal = rsiValue <= entry.rsiBelow;
    if (buySignal) reasons.push(`RSI ${rsiValue.toFixed(2)} <= ${entry.rsiBelow} (buy threshold)`);
  }

  if (buySignal) {
    // SMA filter
    if (entry.useSmaFilter && smaValue !== null) {
      if (currentPrice <= smaValue) {
        reasons.push(`Price ${currentPrice} <= SMA${entry.smaPeriod} ${smaValue.toFixed(2)} (blocked: below SMA)`);
        return {
          signalType: 'HOLD',
          rsiValue,
          smaValue,
          price: currentPrice,
          symbol,
          timeframe,
          reasons,
          timestamp: Date.now(),
        };
      }
      reasons.push(`Price ${currentPrice} > SMA${entry.smaPeriod} ${smaValue.toFixed(2)} (confirmed)`);
    }

    // Multi-timeframe confirmation
    if (entry.requireMultiTimeframeConfirmation && allTimeframeData) {
      const allConfirmed = confirmMultiTimeframe(allTimeframeData, entry.rsiBelow);
      if (!allConfirmed) {
        reasons.push('Multi-timeframe confirmation failed');
        return {
          signalType: 'HOLD',
          rsiValue,
          smaValue,
          price: currentPrice,
          symbol,
          timeframe,
          reasons,
          timestamp: Date.now(),
        };
      }
      reasons.push('Multi-timeframe confirmation passed');
    }

    return {
      signalType: 'BUY_SIGNAL',
      rsiValue,
      smaValue,
      price: currentPrice,
      symbol,
      timeframe,
      reasons,
      timestamp: Date.now(),
    };
  }

  // No signal
  reasons.push(`RSI ${rsiValue.toFixed(2)} is between ${entry.rsiBelow} and ${exit.rsiAbove} (no action)`);
  return {
    signalType: 'HOLD',
    rsiValue,
    smaValue,
    price: currentPrice,
    symbol,
    timeframe,
    reasons,
    timestamp: Date.now(),
  };
}

function confirmMultiTimeframe(
  allTimeframeData: Map<string, number[]>,
  rsiThreshold: number,
): boolean {
  for (const [, closes] of allTimeframeData) {
    const rsiValues = calculateRsi(closes, 14);
    const lastRsi = rsiValues[rsiValues.length - 1];
    if (lastRsi === undefined || Number.isNaN(lastRsi) || lastRsi > rsiThreshold) {
      return false;
    }
  }
  return true;
}
