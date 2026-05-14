import { describe, it, expect } from 'vitest';
import { StrategyConfigSchema, CreateStrategySchema } from '../schemas/index.js';

const validConfig = {
  symbols: ['BTCUSDT', 'ETHUSDT'],
  timeframes: ['15m', '1h', '4h'],
  entry: {
    rsiBelow: 30,
    requireMultiTimeframeConfirmation: true,
    useSmaFilter: true,
    smaPeriod: 200,
    cooldownMinutes: 360,
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
    cooldownMinutes: 360,
  },
  execution: {
    orderType: 'MARKET' as const,
    useOrderTestBeforeRealOrder: true,
    dryRun: true,
  },
};

describe('StrategyConfigSchema', () => {
  it('should validate a valid strategy config', () => {
    const result = StrategyConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should reject config without symbols', () => {
    const invalid = { ...validConfig, symbols: [] };
    const result = StrategyConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject config with rsiBelow > 100', () => {
    const invalid = {
      ...validConfig,
      entry: { ...validConfig.entry, rsiBelow: 150 },
    };
    const result = StrategyConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject config with negative stopLossPct', () => {
    const invalid = {
      ...validConfig,
      exit: { ...validConfig.exit, stopLossPct: -1 },
    };
    const result = StrategyConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('CreateStrategySchema', () => {
  it('should validate a valid strategy creation', () => {
    const result = CreateStrategySchema.safeParse({
      name: 'Test Strategy',
      description: 'A test strategy',
      mode: 'simulation',
      environment: 'demo',
      config: validConfig,
    });
    expect(result.success).toBe(true);
  });

  it('should reject strategy without name', () => {
    const result = CreateStrategySchema.safeParse({
      name: '',
      mode: 'simulation',
      environment: 'demo',
      config: validConfig,
    });
    expect(result.success).toBe(false);
  });
});
