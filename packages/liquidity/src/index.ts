import type { LiquidityInput, LiquidityHealthResult, LiquidityBlockScore } from './types.js';
import { calculateExecutionLiquidity } from './execution.js';
import { calculateActivity } from './activity.js';
import { calculateFragility } from './fragility.js';
import { linearScore, scoreToState, scoreToDecision } from './scoring.js';

export function calculateLiquidityHealth(input: LiquidityInput): LiquidityHealthResult {
  const execution = calculateExecutionLiquidity(input.execution);
  const activity = calculateActivity(input.activity);
  const fragility = calculateFragility(input.fragility);

  // Data quality score from API latency
  const latencyScore = linearScore(input.apiLatencyMs, 150, 2000);
  const dataQuality: LiquidityBlockScore = {
    score: Math.round(latencyScore * 10) / 10,
    state: scoreToState(latencyScore),
    reasons: input.apiLatencyMs > 1000 ? ['Latencia API alta'] : [],
    metrics: { apiLatencyMs: input.apiLatencyMs },
  };

  // Weighted final score (same as spec: 35% exec, 15% activity, 15% fragility, 10% data quality)
  // Remaining 25% reserved for macro+crypto systemic (Phase 2) — distribute proportionally
  const rawScore =
    0.467 * execution.score +
    0.200 * activity.score +
    0.200 * fragility.score +
    0.133 * dataQuality.score;

  const score = Math.round(rawScore * 10) / 10;
  const { decision, multiplier: liquidityMultiplier } = scoreToDecision(score);

  const allReasons = [
    ...execution.reasons,
    ...activity.reasons,
    ...fragility.reasons,
    ...dataQuality.reasons,
  ];

  // Hard blocks
  const isHardBlock =
    input.apiLatencyMs > 2000 ||
    (input.execution.bestAsk - input.execution.bestBid) / ((input.execution.bestAsk + input.execution.bestBid) / 2) * 10000 > 50;

  const finalDecision = isHardBlock ? 'BLOCK' : decision;
  const finalMultiplier = isHardBlock ? 0 : liquidityMultiplier;

  if (isHardBlock) {
    allReasons.unshift('BLOQUEO: condicion critica detectada');
  }

  return {
    score,
    state: scoreToState(score),
    confidence: input.activity.relativeVolume !== null ? 0.9 : 0.7,
    decision: finalDecision,
    liquidityMultiplier: finalMultiplier,
    execution,
    activity,
    fragility,
    dataQuality,
    reasons: allReasons,
  };
}

export type { LiquidityInput, LiquidityHealthResult, LiquidityBlockScore, LiquidityState, TradeDecision } from './types.js';
