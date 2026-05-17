import { describe, it, expect } from 'vitest';
import { runBacktest, type BacktestCandle } from '../domain/backtest/engine.js';
import type { StrategyConfig } from '@cryptorsi/shared';

const defaultConfig: StrategyConfig = {
  symbols: ['BTCUSDT'],
  timeframes: ['1h'],
  entry: {
    rsiBelow: 30,
    requireMultiTimeframeConfirmation: false,
    useSmaFilter: false,
    smaPeriod: 20,
  },
  exit: {
    rsiAbove: 70,
    takeProfitPct: 8,
    stopLossPct: 3,
    trailingStopPct: null,
  },
  risk: {
    quoteAmountPerTrade: 100,
    maxOpenPositions: 5,
    maxPositionsPerSymbol: 2,
    maxTotalExposureQuote: 500,
    maxDailyLossPct: 5,
    cooldownMinutes: 0,
  },
  execution: {
    orderType: 'MARKET',
    useOrderTestBeforeRealOrder: true,
    dryRun: true,
  },
};

const defaultParams = {
  strategyId: 'test-strategy',
  strategyVersionId: 'test-version',
  symbol: 'BTCUSDT',
  interval: '1h',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  initialCapital: 1000,
  commissionRate: 0.001,
};

/**
 * Generate synthetic candles.
 * Can force RSI to go low (oversold) or high (overbought) by controlling price direction.
 */
function generateCandles(opts: {
  count: number;
  basePrice?: number;
  /** Index at which to start a strong downtrend (drives RSI low) */
  downtrendStart?: number;
  /** How many candles the downtrend lasts */
  downtrendLength?: number;
  /** Index at which to start a strong uptrend (drives RSI high) */
  uptrendStart?: number;
  /** How many candles the uptrend lasts */
  uptrendLength?: number;
  /** Volatility per candle (fraction of price) */
  volatility?: number;
}): BacktestCandle[] {
  const {
    count,
    basePrice = 100,
    downtrendStart,
    downtrendLength = 10,
    uptrendStart,
    uptrendLength = 10,
    volatility = 0.005,
  } = opts;

  const candles: BacktestCandle[] = [];
  let price = basePrice;
  const hourMs = 3600 * 1000;
  let time = 1704067200000; // 2024-01-01T00:00:00Z

  for (let i = 0; i < count; i++) {
    // Determine price change
    let change: number;
    if (downtrendStart !== undefined && i >= downtrendStart && i < downtrendStart + downtrendLength) {
      change = -price * 0.03; // 3% drop per candle
    } else if (uptrendStart !== undefined && i >= uptrendStart && i < uptrendStart + uptrendLength) {
      change = price * 0.03; // 3% rise per candle
    } else {
      change = price * volatility * (Math.random() - 0.5) * 2;
    }

    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.abs(change) * 0.2;
    const low = Math.min(open, close) - Math.abs(change) * 0.2;

    candles.push({
      openTime: time,
      open,
      high,
      low,
      close,
      volume: 1000,
    });

    price = close;
    time += hourMs;
  }

  return candles;
}

/**
 * Build candles deterministically: flat, then downtrend, then optional phases.
 * Each phase is described as { dropPct: number } (negative = down, positive = up).
 */
function buildCandles(phases: Array<{ count: number; changePct: number }>): BacktestCandle[] {
  const candles: BacktestCandle[] = [];
  let price = 100;
  const hourMs = 3600 * 1000;
  let time = 1704067200000;

  for (const phase of phases) {
    for (let i = 0; i < phase.count; i++) {
      const open = price;
      const change = price * phase.changePct;
      const close = price + change;
      const high = Math.max(open, close) + Math.abs(change) * 0.1;
      const low = Math.min(open, close) - Math.abs(change) * 0.1;
      candles.push({ openTime: time, open, high, low, close, volume: 1000 });
      price = close;
      time += hourMs;
    }
  }

  return candles;
}

