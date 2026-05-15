import type { LiquidityState, TradeDecision } from './types.js';

export function linearScore(value: number, good: number, bad: number, inverse = true): number {
  if (!isFinite(value)) return 50; // neutral default for missing/bad data
  if (inverse) {
    if (value <= good) return 100;
    if (value >= bad) return 0;
    return 100 * (1 - (value - good) / (bad - good));
  }
  if (value >= good) return 100;
  if (value <= bad) return 0;
  return 100 * ((value - bad) / (good - bad));
}

export function weightedAverage(scores: Array<{ score: number; weight: number }>): number {
  const totalWeight = scores.reduce((s, x) => s + x.weight, 0);
  if (totalWeight === 0) return 0;
  return scores.reduce((s, x) => s + x.score * x.weight, 0) / totalWeight;
}

export function scoreToState(score: number): LiquidityState {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 50) return 'acceptable';
  if (score >= 35) return 'weak';
  return 'critical';
}

export function scoreToDecision(score: number): { decision: TradeDecision; multiplier: number } {
  if (score >= 65) return { decision: 'ALLOW', multiplier: 1.0 };
  if (score >= 50) return { decision: 'REDUCE', multiplier: 0.5 };
  if (score >= 35) return { decision: 'REDUCE', multiplier: 0.25 };
  return { decision: 'BLOCK', multiplier: 0 };
}
