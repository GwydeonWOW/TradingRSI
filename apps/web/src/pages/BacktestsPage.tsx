import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { strategiesApi, backtestsApi } from '../api/strategies.ts';
import type { StrategyListItem, BacktestResult, BacktestMetrics, BacktestTrade } from '../api/strategies.ts';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';
import { EmptyState } from '../components/EmptyState.tsx';

const INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

function formatDateInput(d: Date): string {
  return d.toISOString().split('T')[0] ?? '';
}

function formatDateTime(epoch: number): string {
  return new Date(epoch).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pnlColor(value: number): string {
  if (value > 0) return 'text-success';
  if (value < 0) return 'text-danger';
  return 'text-text-primary';
}

function pnlSign(value: number): string {
  if (value > 0) return '+';
  return '';
}

function MetricsGrid({ metrics }: { metrics: BacktestMetrics }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-lg border border-border bg-bg-secondary p-4 border-l-4 border-l-border">
        <p className="text-sm text-text-secondary">Total Trades</p>
        <p className="mt-1 text-2xl font-semibold text-text-primary">{metrics.totalTrades}</p>
        <p className="mt-1 text-xs text-text-muted">{metrics.winningTrades}G / {metrics.losingTrades}P</p>
      </div>
      <div className={`rounded-lg border border-border bg-bg-secondary p-4 border-l-4 ${metrics.totalPnl >= 0 ? 'border-l-success' : 'border-l-danger'}`}>
        <p className="text-sm text-text-secondary">Win Rate</p>
        <p className="mt-1 text-2xl font-semibold text-text-primary">{(metrics.winRate * 100).toFixed(1)}%</p>
      </div>
      <div className={`rounded-lg border border-border bg-bg-secondary p-4 border-l-4 ${metrics.totalPnl >= 0 ? 'border-l-success' : 'border-l-danger'}`}>
        <p className="text-sm text-text-secondary">PnL Total</p>
        <p className={`mt-1 text-2xl font-semibold ${pnlColor(metrics.totalPnl)}`}>
          {pnlSign(metrics.totalPnl)}{metrics.totalPnl.toFixed(2)} USDT
        </p>
        <p className={`mt-1 text-xs ${pnlColor(metrics.totalPnlPct)}`}>
          {pnlSign(metrics.totalPnlPct)}{(metrics.totalPnlPct * 100).toFixed(2)}%
        </p>
      </div>
      <div className="rounded-lg border border-border bg-bg-secondary p-4 border-l-4 border-l-warning">
        <p className="text-sm text-text-secondary">Max Drawdown</p>
        <p className="mt-1 text-2xl font-semibold text-danger">{(metrics.maxDrawdown * 100).toFixed(2)}%</p>
      </div>
      <div className="rounded-lg border border-border bg-bg-secondary p-4 border-l-4 border-l-border">
        <p className="text-sm text-text-secondary">Profit Factor</p>
        <p className="mt-1 text-2xl font-semibold text-text-primary">{metrics.profitFactor.toFixed(2)}</p>
      </div>
      <div className="rounded-lg border border-border bg-bg-secondary p-4 border-l-4 border-l-border">
        <p className="text-sm text-text-secondary">Sharpe Ratio</p>
        <p className="mt-1 text-2xl font-semibold text-text-primary">{metrics.sharpeRatio.toFixed(2)}</p>
      </div>
      <div className="rounded-lg border border-border bg-bg-secondary p-4 border-l-4 border-l-success">
        <p className="text-sm text-text-secondary">Mejor Trade</p>
        <p className="mt-1 text-2xl font-semibold text-success">{pnlSign(metrics.bestTrade)}{metrics.bestTrade.toFixed(2)}</p>
      </div>
      <div className="rounded-lg border border-border bg-bg-secondary p-4 border-l-4 border-l-danger">
        <p className="text-sm text-text-secondary">Peor Trade</p>
        <p className="mt-1 text-2xl font-semibold text-danger">{metrics.worstTrade.toFixed(2)}</p>
      </div>
    </div>
  );
}

