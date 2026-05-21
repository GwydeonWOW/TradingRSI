export interface HHLLMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
}

export interface HHLLResult {
  markers: HHLLMarker[];
}

interface Pivot {
  index: number;
  value: number;
}

/**
 * Detects Higher High, Lower Low, Higher Low, Lower High patterns.
 * Ported from TradingView Pine Script — tracks pivot highs and lows independently.
 */
export function computeHHLL(
  highs: number[],
  lows: number[],
  times: number[],
  leftBars = 5,
  rightBars = 5,
): HHLLResult {
  if (highs.length < leftBars + rightBars + 1) return { markers: [] };

  const pivotHighs = findPivotHighs(highs, leftBars, rightBars);
  const pivotLows = findPivotLows(lows, leftBars, rightBars);
  return detectPatterns(pivotHighs, pivotLows, times);
}

function findPivotHighs(highs: number[], lb: number, rb: number): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = lb; i < highs.length - rb; i++) {
    let isHigh = true;
    for (let j = i - lb; j <= i + rb; j++) {
      if (j === i) continue;
      if (highs[j]! >= highs[i]!) { isHigh = false; break; }
    }
    if (isHigh) pivots.push({ index: i, value: highs[i]! });
  }
  return pivots;
}

function findPivotLows(lows: number[], lb: number, rb: number): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = lb; i < lows.length - rb; i++) {
    let isLow = true;
    for (let j = i - lb; j <= i + rb; j++) {
      if (j === i) continue;
      if (lows[j]! <= lows[i]!) { isLow = false; break; }
    }
    if (isLow) pivots.push({ index: i, value: lows[i]! });
  }
  return pivots;
}

function detectPatterns(pivotHighs: Pivot[], pivotLows: Pivot[], times: number[]): HHLLResult {
  const markers: HHLLMarker[] = [];

  for (let i = 1; i < pivotHighs.length; i++) {
    const curr = pivotHighs[i]!;
    const prev = pivotHighs[i - 1]!;

    if (curr.value > prev.value) {
      markers.push({
        time: times[curr.index]!,
        position: 'aboveBar',
        color: '#10b981',
        shape: 'arrowDown',
        text: 'HH',
      });
    } else if (curr.value < prev.value) {
      markers.push({
        time: times[curr.index]!,
        position: 'aboveBar',
        color: '#ef4444',
        shape: 'arrowDown',
        text: 'LH',
      });
    }
  }

  for (let i = 1; i < pivotLows.length; i++) {
    const curr = pivotLows[i]!;
    const prev = pivotLows[i - 1]!;

    if (curr.value > prev.value) {
      markers.push({
        time: times[curr.index]!,
        position: 'belowBar',
        color: '#10b981',
        shape: 'arrowUp',
        text: 'HL',
      });
    } else if (curr.value < prev.value) {
      markers.push({
        time: times[curr.index]!,
        position: 'belowBar',
        color: '#ef4444',
        shape: 'arrowUp',
        text: 'LL',
      });
    }
  }

  return { markers };
}
