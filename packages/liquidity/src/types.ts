export type LiquidityState = 'excellent' | 'good' | 'acceptable' | 'weak' | 'critical';
export type TradeDecision = 'ALLOW' | 'REDUCE' | 'BLOCK';

export interface LiquidityBlockScore {
  score: number;
  state: LiquidityState;
  reasons: string[];
  metrics: Record<string, number | null>;
}

export interface ExecutionLiquidityInput {
  bestBid: number;
  bestAsk: number;
  asks: Array<{ price: number; qty: number }>;
  bids: Array<{ price: number; qty: number }>;
  side: 'BUY' | 'SELL';
  quoteAmount: number;
}

export interface ActivityInput {
  quoteVolume24h: number;
  tradesCount1m: number;
  timeSinceLastTradeMs: number;
  relativeVolume: number | null;
}

export interface FragilityInput {
  closes1m: number[];
}

export interface LiquidityInput {
  execution: ExecutionLiquidityInput;
  activity: ActivityInput;
  fragility: FragilityInput;
  apiLatencyMs: number;
}

export interface LiquidityHealthResult {
  score: number;
  state: LiquidityState;
  confidence: number;
  decision: TradeDecision;
  liquidityMultiplier: number;
  execution: LiquidityBlockScore;
  activity: LiquidityBlockScore;
  fragility: LiquidityBlockScore;
  dataQuality: LiquidityBlockScore;
  reasons: string[];
}
