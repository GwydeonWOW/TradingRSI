export interface DivergenceMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
}

interface PricePoint {
  time: number;
  value: number;
}

interface RsiPoint {
  time: number;
  rsi: number;
}

export function calculateRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) {
    result[period] = 100;
  } else {
    result[period] = 100 - 100 / (1 + avgGain / avgLoss);
  }

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      result[i] = 100 - 100 / (1 + avgGain / avgLoss);
    }
  }

  return result;
}

function findSwingHighs(points: PricePoint[], leftBars: number, rightBars: number): PricePoint[] {
  const swingHighs: PricePoint[] = [];
  for (let i = leftBars; i < points.length - rightBars; i++) {
    const val = points[i]!.value;
    let isHigh = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (points[j]!.value >= val) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) swingHighs.push(points[i]!);
  }
  return swingHighs;
}

function findSwingLows(points: PricePoint[], leftBars: number, rightBars: number): PricePoint[] {
  const swingLows: PricePoint[] = [];
  for (let i = leftBars; i < points.length - rightBars; i++) {
    const val = points[i]!.value;
    let isLow = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (points[j]!.value <= val) {
        isLow = false;
        break;
      }
    }
    if (isLow) swingLows.push(points[i]!);
  }
  return swingLows;
}

export function detectRSIDivergence(
  times: number[],
  closes: number[],
  rsiPeriod = 14,
  swingLookback = 5,
  rsiOverbought = 70,
  rsiOversold = 30,
): DivergenceMarker[] {
  if (times.length < rsiPeriod + swingLookback * 2 + 2) return [];

  const rsiValues = calculateRSI(closes, rsiPeriod);
  const markers: DivergenceMarker[] = [];

  const pricePoints: PricePoint[] = times.map((t, i) => ({ time: t, value: closes[i]! }));
  const rsiPoints: RsiPoint[] = times
    .map((t, i) => ({ time: t, rsi: rsiValues[i]! }))
    .filter((p) => p.rsi !== null);

  if (rsiPoints.length < 10) return [];

  const priceHighs = findSwingHighs(pricePoints, swingLookback, swingLookback);
  const priceLows = findSwingLows(pricePoints, swingLookback, swingLookback);
  const rsiHighs = findSwingHighs(
    rsiPoints.map((p) => ({ time: p.time, value: p.rsi })),
    swingLookback,
    swingLookback,
  );
  const rsiLows = findSwingLows(
    rsiPoints.map((p) => ({ time: p.time, value: p.rsi })),
    swingLookback,
    swingLookback,
  );

  const timeToRsi = new Map<number, number>();
  for (const p of rsiPoints) {
    timeToRsi.set(p.time, p.rsi);
  }

  // Bearish divergence: price makes higher high but RSI makes lower high
  for (const ph of priceHighs) {
    const rsiAtPh = timeToRsi.get(ph.time);
    if (rsiAtPh === undefined || rsiAtPh < rsiOverbought) continue;

    // Find previous price high before this one
    const prevPh = priceHighs.filter((p) => p.time < ph.time).pop();
    if (!prevPh) continue;
    if (prevPh.value >= ph.value) continue; // Price must make higher high

    const rsiAtPrevPh = timeToRsi.get(prevPh.time);
    if (rsiAtPrevPh === undefined) continue;
    if (rsiAtPh >= rsiAtPrevPh) continue; // RSI must make lower high

    markers.push({
      time: ph.time,
      position: 'aboveBar',
      color: '#ef4444',
      shape: 'arrowDown',
      text: 'Bear Div',
    });
  }

  // Bullish divergence: price makes lower low but RSI makes higher low
  for (const pl of priceLows) {
    const rsiAtPl = timeToRsi.get(pl.time);
    if (rsiAtPl === undefined || rsiAtPl > rsiOversold) continue;

    const prevPl = priceLows.filter((p) => p.time < pl.time).pop();
    if (!prevPl) continue;
    if (prevPl.value <= pl.value) continue; // Price must make lower low

    const rsiAtPrevPl = timeToRsi.get(prevPl.time);
    if (rsiAtPrevPl === undefined) continue;
    if (rsiAtPl <= rsiAtPrevPl) continue; // RSI must make higher low

    markers.push({
      time: pl.time,
      position: 'belowBar',
      color: '#10b981',
      shape: 'arrowUp',
      text: 'Bull Div',
    });
  }

  return markers;
}
