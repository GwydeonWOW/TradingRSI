import { z } from 'zod';

export const EntryConfigSchema = z.object({
  rsiBelow: z.number().min(0).max(100),
  requireMultiTimeframeConfirmation: z.boolean(),
  useSmaFilter: z.boolean(),
  smaPeriod: z.number().positive(),
  cooldownMinutes: z.number().nonnegative(),
});

export const ExitConfigSchema = z.object({
  rsiAbove: z.number().min(0).max(100),
  takeProfitPct: z.number().positive(),
  stopLossPct: z.number().positive(),
  trailingStopPct: z.number().positive().nullable(),
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
});

export const CreateStrategySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  mode: z.enum(['simulation', 'binance_demo', 'binance_live']),
  environment: z.enum(['demo', 'testnet', 'production']),
  config: StrategyConfigSchema,
});
