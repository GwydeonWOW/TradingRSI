import { useEffect, useRef } from 'react';
import { createChart, LineSeries, type IChartApi } from 'lightweight-charts';

export interface RsiDataPoint {
  time: number;
  value: number;
}

interface RsiChartProps {
  data: RsiDataPoint[];
  height?: number;
  period?: number;
}

export function RsiChart({ data, height = 150, period = 14 }: RsiChartProps) {
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
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: { borderColor: '#1e293b', timeVisible: true },
    });

    chartRef.current = chart;

    const rsiSeries = chart.addSeries(LineSeries, {
      color: '#8b5cf6',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    rsiSeries.setData(data.map((d) => ({ time: d.time as any, value: d.value })));

    // Overbought line at 70
    rsiSeries.createPriceLine({
      price: 70,
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: 2, // dashed
      axisLabelVisible: true,
      title: '',
    });

    // Oversold line at 30
    rsiSeries.createPriceLine({
      price: 30,
      color: '#10b981',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: '',
    });

    // Middle line at 50
    rsiSeries.createPriceLine({
      price: 50,
      color: '#475569',
      lineWidth: 1,
      lineStyle: 1,
      axisLabelVisible: false,
      title: '',
    });

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
  }, [data, height, period]);

  return (
    <div className="w-full rounded-lg overflow-hidden">
      <div className="flex items-center justify-between bg-[#0f1729] px-3 py-1">
        <span className="text-xs font-medium text-[#8b5cf6]">RSI ({period})</span>
      </div>
      <div ref={containerRef} />
    </div>
  );
}