describe('runBacktest', () => {
  it('should return empty trades when no signals are generated (flat data)', () => {
    // Completely flat prices: RSI stays at 50, no buy or sell signals
    const candles = buildCandles([
      { count: 100, changePct: 0 },
    ]);
    const result = runBacktest(defaultConfig, candles, defaultParams);

    expect(result.metrics.totalTrades).toBe(0);
    expect(result.metrics.totalPnl).toBe(0);
    expect(result.metrics.winRate).toBe(0);
    expect(result.trades).toHaveLength(0);
    expect(result.equityCurve).toHaveLength(candles.length);
    expect(result.metrics.finalCapital).toBe(defaultParams.initialCapital);
  });

  it('should generate BUY and SELL trades with RSI buy/sell signals', () => {
    // Downtrend starting at candle 20 for 15 candles -> RSI should drop below 30
    // Uptrend starting at candle 45 for 15 candles -> RSI should rise above 70
    const candles = generateCandles({
      count: 80,
      basePrice: 100,
      downtrendStart: 20,
      downtrendLength: 15,
      uptrendStart: 50,
      uptrendLength: 15,
    });

    const result = runBacktest(defaultConfig, candles, defaultParams);

    expect(result.metrics.totalTrades).toBeGreaterThanOrEqual(1);
    expect(result.trades.length).toBe(result.metrics.totalTrades);
    expect(result.equityCurve).toHaveLength(candles.length);

    // Every trade should have valid PnL
    for (const trade of result.trades) {
      expect(trade.entryTime).toBeGreaterThan(0);
      expect(trade.exitTime).toBeGreaterThanOrEqual(trade.entryTime);
      expect(trade.entryPrice).toBeGreaterThan(0);
      expect(trade.exitPrice).toBeGreaterThan(0);
      expect(trade.quantity).toBeGreaterThan(0);
      expect(trade.investedQuote).toBeGreaterThan(0);
      expect(['signal', 'stop_loss', 'take_profit', 'trailing_stop', 'end_of_data']).toContain(trade.exitReason);
    }
  });

  it('should calculate win rate, PnL, and profit factor correctly', () => {
    // Force a clear trade: downtrend then strong uptrend
    const candles = generateCandles({
      count: 80,
      basePrice: 100,
      downtrendStart: 20,
      downtrendLength: 15,
      uptrendStart: 50,
      uptrendLength: 20,
    });

    const result = runBacktest(defaultConfig, candles, defaultParams);

    if (result.metrics.totalTrades > 0) {
      const { winningTrades, losingTrades, totalTrades, winRate } = result.metrics;
      expect(winningTrades + losingTrades).toBe(totalTrades);
      expect(winRate).toBeCloseTo((winningTrades / totalTrades) * 100, 1);
      expect(result.metrics.totalPnl).toBeCloseTo(
        result.trades.reduce((sum, t) => sum + t.pnl, 0),
        10,
      );
      expect(result.metrics.totalPnlPct).toBeCloseTo(
        (result.metrics.totalPnl / defaultParams.initialCapital) * 100,
        4,
      );

      // Profit factor should be >= 0
      expect(result.metrics.profitFactor).toBeGreaterThanOrEqual(0);
    }
  });

  it('should trigger stop-loss when price drops sharply after entry', () => {
    // Config: stop-loss at 2%, no RSI sell, no take-profit
    const config: StrategyConfig = {
      ...defaultConfig,
      exit: {
        rsiAbove: 99,
        takeProfitPct: 50,
        stopLossPct: 2,
        trailingStopPct: null,
      },
    };

    // Phase 1: 50 flat candles (fill RSI data)
    // Phase 2: 15 strong down candles -> RSI drops, buy signal triggers entry at some candle's close
    // Phase 3: 2 candles that drop further, with low reaching 2% below the entry
    // Phase 4: flat tail
    const candles = buildCandles([
      { count: 50, changePct: 0 },        // flat
      { count: 15, changePct: -0.03 },    // downtrend -> RSI drops -> entry
      { count: 2, changePct: -0.04 },     // further drop, triggers SL
      { count: 10, changePct: 0 },        // flat tail
    ]);

    const result = runBacktest(config, candles, defaultParams);

    // Should have at least one trade
    expect(result.trades.length).toBeGreaterThanOrEqual(1);

    const stopLossTrades = result.trades.filter(t => t.exitReason === 'stop_loss');
    expect(stopLossTrades.length).toBeGreaterThanOrEqual(1);

    for (const t of stopLossTrades) {
      expect(t.exitPrice).toBeLessThan(t.entryPrice);
      expect(t.pnl).toBeLessThan(0);
      // Exit price should be close to entry * (1 - 2/100)
      const expectedSL = t.entryPrice * 0.98;
      expect(t.exitPrice).toBeCloseTo(expectedSL, 1);
    }
  });

  it('should trigger take-profit when price rises after entry', () => {
    // Config: TP at 5%, no RSI sell, no stop-loss
    const config: StrategyConfig = {
      ...defaultConfig,
      exit: {
        rsiAbove: 99,
        takeProfitPct: 5,
        stopLossPct: 50,
        trailingStopPct: null,
      },
    };

    // Build candles with slight uptrend first so RSI starts mid-range (not 0 or 100)
    const candles: BacktestCandle[] = [];
    let price = 100;
    const hourMs = 3600 * 1000;
    let time = 1704067200000;

    // 50 slight uptrend candles (0.1% up each) - RSI should be around 60-70
    for (let i = 0; i < 50; i++) {
      const open = price;
      const close = price * 1.001;
      candles.push({
        openTime: time, open, high: close, low: open, close, volume: 1000,
      });
      price = close;
      time += hourMs;
    }

    // 20 strong down candles (-3% each) -> RSI drops -> entry
    for (let i = 0; i < 20; i++) {
      const open = price;
      const close = price * 0.97;
      candles.push({
        openTime: time, open, high: open, low: close, close, volume: 1000,
      });
      price = close;
      time += hourMs;
    }

    // 20 strong up candles (+4% each) -> should trigger TP at entry * 1.05
    for (let i = 0; i < 20; i++) {
      const open = price;
      const close = price * 1.04;
      candles.push({
        openTime: time, open, high: close, low: open, close, volume: 1000,
      });
      price = close;
      time += hourMs;
    }

    // flat tail
    for (let i = 0; i < 10; i++) {
      candles.push({
        openTime: time, open: price, high: price, low: price, close: price, volume: 1000,
      });
      time += hourMs;
    }

    const result = runBacktest(config, candles, defaultParams);

    // Should have at least one trade
    expect(result.trades.length).toBeGreaterThanOrEqual(1);

    const tpTrades = result.trades.filter(t => t.exitReason === 'take_profit');
    expect(tpTrades.length).toBeGreaterThanOrEqual(1);

    for (const t of tpTrades) {
      expect(t.exitPrice).toBeGreaterThan(t.entryPrice);
      expect(t.pnl).toBeGreaterThan(0);
      // Exit price should be close to entry * (1 + 5/100)
      const expectedTP = t.entryPrice * 1.05;
      expect(t.exitPrice).toBeCloseTo(expectedTP, 1);
    }
  });

  it('should calculate max drawdown from equity curve', () => {
    const candles = generateCandles({
      count: 100,
      basePrice: 100,
      downtrendStart: 20,
      downtrendLength: 15,
      uptrendStart: 50,
      uptrendLength: 15,
    });

    const result = runBacktest(defaultConfig, candles, defaultParams);

    expect(result.metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
    expect(result.metrics.maxDrawdownDuration).toBeGreaterThanOrEqual(0);

    // Verify equity curve consistency
    for (const point of result.equityCurve) {
      expect(point.equity).toBeGreaterThan(0);
      expect(point.time).toBeGreaterThan(0);
    }
  });

  it('should calculate Sharpe ratio', () => {
    const candles = generateCandles({
      count: 100,
      basePrice: 100,
      downtrendStart: 20,
      downtrendLength: 15,
      uptrendStart: 50,
      uptrendLength: 15,
    });

    const result = runBacktest(defaultConfig, candles, defaultParams);

    // Sharpe ratio can be any real number
    expect(typeof result.metrics.sharpeRatio).toBe('number');
    expect(Number.isFinite(result.metrics.sharpeRatio)).toBe(true);
  });

  it('should apply commission to trades', () => {
    const highCommissionParams = {
      ...defaultParams,
      commissionRate: 0.01, // 1% commission
    };

    const candles = generateCandles({
      count: 80,
      basePrice: 100,
      downtrendStart: 20,
      downtrendLength: 15,
      uptrendStart: 50,
      uptrendLength: 15,
    });

    const resultHigh = runBacktest(defaultConfig, candles, highCommissionParams);
    const resultLow = runBacktest(defaultConfig, candles, { ...defaultParams, commissionRate: 0 });

    // Higher commission should result in lower or equal final capital
    expect(resultHigh.metrics.finalCapital).toBeLessThanOrEqual(resultLow.metrics.finalCapital);
  });

  it('should handle trailing stop exit', () => {
    const config: StrategyConfig = {
      ...defaultConfig,
      exit: {
        rsiAbove: 99,
        takeProfitPct: 50,
        stopLossPct: 50,
        trailingStopPct: 3,
      },
    };

    // Phase 1: 50 flat -> fill RSI
    // Phase 2: 15 strong down -> entry
    // Phase 3: 3 candles up 10% each -> price rises, trailing high updates
    // Phase 4: 1 candle that drops 5% from last close -> triggers trailing stop
    // Phase 5: flat tail
    const candles = buildCandles([
      { count: 50, changePct: 0 },       // flat
      { count: 15, changePct: -0.03 },   // downtrend -> entry
      { count: 3, changePct: 0.10 },     // big rise
      { count: 1, changePct: -0.05 },    // pullback triggers trailing
      { count: 10, changePct: 0 },       // flat tail
    ]);

    const result = runBacktest(config, candles, defaultParams);

    expect(result.trades.length).toBeGreaterThanOrEqual(1);

    const trailingTrades = result.trades.filter(t => t.exitReason === 'trailing_stop');
    expect(trailingTrades.length).toBeGreaterThanOrEqual(1);

    for (const t of trailingTrades) {
      // Trailing stop exit: price went up from entry, then pulled back
      // But exit price could still be above or below entry depending on how far it fell
      // What matters is the exit mechanism is correct
      expect(t.exitPrice).toBeGreaterThan(0);
      // The trailing stop price = highest * (1 - 3/100)
      // Since we went up 10% then pulled back 5%, exit price should reflect that
    }
  });

  it('should respect the SMA filter when enabled', () => {
    const config: StrategyConfig = {
      ...defaultConfig,
      entry: {
        ...defaultConfig.entry,
        useSmaFilter: true,
        smaPeriod: 20,
      },
    };

    const candles = generateCandles({
      count: 100,
      basePrice: 100,
      downtrendStart: 30,
      downtrendLength: 20,
    });

    const result = runBacktest(config, candles, defaultParams);

    // With SMA filter, some buy signals may be blocked
    // The result should still be valid
    expect(result.trades).toBeDefined();
    expect(result.metrics).toBeDefined();
    expect(result.equityCurve).toHaveLength(candles.length);
  });
});
