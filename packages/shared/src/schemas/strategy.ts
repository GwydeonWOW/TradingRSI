import { z } from 'zod';

export const TimeframeConditionSchema = z.object({
  timeframe: z.string(),
  rsiBelow: z.number().min(0).max(100).optional(),
  rsiAbove: z.number().min(0).max(100).optional(),
});

export const EntryConfigSchema = z.object({
  entryMode: z.enum(['rsi_threshold', 'divergence']).optional(),
  rsiBelow: z.number().min(0).max(100),
  rsiAbove: z.number().min(0).max(100).optional(),
  rsiPeriod: z.number().positive().optional(),
  useRsiDivergence: z.boolean().optional(),
  requireMultiTimeframeConfirmation: z.boolean(),
  multiTimeframeConditions: z.array(TimeframeConditionSchema).optional(),
  useSmaFilter: z.boolean(),
  smaPeriod: z.number().positive(),
  useVolumeConfirmation: z.boolean().optional(),
  volumeMultiplier: z.number().positive().optional(),
});

export const ExitConfigSchema = z.object({
  rsiAbove: z.number().min(0).max(100),
  takeProfitPct: z.number().positive().nullable(),
  stopLossPct: z.number().positive().nullable(),
  trailingStopPct: z.number().positive().nullable(),
  exitOnBearishDivergence: z.boolean().optional(),
});

export const RiskConfigSchema = z.object({
  quoteAmountPerTrade: z.number().positive(),
  maxOpenPositions: z.number().int().positive(),
  maxPositionsPerSymbol: z.number().int().positive(),
  maxTotalExposureQuote: z.number().positive(),
  maxDailyLossPct: z.number().min(0).max(100),
  cooldownMinutes: z.number().nonnegative(),
});

export const ExecutionConfigSchema = z.object({
  orderType: z.literal('MARKET'),
  useOrderTestBeforeRealOrder: z.boolean(),
  dryRun: z.boolean(),
});

export const StrategyConfigSchema = z.object({
  symbols: z.array(z.string()).min(1),
  timeframes: z.array(z.string()).min(1),
  entry: EntryConfigSchema,
  exit: ExitConfigSchema,
  risk: RiskConfigSchema,
  execution: ExecutionConfigSchema,
  btcStability: z.object({
    enabled: z.boolean(),
    minScore: z.number().min(0).max(5),
  }).optional(),
});

export const CreateStrategySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  mode: z.enum(['simulation', 'signal_only', 'binance_demo', 'binance_live']),
  environment: z.enum(['demo', 'testnet', 'production']),
  config: StrategyConfigSchema,
});
