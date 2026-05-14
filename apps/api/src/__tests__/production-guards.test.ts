import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import {
  assertLiveGuard,
  isLiveEnvironment,
  checkLiveReadiness,
  canPromoteToLive,
  type LiveTradingChecklist,
} from '../domain/guards/index.js';
import { validateLiveRiskLimits, DEFAULT_LIVE_LIMITS } from '../domain/risk/liveLimits.js';

// ---------------------------------------------------------------------------
// assertLiveGuard
// ---------------------------------------------------------------------------

describe('assertLiveGuard', () => {
  const originalEnv = process.env.ALLOW_LIVE_TRADING;

  beforeEach(() => {
    delete process.env.ALLOW_LIVE_TRADING;
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.ALLOW_LIVE_TRADING = originalEnv;
    }
  });

  it('should throw for production environment without ALLOW_LIVE_TRADING', () => {
    expect(() => assertLiveGuard('production')).toThrow(
      'Live trading is BLOCKED for environment "production"',
    );
  });

  it('should not throw for production environment when ALLOW_LIVE_TRADING=true', () => {
    process.env.ALLOW_LIVE_TRADING = 'true';
    expect(() => assertLiveGuard('production')).not.toThrow();
  });

  it('should not throw for demo environment', () => {
    expect(() => assertLiveGuard('demo')).not.toThrow();
  });

  it('should not throw for testnet environment', () => {
    expect(() => assertLiveGuard('testnet')).not.toThrow();
  });

  it('should throw for production even with ALLOW_LIVE_TRADING=false', () => {
    process.env.ALLOW_LIVE_TRADING = 'false';
    expect(() => assertLiveGuard('production')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// isLiveEnvironment
// ---------------------------------------------------------------------------

describe('isLiveEnvironment', () => {
  it('should return true for production', () => {
    expect(isLiveEnvironment('production')).toBe(true);
  });

  it('should return false for demo', () => {
    expect(isLiveEnvironment('demo')).toBe(false);
  });

  it('should return false for testnet', () => {
    expect(isLiveEnvironment('testnet')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isLiveEnvironment('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkLiveReadiness
// ---------------------------------------------------------------------------

describe('checkLiveReadiness', () => {
  const allPassed: LiveTradingChecklist = {
    allowLiveTradingEnvSet: true,
    strategyApprovedForLive: true,
    riskLimitsConfigured: true,
    reconciliationActive: true,
    testOrdersPassed: true,
    auditLogHealthy: true,
    binanceConnected: true,
    credentialsValid: true,
  };

  it('should return allowed=true when all checks pass', () => {
    const result = checkLiveReadiness(allPassed);
    expect(result.allowed).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.checks).toEqual(allPassed);
  });

  it('should return allowed=false when env var is not set', () => {
    const checks = { ...allPassed, allowLiveTradingEnvSet: false };
    const result = checkLiveReadiness(checks);
    expect(result.allowed).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toContain('ALLOW_LIVE_TRADING');
  });

  it('should return allowed=false when all checks fail', () => {
    const nonePassed: LiveTradingChecklist = {
      allowLiveTradingEnvSet: false,
      strategyApprovedForLive: false,
      riskLimitsConfigured: false,
      reconciliationActive: false,
      testOrdersPassed: false,
      auditLogHealthy: false,
      binanceConnected: false,
      credentialsValid: false,
    };
    const result = checkLiveReadiness(nonePassed);
    expect(result.allowed).toBe(false);
    expect(result.missing).toHaveLength(8);
  });

  it('should return allowed=false when only binance is disconnected', () => {
    const checks = { ...allPassed, binanceConnected: false };
    const result = checkLiveReadiness(checks);
    expect(result.allowed).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toContain('Binance');
  });

  it('should return multiple missing items as expected', () => {
    const checks = { ...allPassed, credentialsValid: false, testOrdersPassed: false };
    const result = checkLiveReadiness(checks);
    expect(result.allowed).toBe(false);
    expect(result.missing).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// canPromoteToLive
// ---------------------------------------------------------------------------

describe('canPromoteToLive', () => {
  it('should block promotion if strategy is not active', () => {
    const result = canPromoteToLive({
      status: 'draft',
      mode: 'binance_demo',
      environment: 'demo',
      hasDemoHistory: true,
      backtestResults: { winRate: 60, maxDrawdown: 10 },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('draft');
  });

  it('should block promotion if mode is not binance_demo', () => {
    const result = canPromoteToLive({
      status: 'active',
      mode: 'simulation',
      environment: 'demo',
      hasDemoHistory: true,
      backtestResults: { winRate: 60, maxDrawdown: 10 },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('simulation');
  });

  it('should block promotion if environment is not demo', () => {
    const result = canPromoteToLive({
      status: 'active',
      mode: 'binance_demo',
      environment: 'production',
      hasDemoHistory: true,
      backtestResults: { winRate: 60, maxDrawdown: 10 },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('production');
  });

  it('should block promotion if no demo history', () => {
    const result = canPromoteToLive({
      status: 'active',
      mode: 'binance_demo',
      environment: 'demo',
      hasDemoHistory: false,
      backtestResults: { winRate: 60, maxDrawdown: 10 },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('demo');
  });

  it('should block promotion if no backtest results', () => {
    const result = canPromoteToLive({
      status: 'active',
      mode: 'binance_demo',
      environment: 'demo',
      hasDemoHistory: true,
      backtestResults: null,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('backtest');
  });

  it('should block promotion if win rate is below 50%', () => {
    const result = canPromoteToLive({
      status: 'active',
      mode: 'binance_demo',
      environment: 'demo',
      hasDemoHistory: true,
      backtestResults: { winRate: 40, maxDrawdown: 10 },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason!.toLowerCase()).toContain('win rate');
  });

  it('should block promotion if max drawdown exceeds 20%', () => {
    const result = canPromoteToLive({
      status: 'active',
      mode: 'binance_demo',
      environment: 'demo',
      hasDemoHistory: true,
      backtestResults: { winRate: 60, maxDrawdown: 25 },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('drawdown');
  });

  it('should allow promotion when all conditions are met', () => {
    const result = canPromoteToLive({
      status: 'active',
      mode: 'binance_demo',
      environment: 'demo',
      hasDemoHistory: true,
      backtestResults: { winRate: 60, maxDrawdown: 10 },
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should allow promotion at exactly 50% win rate', () => {
    const result = canPromoteToLive({
      status: 'active',
      mode: 'binance_demo',
      environment: 'demo',
      hasDemoHistory: true,
      backtestResults: { winRate: 50, maxDrawdown: 10 },
    });
    expect(result.allowed).toBe(true);
  });

  it('should allow promotion at exactly 20% max drawdown', () => {
    const result = canPromoteToLive({
      status: 'active',
      mode: 'binance_demo',
      environment: 'demo',
      hasDemoHistory: true,
      backtestResults: { winRate: 60, maxDrawdown: 20 },
    });
    expect(result.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateLiveRiskLimits
// ---------------------------------------------------------------------------

describe('validateLiveRiskLimits', () => {
  it('should return no errors for default limits', () => {
    const errors = validateLiveRiskLimits(DEFAULT_LIVE_LIMITS);
    expect(errors).toHaveLength(0);
  });

  it('should return error for zero maxPositionSizeUsdt', () => {
    const errors = validateLiveRiskLimits({ ...DEFAULT_LIVE_LIMITS, maxPositionSizeUsdt: 0 });
    expect(errors).toContain('maxPositionSizeUsdt must be positive');
  });

  it('should return error for maxPositionSizeUsdt exceeding 100', () => {
    const errors = validateLiveRiskLimits({ ...DEFAULT_LIVE_LIMITS, maxPositionSizeUsdt: 150 });
    expect(errors.some(e => e.includes('maxPositionSizeUsdt exceeds'))).toBe(true);
  });

  it('should return error when maxTotalExposureUsdt < maxPositionSizeUsdt', () => {
    const errors = validateLiveRiskLimits({ ...DEFAULT_LIVE_LIMITS, maxTotalExposureUsdt: 10, maxPositionSizeUsdt: 50 });
    expect(errors).toContain('maxTotalExposureUsdt must be >= maxPositionSizeUsdt');
  });

  it('should return error for negative maxDailyLossUsdt', () => {
    const errors = validateLiveRiskLimits({ ...DEFAULT_LIVE_LIMITS, maxDailyLossUsdt: -5 });
    expect(errors).toContain('maxDailyLossUsdt must be positive');
  });

  it('should return error for maxDailyLossUsdt exceeding 50', () => {
    const errors = validateLiveRiskLimits({ ...DEFAULT_LIVE_LIMITS, maxDailyLossUsdt: 60 });
    expect(errors.some(e => e.includes('maxDailyLossUsdt exceeds'))).toBe(true);
  });

  it('should return error for zero maxOrdersPerDay', () => {
    const errors = validateLiveRiskLimits({ ...DEFAULT_LIVE_LIMITS, maxOrdersPerDay: 0 });
    expect(errors).toContain('maxOrdersPerDay must be positive');
  });

  it('should return error for maxOrdersPerDay exceeding 50', () => {
    const errors = validateLiveRiskLimits({ ...DEFAULT_LIVE_LIMITS, maxOrdersPerDay: 100 });
    expect(errors.some(e => e.includes('maxOrdersPerDay exceeds'))).toBe(true);
  });

  it('should return error for negative minTimeBetweenOrders', () => {
    const errors = validateLiveRiskLimits({ ...DEFAULT_LIVE_LIMITS, minTimeBetweenOrders: -1000 });
    expect(errors).toContain('minTimeBetweenOrders must be non-negative');
  });

  it('should return error for minTimeBetweenOrders below 30s', () => {
    const errors = validateLiveRiskLimits({ ...DEFAULT_LIVE_LIMITS, minTimeBetweenOrders: 10_000 });
    expect(errors.some(e => e.includes('minTimeBetweenOrders should be at least'))).toBe(true);
  });

  it('should return multiple errors for multiple invalid fields', () => {
    const errors = validateLiveRiskLimits({
      maxPositionSizeUsdt: 0,
      maxTotalExposureUsdt: 0,
      maxDailyLossUsdt: 0,
      maxOrdersPerDay: 0,
      minTimeBetweenOrders: -1,
      requireOrderTestBeforeLive: true,
    });
    expect(errors.length).toBeGreaterThanOrEqual(5);
  });
});
