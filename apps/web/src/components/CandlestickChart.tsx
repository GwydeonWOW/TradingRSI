import { useEffect, useRef, useState } from 'react';
import { createChart, createSeriesMarkers, type IChartApi, type ISeriesApi, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { computeHHLL } from '../utils/hhll';

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TradeRange {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
}

export interface RsiSeriesConfig {
  label: string;
  color: string;
  data: Array<{ time: number; value: number }>;
}

interface CandlestickChartProps {
  data: CandleData[];
  height?: number;
  showVolume?: boolean;
  markers?: Array<{ time: number; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown' | 'circle'; text?: string }>;
  liquidityScores?: Array<{ time: number; value: number }>;
  rsiSeries?: RsiSeriesConfig[];
  tradeRange?: TradeRange;
}

export function CandlestickChart({ data, height = 400, showVolume = true, markers, liquidityScores, rsiSeries, tradeRange }: CandlestickChartProps) {
  const [showSma, setShowSma] = useState(true);
  const [showRsi, setShowRsi] = useState(true);
  const [showHhll, setShowHhll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const darkTheme = {
      layout: { background: { color: '#0f1729' }, textColor: '#6b7280' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      crosshair: { vertLine: { color: '#475569' }, horzLine: { color: '#475569' } },
      rightPriceScale: { borderColor: '#1e293b' },
      timeScale: { borderColor: '#1e293b', timeVisible: true },
    };

    const chart = createChart(containerRef.current, {
      ...darkTheme,
      height,
      localization: {
        timeFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        },
      },
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

    // Markers (buy/sell signals + HHLL patterns)
    const allMarkers = [...(markers || [])];
    if (showHhll) {
      const hhll = computeHHLL(
        data.map((d) => d.high),
        data.map((d) => d.low),
        data.map((d) => d.time),
      );
      allMarkers.push(...hhll);
    }
    if (allMarkers.length > 0) {
      createSeriesMarkers(
        candleSeries,
        allMarkers.map((m) => ({
          time: m.time as any,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
        })),
      );
    }

    // SMA overlays
    if (showSma) {
      const closes = data.map((d) => d.close);
      const sma50 = computeSma(closes, 50);
      const sma200 = computeSma(closes, 200);

      const sma50Series = chart.addSeries(LineSeries, {
        color: '#fb9800', lineWidth: 1, priceLineVisible: false, lastValueVisible: true, title: 'SMA 50',
      });
      sma50Series.setData(
        sma50.map((v, i) => ({ time: data[i]!.time as any, value: v })).filter((p) => !Number.isNaN(p.value)),
      );

      const sma200Series = chart.addSeries(LineSeries, {
        color: '#f60c0c', lineWidth: 1, priceLineVisible: false, lastValueVisible: true, title: 'SMA 200',
      });
      sma200Series.setData(
        sma200.map((v, i) => ({ time: data[i]!.time as any, value: v })).filter((p) => !Number.isNaN(p.value)),
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

    // Trade range: entry/exit price lines with PnL%
    if (tradeRange) {
      candleSeries.createPriceLine({
        price: tradeRange.entryPrice,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Entry: ${tradeRange.entryPrice.toFixed(2)}`,
      });
      candleSeries.createPriceLine({
        price: tradeRange.exitPrice,
        color: tradeRange.pnlPct >= 0 ? '#10b981' : '#ef4444',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Exit: ${tradeRange.exitPrice.toFixed(2)} (${tradeRange.pnlPct >= 0 ? '+' : ''}${tradeRange.pnlPct.toFixed(2)}%)`,
      });
    }

    chart.timeScale().fitContent();

    // RSI sub-chart
    let rsiChart: IChartApi | null = null;
    const hasRsi = showRsi && rsiSeries && rsiSeries.length > 0 && rsiSeries.some((s) => s.data.length > 0);

    if (rsiContainerRef.current && hasRsi) {
      rsiChart = createChart(rsiContainerRef.current, {
        ...darkTheme,
        height: 150,
        localization: {
          timeFormatter: (time: number) => {
            const d = new Date(time * 1000);
            return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          },
        },
      });

      // Reference lines
      const refSeries = rsiChart.addSeries(LineSeries, {
        color: 'transparent',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      refSeries.createPriceLine({ price: 70, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '70' });
      refSeries.createPriceLine({ price: 30, color: '#10b981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '30' });
      refSeries.createPriceLine({ price: 50, color: '#475569', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '' });

      // Seed the reference series with ALL candle timestamps so logical indices align
      const allRsiPoints = rsiSeries.flatMap((s) => s.data);
      if (allRsiPoints.length > 0) {
        refSeries.setData(data.map((d) => ({ time: d.time as any, value: 50 })));
      }

      // Draw each RSI series
      for (const series of rsiSeries) {
        if (series.data.length === 0) continue;
        const line = rsiChart.addSeries(LineSeries, {
          color: series.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: series.label,
        });
        line.setData(series.data.map((d) => ({ time: d.time as any, value: d.value })));
      }

      rsiChart.timeScale().fitContent();

      // Sync time scales between candlestick and RSI charts
      let syncing = false;
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range || !rsiChart) return;
        syncing = true;
        rsiChart.timeScale().setVisibleLogicalRange(range);
        setTimeout(() => { syncing = false; }, 0);
      });
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || !range) return;
        syncing = true;
        chart.timeScale().setVisibleLogicalRange(range);
        setTimeout(() => { syncing = false; }, 0);
      });
    }

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
      if (rsiContainerRef.current && rsiChart) {
        rsiChart.applyOptions({ width: rsiContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (rsiChart) rsiChart.remove();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height, showVolume, markers, liquidityScores, rsiSeries, tradeRange, showSma, showRsi, showHhll]);

  return (
    <div className="w-full rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 bg-[#0f1729] px-3 py-1">
        <button onClick={() => setShowSma(!showSma)} className={`text-xs font-medium px-2 py-0.5 rounded cursor-pointer ${showSma ? 'text-[#fb9800] bg-[#fb980020]' : 'text-[#6b7280]'}`}>SMA</button>
        <button onClick={() => setShowRsi(!showRsi)} className={`text-xs font-medium px-2 py-0.5 rounded cursor-pointer ${showRsi ? 'text-[#8b5cf6] bg-[#8b5cf620]' : 'text-[#6b7280]'}`}>RSI</button>
        <button onClick={() => setShowHhll(!showHhll)} className={`text-xs font-medium px-2 py-0.5 rounded cursor-pointer ${showHhll ? 'text-[#10b981] bg-[#10b98120]' : 'text-[#6b7280]'}`}>HHLL</button>
      </div>
      <div ref={containerRef} />
      {showRsi && rsiSeries && rsiSeries.length > 0 && rsiSeries.some((s) => s.data.length > 0) && (
        <div>
          <div className="flex items-center gap-4 bg-[#0f1729] px-3 py-1">
            {rsiSeries.filter((s) => s.data.length > 0).map((s) => (
              <span key={s.label} className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
            ))}
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
