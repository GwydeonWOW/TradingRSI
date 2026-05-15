import { useEffect, useRef } from 'react';
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
  rsiSeries: ISeriesApi<'Line'> | null;
  syncCleanup: () => void;
  lastDataLen: number;
  lastRsiLen: number;
}

export function MarketChart({ data, rsiData, height = 400, rsiHeight = 150, markers }: MarketChartProps) {
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

    let rsiChart: IChartApi | null = null;
    let rsiSeries: ISeriesApi<'Line'> | null = null;
    let syncCleanup = () => {};

    if (rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, { ...darkTheme, height: rsiHeight });
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
        syncing = false;
      });
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range) return;
        syncing = true;
        priceChart.timeScale().setVisibleLogicalRange(range);
        syncing = false;
      });
    }

    stateRef.current = {
      priceChart, rsiChart, candleSeries, volumeSeries, rsiSeries, syncCleanup,
      lastDataLen: 0, lastRsiLen: 0,
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

    state.volumeSeries.setData(
      data.filter((d) => d.volume !== undefined).map((d) => ({
        time: d.time as Time,
        value: d.volume!,
        color: d.close >= d.open ? '#10b98140' : '#ef444440',
      })),
    );

    // Only fit content on first load or when data length shrinks (symbol/timeframe change)
    if (data.length !== state.lastDataLen && (state.lastDataLen === 0 || data.length < state.lastDataLen)) {
      state.priceChart.timeScale().fitContent();
    }
    state.lastDataLen = data.length;

    // Markers
    if (markers && markers.length > 0) {
      createSeriesMarkers(state.candleSeries, markers.map((m) => ({
        time: m.time as Time, position: m.position, color: m.color, shape: m.shape, text: m.text,
      })));
    }
  }, [data, markers]);

  // Update RSI data without recreating chart
  useEffect(() => {
    const state = stateRef.current;
    if (!state || !state.rsiSeries || !rsiData || rsiData.length === 0) return;

    state.rsiSeries.setData(rsiData.map((d) => ({ time: d.time as Time, value: d.value })));

    if (rsiData.length !== state.lastRsiLen && (state.lastRsiLen === 0 || rsiData.length < state.lastRsiLen)) {
      state.rsiChart?.timeScale().fitContent();
    }
    state.lastRsiLen = rsiData.length;
  }, [rsiData]);

  return (
    <div className="w-full rounded-lg overflow-hidden">
      <div ref={priceContainerRef} />
      {rsiData && rsiData.length > 0 && (
        <div>
          <div className="flex items-center justify-between bg-[#0f1729] px-3 py-1">
            <span className="text-xs font-medium text-[#8b5cf6]">RSI (14)</span>
          </div>
          <div ref={rsiContainerRef} />
        </div>
      )}
    </div>
  );
}
