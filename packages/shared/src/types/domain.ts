// Strategy
export type StrategyStatus = 'draft' | 'active' | 'paused' | 'archived';
export type ExecutionMode =
  | 'simulation'
  | 'signal_only'
  | 'binance_demo_dry_run'
  | 'binance_demo_live'
  | 'binance_live_dry_run'
  | 'binance_live';
export type ExchangeEnvironment = 'demo' | 'testnet' | 'production';

// Strategy config (seccion 10.2)
export interface StrategyConfig {
  symbols: string[];
  timeframes: string[];
  entry: EntryConfig;
  exit: ExitConfig;
  risk: RiskConfig;
  execution: ExecutionConfig;
  btcStability?: {
    enabled: boolean;
    minScore: number;
  };
}

export interface TimeframeCondition {
  timeframe: string;
  rsiBelow?: number;
  rsiAbove?: number;
}

export interface EntryConfig {
  entryMode?: 'rsi_threshold' | 'divergence';
  rsiBelow: number;
  rsiAbove?: number;
  rsiPeriod?: number;
  useRsiDivergence?: boolean;
  requireMultiTimeframeConfirmation: boolean;
  multiTimeframeConditions?: TimeframeCondition[];
  useSmaFilter: boolean;
  smaPeriod: number;
  trendConfirmCandles?: number;
}

export interface ExitConfig {
  rsiAbove: number;
  takeProfitPct: number | null;
  stopLossPct: number | null;
  trailingStopPct: number | null;
  exitOnBearishDivergence?: boolean;
}

export interface RiskConfig {
  quoteAmountPerTrade: number;
  maxOpenPositions: number;
  maxPositionsPerSymbol: number;
  maxTotalExposureQuote: number;
  maxDailyLossPct: number;
  cooldownMinutes: number;
}

export interface ExecutionConfig {
  orderType: 'MARKET';
  useOrderTestBeforeRealOrder: boolean;
  dryRun: boolean;
}

// Signal types (seccion 10.3)
export type SignalType =
  | 'BUY_SIGNAL'
  | 'SELL_SIGNAL'
  | 'HOLD'
  | 'BLOCKED_BY_RISK'
  | 'BLOCKED_BY_DATA'
  | 'BLOCKED_BY_ENVIRONMENT';

// Order types (seccion 21.1)
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderStatus =
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'UNKNOWN';

// Risk (seccion 11.2)
export interface RiskCheck {
  rule: string;
  passed: boolean;
  reason?: string;
}

export type RiskResult =
  | { allowed: true; checks: RiskCheck[] }
  | { allowed: false; reason: string; checks: RiskCheck[] };

// Binance environment config (seccion 21.2-21.3)
export interface BinanceEnvironmentConfig {
  restBaseUrl: string;
  streamBaseUrl: string;
  wsApiBaseUrl: string;
}
