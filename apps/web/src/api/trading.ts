import { apiGet, apiPost } from './client.ts';

export interface Position {
  id: string;
  symbol: string;
  status: string;
  source: string;
  entryPrice: number;
  quantity: number;
  investedQuote: number;
  exitPrice: number | null;
  realizedPnl: number | null;
  realizedPnlPct: number | null;
  openedAt: string | null;
  closedAt: string | null;
  strategyId: string;
  createdAt: string;
}

export interface Order {
  id: string;
  symbol: string;
  side: string;
  type: string;
  status: string;
  quoteAmount: number | null;
  executedQuantity: number | null;
  avgPrice: number | null;
  exchange: string;
  environment: string;
  createdAt: string;
}

export interface Signal {
  id: string;
  symbol: string;
  timeframe: string;
  signalType: string;
  rsiValue: number | null;
  price: number | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface BinanceStatus {
  environment: string;
  configured: boolean;
  connected: boolean;
  latency: number | null;
  endpoints: string[];
}

export interface StreamStatus {
  klineConnected: boolean;
  userStreamConnected: boolean;
  listenKeyAge: number | null;
  subscriptionsCount: number;
}

export interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

export interface BinanceOpenOrder {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  side: string;
  type: string;
  status: string;
  price: string;
  origQty: string;
  executedQty: string;
  time: number;
  updateTime: number;
}

export interface ReconcileResult {
  message: string;
  balances: BinanceBalance[];
  environment: string;
}

export interface LiveReadinessResult {
  allowed: boolean;
  missing: string[];
  checks: {
    allowLiveTradingEnvSet: boolean;
    strategyApprovedForLive: boolean;
    riskLimitsConfigured: boolean;
    reconciliationActive: boolean;
    testOrdersPassed: boolean;
    auditLogHealthy: boolean;
    binanceConnected: boolean;
    credentialsValid: boolean;
  };
}

export interface PromoteResult {
  promoted: boolean;
  strategyId: string;
  metrics: {
    demoPositions: number;
    winRate: number;
    maxDrawdown: number;
    totalTrades: number;
  };
  liveReadiness: {
    allowed: boolean;
    missing: string[];
  };
  message: string;
}

export interface BinanceCredentialInfo {
  id: string;
  environment: string;
  label: string;
  enabled: boolean;
  apiKeyPreview: string;
  createdAt: string;
}

export const settingsApi = {
  getCredentials: () =>
    apiGet<{ success: true; data: BinanceCredentialInfo[] }>('/settings/binance-credentials'),
  saveCredentials: (data: { apiKey: string; apiSecret: string; environment: string; label?: string }) =>
    apiPost<{ success: true; data: { id: string; message: string } }>('/settings/binance-credentials', data),
  revokeCredentials: (id: string) =>
    apiPost<{ success: true; data: { message: string } }>(`/settings/binance-credentials/${id}/revoke`),
};

export const tradingApi = {
  getPositions: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiGet<{ success: boolean; data: Position[] }>(`/positions${query}`);
  },
  getOrders: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiGet<{ success: boolean; data: Order[] }>(`/orders${query}`);
  },
  getSignals: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiGet<{ success: boolean; data: Signal[] }>(`/signals${query}`);
  },
  getBinanceStatus: () =>
    apiGet<{ success: boolean; data: BinanceStatus }>('/binance/status'),
  getBinanceAccount: () =>
    apiGet<{ success: boolean; data: { balances: BinanceBalance[] } }>('/binance/account'),
  getOpenOrders: (symbol?: string) => {
    const query = symbol ? `?symbol=${symbol}` : '';
    return apiGet<{ success: boolean; data: BinanceOpenOrder[] }>(`/binance/open-orders${query}`);
  },
  reconcile: () =>
    apiPost<{ success: boolean; data: ReconcileResult }>('/binance/reconcile'),
  getKlines: (params: { symbol: string; interval: string }) => {
    const query = new URLSearchParams(params).toString();
    return apiGet<{ success: boolean; data: Array<{ openTime: number; open: string; high: string; low: string; close: string; volume: string; closeTime: number }> }>(`/binance/klines?${query}`);
  },
  getStreamStatus: () =>
    apiGet<{ success: boolean; data: StreamStatus }>('/binance/streams/status'),
  startStreams: () =>
    apiPost<{ success: boolean; data: unknown }>('/binance/streams/start'),
  stopStreams: () =>
    apiPost<{ success: boolean; data: unknown }>('/binance/streams/stop'),
  getLiveReadiness: () =>
    apiGet<{ success: boolean; data: LiveReadinessResult }>('/binance/live-readiness'),
  promoteStrategy: (strategyId: string) =>
    apiPost<{ success: boolean; data: PromoteResult; error?: { code: string; message: string } }>(`/strategies/${strategyId}/promote`),
};
