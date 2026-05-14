import { calculateRsi, calculateSma } from '@cryptorsi/indicators';
import type { StrategyConfig } from '@cryptorsi/shared';

export interface BacktestParams {
  strategyId: string;
  strategyVersionId: string;
  symbol: string;
  interval: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  commissionRate: number; // e.g. 0.001 for 0.1%
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  side: 'BUY';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  investedQuote: number;
  pnl: number;
  pnlPct: number;
  exitReason: 'signal' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'end_of_data';
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdown: number; // percentage
  maxDrawdownDuration: number; // in candles
  profitFactor: number;
  avgTradeDuration: number; // in candles
  bestTrade: number; // best PnL%
  worstTrade: number; // worst PnL%
  avgWin: number;
  avgLoss: number;
  sharpeRatio: number;
  finalCapital: number;
}

export interface BacktestResult {
  params: BacktestParams;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: Array<{ time: number; equity: number }>;
}

export interface BacktestCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OpenPosition {
  entryCandleIndex: number;
  entryTime: number;
  entryPrice: number;
  quantity: number;
  investedQuote: number;
  highestPrice: number; // for trailing stop tracking
}

/**
 * Run a backtest against historical candle data using the given strategy config.
 */
export function runBacktest(
  config: StrategyConfig,
  candles: BacktestCandle[],
  params: BacktestParams,
): BacktestResult {
  const { entry, exit } = config;
  const commissionRate = params.commissionRate;
  const rsiPeriod = 14;
  const minDataLength = rsiPeriod + 1;

  const trades: BacktestTrade[] = [];
  const equityCurve: Array<{ time: number; equity: number }> = [];

  let capital = params.initialCapital;
  let openPosition: OpenPosition | null = null;

  const closesSoFar: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]!;
    closesSoFar.push(candle.close);

    // Not enough data for indicators
    if (closesSoFar.length < minDataLength) {
      const equity = capital + unrealizedPnl(openPosition, candle.close);
      equityCurve.push({ time: candle.openTime, equity });
      continue;
    }

    // Calculate indicators
    const rsiValues = calculateRsi(closesSoFar, rsiPeriod);
    const rsiValue = rsiValues[rsiValues.length - 1]!;

    let smaValue: number | null = null;
    if (entry.useSmaFilter) {
      const smaValues = calculateSma(closesSoFar, entry.smaPeriod);
      const lastSma = smaValues[smaValues.length - 1];
      if (lastSma !== undefined && !Number.isNaN(lastSma)) {
        smaValue = lastSma;
      }
    }

    // --- Check exit conditions for open position ---
    if (openPosition) {
      const exitResult = checkExit(
        openPosition,
        candle,
        rsiValue,
        exit.rsiAbove,
        exit.stopLossPct,
        exit.takeProfitPct,
        exit.trailingStopPct,
        commissionRate,
      );

      if (exitResult) {
        trades.push(exitResult.trade);
        capital += exitResult.proceeds;
        openPosition = null;
      }
    }

    // --- Check entry conditions if no position ---
    if (!openPosition && !Number.isNaN(rsiValue)) {
      const buySignal = rsiValue <= entry.rsiBelow;

      let smaBlocked = false;
      if (buySignal && entry.useSmaFilter && smaValue !== null) {
        if (candle.close <= smaValue) {
          smaBlocked = true;
        }
      }

      if (buySignal && !smaBlocked) {
        const investedQuote = Math.min(config.risk.quoteAmountPerTrade, capital);
        if (investedQuote > 0) {
          const commission = investedQuote * commissionRate;
          const netInvested = investedQuote - commission;
          const quantity = netInvested / candle.close;

          openPosition = {
            entryCandleIndex: i,
            entryTime: candle.openTime,
            entryPrice: candle.close,
            quantity,
            investedQuote,
            highestPrice: candle.high,
          };
        }
      }
    }

    const equity = capital + unrealizedPnl(openPosition, candle.close);
    equityCurve.push({ time: candle.openTime, equity });
  }

  // Close any remaining position at the last close price
  if (openPosition && candles.length > 0) {
    const lastCandle = candles[candles.length - 1]!;
    const exitPrice = lastCandle.close;
    const grossValue = openPosition.quantity * exitPrice;
    const commission = grossValue * commissionRate;
    const netProceeds = grossValue - commission;
    const pnl = netProceeds - openPosition.investedQuote;
    const pnlPct = (pnl / openPosition.investedQuote) * 100;
    const duration = candles.length - 1 - openPosition.entryCandleIndex;

    trades.push({
      entryTime: openPosition.entryTime,
      exitTime: lastCandle.openTime,
      side: 'BUY',
      entryPrice: openPosition.entryPrice,
      exitPrice,
      quantity: openPosition.quantity,
      investedQuote: openPosition.investedQuote,
      pnl,
      pnlPct,
      exitReason: 'end_of_data',
    });

    capital += netProceeds;
    openPosition = null;

    // Update last equity curve point
    equityCurve[equityCurve.length - 1]!.equity = capital;
  }

  const metrics = calculateMetrics(trades, params.initialCapital, equityCurve);

  return {
    params,
    metrics,
    trades,
    equityCurve,
  };
}

interface ExitCheckResult {
  trade: BacktestTrade;
  proceeds: number;
}

