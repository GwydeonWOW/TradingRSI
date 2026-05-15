import type { ActivityInput, LiquidityBlockScore } from './types.js';
import { linearScore, weightedAverage, scoreToState } from './scoring.js';

export function calculateActivity(input: ActivityInput): LiquidityBlockScore {
  const volumeScore = linearScore(input.quoteVolume24h, 250_000_000, 10_000_000, false);

  const relativeScore = input.relativeVolume !== null
    ? linearScore(input.relativeVolume, 0.8, 0.4, false)
    : 50; // neutral if unknown

  const tradesScore = linearScore(input.tradesCount1m, 10, 0.5, false);

  const freshnessScore = linearScore(input.timeSinceLastTradeMs, 1000, 60000);

  const score = weightedAverage([
    { score: volumeScore, weight: 0.30 },
    { score: relativeScore, weight: 0.25 },
    { score: tradesScore, weight: 0.25 },
    { score: freshnessScore, weight: 0.20 },
  ]);

  const reasons: string[] = [];
  if (input.quoteVolume24h < 50_000_000) reasons.push(`Volumen bajo: $${(input.quoteVolume24h / 1e6).toFixed(1)}M 24h`);
  if (input.relativeVolume !== null && input.relativeVolume < 0.5) reasons.push(`Volumen relativo bajo: ${input.relativeVolume.toFixed(2)}`);
  if (input.tradesCount1m < 1) reasons.push('Mercado inactivo');
  if (input.timeSinceLastTradeMs > 15000) reasons.push(`Ultimo trade hace ${Math.round(input.timeSinceLastTradeMs / 1000)}s`);
  if (input.quoteVolume24h >= 1e9) reasons.push('Volumen excelente');

  return {
    score: Math.round(score * 10) / 10,
    state: scoreToState(score),
    reasons,
    metrics: {
      quoteVolume24h: input.quoteVolume24h,
      tradesPerMinute: input.tradesCount1m,
      timeSinceLastTradeMs: input.timeSinceLastTradeMs,
      relativeVolume: input.relativeVolume,
    },
  };
}
