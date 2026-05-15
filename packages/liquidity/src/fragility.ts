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

  // Amihud illiquidity ratio: avg(|return| / quoteVolume)
  let amihud = 0;
  if (input.trades && input.trades.length > 10) {
    const ratios: number[] = [];
    for (const t of input.trades) {
      if (t.quoteQty > 0 && t.price > 0) {
        const prevPrice = t.price; // approximate: use trade itself
        ratios.push(Math.abs(t.qty) / t.quoteQty);
      }
    }
    if (ratios.length > 0) {
      amihud = ratios.reduce((s, r) => s + r, 0) / ratios.length;
    }
  }

  // Kyle's Lambda: slope of price change vs net order flow
  let kylesLambda = 0;
  if (input.trades && input.trades.length > 20) {
    const tradeData = input.trades;
    const midPrice = tradeData.reduce((s, t) => s + t.price, 0) / tradeData.length;
    if (midPrice > 0) {
      let sumXY = 0;
      let sumX2 = 0;
      let sumX = 0;
      let sumY = 0;
      const n = tradeData.length;
      for (const t of tradeData) {
        const priceImpact = (t.price - midPrice) / midPrice;
        const signedQty = t.isBuyerMaker ? -t.qty : t.qty;
        sumXY += signedQty * priceImpact;
        sumX2 += signedQty * signedQty;
        sumX += signedQty;
        sumY += priceImpact;
      }
      const denom = n * sumX2 - sumX * sumX;
      if (Math.abs(denom) > 1e-15) {
        kylesLambda = Math.abs((n * sumXY - sumX * sumY) / denom);
      }
    }
  }

  // Scores: lower amihud/lambda = better liquidity
  const amihudScore = input.trades && input.trades.length > 10 ? linearScore(amihud, 0.0001, 0.01) : 80;
  const lambdaScore = input.trades && input.trades.length > 20 ? linearScore(kylesLambda, 0.0001, 0.005) : 80;

  const hasTradeData = input.trades && input.trades.length > 10;
  const score = hasTradeData
    ? volScore * 0.35 + wickScore * 0.15 + amihudScore * 0.25 + lambdaScore * 0.25
    : volScore * 0.7 + wickScore * 0.3;

  const reasons: string[] = [];
  if (volatility > 1.0) reasons.push(`Volatilidad muy alta: ${(volatility * 100).toFixed(0)}%`);
  if (volatility > 0.8 && volatility <= 1.0) reasons.push(`Volatilidad elevada: ${(volatility * 100).toFixed(0)}%`);
  if (wickRatioMedian > 0.005) reasons.push('Movimientos erraticos detectados');
  if (amihud > 0.005) reasons.push(`Amihud iliquidez alta: ${(amihud * 10000).toFixed(1)}`);
  if (kylesLambda > 0.002) reasons.push(`Kyle Lambda alto: ${(kylesLambda * 10000).toFixed(2)}`);

  return {
    score: Math.round(score * 10) / 10,
    state: scoreToState(score),
    reasons,
    metrics: {
      realizedVolatility: Math.round(volatility * 10000) / 10000,
      wickRatioMedian: Math.round(wickRatioMedian * 100000) / 100000,
      amihud: Math.round(amihud * 100000) / 100000,
      kylesLambda: Math.round(kylesLambda * 100000) / 100000,
    },
  };
}