/**
 * Check if an open position should be exited on this candle.
 * Uses high/low to detect stop-loss and take-profit hits intracandle.
 */
function checkExit(
  position: OpenPosition,
  candle: BacktestCandle,
  rsiValue: number,
  rsiAbove: number,
  stopLossPct: number,
  takeProfitPct: number,
  trailingStopPct: number | null,
  commissionRate: number,
): ExitCheckResult | null {
  // Update trailing stop highest price
  if (trailingStopPct !== null && candle.high > position.highestPrice) {
    position.highestPrice = candle.high;
  }

  // Check stop-loss (price dropped below threshold)
  const stopLossPrice = position.entryPrice * (1 - stopLossPct / 100);
  if (candle.low <= stopLossPrice) {
    return buildTrade(position, candle, stopLossPrice, 'stop_loss', commissionRate);
  }

  // Check trailing stop
  if (trailingStopPct !== null) {
    const trailingStopPrice = position.highestPrice * (1 - trailingStopPct / 100);
    if (candle.low <= trailingStopPrice && trailingStopPrice > stopLossPrice) {
      return buildTrade(position, candle, trailingStopPrice, 'trailing_stop', commissionRate);
    }
  }

  // Check take-profit (price rose above threshold)
  const takeProfitPrice = position.entryPrice * (1 + takeProfitPct / 100);
  if (candle.high >= takeProfitPrice) {
    return buildTrade(position, candle, takeProfitPrice, 'take_profit', commissionRate);
  }

  // Check RSI sell signal
  if (rsiValue >= rsiAbove) {
    return buildTrade(position, candle, candle.close, 'signal', commissionRate);
  }

  return null;
}

function buildTrade(
  position: OpenPosition,
  candle: BacktestCandle,
  exitPrice: number,
  exitReason: BacktestTrade['exitReason'],
  commissionRate: number,
): ExitCheckResult {
  const grossValue = position.quantity * exitPrice;
  const commission = grossValue * commissionRate;
  const proceeds = grossValue - commission;
  const pnl = proceeds - position.investedQuote;
  const pnlPct = (pnl / position.investedQuote) * 100;

  return {
    trade: {
      entryTime: position.entryTime,
      exitTime: candle.openTime,
      side: 'BUY',
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      investedQuote: position.investedQuote,
      pnl,
      pnlPct,
      exitReason,
    },
    proceeds,
  };
}

function unrealizedPnl(position: OpenPosition | null, currentPrice: number): number {
  if (!position) return 0;
  return position.quantity * currentPrice - position.investedQuote;
}

function calculateMetrics(
  trades: BacktestTrade[],
  initialCapital: number,
  equityCurve: Array<{ time: number; equity: number }>,
): BacktestMetrics {
  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.pnl > 0).length;
  const losingTrades = trades.filter(t => t.pnl <= 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalPnlPct = initialCapital > 0 ? (totalPnl / initialCapital) * 100 : 0;

  const grossProfit = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const pnlValues = trades.map(t => t.pnlPct);
  const bestTrade = pnlValues.length > 0 ? Math.max(...pnlValues) : 0;
  const worstTrade = pnlValues.length > 0 ? Math.min(...pnlValues) : 0;

  const avgWin = winningTrades > 0
    ? trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnlPct, 0) / winningTrades
    : 0;
  const avgLoss = losingTrades > 0
    ? trades.filter(t => t.pnl <= 0).reduce((sum, t) => sum + t.pnlPct, 0) / losingTrades
    : 0;

  // Avg trade duration (based on candle count approximated from entry/exit times)
  // Since we store indices indirectly, we approximate from the trades' time delta
  // But we don't have candle duration here. Instead, we compute it as a simple average of trade count.
  // For now, return 0 since candle duration is not available in the trade data.
  const avgTradeDuration = 0;

  // Sharpe ratio (simplified: using trade PnLs as returns, risk-free rate = 0)
  const sharpeRatio = calculateSharpeRatio(pnlValues);

  // Max drawdown from equity curve
  const { maxDrawdown, maxDrawdownDuration } = calculateMaxDrawdown(equityCurve);

  const finalCapital = initialCapital + totalPnl;

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    totalPnl,
    totalPnlPct,
    maxDrawdown,
    maxDrawdownDuration,
    profitFactor,
    avgTradeDuration,
    bestTrade,
    worstTrade,
    avgWin,
    avgLoss,
    sharpeRatio,
    finalCapital,
  };
}

function calculateSharpeRatio(returns: number[]): number {
  if (returns.length < 2) return 0;

  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;
  return (mean / stdDev) * Math.sqrt(252); // Annualized
}

function calculateMaxDrawdown(
  equityCurve: Array<{ time: number; equity: number }>,
): { maxDrawdown: number; maxDrawdownDuration: number } {
  if (equityCurve.length === 0) return { maxDrawdown: 0, maxDrawdownDuration: 0 };

  let peak = equityCurve[0]!.equity;
  let maxDrawdown = 0;
  let peakIndex = 0;
  let maxDrawdownDuration = 0;

  for (let i = 1; i < equityCurve.length; i++) {
    const equity = equityCurve[i]!.equity;

    if (equity > peak) {
      peak = equity;
      peakIndex = i;
    }

    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownDuration = i - peakIndex;
    }
  }

  return { maxDrawdown, maxDrawdownDuration };
}
