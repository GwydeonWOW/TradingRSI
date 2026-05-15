import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, LineSeries, HistogramSeries } from 'lightweight-charts';

export interface EquityData {
  time: number;
  equity: number;
}

export interface DrawdownData {
  time: number;
  drawdown: number;
}

interface EquityCurveChartProps {
  equity: EquityData[];
  drawdown?: DrawdownData[];
  height?: number;
}

export function EquityCurveChart({ equity, drawdown, height = 300 }: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || equity.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      height,
      layout: { background: { color: '#0f1729' }, textColor: '#6b7280' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: { borderColor: '#1e293b', timeVisible: true },
    });

    chartRef.current = chart;

    const equitySeries = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 2,
    });

    equitySeries.setData(equity.map((d) => ({ time: d.time as any, value: d.equity })));

    if (drawdown && drawdown.length > 0) {
      const ddSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: 'percent' },
        priceScaleId: 'drawdown',
      });

      chart.priceScale('drawdown').applyOptions({
        scaleMargins: { top: 0.7, bottom: 0 },
        visible: false,
      });

      ddSeries.setData(
        drawdown.map((d) => ({
          time: d.time as any,
          value: d.drawdown,
          color: '#ef444480',
        })),
      );
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
  }, [equity, drawdown, height]);

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden" />;
}
