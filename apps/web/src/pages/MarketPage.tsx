import { useEffect, useState, useCallback, useMemo } from 'react';
import { tradingApi } from '../api/trading.ts';
import { liquidityApi } from '../api/liquidity.ts';
import { getSymbols } from '../api/config.ts';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';
import { detectRSIDivergence, calculateRSI as calculateRSIFull } from '../utils/rsiDivergence.ts';
import { MarketChart } from '../components/MarketChart.tsx';

const TIMEFRAMES = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
] as const;

interface PriceData {
  symbol: string;
  price: number | null;
  rsi: number | null;
  change24h: number | null;
  liquidityScore: number | null;
  liquidityState: string | null;
  error: boolean;
}

function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function MarketPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [environment, setEnvironment] = useState<string>('demo');
  const [loading, setLoading] = useState(true);
  const [symbols] = useState<string[]>(getSymbols);
  const [prices, setPrices] = useState<PriceData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedChart, setSelectedChart] = useState<string>(symbols[0] ?? 'BTCUSDT');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1h');
  const [chartData, setChartData] = useState<{ time: number; open: number; high: number; low: number; close: number; volume: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [showDivergence, setShowDivergence] = useState(true);

  // Initialize prices from symbols
  useEffect(() => {
    setPrices(symbols.map((s) => ({ symbol: s, price: null, rsi: null, change24h: null, liquidityScore: null, liquidityState: null, error: false })));
  }, [symbols]);

  // Fetch price cards data
  const fetchPrices = useCallback(async () => {
    try {
      const statusRes = await tradingApi.getBinanceStatus();
      const isConnected = statusRes.data.connected && statusRes.data.configured;
      setConnected(isConnected);
      setEnvironment(statusRes.data.environment);

      if (!isConnected) {
        setLoading(false);
        return;
      }

      const results = await Promise.allSettled(
        symbols.map(async (symbol) => {
          const res = await tradingApi.getKlines({ symbol, interval: '1h' });
          const klines = res.data;
          if (klines.length > 0) {
            const last = klines[klines.length - 1]!;
            const closes = klines.map((k) => parseFloat(k.close));
            const rsi = calculateRSI(closes);
            const first = klines[0]!;
            const change24h = parseFloat(first.open) > 0
              ? ((parseFloat(last.close) - parseFloat(first.open)) / parseFloat(first.open)) * 100
              : null;
            return { symbol, price: parseFloat(last.close), rsi, change24h, liquidityScore: null, liquidityState: null, error: false } as PriceData;
          }
          return { symbol, price: null, rsi: null, change24h: null, liquidityScore: null, liquidityState: null, error: true } as PriceData;
        })
      );

      setPrices(
        results.map((r, i) =>
          r.status === 'fulfilled' ? r.value : ({ symbol: symbols[i]!, price: null, rsi: null, change24h: null, liquidityScore: null, liquidityState: null, error: true } as PriceData)
        )
      );
      setError(null);

      // Fetch liquidity scores (non-blocking)
      Promise.allSettled(
        symbols.map(async (symbol) => {
          try {
            const res = await liquidityApi.getCurrent(symbol);
            return { symbol, score: res.data.score, state: res.data.state };
          } catch {
            return null;
          }
        })
      ).then((liqResults) => {
        setPrices((prev) =>
          prev.map((p) => {
            const liq = liqResults.find(
              (r) => r.status === 'fulfilled' && r.value && r.value.symbol === p.symbol,
            );
            if (liq && liq.status === 'fulfilled' && liq.value) {
              return { ...p, liquidityScore: liq.value.score, liquidityState: liq.value.state };
            }
            return p;
          })
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos');
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch chart data for selected symbol + timeframe
  const fetchChart = useCallback(async () => {
    if (!selectedChart) return;
    setChartLoading(true);
    try {
      const klineRes = await tradingApi.getKlines({ symbol: selectedChart, interval: selectedTimeframe });
      setChartData(
        klineRes.data.map((k) => ({
          time: Math.floor(k.openTime / 1000),
          open: parseFloat(k.open),
          high: parseFloat(k.high),
          low: parseFloat(k.low),
          close: parseFloat(k.close),
          volume: parseFloat(k.volume),
        })),
      );
    } catch {
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, [selectedChart, selectedTimeframe]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  useEffect(() => {
    fetchChart();
  }, [fetchChart]);

  // Refresh chart data every 10s to keep current candle up to date
  useEffect(() => {
    const interval = setInterval(fetchChart, 10000);
    return () => clearInterval(interval);
  }, [fetchChart]);

  useEffect(() => {
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  const divergenceMarkers = useMemo(() => {
    if (!showDivergence || chartData.length < 30) return undefined;
    const times = chartData.map((d) => d.time);
    const closes = chartData.map((d) => d.close);
    return detectRSIDivergence(times, closes);
  }, [chartData, showDivergence]);

  const rsiChartData: Array<{ time: number; value: number }> = useMemo(() => {
    if (chartData.length < 16) return [];
    const closes = chartData.map((d) => d.close);
    const rsiValues = calculateRSIFull(closes, 14);
    return chartData
      .map((d, i) => ({ time: d.time, value: rsiValues[i]! }))
      .filter((p) => p.value !== null);
  }, [chartData]);

  if (loading) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-text-primary">Datos de Mercado</h1>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Datos de Mercado</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {connected === false ? (
        <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger/10">
            <svg className="h-8 w-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary">Sin conexion a Binance</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Verifica la configuracion de la API de Binance para ver precios en tiempo real.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Datos de Binance {environment === 'demo' ? 'Demo' : environment}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {prices.length > 0 ? prices.map((p) => (
              <div
                key={p.symbol}
                className={`cursor-pointer rounded-lg border bg-bg-secondary p-4 transition-colors ${
                  selectedChart === p.symbol ? 'border-accent border-l-4' : 'border-border border-l-4 border-l-accent/30'
                }`}
                onClick={() => setSelectedChart(p.symbol)}
              >
                <p className="text-sm text-text-secondary">
                  {p.symbol.slice(0, -4)}/{p.symbol.slice(-4)}
                </p>
                {p.error ? (
                  <p className="mt-1 text-lg font-semibold text-text-muted">-</p>
                ) : (
                  <>
                    <p className="mt-1 text-2xl font-semibold text-text-primary">
                      {p.price !== null ? `$${p.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </p>
                    {p.change24h !== null && (
                      <p className={`mt-0.5 text-xs ${p.change24h >= 0 ? 'text-success' : 'text-danger'}`}>
                        {p.change24h >= 0 ? '+' : ''}{p.change24h.toFixed(2)}%
                      </p>
                    )}
                  </>
                )}
                <div className="mt-2 border-t border-border pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-muted">RSI (14)</span>
                    <span
                      className={`text-xs font-medium ${
                        p.rsi === null
                          ? 'text-text-muted'
                          : p.rsi < 30
                            ? 'text-success'
                            : p.rsi > 70
                              ? 'text-danger'
                              : 'text-text-primary'
                      }`}
                    >
                      {p.rsi !== null ? p.rsi.toFixed(1) : '-'}
                    </span>
                  </div>
                  {p.rsi !== null && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
                      <div
                        className={`h-full rounded-full ${p.rsi < 30 ? 'bg-success' : p.rsi > 70 ? 'bg-danger' : 'bg-accent'}`}
                        style={{ width: `${p.rsi}%` }}
                      />
                    </div>
                  )}
                </div>
                {p.liquidityScore !== null && (
                  <div className="mt-2 border-t border-border pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-muted">Liquidity</span>
                      <span className={`text-xs font-medium ${p.liquidityState === 'excellent' || p.liquidityState === 'good' ? 'text-success' : p.liquidityState === 'acceptable' ? 'text-warning' : 'text-danger'}`}>
                        {p.liquidityScore.toFixed(0)}/100
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
                      <div
                        className={`h-full rounded-full ${(p.liquidityState === 'excellent' || p.liquidityState === 'good') ? 'bg-success' : p.liquidityState === 'acceptable' ? 'bg-warning' : 'bg-danger'}`}
                        style={{ width: `${Math.min(100, p.liquidityScore)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )) : (
              <p className="text-sm text-text-muted">No hay simbolos configurados.</p>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-border bg-bg-secondary p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-text-secondary">
                {selectedChart.slice(0, -4)}/{selectedChart.slice(-4)} Chart
              </h2>
              <div className="flex gap-2">
                {/* Symbol selector */}
                <div className="flex gap-1">
                  {symbols.map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => setSelectedChart(sym)}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        selectedChart === sym
                          ? 'bg-accent text-white'
                          : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
                      }`}
                    >
                      {sym.slice(0, -4)}
                    </button>
                  ))}
                </div>
                {/* Timeframe selector */}
                <div className="ml-2 flex gap-1 border-l border-border pl-2">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf.value}
                      type="button"
                      onClick={() => setSelectedTimeframe(tf.value)}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        selectedTimeframe === tf.value
                          ? 'bg-accent text-white'
                          : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
                <div className="ml-2 border-l border-border pl-2">
                  <button
                    type="button"
                    onClick={() => setShowDivergence(!showDivergence)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      showDivergence
                        ? 'bg-warning/20 text-warning'
                        : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
                    }`}
                  >
                    RSI Div
                  </button>
                </div>
              </div>
            </div>
            {chartLoading ? (
              <div className="flex h-[400px] items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : chartData.length > 0 ? (
              <MarketChart data={chartData} rsiData={rsiChartData.length > 0 ? rsiChartData : undefined} height={400} rsiHeight={150} markers={divergenceMarkers} />
            ) : (
              <p className="text-sm text-text-muted">Sin datos del gráfico.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
