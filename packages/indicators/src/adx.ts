export interface AdxResult {
  adx: number;
  plusDi: number;
  minusDi: number;
}

/**
 * Calcula el ADX (Average Directional Index) con +DI y -DI.
 * @param highs - Array de precios maximos
 * @param lows - Array de precios minimos
 * @param closes - Array de precios de cierre
 * @param period - Periodo (tipicamente 14)
 * @returns Array de AdxResult (NaN para valores iniciales insuficientes)
 */
export function calculateAdx(highs: number[], lows: number[], closes: number[], period: number): AdxResult[] {
  const len = highs.length;
  if (len < 2 * period) {
    return Array(len).fill({ adx: NaN, plusDi: NaN, minusDi: NaN });
  }

  // Step 1: True Range, +DM, -DM
  const trValues: number[] = [];
  const plusDmValues: number[] = [];
  const minusDmValues: number[] = [];

  for (let i = 1; i < len; i++) {
    const hDiff = highs[i]! - highs[i - 1]!;
    const lDiff = lows[i - 1]! - lows[i]!;

    trValues.push(Math.max(highs[i]! - lows[i]!, Math.abs(highs[i]! - closes[i - 1]!), Math.abs(lows[i]! - closes[i - 1]!)));
    plusDmValues.push(hDiff > lDiff && hDiff > 0 ? hDiff : 0);
    minusDmValues.push(lDiff > hDiff && lDiff > 0 ? lDiff : 0);
  }

  const result: AdxResult[] = [];

  // Fill initial NaN entries
  for (let i = 0; i < period; i++) {
    result.push({ adx: NaN, plusDi: NaN, minusDi: NaN });
  }

  // Step 2: Wilder-smooth TR, +DM, -DM over first `period` values
  let smoothTr = sum(trValues, 0, period);
  let smoothPlusDm = sum(plusDmValues, 0, period);
  let smoothMinusDm = sum(minusDmValues, 0, period);

  // First DI values at index `period`
  let prevPlusDi = smoothTr > 0 ? (100 * smoothPlusDm) / smoothTr : 0;
  let prevMinusDi = smoothTr > 0 ? (100 * smoothMinusDm) / smoothTr : 0;

  // First DX value
  let dxDenom = prevPlusDi + prevMinusDi;
  let prevDx = dxDenom > 0 ? (100 * Math.abs(prevPlusDi - prevMinusDi)) / dxDenom : 0;

  // We need `period` DX values before we can compute ADX
  // Accumulate DX values for initial ADX
  const dxValues: number[] = [prevDx];

  // First DI result (not yet ADX)
  result.push({ adx: NaN, plusDi: prevPlusDi, minusDi: prevMinusDi });

  // Step 3: Continue smoothing for remaining values
  for (let i = period; i < trValues.length; i++) {
    smoothTr = smoothTr - smoothTr / period + trValues[i]!;
    smoothPlusDm = smoothPlusDm - smoothPlusDm / period + plusDmValues[i]!;
    smoothMinusDm = smoothMinusDm - smoothMinusDm / period + minusDmValues[i]!;

    prevPlusDi = smoothTr > 0 ? (100 * smoothPlusDm) / smoothTr : 0;
    prevMinusDi = smoothTr > 0 ? (100 * smoothMinusDm) / smoothTr : 0;

    dxDenom = prevPlusDi + prevMinusDi;
    const dx = dxDenom > 0 ? (100 * Math.abs(prevPlusDi - prevMinusDi)) / dxDenom : 0;

    dxValues.push(dx);

    if (dxValues.length < period) {
      result.push({ adx: NaN, plusDi: prevPlusDi, minusDi: prevMinusDi });
    } else if (dxValues.length === period) {
      // First ADX = simple average of first `period` DX values
      const firstAdx = dxValues.reduce((a, b) => a + b, 0) / period;
      result.push({ adx: firstAdx, plusDi: prevPlusDi, minusDi: prevMinusDi });
    } else {
      // Subsequent ADX = Wilder-smoothed
      const prevAdx = result[result.length - 1]!.adx;
      const adx = (prevAdx * (period - 1) + dx) / period;
      result.push({ adx, plusDi: prevPlusDi, minusDi: prevMinusDi });
    }
  }

  return result;
}

function sum(arr: number[], start: number, count: number): number {
  let s = 0;
  for (let i = start; i < start + count && i < arr.length; i++) {
    s += arr[i]!;
  }
  return s;
}
