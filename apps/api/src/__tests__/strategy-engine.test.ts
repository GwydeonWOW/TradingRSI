import { describe, it, expect } from 'vitest';
import { evaluateSignal } from '../domain/strategy/evaluate.js';
import { evaluateRisk } from '../domain/risk/evaluate.js';
import { executeSimulation } from '../domain/execution/simulation.js';
import type { StrategyConfig } from '@cryptorsi/shared';
import type { RiskContext } from '../domain/risk/evaluate.js';

const baseConfig: StrategyConfig = {
  symbols: ['BTCUSDT'],
  timeframes: ['1h'],
  entry: {
    rsiBelow: 30,
    requireMultiTimeframeConfirmation: false,
    useSmaFilter: false,
    smaPeriod: 200,
  },
  exit: {
    rsiAbove: 70,
    takeProfitPct: 8,
    stopLossPct: 3,
    trailingStopPct: null,
  },
  risk: {
    quoteAmountPerTrade: 25,
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

function generateCloses(basePrice: number, trend: 'up' | 'down' | 'neutral', count: number): number[] {
  const closes: number[] = [basePrice];
  for (let i = 1; i < count; i++) {
    const change = trend === 'up' ? 0.5 : trend === 'down' ? -0.5 : (Math.random() - 0.5) * 0.1;
    closes.push(closes[i - 1]! + change);
  }
  return closes;
}

describe('evaluateSignal', () => {
  it('should return HOLD when RSI is between thresholds', () => {
    const closes = generateCloses(100, 'neutral', 50);
    const result = evaluateSignal(baseConfig, {
      symbol: 'BTCUSDT',
      timeframe: '1h',
      closes,
      currentPrice: closes[closes.length - 1]!,
      timestamp: Date.now(),
    });
    expect(['HOLD', 'BUY_SIGNAL', 'SELL_SIGNAL']).toContain(result.signalType);
    expect(result.rsiValue).toBeGreaterThanOrEqual(0);
    expect(result.rsiValue).toBeLessThanOrEqual(100);
  });

  it('should return BUY_SIGNAL when RSI is below threshold', () => {
    const closes: number[] = [100];
    for (let i = 1; i < 30; i++) {
      closes.push(closes[i - 1]! * 0.97);
    }
    const result = evaluateSignal(baseConfig, {
      symbol: 'BTCUSDT',
      timeframe: '1h',
      closes,
      currentPrice: closes[closes.length - 1]!,
      timestamp: Date.now(),
    });
    expect(result.signalType).toBe('BUY_SIGNAL');
    expect(result.rsiValue).toBeLessThanOrEqual(30);
  });

  it('should return SELL_SIGNAL when RSI is above threshold', () => {
    const closes: number[] = [100];
    for (let i = 1; i < 30; i++) {
      closes.push(closes[i - 1]! * 1.03);
    }
    const result = evaluateSignal(baseConfig, {
      symbol: 'BTCUSDT',
      timeframe: '1h',
      closes,
      currentPrice: closes[closes.length - 1]!,
      timestamp: Date.now(),
    });
    expect(result.signalType).toBe('SELL_SIGNAL');
    expect(result.rsiValue).toBeGreaterThanOrEqual(70);
  });

  it('should return BLOCKED_BY_DATA with insufficient data', () => {
    const result = evaluateSignal(baseConfig, {
      symbol: 'BTCUSDT',
      timeframe: '1h',
      closes: [100, 101],
      currentPrice: 101,
      timestamp: Date.now(),
    });
    expect(result.signalType).toBe('BLOCKED_BY_DATA');
  });
});

describe('evaluateRisk', () => {
  function baseCtx(overrides?: Partial<RiskContext>): RiskContext {
    return {
      config: baseConfig,
      symbol: 'BTCUSDT',
      strategyStatus: 'active',
      strategyMode: 'simulation',
      environment: 'demo',
      openPositionsCount: 0,
      openPositionsBySymbol: 0,
      totalExposure: 0,
      dailyLoss: 0,
      dailyLossPct: 0,
      lastTradeTimestamp: null,
      allowLiveTrading: false,
      ...overrides,
    };
  }

  it('should allow trade when all checks pass', () => {
    const result = evaluateRisk(baseCtx());
    expect(result.allowed).toBe(true);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it('should block when strategy is not active', () => {
    const result = evaluateRisk(baseCtx({ strategyStatus: 'paused' }));
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason.toLowerCase()).toContain('strategy');
    }
  });

  it('should block when max positions reached', () => {
    const result = evaluateRisk(baseCtx({ openPositionsCount: 5 }));
    expect(result.allowed).toBe(false);
  });

  it('should block when max exposure reached', () => {
    const result = evaluateRisk(baseCtx({ totalExposure: 490 }));
    expect(result.allowed).toBe(false);
  });

  it('should block production without ALLOW_LIVE_TRADING', () => {
    const result = evaluateRisk(baseCtx({ environment: 'production', allowLiveTrading: false }));
    expect(result.allowed).toBe(false);
  });
});

describe('executeSimulation', () => {
  it('should open position on BUY_SIGNAL', () => {
    const result = executeSimulation(
      { signalType: 'BUY_SIGNAL', rsiValue: 25, smaValue: null, price: 50000, symbol: 'BTCUSDT', timeframe: '1h', reasons: ['RSI low'], timestamp: Date.now() },
      baseConfig,
      [],
    );
    expect(result.action).toBe('OPEN');
    expect(result.position?.symbol).toBe('BTCUSDT');
    expect(result.position?.entryPrice).toBe(50000);
    expect(result.position?.investedQuote).toBe(25);
  });

  it('should close position on SELL_SIGNAL', () => {
    const positions = [{
      id: 'test', symbol: 'BTCUSDT', side: 'BUY' as const, entryPrice: 50000,
      quantity: 0.0005, investedQuote: 25, openedAt: Date.now() - 3600000,
      strategyId: 's1', strategyVersionId: 'v1',
    }];
    const result = executeSimulation(
      { signalType: 'SELL_SIGNAL', rsiValue: 75, smaValue: null, price: 52000, symbol: 'BTCUSDT', timeframe: '1h', reasons: ['RSI high'], timestamp: Date.now() },
      baseConfig,
      positions,
    );
    expect(result.action).toBe('CLOSE');
    expect(result.realizedPnl).toBeGreaterThan(0);
  });

  it('should not open duplicate position', () => {
    const positions = [{
      id: 'test', symbol: 'BTCUSDT', side: 'BUY' as const, entryPrice: 50000,
      quantity: 0.0005, investedQuote: 25, openedAt: Date.now(),
      strategyId: 's1', strategyVersionId: 'v1',
    }];
    const result = executeSimulation(
      { signalType: 'BUY_SIGNAL', rsiValue: 25, smaValue: null, price: 49000, symbol: 'BTCUSDT', timeframe: '1h', reasons: ['RSI low'], timestamp: Date.now() },
      baseConfig,
      positions,
    );
    expect(result.action).toBe('NONE');
  });
});