function TradesTable({ trades }: { trades: BacktestTrade[] }) {
  if (trades.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-bg-tertiary">
          <tr>
            <th className="px-4 py-3 font-medium text-text-secondary">Entrada</th>
            <th className="px-4 py-3 font-medium text-text-secondary">Salida</th>
            <th className="px-4 py-3 font-medium text-text-secondary">Lado</th>
            <th className="px-4 py-3 font-medium text-text-secondary">Precio Entrada</th>
            <th className="px-4 py-3 font-medium text-text-secondary">Precio Salida</th>
            <th className="px-4 py-3 font-medium text-text-secondary">PnL</th>
            <th className="px-4 py-3 font-medium text-text-secondary">PnL %</th>
            <th className="px-4 py-3 font-medium text-text-secondary">Razon</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {trades.map((t, i) => (
            <tr key={i} className="hover:bg-bg-hover">
              <td className="px-4 py-2 text-text-secondary text-xs">{formatDateTime(t.entryTime)}</td>
              <td className="px-4 py-2 text-text-secondary text-xs">{formatDateTime(t.exitTime)}</td>
              <td className="px-4 py-2">
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${t.side === 'BUY' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                  {t.side}
                </span>
              </td>
              <td className="px-4 py-2 text-text-primary">{t.entryPrice.toFixed(2)}</td>
              <td className="px-4 py-2 text-text-primary">{t.exitPrice.toFixed(2)}</td>
              <td className={`px-4 py-2 font-medium ${pnlColor(t.pnl)}`}>
                {pnlSign(t.pnl)}{t.pnl.toFixed(2)}
              </td>
              <td className={`px-4 py-2 ${pnlColor(t.pnlPct)}`}>
                {pnlSign(t.pnlPct)}{(t.pnlPct * 100).toFixed(2)}%
              </td>
              <td className="px-4 py-2 text-text-muted text-xs">{t.exitReason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EquityCurveTable({ curve }: { curve: BacktestResult['equityCurve'] }) {
  if (curve.length === 0) return null;
  // Sample at most 20 evenly spaced points for readability
  const step = Math.max(1, Math.floor(curve.length / 20));
  const sampled = curve.filter((_, i) => i % step === 0 || i === curve.length - 1);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-bg-tertiary">
          <tr>
            <th className="px-4 py-3 font-medium text-text-secondary">Fecha</th>
            <th className="px-4 py-3 font-medium text-text-secondary">Capital</th>
            <th className="px-4 py-3 font-medium text-text-secondary">Cambio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sampled.map((point, i) => {
            const prev = sampled[i - 1];
            const prevEquity = prev ? prev.equity : point.equity;
            const change = point.equity - prevEquity;
            return (
              <tr key={i} className="hover:bg-bg-hover">
                <td className="px-4 py-2 text-text-secondary text-xs">{formatDateTime(point.time)}</td>
                <td className="px-4 py-2 text-text-primary font-medium">{point.equity.toFixed(2)} USDT</td>
                <td className={`px-4 py-2 text-xs ${i === 0 ? 'text-text-muted' : pnlColor(change)}`}>
                  {i === 0 ? '-' : `${pnlSign(change)}${change.toFixed(2)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunBacktestTab({ preselectedStrategyId }: { preselectedStrategyId?: string }) {
  const [strategies, setStrategies] = useState<StrategyListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingStrategies, setFetchingStrategies] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [strategyId, setStrategyId] = useState(preselectedStrategyId ?? '');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1h');
  const [startDate, setStartDate] = useState(formatDateInput(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(formatDateInput(now));
  const [initialCapital, setInitialCapital] = useState('1000');
  const [commissionRate, setCommissionRate] = useState('0.001');

  useEffect(() => {
    fetchStrategies();
  }, []);

  async function fetchStrategies() {
    setFetchingStrategies(true);
    try {
      const res = await strategiesApi.list();
      setStrategies(res.data);
    } catch {
      // Silently fail - strategy selector will be empty
    } finally {
      setFetchingStrategies(false);
    }
  }

  async function handleRun() {
    if (!strategyId || !symbol || !startDate || !endDate) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await backtestsApi.run({
        strategyId,
        symbol,
        interval,
        startDate,
        endDate,
        initialCapital: parseFloat(initialCapital) || 1000,
        commissionRate: parseFloat(commissionRate) || 0.001,
      });
      setResult(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al ejecutar backtest');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none';
  const labelClass = 'mb-1 block text-xs font-medium text-text-secondary';

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="mb-4 text-sm font-medium text-text-secondary">Parametros</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelClass}>Estrategia</label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              disabled={fetchingStrategies || !!preselectedStrategyId}
              className={inputClass}
            >
              <option value="">{fetchingStrategies ? 'Cargando...' : 'Seleccionar'}</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Simbolo</label>
            <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Intervalo</label>
            <select value={interval} onChange={(e) => setInterval(e.target.value)} className={inputClass}>
              {INTERVALS.map((iv) => (
                <option key={iv} value={iv}>{iv}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Fecha inicio</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Fecha fin</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Capital inicial (USDT)</label>
            <input type="number" value={initialCapital} onChange={(e) => setInitialCapital(e.target.value)} min="1" step="100" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Comision (%)</label>
            <input type="number" value={(parseFloat(commissionRate) * 100).toFixed(1)} onChange={(e) => setCommissionRate(String(parseFloat(e.target.value) / 100 || 0))} min="0" step="0.1" className={inputClass} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleRun}
            disabled={loading || !strategyId || !symbol || !startDate || !endDate}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Ejecutando...' : 'Ejecutar Backtest'}
          </button>
          {loading && <LoadingSpinner size="sm" />}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          <h2 className="text-sm font-medium text-text-secondary">Resultados</h2>
          <MetricsGrid metrics={result.metrics} />

          {/* Final capital */}
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <p className="text-sm text-text-secondary">Capital Final</p>
            <p className={`mt-1 text-xl font-semibold ${pnlColor(result.metrics.finalCapital - (parseFloat(initialCapital) || 1000))}`}>
              {result.metrics.finalCapital.toFixed(2)} USDT
            </p>
          </div>

          {/* Equity curve */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-text-secondary">Curva de Capital</h3>
            <EquityCurveTable curve={result.equityCurve} />
          </div>

          {/* Trades */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-text-secondary">Trades ({result.trades.length})</h3>
            <TradesTable trades={result.trades} />
          </div>
        </div>
      )}
    </div>
  );
}

function PastResultsTab() {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetchResults();
  }, []);

  async function fetchResults() {
    setLoading(true);
    setError(null);
    try {
      const res = await backtestsApi.list();
      setResults(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar resultados');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <LoadingSpinner />;
  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
        {error}
      </div>
    );
  }
  if (results.length === 0) {
    return (
      <EmptyState
        title="Sin resultados anteriores"
        description="Ejecuta un backtest desde la pestana anterior para ver resultados aqui."
      />
    );
  }

  return (
    <div className="space-y-3">
      {results.map((r, i) => {
        const isOpen = expanded === i;
        return (
          <div key={i} className="rounded-lg border border-border bg-bg-secondary">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : i)}
              className="flex w-full items-center justify-between p-4 text-left"
            >
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-text-primary">{r.params.symbol}</span>
                <span className="rounded bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary">{r.params.interval}</span>
                <span className="text-xs text-text-muted">
                  {r.params.startDate} - {r.params.endDate}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className={`text-sm font-medium ${pnlColor(r.metrics.totalPnl)}`}>
                  {pnlSign(r.metrics.totalPnl)}{r.metrics.totalPnl.toFixed(2)} USDT
                </span>
                <span className="text-xs text-text-secondary">
                  {(r.metrics.winRate * 100).toFixed(0)}% win
                </span>
                <span className="text-xs text-text-muted">{r.metrics.totalTrades} trades</span>
                <svg
                  className={`h-4 w-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-border p-4 pt-4 space-y-4">
                <MetricsGrid metrics={r.metrics} />
                <div>
                  <h3 className="mb-2 text-sm font-medium text-text-secondary">Trades ({r.trades.length})</h3>
                  <TradesTable trades={r.trades} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type Tab = 'run' | 'results';

export function BacktestsPage() {
  const [searchParams] = useSearchParams();
  const preselectedStrategyId = searchParams.get('strategyId') ?? undefined;
  const [tab, setTab] = useState<Tab>('run');

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'run', label: 'Ejecutar Backtest' },
    { value: 'results', label: 'Resultados Anteriores' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Backtesting</h1>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.value
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'run' && <RunBacktestTab preselectedStrategyId={preselectedStrategyId} />}
      {tab === 'results' && <PastResultsTab />}
    </div>
  );
}
