/**
 * Calcula el RSI (Relative Strength Index) usando Wilder smoothing.
 * @param closes - Array de precios de cierre
 * @param period - Período del RSI (típicamente 14)
 * @returns Array de valores RSI (los primeros `period` elementos serán NaN)
 */
export function calculateRsi(closes: number[], period: number): number[] {
  if (closes.length < period + 1) {
    return Array(closes.length).fill(NaN);
  }

  const result: number[] = Array(period).fill(NaN);

  // Calculate initial average gain and loss
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + rs));

  // Wilder smoothing for subsequent values
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const currentRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + currentRs));
  }

  return result;
}
