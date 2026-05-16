import { apiGet, apiPost } from './client.ts';

export interface LiquidityBlock {
  score: number;
  state: string;
  reasons: string[];
  metrics: Record<string, number | null>;
}

export interface LiquidityResult {
  symbol: string;
  score: number;
  state: string;
  confidence: number;
  decision: string;
  liquidityMultiplier: number;
  execution: LiquidityBlock;
  activity: LiquidityBlock;
  fragility: LiquidityBlock;
  dataQuality: LiquidityBlock;
  cryptoSystemic?: Record<string, number | null> | null;
  macro?: Record<string, number | null> | null;
  reasons: string[];
}

export interface BtcStabilityFilter {
  name: string;
  passed: boolean;
  value: number | string;
  threshold: string;
  reason: string;
}

export interface BtcStabilityResult {
  score: number;
  maxScore: number;
  passed: boolean;
  minScore: number;
  filters: BtcStabilityFilter[];
}

export const liquidityApi = {
  getCurrent: (symbol: string, params?: { side?: string; quoteAmount?: number }) => {
    const query = new URLSearchParams();
    if (params?.side) query.set('side', params.side);
    if (params?.quoteAmount) query.set('quoteAmount', params.quoteAmount.toString());
    return apiGet<{ success: true; data: LiquidityResult }>(`/liquidity/${symbol}/current?${query.toString()}`);
  },
  getHistory: (symbol: string, hours = 24) =>
    apiGet<{ success: true; data: Array<Record<string, unknown>> }>(`/liquidity/${symbol}/history?hours=${hours}`),
  simulateOrder: (symbol: string, data: { side: string; quoteAmount: number }) =>
    apiPost<{ success: true; data: Record<string, unknown> }>(`/liquidity/${symbol}/simulate-order`, data),
  getBtcStability: () =>
    apiGet<{ success: true; data: BtcStabilityResult }>('/liquidity/btc-stability'),
};
