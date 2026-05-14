/**
 * Calcula la Simple Moving Average (SMA).
 * @param values - Array de valores
 * @param period - Período de la media
 * @returns Array de valores SMA (NaN donde no hay suficientes datos)
 */
export function calculateSma(values: number[], period: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }

    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += values[j]!;
    }
    result.push(sum / period);
  }

  return result;
}
