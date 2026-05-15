import type { ExecutionLiquidityInput, LiquidityBlockScore } from './types.js';
import { linearScore, weightedAverage, scoreToState } from './scoring.js';

export function calculateExecutionLiquidity(input: ExecutionLiquidityInput): LiquidityBlockScore {
  const mid = (input.bestBid + input.bestAsk) / 2;
  const spreadBps = ((input.bestAsk - input.bestBid) / mid) * 10000;

  const spreadScore = linearScore(spreadBps, 2, 25);

  // Depth at 25 bps
  let depth25bps = 0;
  if (input.side === 'BUY') {
    for (const ask of input.asks) {
      if (ask.price <= mid * 1.0025) {
        depth25bps += ask.price * ask.qty;
      }
    }
  } else {
    for (const bid of input.bids) {
      if (bid.price >= mid * 0.9975) {
        depth25bps += bid.price * bid.qty;
      }
    }
  }

  const depthCoverage = input.quoteAmount > 0 ? depth25bps / input.quoteAmount : 0;
  const depthScore = linearScore(depthCoverage, 50, 3, false);

  // Slippage via order book walk
  let slippageBps = 0;
  if (input.side === 'BUY') {
    const sortedAsks = [...input.asks].sort((a, b) => a.price - b.price);
    let remaining = input.quoteAmount;
    let quoteSpent = 0;
    let baseFilled = 0;
    for (const ask of sortedAsks) {
      if (remaining <= 0) break;
      const fillQuote = Math.min(remaining, ask.price * ask.qty);
      baseFilled += fillQuote / ask.price;
      quoteSpent += fillQuote;
      remaining -= fillQuote;
    }
    const avgPrice = baseFilled > 0 ? quoteSpent / baseFilled : mid;
    slippageBps = ((avgPrice - mid) / mid) * 10000;
  } else {
    const sortedBids = [...input.bids].sort((a, b) => b.price - a.price);
    let remaining = input.quoteAmount;
    let quoteSpent = 0;
    let baseFilled = 0;
    for (const bid of sortedBids) {
      if (remaining <= 0) break;
      const fillBase = Math.min(remaining / bid.price, bid.qty);
      const fillQuote = fillBase * bid.price;
      baseFilled += fillBase;
      quoteSpent += fillQuote;
      remaining -= fillQuote;
    }
    const avgPrice = baseFilled > 0 ? quoteSpent / baseFilled : mid;
    slippageBps = ((mid - avgPrice) / mid) * 10000;
  }

  const slippageScore = linearScore(slippageBps, 3, 40);

  // Book imbalance
  let bidDepth = 0;
  let askDepth = 0;
  for (const bid of input.bids) {
    if (bid.price >= mid * 0.9975) bidDepth += bid.price * bid.qty;
  }
  for (const ask of input.asks) {
    if (ask.price <= mid * 1.0025) askDepth += ask.price * ask.qty;
  }
  const totalDepth = bidDepth + askDepth;
  const imbalance = totalDepth > 0 ? (bidDepth - askDepth) / totalDepth : 0;
  const imbalanceScore = linearScore(Math.abs(imbalance), 0.3, 0.8);

  // Book density (depth10 / depth50)
  let depth10 = 0;
  let depth50 = 0;
  if (input.side === 'BUY') {
    for (const ask of input.asks) {
      if (ask.price <= mid * 1.001) depth10 += ask.price * ask.qty;
      if (ask.price <= mid * 1.005) depth50 += ask.price * ask.qty;
    }
  } else {
    for (const bid of input.bids) {
      if (bid.price >= mid * 0.999) depth10 += bid.price * bid.qty;
      if (bid.price >= mid * 0.995) depth50 += bid.price * bid.qty;
    }
  }
  const density = depth50 > 0 ? depth10 / depth50 : 0;
  const densityScore = linearScore(density, 0.65, 0.25, false);

  const score = weightedAverage([
    { score: spreadScore, weight: 0.25 },
    { score: slippageScore, weight: 0.25 },
    { score: depthScore, weight: 0.20 },
    { score: imbalanceScore, weight: 0.15 },
    { score: densityScore, weight: 0.15 },
  ]);

  const reasons: string[] = [];
  if (spreadBps > 10) reasons.push(`Spread alto: ${spreadBps.toFixed(1)} bps`);
  if (slippageBps > 15) reasons.push(`Slippage estimado alto: ${slippageBps.toFixed(1)} bps`);
  if (depthCoverage < 10) reasons.push(`Profundidad baja: ${depthCoverage.toFixed(1)}x cobertura`);
  if (density < 0.25) reasons.push('Book concentrado lejos del precio');
  if (spreadBps <= 2 && slippageBps <= 3) reasons.push('Ejecucion excelente');

  return {
    score: Math.round(score * 10) / 10,
    state: scoreToState(score),
    reasons,
    metrics: {
      spreadBps: Math.round(spreadBps * 100) / 100,
      slippageBps: Math.round(slippageBps * 100) / 100,
      depth25bpsQuote: Math.round(depth25bps * 100) / 100,
      depthCoverage: Math.round(depthCoverage * 10) / 10,
      imbalance: Math.round(imbalance * 1000) / 1000,
      density: Math.round(density * 100) / 100,
    },
  };
}
