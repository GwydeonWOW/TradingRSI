import { calculateRsi } from './rsi.js';

function findSwingLows(values: number[], leftBars: number, rightBars: number): number[] {
  const result: number[] = [];
  for (let i = leftBars; i < values.length - rightBars; i++) {
    const val = values[i]!;
    let isLow = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (values[j]! <= val) { isLow = false; break; }
    }
    if (isLow) result.push(i);
  }
  return result;
}

function findSwingHighs(values: number[], leftBars: number, rightBars: number): number[] {
  const result: number[] = [];
  for (let i = leftBars; i < values.length - rightBars; i++) {
    const val = values[i]!;
    let isHigh = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (values[j]! >= val) { isHigh = false; break; }
    }
    if (isHigh) result.push(i);
  }
  return result;
}

/**
 * Detect bullish divergence: price makes lower low but RSI makes higher low.
 * Returns true if the most recent swing low shows bullish divergence.
 */
export function detectBullishDivergence(closes: number[], rsiPeriod = 14, swingLookback = 5): boolean {
  const rsiValues = calculateRsi(closes, rsiPeriod);
  if (rsiValues.length < swingLookback * 2 + 2) return false;

  // Find swing lows in price
  const priceSwingLows = findSwingLows(closes, swingLookback, swingLookback);
  if (priceSwingLows.length < 2) return false;

  // Get the last two swing lows
  const lastLow = priceSwingLows[priceSwingLows.length - 1]!;
  const prevLow = priceSwingLows[priceSwingLows.length - 2]!;

  // Price must make lower low
  if (closes[lastLow]! >= closes[prevLow]!) return false;

  // RSI must make higher low at those same positions
  const rsiAtLast = rsiValues[lastLow]!;
  const rsiAtPrev = rsiValues[prevLow]!;
  if (rsiAtLast === null || rsiAtPrev === null) return false;

  return rsiAtLast > rsiAtPrev;
}

/**
 * Detect bearish divergence: price makes higher high but RSI makes lower high.
 * Returns true if the most recent swing high shows bearish divergence.
 */
export function detectBearishDivergence(closes: number[], rsiPeriod = 14, swingLookback = 5): boolean {
  const rsiValues = calculateRsi(closes, rsiPeriod);
  if (rsiValues.length < swingLookback * 2 + 2) return false;

  const priceSwingHighs = findSwingHighs(closes, swingLookback, swingLookback);
  if (priceSwingHighs.length < 2) return false;

  const lastHigh = priceSwingHighs[priceSwingHighs.length - 1]!;
  const prevHigh = priceSwingHighs[priceSwingHighs.length - 2]!;

  // Price must make higher high
  if (closes[lastHigh]! <= closes[prevHigh]!) return false;

  // RSI must make lower high at those same positions
  const rsiAtLast = rsiValues[lastHigh]!;
  const rsiAtPrev = rsiValues[prevHigh]!;
  if (rsiAtLast === null || rsiAtPrev === null) return false;

  return rsiAtLast < rsiAtPrev;
}
