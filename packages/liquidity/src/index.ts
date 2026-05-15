import type { LiquidityInput, LiquidityHealthResult, LiquidityBlockScore } from './types.js';
import { calculateExecutionLiquidity } from './execution.js';
import { calculateActivity } from './activity.js';
import { calculateFragility } from './fragility.js';
import { calculateMacro } from './macro.js';
import { calculateCryptoSystemic } from './cryptoSystemic.js';
import { linearScore, scoreToState, scoreToDecision } from './scoring.js';

export function calculateLiquidityHealth(input: LiquidityInput): LiquidityHealthResult {
  const execution = calculateExecutionLiquidity(input.execution);
  const activity = calculateActivity(input.activity);
  const fragility = calculateFragility(input.fragility);

  // Macro block (optional)
  const macro: LiquidityBlockScore = input.macro
    ? calculateMacro(input.macro)
    : { score: 80, state: 'excellent', reasons: [], metrics: {} };

  // Crypto systemic block (optional)
  const cryptoSystemic: LiquidityBlockScore = input.cryptoSystemic
    ? calculateCryptoSystemic(input.cryptoSystemic)
    : { score: 80, state: 'excellent', reasons: [], metrics: {} };

  // Data quality score from API latency
  const latencyScore = linearScore(input.apiLatencyMs, 150, 2000);
  const dataQuality: LiquidityBlockScore = {
    score: Math.round(latencyScore * 10) / 10,
    state: scoreToState(latencyScore),
    reasons: input.apiLatencyMs > 1000 ? ['Latencia API alta'] : [],
    metrics: { apiLatencyMs: input.apiLatencyMs },
  };

  // Weighted final score per spec:
  // 35% execution, 15% activity, 15% fragility, 15% macro, 10% crypto systemic, 10% data quality
  const hasMacro = input.macro !== undefined;
  const hasCrypto = input.cryptoSystemic !== undefined;

  let rawScore: number;
  if (hasMacro && hasCrypto) {
    rawScore =
      0.35 * execution.score +
      0.15 * activity.score +
      0.15 * fragility.score +
      0.15 * macro.score +
      0.10 * cryptoSystemic.score +
      0.10 * dataQuality.score;
  } else if (hasMacro) {
    // Redistribute crypto weight to other blocks proportionally
    rawScore =
      0.39 * execution.score +
      0.17 * activity.score +
      0.17 * fragility.score +
      0.17 * macro.score +
      0.10 * dataQuality.score;
  } else if (hasCrypto) {
    rawScore =
      0.41 * execution.score +
      0.18 * activity.score +
      0.18 * fragility.score +
      0.12 * cryptoSystemic.score +
      0.11 * dataQuality.score;
  } else {
    // No macro or crypto: redistribute proportionally
    rawScore =
      0.46 * execution.score +
      0.20 * activity.score +
      0.20 * fragility.score +
      0.14 * dataQuality.score;
  }

  const score = Math.round(rawScore * 10) / 10;
  const { decision, multiplier: liquidityMultiplier } = scoreToDecision(score);

  const allReasons = [
    ...execution.reasons,
    ...activity.reasons,
    ...fragility.reasons,
    ...macro.reasons,
    ...cryptoSystemic.reasons,
    ...dataQuality.reasons,
  ];

  // Hard blocks
  const spreadBps =
    ((input.execution.bestAsk - input.execution.bestBid) /
      ((input.execution.bestAsk + input.execution.bestBid) / 2)) *
    10000;
  const isHardBlock = input.apiLatencyMs > 2000 || spreadBps > 50;

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
