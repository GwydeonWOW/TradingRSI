import type { LiquidityBlockScore } from './types.js';
import { linearScore, scoreToState } from './scoring.js';

export interface MacroInput {
  sofrLevel: number | null;
  sofrChange5d: number | null;
  netUsdLiquidityChange4w: number | null;
}

export function calculateMacro(input: MacroInput): LiquidityBlockScore {
  let sofrScore = 50;
  if (input.sofrLevel !== null) {
    // SOFR > 5.5 = stress, SOFR 4-5.5 = neutral, < 4 = easy
    sofrScore = linearScore(input.sofrLevel, 4.0, 6.0);
  }

  let sofrChangeScore = 50;
  if (input.sofrChange5d !== null) {
    sofrChangeScore = linearScore(Math.abs(input.sofrChange5d), 0.1, 1.0);
  }

  let liquidityScore = 50;
  if (input.netUsdLiquidityChange4w !== null) {
    // Negative change = less liquidity
    liquidityScore = linearScore(input.netUsdLiquidityChange4w, -0.02, -0.1);
  }

  const score = sofrScore * 0.3 + sofrChangeScore * 0.3 + liquidityScore * 0.4;

  const reasons: string[] = [];
  if (input.sofrLevel !== null && input.sofrLevel > 5.5) reasons.push(`SOFR alto: ${input.sofrLevel.toFixed(2)}%`);
  if (input.sofrChange5d !== null && Math.abs(input.sofrChange5d) > 0.5) reasons.push(`SOFR cambio rapido: ${input.sofrChange5d > 0 ? '+' : ''}${input.sofrChange5d.toFixed(2)}%`);
  if (input.netUsdLiquidityChange4w !== null && input.netUsdLiquidityChange4w < -0.05) reasons.push('Liquidez USD neta cayendo');

  return {
    score: Math.round(score * 10) / 10,
    state: scoreToState(score),
    reasons,
    metrics: {
      sofrLevel: input.sofrLevel,
      sofrChange5d: input.sofrChange5d,
      netUsdLiquidityChange4w: input.netUsdLiquidityChange4w,
    },
  };
}
