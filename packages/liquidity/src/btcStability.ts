import { calculateAtrPercent, calculateAdx, calculateSma } from '@cryptorsi/indicators';

export interface BtcDailyCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface BtcStabilityFilter {
  name: string;
  passed: boolean;
  value: number | string;
  threshold: string;
  reason: string;
}

export interface BtcStabilityConfig {
  atrPeriod?: number;
  atrMaxPercent?: number;
  adxPeriod?: number;
  adxTrendMax?: number;
  adxHardBlock?: number;
  smaPeriod?: number;
  priceStructureLookback?: number;
  diMaxDifference?: number;
  minScore?: number;
}

export interface BtcStabilityResult {
  score: number;
  maxScore: number;
  passed: boolean;
  minScore: number;
  filters: BtcStabilityFilter[];
}

const DEFAULTS = {
  atrPeriod: 14,
  atrMaxPercent: 4.0,
  adxPeriod: 14,
  adxTrendMax: 20,
  adxHardBlock: 25,
  smaPeriod: 20,
  priceStructureLookback: 5,
  diMaxDifference: 5,
  minScore: 4,
};

export function calculateBtcStability(candles: BtcDailyCandle[], config?: BtcStabilityConfig): BtcStabilityResult {
  const c = { ...DEFAULTS, ...config };
  const filters: BtcStabilityFilter[] = [];

  const highs = candles.map((k) => k.high);
  const lows = candles.map((k) => k.low);
  const closes = candles.map((k) => k.close);

  const last = (arr: number[]) => arr[arr.length - 1]!;
  const lastN = (arr: number[], n: number) => arr.slice(-n);

  // Filter 1: Volatility (ATR%)
  const atrPercentValues = calculateAtrPercent(highs, lows, closes, c.atrPeriod);
  const currentAtrPercent = last(atrPercentValues);
  const atrPassed = !Number.isNaN(currentAtrPercent) && currentAtrPercent < c.atrMaxPercent;
  filters.push({
    name: 'Volatilidad',
    passed: atrPassed,
    value: Number.isNaN(currentAtrPercent) ? 'N/A' : Math.round(currentAtrPercent * 100) / 100,
    threshold: `ATR% < ${c.atrMaxPercent}`,
    reason: atrPassed
      ? `ATR% ${currentAtrPercent.toFixed(2)} < ${c.atrMaxPercent} — volatilidad controlada`
      : `ATR% ${Number.isNaN(currentAtrPercent) ? 'N/A' : currentAtrPercent.toFixed(2)} >= ${c.atrMaxPercent} — volatilidad alta`,
  });

  // Filter 2: Trend (ADX)
  const adxResults = calculateAdx(highs, lows, closes, c.adxPeriod);
  const currentAdx = adxResults[adxResults.length - 1]!;
  let adxPassed = false;
  let adxReason = '';

  if (Number.isNaN(currentAdx.adx)) {
    adxPassed = false;
    adxReason = 'Datos insuficientes para ADX';
  } else {
    // Hard block: ADX > 25 and minus_di > plus_di
    if (currentAdx.adx > c.adxHardBlock && currentAdx.minusDi > currentAdx.plusDi) {
      adxPassed = false;
      adxReason = `ADX ${currentAdx.adx.toFixed(1)} > ${c.adxHardBlock} con -DI > +DI — tendencia bajista fuerte`;
    } else if (currentAdx.adx < c.adxTrendMax) {
      adxPassed = true;
      adxReason = `ADX ${currentAdx.adx.toFixed(1)} < ${c.adxTrendMax} — sin tendencia fuerte`;
    } else {
      // Check if ADX is descending over last 3 candles
      const recent = adxResults.slice(-3).map((r) => r.adx);
      const descending = recent.length === 3 && !Number.isNaN(recent[0]!) && recent[2]! < recent[1]! && recent[1]! < recent[0]!;
      adxPassed = descending;
      adxReason = descending
        ? `ADX descendiendo (${recent.map((v) => v.toFixed(1)).join(' → ')})`
        : `ADX ${currentAdx.adx.toFixed(1)} >= ${c.adxTrendMax} y no descendiendo`;
    }
  }

  filters.push({
    name: 'Tendencia',
    passed: adxPassed,
    value: Number.isNaN(currentAdx.adx) ? 'N/A' : Math.round(currentAdx.adx * 100) / 100,
    threshold: `ADX < ${c.adxTrendMax} o descendiendo`,
    reason: adxReason,
  });

  // Filter 3: Direction (+DI vs -DI)
  let dirPassed = false;
  if (Number.isNaN(currentAdx.plusDi) || Number.isNaN(currentAdx.minusDi)) {
    dirPassed = false;
  } else if (currentAdx.plusDi >= currentAdx.minusDi) {
    dirPassed = true;
  } else {
    const diff = currentAdx.minusDi - currentAdx.plusDi;
    dirPassed = diff < c.diMaxDifference;
  }

  filters.push({
    name: 'Direccion',
    passed: dirPassed,
    value: Number.isNaN(currentAdx.plusDi) ? 'N/A' : `+DI ${currentAdx.plusDi.toFixed(1)} / -DI ${currentAdx.minusDi.toFixed(1)}`,
    threshold: `+DI >= -DI o diferencia < ${c.diMaxDifference}`,
    reason: dirPassed
      ? 'Presion bajista no domina'
      : 'Presion bajista dominante',
  });

  // Filter 4: Moving Averages (close > SMA20)
  const smaValues = calculateSma(closes, c.smaPeriod);
  const currentSma = last(smaValues);
  const currentClose = last(closes);
  const smaPassed = !Number.isNaN(currentSma) && currentClose > currentSma;

  filters.push({
    name: 'Medias Moviles',
    passed: smaPassed,
    value: Number.isNaN(currentSma) ? 'N/A' : `close ${currentClose.toFixed(0)} vs SMA${c.smaPeriod} ${currentSma.toFixed(0)}`,
    threshold: `close > SMA${c.smaPeriod}`,
    reason: smaPassed
      ? `BTC por encima de SMA${c.smaPeriod}`
      : `BTC por debajo de SMA${c.smaPeriod}`,
  });

  // Filter 5: Price Structure (close >= min of last N daily lows)
  const recentLows = lastN(lows, c.priceStructureLookback);
  const rollingLow = Math.min(...recentLows);
  const structPassed = currentClose >= rollingLow;

  filters.push({
    name: 'Estructura',
    passed: structPassed,
    value: `close ${currentClose.toFixed(0)} vs min ${rollingLow.toFixed(0)}`,
    threshold: `close >= min(low[-${c.priceStructureLookback}:])`,
    reason: structPassed
      ? 'BTC no pierde minimos recientes'
      : 'BTC rompe minimos recientes',
  });

  const score = filters.filter((f) => f.passed).length;
  const maxScore = filters.length;

  return {
    score,
    maxScore,
    passed: score >= c.minScore,
    minScore: c.minScore,
    filters,
  };
}
