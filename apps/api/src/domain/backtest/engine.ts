import { calculateRsi, calculateSma, detectBullishDivergence, detectBearishDivergence } from '@cryptorsi/indicators';
import type { StrategyConfig } from '@cryptorsi/shared';

export interface BacktestParams {
  strategyId: string;
  strategyVersionId: string;
  symbol: string;
  interval: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  commissionRate: number;
}

export interface BacktestTrade {
  symbol: string;
  entryTime: number;
  exitTime: number;
  side: 'BUY';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  investedQuote: number;
  pnl: number;
  pnlPct: number;
  entryRsi: number | null;
  exitRsi: number | null;
  exitReason: 'signal' | 'stop_loss' | 'take_profit' | 'trailing_stop' | 'end_of_data';
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPct: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  profitFactor: number;
  avgTradeDuration: number;
  bestTrade: number;
  worstTrade: number;
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
  highestPrice: number;
  entryRsi: number | null;
  symbol: string;
}

interface SymbolRun {
  symbol: string;
  candles: BacktestCandle[];
  closesSoFar: number[];
  openPosition: OpenPosition | null;
  lastExitTime: number;
}

// ---------------------------------------------------------------------------
// Multi-symbol backtest with shared capital pool
// ---------------------------------------------------------------------------

export interface MultiSymbolParams {
  startTimestampMs: number;
  initialCapital: number;
  commissionRate: number;
}

export function runMultiSymbolBacktest(
  config: StrategyConfig,
  symbolsData: Array<{ symbol: string; candles: BacktestCandle[] }>,
  params: MultiSymbolParams,
): BacktestResult {
  const { entry, exit, risk } = config;
  const rsiPeriod = 14;
  const minDataLength = rsiPeriod + 1;

  // Build per-symbol state
  const runs: SymbolRun[] = symbolsData.map((sd) => ({
    symbol: sd.symbol,
    candles: sd.candles,
    closesSoFar: [],
    openPosition: null,
    lastExitTime: 0,
  }));

  // Build merged chronological event stream
  const events: Array<{ time: number; runIdx: number; candleIdx: number }> = [];
  for (let r = 0; r < runs.length; r++) {
    const candles = runs[r]!.candles;
    for (let c = 0; c < candles.length; c++) {
      events.push({ time: candles[c]!.openTime, runIdx: r, candleIdx: c });
    }
  }
  events.sort((a, b) => a.time - b.time);

  let cash = params.initialCapital;
  const trades: BacktestTrade[] = [];
  const equityCurve: Array<{ time: number; equity: number }> = [];

  for (const event of events) {
    const run = runs[event.runIdx]!;
    const candle = run.candles[event.candleIdx]!;
    run.closesSoFar.push(candle.close);

    // Warm-up phase: only build indicator data
    if (candle.openTime < params.startTimestampMs) continue;

    // Not enough data for indicators
    if (run.closesSoFar.length < minDataLength) {
      equityCurve.push({ time: candle.openTime, equity: computeEquity(cash, runs) });
      continue;
    }

    // Calculate indicators
    const rsiValues = calculateRsi(run.closesSoFar, rsiPeriod);
    const rsiValue = rsiValues[rsiValues.length - 1]!;

    // --- Check exit for this symbol ---
    if (run.openPosition) {
      const exitResult = checkExit(
        run.openPosition,
        candle,
        rsiValue,
        exit,
        params.commissionRate,
        run.closesSoFar,
        entry.rsiPeriod ?? rsiPeriod,
      );

      if (exitResult) {
        exitResult.trade.exitRsi = Number.isNaN(rsiValue) ? null : Math.round(rsiValue * 100) / 100;
        exitResult.trade.symbol = run.symbol;
        trades.push(exitResult.trade);
        cash += exitResult.proceeds;
        run.lastExitTime = candle.openTime;
        run.openPosition = null;
      }
    }

    // --- Check entry for this symbol ---
    if (!run.openPosition && !Number.isNaN(rsiValue)) {
      const entryMode = entry.entryMode ?? (entry.useRsiDivergence ? 'divergence' : 'rsi_threshold');
      let buySignal: boolean;
      if (entryMode === 'divergence') {
        buySignal = detectBullishDivergence(run.closesSoFar, entry.rsiPeriod ?? rsiPeriod);
      } else {
        buySignal = rsiValue <= entry.rsiBelow;
      }

      // SMA filter
      let smaBlocked = false;
      if (buySignal && entry.useSmaFilter) {
        const smaValues = calculateSma(run.closesSoFar, entry.smaPeriod);
        const lastSma = smaValues[smaValues.length - 1];
        if (lastSma === undefined || Number.isNaN(lastSma)) {
          smaBlocked = true; // No SMA data yet → block entry
        } else if (candle.close <= lastSma) {
          smaBlocked = true;
        }
      }

      // Cooldown check
      const cooldownMs = risk.cooldownMinutes * 60000;
      const inCooldown = run.lastExitTime > 0 && (candle.openTime - run.lastExitTime) < cooldownMs;

      // Position limits
      const totalOpenPositions = runs.filter((r) => r.openPosition !== null).length;
      const totalExposure = runs.reduce((sum, r) => sum + (r.openPosition?.investedQuote ?? 0), 0);

      const withinLimits = totalOpenPositions < risk.maxOpenPositions
        && totalExposure + risk.quoteAmountPerTrade <= risk.maxTotalExposureQuote;

      if (buySignal && !smaBlocked && !inCooldown && withinLimits) {
        const investedQuote = Math.min(risk.quoteAmountPerTrade, cash);
        if (investedQuote > 0) {
          const commission = investedQuote * params.commissionRate;
          const netInvested = investedQuote - commission;
          const quantity = netInvested / candle.close;
          const entryRsi = Number.isNaN(rsiValue) ? null : Math.round(rsiValue * 100) / 100;

          run.openPosition = {
            entryCandleIndex: event.candleIdx,
            entryTime: candle.openTime,
            entryPrice: candle.close,
            quantity,
            investedQuote,
            highestPrice: candle.high,
            entryRsi,
            symbol: run.symbol,
          };
          cash -= investedQuote;
        }
      }
    }

    equityCurve.push({ time: candle.openTime, equity: computeEquity(cash, runs) });
  }

  // Close all remaining positions at last candle
  for (const run of runs) {
    if (run.openPosition && run.candles.length > 0) {
      const lastCandle = run.candles[run.candles.length - 1]!;
      const exitPrice = lastCandle.close;
      const grossValue = run.openPosition.quantity * exitPrice;
      const commission = grossValue * params.commissionRate;
      const netProceeds = grossValue - commission;
      const pnl = netProceeds - run.openPosition.investedQuote;
      const pnlPct = (pnl / run.openPosition.investedQuote) * 100;

      trades.push({
        symbol: run.symbol,
        entryTime: run.openPosition.entryTime,
        exitTime: lastCandle.openTime,
        side: 'BUY',
        entryPrice: run.openPosition.entryPrice,
        exitPrice,
        quantity: run.openPosition.quantity,
        investedQuote: run.openPosition.investedQuote,
        pnl,
        pnlPct,
        entryRsi: run.openPosition.entryRsi,
        exitRsi: null,
        exitReason: 'end_of_data',
      });
      cash += netProceeds;
      run.openPosition = null;
    }
  }

  // Update last equity curve point with final cash
  if (equityCurve.length > 0) {
    equityCurve[equityCurve.length - 1]!.equity = cash;
  }

  // Deduplicate equity curve: multiple symbols can share the same timestamp.
  // Keep the last equity value for each timestamp.
  const dedupedCurve: typeof equityCurve = [];
  for (const point of equityCurve) {
    if (dedupedCurve.length > 0 && dedupedCurve[dedupedCurve.length - 1]!.time === point.time) {
      dedupedCurve[dedupedCurve.length - 1]!.equity = point.equity;
    } else {
      dedupedCurve.push({ time: point.time, equity: point.equity });
    }
  }

  const metrics = calculateMetrics(trades, params.initialCapital, dedupedCurve);

  return {
    params: {
      strategyId: '',
      strategyVersionId: '',
      symbol: symbolsData.map((s) => s.symbol).join(','),
      interval: '',
      startDate: new Date(params.startTimestampMs),
      endDate: new Date(0),
      initialCapital: params.initialCapital,
      commissionRate: params.commissionRate,
    },
    metrics,
    trades: trades.sort((a, b) => a.entryTime - b.entryTime),
    equityCurve: dedupedCurve,
  };
}

