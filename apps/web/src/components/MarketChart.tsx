import { useEffect, useRef } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
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

export function MarketChart({ data, rsiData, height = 400, rsiHeight = 150, markers }: MarketChartProps) {
  const priceContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const priceChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!priceContainerRef.current || data.length === 0) return;

    // Clean up previous charts
    if (priceChartRef.current) {
      priceChartRef.current.remove();
      priceChartRef.current = null;
    }
    if (rsiChartRef.current) {
      rsiChartRef.current.remove();
      rsiChartRef.current = null;
    }

    const darkTheme = {
      layout: { background: { color: '#0f1729' }, textColor: '#6b7280' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: { vertLine: { color: '#475569' }, horzLine: { color: '#475569' } },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: { borderColor: '#1e293b', timeVisible: true },
    };

    // --- Price chart ---
    const priceChart = createChart(priceContainerRef.current, {
      ...darkTheme,
      height,
    });
    priceChartRef.current = priceChart;

    const candleSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    const candleData = data.map((d) => ({
      time: d.time as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candleSeries.setData(candleData);

    // Volume
    const volumeSeries = priceChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    priceChart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeries.setData(
      data
        .filter((d) => d.volume !== undefined)
        .map((d) => ({
          time: d.time as any,
          value: d.volume!,
          color: d.close >= d.open ? '#10b98140' : '#ef444440',
        })),
    );

    // Markers
    if (markers && markers.length > 0) {
      createSeriesMarkers(
        candleSeries,
        markers.map((m) => ({
          time: m.time as any,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
        })),
      );
    }

    priceChart.timeScale().fitContent();

    // --- RSI chart ---
    if (rsiContainerRef.current && rsiData && rsiData.length > 0) {
      const rsiChart = createChart(rsiContainerRef.current, {
        ...darkTheme,
        height: rsiHeight,
      });
      rsiChartRef.current = rsiChart;

      const rsiSeries = rsiChart.addSeries(LineSeries, {
        color: '#8b5cf6',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });

      rsiSeries.setData(rsiData.map((d) => ({ time: d.time as any, value: d.value })));

      rsiSeries.createPriceLine({
        price: 70,
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '',
      });
      rsiSeries.createPriceLine({
        price: 30,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: '',
      });
      rsiSeries.createPriceLine({
        price: 50,
        color: '#475569',
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: false,
        title: '',
      });

      rsiChart.timeScale().fitContent();

      // --- Synchronize time scales ---
      let syncing = false;

      priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range) return;
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

    // --- Resize handling ---
    const handleResize = () => {
      if (priceContainerRef.current) {
        priceChart.applyOptions({ width: priceContainerRef.current.clientWidth });
      }
      if (rsiContainerRef.current && rsiChartRef.current) {
        rsiChartRef.current.applyOptions({ width: rsiContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      priceChart.remove();
      priceChartRef.current = null;
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
      }
    };
  }, [data, rsiData, height, rsiHeight, markers]);

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
