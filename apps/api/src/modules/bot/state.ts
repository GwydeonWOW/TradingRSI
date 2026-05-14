export type BotStatus = 'idle' | 'running' | 'paused' | 'error';

export interface BotState {
  status: BotStatus;
  activeStrategyId: string | null;
  activeStrategyVersionId: string | null;
  startedAt: number | null;
  lastEvaluationAt: number | null;
  lastSignalType: string | null;
  cycleCount: number;
  errorMessage: string | null;
}

let state: BotState = {
  status: 'idle',
  activeStrategyId: null,
  activeStrategyVersionId: null,
  startedAt: null,
  lastEvaluationAt: null,
  lastSignalType: null,
  cycleCount: 0,
  errorMessage: null,
};

export function getBotState(): BotState {
  return { ...state };
}

export function setBotState(update: Partial<BotState>): BotState {
  state = { ...state, ...update };
  return { ...state };
}

export function resetBotState(): void {
  state = {
    status: 'idle',
    activeStrategyId: null,
    activeStrategyVersionId: null,
    startedAt: null,
    lastEvaluationAt: null,
    lastSignalType: null,
    cycleCount: 0,
    errorMessage: null,
  };
}
