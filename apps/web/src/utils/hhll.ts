export interface HHLLMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
}

interface Pivot {
  index: number;
  value: number;
  type: 'high' | 'low';
}

/**
 * Detects Higher High, Lower Low, Higher Low, Lower High patterns.
 * Ported from TradingView "Higher High Lower Low Strategy" Pine Script.
 */
export function computeHHLL(
  highs: number[],
  lows: number[],
  times: number[],
  leftBars = 5,
  rightBars = 5,
): HHLLMarker[] {
  if (highs.length < leftBars + rightBars + 1) return [];

  const pivots = findPivots(highs, lows, leftBars, rightBars);
  const zigzag = buildZigzag(pivots);
  return detectPatterns(zigzag, times);
}

function findPivots(highs: number[], lows: number[], lb: number, rb: number): Pivot[] {
  const pivots: Pivot[] = [];

  for (let i = lb; i < highs.length - rb; i++) {
    let isHigh = true;
    let isLow = true;

    for (let j = i - lb; j <= i + rb; j++) {
      if (j === i) continue;
      if (highs[j]! > highs[i]!) isHigh = false;
      if (lows[j]! < lows[i]!) isLow = false;
    }

    if (isHigh) pivots.push({ index: i, value: highs[i]!, type: 'high' });
    else if (isLow) pivots.push({ index: i, value: lows[i]!, type: 'low' });
  }

  return pivots;
}

function buildZigzag(pivots: Pivot[]): Pivot[] {
  const zz: Pivot[] = [];
  for (const p of pivots) {
    if (zz.length === 0) {
      zz.push(p);
      continue;
    }
    const last = zz[zz.length - 1]!;
    if (p.type === last.type) {
      if (p.type === 'high' && p.value > last.value) zz[zz.length - 1] = p;
      else if (p.type === 'low' && p.value < last.value) zz[zz.length - 1] = p;
    } else {
      zz.push(p);
    }
  }
  return zz;
}

function detectPatterns(zz: Pivot[], times: number[]): HHLLMarker[] {
  const markers: HHLLMarker[] = [];

  for (let i = 4; i < zz.length; i++) {
    const a = zz[i]!;       // current
    const b = zz[i - 1]!;   // previous
    const c = zz[i - 2]!;   // 2nd previous (same type as a)
    const d = zz[i - 3]!;   // 3rd previous
    const e = zz[i - 4]!;   // 4th previous (same type as a)

    if (a.type === 'high') {
      // Higher High: a > c (new high above previous high)
      if (a.value > c.value && c.value > d.value) {
        markers.push({
          time: times[a.index]!,
          position: 'aboveBar',
          color: '#10b981',
          shape: 'arrowDown',
          text: 'HH',
        });
      }
      // Lower High: a < c (new high below previous high)
      if (a.value < c.value && c.value < d.value) {
        markers.push({
          time: times[a.index]!,
          position: 'aboveBar',
          color: '#ef4444',
          shape: 'arrowDown',
          text: 'LH',
        });
      }
    }

    if (a.type === 'low') {
      // Higher Low: a > c (new low above previous low)
      if (a.value > c.value && b.value > d.value) {
        markers.push({
          time: times[a.index]!,
          position: 'belowBar',
          color: '#10b981',
          shape: 'arrowUp',
          text: 'HL',
        });
      }
      // Lower Low: a < c (new low below previous low)
      if (a.value < c.value && b.value < d.value) {
        markers.push({
          time: times[a.index]!,
          position: 'belowBar',
          color: '#ef4444',
          shape: 'arrowUp',
          text: 'LL',
        });
      }
    }
  }

  return markers;
}
