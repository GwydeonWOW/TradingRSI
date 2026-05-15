import type { FragilityInput, LiquidityBlockScore } from './types.js';
import { linearScore, scoreToState } from './scoring.js';

export function calculateFragility(input: FragilityInput): LiquidityBlockScore {
  const closes = input.closes1m;

  // Realized volatility (annualized from 1m returns)
  let volatility = 0;
  if (closes.length > 2) {
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i]! > 0 && closes[i - 1]! > 0) {
        returns.push(Math.log(closes[i]! / closes[i - 1]!));
      }
    }
    if (returns.length > 1) {
      const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
      volatility = Math.sqrt(variance) * Math.sqrt(525600); // annualize from 1m
    }
  }

  // Higher volatility = lower score
  // Normal daily crypto vol: 40-80% annualized. Stress: >100%
  const volScore = linearScore(volatility, 0.4, 2.0);

  // Wick ratio: detect erratic candles
  let wickRatioMedian = 0;
  if (closes.length > 0) {
    // Approximate using consecutive price jumps
    const jumps: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const ret = Math.abs((closes[i]! - closes[i - 1]!) / closes[i - 1]!);
      jumps.push(ret);
    }
    if (jumps.length > 0) {
      jumps.sort((a, b) => a - b);
      wickRatioMedian = jumps[Math.floor(jumps.length / 2)]!;
    }
  }
  const wickScore = linearScore(wickRatioMedian, 0.001, 0.01);

  const score = volScore * 0.7 + wickScore * 0.3;

  const reasons: string[] = [];
  if (volatility > 1.0) reasons.push(`Volatilidad muy alta: ${(volatility * 100).toFixed(0)}%`);
  if (volatility > 0.8) reasons.push(`Volatilidad elevada: ${(volatility * 100).toFixed(0)}%`);
  if (wickRatioMedian > 0.005) reasons.push('Movimientos erraticos detectados');
  if (volatility < 0.5) reasons.push('Volatilidad normal');

  return {
    score: Math.round(score * 10) / 10,
    state: scoreToState(score),
    reasons,
    metrics: {
      realizedVolatility: Math.round(volatility * 10000) / 10000,
      wickRatioMedian: Math.round(wickRatioMedian * 100000) / 100000,
    },
  };
}
