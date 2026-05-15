import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface CandlestickChartProps {
  data: CandleData[];
  height?: number;
  showVolume?: boolean;
  markers?: Array<{ time: number; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown' | 'circle'; text?: string }>;
  liquidityScores?: Array<{ time: number; value: number }>;
}

export function CandlestickChart({ data, height = 400, showVolume = true, markers, liquidityScores }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: '#0f1729' },
        textColor: '#6b7280',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        vertLine: { color: '#475569' },
        horzLine: { color: '#475569' },
      },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: { borderColor: '#1e293b', timeVisible: true },
    });

    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
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

    // Volume histogram
    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      volumeSeries.setData(
        data
          .filter((d) => d.volume !== undefined)
          .map((d) => ({
            time: d.time as any,
            value: d.volume!,
            color: d.close >= d.open ? '#10b98140' : '#ef444440',
          })),
      );
    }

    // Markers (buy/sell signals)
    if (markers && markers.length > 0) {
      (candleSeries as any).setMarkers(
        markers.map((m) => ({
          time: m.time as any,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
        })),
      );
    }

    // Liquidity score line
    if (liquidityScores && liquidityScores.length > 0) {
      const liqSeries = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 2,
        priceScaleId: 'liquidity',
        lastValueVisible: false,
        priceLineVisible: false,
      });

      chart.priceScale('liquidity').applyOptions({
        scaleMargins: { top: 0, bottom: 0.8 },
        visible: false,
      });

      liqSeries.setData(liquidityScores.map((s) => ({ time: s.time as any, value: s.value })));
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height, showVolume, markers, liquidityScores]);

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden" />;
}
