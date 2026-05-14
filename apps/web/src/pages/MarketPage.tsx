import { useEffect, useState, useCallback } from 'react';
import { tradingApi } from '../api/trading.ts';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'] as const;

interface PriceData {
  symbol: string;
  price: number | null;
  error: boolean;
}

export function MarketPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [prices, setPrices] = useState<PriceData[]>(
    SYMBOLS.map((s) => ({ symbol: s, price: null, error: false }))
  );
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const statusRes = await tradingApi.getBinanceStatus();
      const isConnected = statusRes.data.connected && statusRes.data.configured;
      setConnected(isConnected);

      if (!isConnected) {
        setLoading(false);
        return;
      }

      const results = await Promise.allSettled(
        SYMBOLS.map(async (symbol) => {
          const res = await tradingApi.getKlines({ symbol, interval: '1h' });
          const klines = res.data;
          if (klines.length > 0) {
            const last = klines[klines.length - 1]!;
            return { symbol, price: parseFloat(last.close), error: false } as PriceData;
          }
          return { symbol, price: null, error: true } as PriceData;
        })
      );

      setPrices(
        results.map((r, i) =>
          r.status === 'fulfilled' ? r.value : ({ symbol: SYMBOLS[i]!, price: null, error: true } as PriceData)
        )
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos');
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

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
            <svg
              className="h-8 w-8 text-danger"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text-primary">Sin conexion a Binance</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Verifica la configuracion de la API de Binance para ver precios en tiempo real.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {prices.map((p) => (
              <div
                key={p.symbol}
                className="rounded-lg border border-border border-l-4 border-l-accent bg-bg-secondary p-4"
              >
                <p className="text-sm text-text-secondary">
                  {p.symbol.slice(0, -4)}/{p.symbol.slice(-4)}
                </p>
                {p.error ? (
                  <p className="mt-1 text-lg font-semibold text-text-muted">-</p>
                ) : (
                  <p className="mt-1 text-2xl font-semibold text-text-primary">
                    {p.price !== null ? `$${p.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                  </p>
                )}
                <p className="mt-1 text-xs text-text-muted">USD</p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-lg border border-border bg-bg-secondary p-4">
            <h2 className="mb-3 text-sm font-medium text-text-secondary">Watchlist</h2>
            <p className="text-sm text-text-muted">
              {prices.some((p) => p.price !== null)
                ? 'Precios actualizados cada 30 segundos.'
                : 'Sin datos de precios disponibles.'}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