function computeEquity(cash: number, runs: SymbolRun[]): number {
  let equity = cash;
  for (const run of runs) {
    if (run.openPosition) {
      const lastClose = run.closesSoFar[run.closesSoFar.length - 1] ?? run.openPosition.entryPrice;
      equity += run.openPosition.quantity * lastClose;
    }
  }
  return equity;
}

// ---------------------------------------------------------------------------
// Single-symbol backtest (kept for compare route)
// ---------------------------------------------------------------------------

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

    if (closesSoFar.length < minDataLength) {
      const equity = capital + unrealizedPnl(openPosition, candle.close);
      equityCurve.push({ time: candle.openTime, equity });
      continue;
    }

    const rsiValues = calculateRsi(closesSoFar, rsiPeriod);
    const rsiValue = rsiValues[rsiValues.length - 1]!;

    // --- Check exit ---
    if (openPosition) {
      const exitResult = checkExit(
        openPosition,
        candle,
        rsiValue,
        exit,
        commissionRate,
        closesSoFar,
        entry.rsiPeriod ?? rsiPeriod,
      );

      if (exitResult) {
        exitResult.trade.exitRsi = Number.isNaN(rsiValue) ? null : Math.round(rsiValue * 100) / 100;
        exitResult.trade.symbol = params.symbol;
        trades.push(exitResult.trade);
        capital += exitResult.proceeds;
        openPosition = null;
      }
    }

    // --- Check entry ---
    if (!openPosition && !Number.isNaN(rsiValue)) {
      const entryMode = entry.entryMode ?? (entry.useRsiDivergence ? 'divergence' : 'rsi_threshold');
      let buySignal: boolean;
      if (entryMode === 'divergence') {
        buySignal = detectBullishDivergence(closesSoFar, entry.rsiPeriod ?? rsiPeriod);
      } else {
        buySignal = rsiValue <= entry.rsiBelow;
      }

      // SMA filter — block if no data yet
      let smaBlocked = false;
      if (buySignal && entry.useSmaFilter) {
        const smaValues = calculateSma(closesSoFar, entry.smaPeriod);
        const lastSma = smaValues[smaValues.length - 1];
        if (lastSma === undefined || Number.isNaN(lastSma)) {
          smaBlocked = true;
        } else if (candle.close <= lastSma) {
          smaBlocked = true;
        }
      }

      if (buySignal && !smaBlocked) {
        const investedQuote = Math.min(config.risk.quoteAmountPerTrade, capital);
        if (investedQuote > 0) {
          const commission = investedQuote * commissionRate;
          const netInvested = investedQuote - commission;
          const quantity = netInvested / candle.close;
          const entryRsi = Number.isNaN(rsiValue) ? null : Math.round(rsiValue * 100) / 100;

          openPosition = {
            entryCandleIndex: i,
            entryTime: candle.openTime,
            entryPrice: candle.close,
            quantity,
            investedQuote,
            highestPrice: candle.high,
            entryRsi,
            symbol: params.symbol,
          };
        }
      }
    }

    const equity = capital + unrealizedPnl(openPosition, candle.close);
    equityCurve.push({ time: candle.openTime, equity });
  }

  // Close remaining position
  if (openPosition && candles.length > 0) {
    const lastCandle = candles[candles.length - 1]!;
    const exitPrice = lastCandle.close;
    const grossValue = openPosition.quantity * exitPrice;
    const commission = grossValue * commissionRate;
    const netProceeds = grossValue - commission;
    const pnl = netProceeds - openPosition.investedQuote;
    const pnlPct = (pnl / openPosition.investedQuote) * 100;

    trades.push({
      symbol: params.symbol,
      entryTime: openPosition.entryTime,
      exitTime: lastCandle.openTime,
      side: 'BUY',
      entryPrice: openPosition.entryPrice,
      exitPrice,
      quantity: openPosition.quantity,
      investedQuote: openPosition.investedQuote,
      pnl,
      pnlPct,
      entryRsi: openPosition.entryRsi,
      exitRsi: null,
      exitReason: 'end_of_data',
    });

    capital += netProceeds;
    openPosition = null;
    equityCurve[equityCurve.length - 1]!.equity = capital;
  }

  const metrics = calculateMetrics(trades, params.initialCapital, equityCurve);

  return { params, metrics, trades, equityCurve };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface ExitCheckResult {
  trade: BacktestTrade;
  proceeds: number;
}

