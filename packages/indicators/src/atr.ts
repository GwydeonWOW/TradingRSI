/**
 * Calcula el ATR (Average True Range) usando Wilder smoothing.
 * @param highs - Array de precios maximos
 * @param lows - Array de precios minimos
 * @param closes - Array de precios de cierre
 * @param period - Periodo del ATR (tipicamente 14)
 * @returns Array de valores ATR (los primeros `period` elementos seran NaN)
 */
export function calculateAtr(highs: number[], lows: number[], closes: number[], period: number): number[] {
  if (highs.length < period + 1) {
    return Array(highs.length).fill(NaN);
  }

  const result: number[] = Array(period).fill(NaN);

  // Calculate True Range values
  let atrSum = 0;
  for (let i = 1; i <= period; i++) {
    atrSum += trueRange(highs[i]!, lows[i]!, closes[i - 1]!);
  }

  result.push(atrSum / period);

  // Wilder smoothing for subsequent values
  for (let i = period + 1; i < highs.length; i++) {
    const tr = trueRange(highs[i]!, lows[i]!, closes[i - 1]!);
    const prevAtr = result[result.length - 1]!;
    result.push((prevAtr * (period - 1) + tr) / period);
  }

  return result;
}

/**
 * Calcula el ATR porcentual (ATR / close * 100).
 * @returns Array de valores ATR% (NaN donde ATR es NaN)
 */
export function calculateAtrPercent(highs: number[], lows: number[], closes: number[], period: number): number[] {
  const atrValues = calculateAtr(highs, lows, closes, period);
  return atrValues.map((atr, i) => (Number.isNaN(atr) ? NaN : (atr / closes[i]!) * 100));
}

function trueRange(high: number, low: number, prevClose: number): number {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}
