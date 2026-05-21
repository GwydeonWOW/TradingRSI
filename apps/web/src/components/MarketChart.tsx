import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from 'lightweight-charts';
import { computeHHLL } from '../utils/hhll';

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface RsiDataPoint {
  time: number;
  value: number;
}

interface MarketChartProps {
  data: CandleData[];
  rsiData?: RsiDataPoint[];
  height?: number;
  rsiHeight?: number;
  markers?: Array<{
    time: number;
    position: 'aboveBar' | 'belowBar';
    color: string;
    shape: 'arrowUp' | 'arrowDown' | 'circle';
    text?: string;
  }>;
}

interface ChartState {
  priceChart: IChartApi;
  rsiChart: IChartApi | null;
  candleSeries: ISeriesApi<'Candlestick'>;
  volumeSeries: ISeriesApi<'Histogram'>;
  sma50Series: ISeriesApi<'Line'>;
  sma200Series: ISeriesApi<'Line'>;
  rsiSeries: ISeriesApi<'Line'> | null;
  rsiAnchorSeries: ISeriesApi<'Line'> | null;
  syncCleanup: () => void;
  lastDataLen: number;
  lastRsiLen: number;
  markerCollection: any;
  pivotPriceLines: any[];
}

export function MarketChart({ data, rsiData, height = 400, rsiHeight = 150, markers }: MarketChartProps) {
  const [showSma, setShowSma] = useState(true);
  const [showRsi, setShowRsi] = useState(true);
  const [showHhll, setShowHhll] = useState(false);
  const priceContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ChartState | null>(null);

  // Create chart on mount, destroy on unmount
  useEffect(() => {
    if (!priceContainerRef.current) return;

    const darkTheme = {
      layout: { background: { color: '#0f1729' }, textColor: '#6b7280' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: { vertLine: { color: '#475569' }, horzLine: { color: '#475569' } },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: { borderColor: '#1e293b', timeVisible: true },
    };

    const priceChart = createChart(priceContainerRef.current, { ...darkTheme, height });
    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });
    const volumeSeries = priceChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: 'volume',
    });
    priceChart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const sma50Series = priceChart.addSeries(LineSeries, {
      color: '#fb9800', lineWidth: 1, priceLineVisible: false, lastValueVisible: true, title: 'SMA 50',
    });
    const sma200Series = priceChart.addSeries(LineSeries, {
      color: '#f60c0c', lineWidth: 1, priceLineVisible: false, lastValueVisible: true, title: 'SMA 200',
    });

    let rsiChart: IChartApi | null = null;
    let rsiSeries: ISeriesApi<'Line'> | null = null;
    let rsiAnchorSeries: ISeriesApi<'Line'> | null = null;
    let syncCleanup = () => {};

    if (rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, { ...darkTheme, height: rsiHeight });

      // Anchor series: invisible, covers ALL candle timestamps so logical indices align
      rsiAnchorSeries = rsiChart.addSeries(LineSeries, {
        color: 'transparent',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      rsiSeries = rsiChart.addSeries(LineSeries, {
        color: '#8b5cf6', lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
      });

      rsiSeries.createPriceLine({ price: 70, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      rsiSeries.createPriceLine({ price: 30, color: '#10b981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' });
      rsiSeries.createPriceLine({ price: 50, color: '#475569', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' });

      let syncing = false;
      priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range || !rsiChart) return;
        syncing = true;
        rsiChart.timeScale().setVisibleLogicalRange(range);
        setTimeout(() => { syncing = false; }, 0);
      });
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range) return;
        syncing = true;
        priceChart.timeScale().setVisibleLogicalRange(range);
        setTimeout(() => { syncing = false; }, 0);
      });
    }

    stateRef.current = {
      priceChart, rsiChart, candleSeries, volumeSeries, sma50Series, sma200Series, rsiSeries, rsiAnchorSeries, syncCleanup,
      lastDataLen: 0, lastRsiLen: 0, markerCollection: null, pivotPriceLines: [],
    };

    const handleResize = () => {
      if (priceContainerRef.current) priceChart.applyOptions({ width: priceContainerRef.current.clientWidth });
      if (rsiContainerRef.current && rsiChart) rsiChart.applyOptions({ width: rsiContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      syncCleanup();
      priceChart.remove();
      if (rsiChart) rsiChart.remove();
      stateRef.current = null;
    };
  }, [height, rsiHeight]);

  // Update data without recreating chart
  useEffect(() => {
    const state = stateRef.current;
    if (!state || data.length === 0) return;

    const candleData: CandlestickData<Time>[] = data.map((d) => ({
      time: d.time as Time,
      open: d.open, high: d.high, low: d.low, close: d.close,
    }));
    state.candleSeries.setData(candleData);

    // SMA overlays
    const closes = data.map((d) => d.close);
    const sma50 = computeSma(closes, 50);
    const sma200 = computeSma(closes, 200);
    state.sma50Series.setData(sma50.map((v, i) => ({ time: data[i]!.time as Time, value: v })).filter((p) => !Number.isNaN(p.value)));
    state.sma200Series.setData(sma200.map((v, i) => ({ time: data[i]!.time as Time, value: v })).filter((p) => !Number.isNaN(p.value)));

    state.volumeSeries.setData(
      data.filter((d) => d.volume !== undefined).map((d) => ({
        time: d.time as Time,
        value: d.volume!,
        color: d.close >= d.open ? '#10b98140' : '#ef444440',
      })),
    );

    // Update RSI anchor series with ALL candle timestamps so logical indices align
    if (state.rsiAnchorSeries) {
      state.rsiAnchorSeries.setData(data.map((d) => ({ time: d.time as Time, value: 50 })));
    }

    // Only fit content on first load or when data length shrinks (symbol/timeframe change)
    if (data.length !== state.lastDataLen && (state.lastDataLen === 0 || data.length < state.lastDataLen)) {
      state.priceChart.timeScale().fitContent();
      if (state.rsiChart) {
        const range = state.priceChart.timeScale().getVisibleLogicalRange();
        if (range) state.rsiChart.timeScale().setVisibleLogicalRange(range);
      }
    }
    state.lastDataLen = data.length;

    // Markers (buy/sell + HHLL)
    if (state.markerCollection) {
      state.markerCollection.detach();
      state.markerCollection = null;
    }
    for (const pl of state.pivotPriceLines) {
      state.candleSeries.removePriceLine(pl);
    }
    state.pivotPriceLines = [];
    const allMarkers = [...(markers || [])];
    if (showHhll) {
      const { markers: hhllMarkers, pivotLines } = computeHHLL(
        data.map((d) => d.high),
        data.map((d) => d.low),
        data.map((d) => d.time),
      );
      allMarkers.push(...hhllMarkers);
      for (const line of pivotLines) {
        const pl = state.candleSeries.createPriceLine({
          price: line.price,
          color: line.color,
          lineWidth: 2,
          lineStyle: 1,
          axisLabelVisible: true,
          title: line.price.toFixed(2),
        });
        state.pivotPriceLines.push(pl);
      }
    }
    state.markerCollection = createSeriesMarkers(state.candleSeries, allMarkers.map((m) => ({
      time: m.time as Time, position: m.position, color: m.color, shape: m.shape, text: m.text,
    })));
  }, [data, markers, showHhll]);

  // Toggle SMA visibility
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.sma50Series.applyOptions({ visible: showSma });
    state.sma200Series.applyOptions({ visible: showSma });
  }, [showSma]);

  // Update RSI data without recreating chart
  useEffect(() => {
    const state = stateRef.current;
    if (!state || !state.rsiSeries || !rsiData || rsiData.length === 0) return;

    state.rsiSeries.setData(rsiData.map((d) => ({ time: d.time as Time, value: d.value })));

    // Sync RSI visible range to match price chart
    if (rsiData.length !== state.lastRsiLen && state.rsiChart) {
      const range = state.priceChart.timeScale().getVisibleLogicalRange();
      if (range) state.rsiChart.timeScale().setVisibleLogicalRange(range);
    }
    state.lastRsiLen = rsiData.length;
  }, [rsiData]);

  return (
    <div className="w-full rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 bg-[#0f1729] px-3 py-1">
        <button onClick={() => setShowSma(!showSma)} className={`text-xs font-medium px-2 py-0.5 rounded cursor-pointer ${showSma ? 'text-[#fb9800] bg-[#fb980020]' : 'text-[#6b7280]'}`}>SMA</button>
        <button onClick={() => setShowRsi(!showRsi)} className={`text-xs font-medium px-2 py-0.5 rounded cursor-pointer ${showRsi ? 'text-[#8b5cf6] bg-[#8b5cf620]' : 'text-[#6b7280]'}`}>RSI</button>
        <button onClick={() => setShowHhll(!showHhll)} className={`text-xs font-medium px-2 py-0.5 rounded cursor-pointer ${showHhll ? 'text-[#10b981] bg-[#10b98120]' : 'text-[#6b7280]'}`}>HHLL</button>
      </div>
      <div ref={priceContainerRef} />
      {rsiData && rsiData.length > 0 && (
        <div style={{ display: showRsi ? 'block' : 'none' }}>
          <div className="flex items-center justify-between bg-[#0f1729] px-3 py-1">
            <span className="text-xs font-medium text-[#8b5cf6]">RSI (14)</span>
          </div>
          <div ref={rsiContainerRef} />
        </div>
      )}
    </div>
  );
}

function computeSma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j]!;
      result.push(sum / period);
    }
  }
  return result;
}