function checkExit(
  position: OpenPosition,
  candle: BacktestCandle,
  rsiValue: number,
  exit: StrategyConfig['exit'],
  commissionRate: number,
  closesSoFar: number[],
  rsiPeriod: number,
): ExitCheckResult | null {
  if (exit.trailingStopPct !== null && candle.high > position.highestPrice) {
    position.highestPrice = candle.high;
  }

  if (exit.stopLossPct !== null) {
    const stopLossPrice = position.entryPrice * (1 - exit.stopLossPct / 100);
    if (candle.low <= stopLossPrice) {
      return buildTrade(position, candle, stopLossPrice, 'stop_loss', commissionRate);
    }

    if (exit.trailingStopPct !== null) {
      const trailingStopPrice = position.highestPrice * (1 - exit.trailingStopPct / 100);
      if (candle.low <= trailingStopPrice && trailingStopPrice > stopLossPrice) {
        return buildTrade(position, candle, trailingStopPrice, 'trailing_stop', commissionRate);
      }
    }
  }

  if (exit.takeProfitPct !== null) {
    const takeProfitPrice = position.entryPrice * (1 + exit.takeProfitPct / 100);
    if (candle.high >= takeProfitPrice) {
      return buildTrade(position, candle, takeProfitPrice, 'take_profit', commissionRate);
    }
  }

  if (exit.exitOnBearishDivergence && detectBearishDivergence(closesSoFar, rsiPeriod)) {
    return buildTrade(position, candle, candle.close, 'signal', commissionRate);
  }

  if (rsiValue >= exit.rsiAbove) {
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
      symbol: '',
      entryTime: position.entryTime,
      exitTime: candle.openTime,
      side: 'BUY',
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      investedQuote: position.investedQuote,
      pnl,
      pnlPct,
      entryRsi: position.entryRsi,
      exitRsi: null,
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

  const avgTradeDuration = 0;

  const sharpeRatio = calculateSharpeRatio(pnlValues);

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
  return (mean / stdDev) * Math.sqrt(252);
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
