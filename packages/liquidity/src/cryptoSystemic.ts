import type { LiquidityBlockScore } from './types.js';
import { linearScore, scoreToState } from './scoring.js';

export interface CryptoSystemicInput {
  stablecoinPegDeviationBps: number | null;
  fundingRate: number | null;
  fundingRateZScore: number | null;
  openInterest: number | null;
  openInterestChange24hPct: number | null;
  longShortRatio: number | null;
  takerBuySellRatio: number | null;
}

export function calculateCryptoSystemic(input: CryptoSystemicInput): LiquidityBlockScore {
  // Stablecoin peg
  let pegScore = 80; // default good
  if (input.stablecoinPegDeviationBps !== null) {
    pegScore = linearScore(input.stablecoinPegDeviationBps, 5, 50);
  }

  // Funding rate stress
  let fundingScore = 80;
  if (input.fundingRateZScore !== null) {
    fundingScore = linearScore(Math.abs(input.fundingRateZScore), 1.0, 3.0);
  } else if (input.fundingRate !== null) {
    const annualized = Math.abs(input.fundingRate) * 3 * 365 * 100;
    fundingScore = linearScore(annualized, 10, 50);
  }

  // Open interest stress
  let oiScore = 80;
  if (input.openInterestChange24hPct !== null) {
    oiScore = linearScore(Math.abs(input.openInterestChange24hPct), 5, 20);
  }

  // Long/short crowding
  let crowdingScore = 80;
  if (input.longShortRatio !== null) {
    crowdingScore = linearScore(Math.abs(input.longShortRatio - 1), 0.3, 1.0);
  }

  // Taker flow balance
  let takerScore = 80;
  if (input.takerBuySellRatio !== null) {
    takerScore = linearScore(Math.abs(input.takerBuySellRatio - 0.5), 0.1, 0.3);
  }

  const score =
    pegScore * 0.25 +
    fundingScore * 0.25 +
    oiScore * 0.20 +
    crowdingScore * 0.15 +
    takerScore * 0.15;

  const reasons: string[] = [];
  if (input.stablecoinPegDeviationBps !== null && input.stablecoinPegDeviationBps > 15) {
    reasons.push(`Stablecoin peg desviado: ${input.stablecoinPegDeviationBps.toFixed(1)} bps`);
  }
  if (input.fundingRateZScore !== null && Math.abs(input.fundingRateZScore) > 2) {
    reasons.push(`Funding extremo (z-score: ${input.fundingRateZScore.toFixed(1)})`);
  }
  if (input.openInterestChange24hPct !== null && Math.abs(input.openInterestChange24hPct) > 15) {
    reasons.push(`OI cambio fuerte: ${input.openInterestChange24hPct > 0 ? '+' : ''}${input.openInterestChange24hPct.toFixed(1)}%`);
  }
  if (input.longShortRatio !== null && Math.abs(input.longShortRatio - 1) > 0.5) {
    reasons.push(`Crowding L/S: ${input.longShortRatio.toFixed(2)}`);
  }

  return {
    score: Math.round(score * 10) / 10,
    state: scoreToState(score),
    reasons,
    metrics: {
      stablecoinPegDeviationBps: input.stablecoinPegDeviationBps,
      fundingRate: input.fundingRate,
      fundingRateZScore: input.fundingRateZScore,
      openInterestChange24hPct: input.openInterestChange24hPct,
      longShortRatio: input.longShortRatio,
      takerBuySellRatio: input.takerBuySellRatio,
    },
  };
}
