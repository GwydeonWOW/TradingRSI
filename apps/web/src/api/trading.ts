import { apiGet } from './client.ts';

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
    apiGet<{ success: boolean; data: { environment: string; configured: boolean; connected: boolean; latency: number; endpoints: string[] } }>('/binance/status'),
  getKlines: (params: { symbol: string; interval: string }) => {
    const query = new URLSearchParams(params).toString();
    return apiGet<{ success: boolean; data: Array<{ openTime: number; open: string; high: string; low: string; close: string; volume: string; closeTime: number }> }>(`/binance/klines?${query}`);
  },
};
