import { apiGet, apiPost } from './client.ts';

export type BotStatusType = 'idle' | 'running' | 'paused' | 'error';

export interface BotStatus {
  status: BotStatusType;
  activeStrategyId: string | null;
  startedAt: number | null;
  lastEvaluationAt: number | null;
  lastSignalType: string | null;
  cycleCount: number;
  errorMessage: string | null;
  strategyName: string | null;
}

export interface BotEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export const botApi = {
  getStatus: () => apiGet<{ success: boolean; data: BotStatus }>('/bot/status'),
  getEvents: (limit = 50) => apiGet<{ success: boolean; data: BotEvent[] }>(`/bot/events?limit=${limit}`),
  start: (strategyId: string) => apiPost<{ success: boolean; data: BotStatus }>('/bot/start', { strategyId }),
  stop: () => apiPost<{ success: boolean; data: BotStatus }>('/bot/stop'),
  evaluateNow: () => apiPost<{ success: boolean; data: BotStatus }>('/bot/evaluate-now'),
  killSwitch: () => apiPost<{ success: boolean; data: unknown }>('/bot/kill-switch'),
};
