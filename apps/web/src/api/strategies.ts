import { apiGet, apiPost, apiPut, apiDelete } from './client.ts';
import type { StrategyStatus, ExecutionMode, ExchangeEnvironment, StrategyConfig } from '@cryptorsi/shared';

export interface StrategyListItem {
  id: string;
  name: string;
  description: string | null;
  status: StrategyStatus;
  mode: ExecutionMode;
  environment: ExchangeEnvironment;
  currentVersion: number | null;
  symbols: string[];
  updatedAt: string;
}

export interface StrategyMetrics {
  totalTrades: number;
  totalRealizedPnl: number;
  winRate: number;
}

export interface StrategyDetail extends StrategyListItem {
  versions: Array<{
    id: string;
    version: number;
    createdAt: string;
  }>;
  metrics: StrategyMetrics;
  createdAt: string;
}

export interface PaginatedStrategies {
  success: true;
  data: StrategyListItem[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface BacktestRequest {
  strategyId: string;
  strategyVersionId?: string;
  interval: string;
  startDate: string;
  endDate: string;
  initialCapital?: number;
  commissionRate?: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPct: number;
  roi: number;
  maxDrawdown: number;
  profitFactor: number;
  avgTradeDuration: number;
  bestTrade: number;
  worstTrade: number;
  sharpeRatio: number;
  finalCapital: number;
}

export interface BacktestTrade {
  symbol?: string;
  entryTime: number;
  exitTime: number;
  side: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  investedQuote: number;
  pnl: number;
  pnlPct: number;
  exitReason: string;
}

export interface BacktestCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestResult {
  params: BacktestRequest;
  metrics: BacktestMetrics;
  trades: BacktestTrade[];
  equityCurve: Array<{ time: number; equity: number }>;
  perSymbol?: Record<string, { metrics: BacktestMetrics; trades: BacktestTrade[]; candleCount: number }>;
  symbols?: string[];
  candles?: Record<string, BacktestCandle[]>;
}

export interface StrategyVersion {
  id: string;
  version: number;
  config: StrategyConfig;
  createdAt: string;
}

export const strategiesApi = {
  list: (params?: { status?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', params.page.toString());
    return apiGet<PaginatedStrategies>(`/strategies?${query.toString()}`);
  },
  get: (id: string) => apiGet<{ success: true; data: StrategyDetail }>(`/strategies/${id}`),
  getVersion: (strategyId: string, versionId: string) =>
    apiGet<{ success: true; data: StrategyVersion }>(`/strategies/${strategyId}/versions/${versionId}`),
  create: (data: { name: string; description?: string; mode: string; environment: string; config: StrategyConfig }) =>
    apiPost<{ success: true; data: StrategyDetail }>('/strategies', data),
  update: (id: string, data: { name?: string; description?: string; status?: string; config?: StrategyConfig }) =>
    apiPut<{ success: true; data: StrategyDetail }>(`/strategies/${id}`, data),
  activate: (id: string) => apiPost<{ success: true; data: StrategyDetail }>(`/strategies/${id}/activate`),
  pause: (id: string) => apiPost<{ success: true; data: StrategyDetail }>(`/strategies/${id}/pause`),
  duplicate: (id: string) => apiPost<{ success: true; data: StrategyDetail }>(`/strategies/${id}/duplicate`),
  delete: (id: string) => apiDelete<{ success: true; data: { id: string } }>(`/strategies/${id}`),
};

export const backtestsApi = {
  run: (data: BacktestRequest) => apiPost<{ success: true; data: BacktestResult }>('/backtests', data),
  list: (params?: { strategyId?: string; symbol?: string }) => {
    const query = new URLSearchParams();
    if (params?.strategyId) query.set('strategyId', params.strategyId);
    if (params?.symbol) query.set('symbol', params.symbol);
    return apiGet<{ success: true; data: BacktestResult[] }>(`/backtests?${query.toString()}`);
  },
  compare: (params: { strategyId: string; versionA: number; versionB: number; symbol: string; interval: string; startDate: string; endDate: string }) => {
    const query = new URLSearchParams({
      strategyId: params.strategyId,
      versionA: String(params.versionA),
      versionB: String(params.versionB),
      symbol: params.symbol,
      interval: params.interval,
      startDate: params.startDate,
      endDate: params.endDate,
    });
    return apiGet<{ success: true; data: { a: BacktestResult; b: BacktestResult } }>(`/backtests/compare?${query.toString()}`);
  },
};
