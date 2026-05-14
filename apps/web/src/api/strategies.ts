import { apiGet, apiPost, apiPut } from './client.ts';
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

export interface StrategyDetail extends StrategyListItem {
  versions: Array<{
    id: string;
    version: number;
    createdAt: string;
  }>;
  createdAt: string;
}

export interface PaginatedStrategies {
  success: true;
  data: StrategyListItem[];
  pagination: { page: number; pageSize: number; total: number };
}

export const strategiesApi = {
  list: (params?: { status?: string; page?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', params.page.toString());
    return apiGet<PaginatedStrategies>(`/strategies?${query.toString()}`);
  },
  get: (id: string) => apiGet<{ success: true; data: StrategyDetail }>(`/strategies/${id}`),
  create: (data: { name: string; description?: string; mode: string; environment: string; config: StrategyConfig }) =>
    apiPost<{ success: true; data: StrategyDetail }>('/strategies', data),
  update: (id: string, data: { name?: string; description?: string; status?: string }) =>
    apiPut<{ success: true; data: StrategyDetail }>(`/strategies/${id}`, data),
  activate: (id: string) => apiPost<{ success: true; data: StrategyDetail }>(`/strategies/${id}/activate`),
  pause: (id: string) => apiPost<{ success: true; data: StrategyDetail }>(`/strategies/${id}/pause`),
  duplicate: (id: string) => apiPost<{ success: true; data: StrategyDetail }>(`/strategies/${id}/duplicate`),
};
