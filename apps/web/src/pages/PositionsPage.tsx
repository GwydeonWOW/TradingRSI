import { useEffect, useState, useCallback } from 'react';
import { tradingApi, type Position } from '../api/trading.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';

type StatusTab = 'open' | 'closed' | 'all';

export function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>('open');
  const [sourceFilter, setSourceFilter] = useState<string>('');

  const fetchPositions = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (statusTab !== 'all') params.status = statusTab;
      if (sourceFilter) params.source = sourceFilter;
      const res = await tradingApi.getPositions(params);
      setPositions(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar posiciones');
    } finally {
      setLoading(false);
    }
  }, [statusTab, sourceFilter]);

  useEffect(() => {
    setLoading(true);
    fetchPositions();
  }, [fetchPositions]);

  useEffect(() => {
    const interval = setInterval(fetchPositions, 30000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  const tabs: { key: StatusTab; label: string }[] = [
    { key: 'open', label: 'Abiertas' },
    { key: 'closed', label: 'Cerradas' },
    { key: 'all', label: 'Todas' },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Posiciones</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-bg-secondary">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                statusTab === tab.key
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary'
              } ${tab.key === 'open' ? 'rounded-l-lg' : ''} ${tab.key === 'all' ? 'rounded-r-lg' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
        >
          <option value="">Todas las fuentes</option>
          <option value="simulation">Simulation</option>
          <option value="binance_demo_dry_run">Binance Demo</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      ) : positions.length === 0 ? (
        <EmptyState
          title="Sin posiciones"
          description="Las posiciones activas se mostraran aqui cuando se generen."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-secondary text-left">
                <th className="px-4 py-3 font-medium text-text-secondary">Simbolo</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Source</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Entry Price</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Quantity</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Invested</th>
                <th className="px-4 py-3 font-medium text-text-secondary">PnL</th>
                <th className="px-4 py-3 font-medium text-text-secondary">PnL%</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Status</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Opened At</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-border hover:bg-bg-hover">
                  <td className="px-4 py-3 font-medium text-text-primary">{p.symbol}</td>
                  <td className="px-4 py-3 text-text-secondary">{p.source}</td>
                  <td className="px-4 py-3 text-text-primary">${p.entryPrice.toFixed(2)}</td>
                  <td className="px-4 py-3 text-text-primary">{p.quantity.toFixed(6)}</td>
                  <td className="px-4 py-3 text-text-primary">${p.investedQuote.toFixed(2)}</td>
                  <PnLCell value={p.realizedPnl} prefix="$" />
                  <PnLCell value={p.realizedPnlPct} suffix="%" />
                  <td className="px-4 py-3">
                    <StatusPill status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {p.openedAt ? new Date(p.openedAt).toLocaleString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PnLCell({ value, prefix = '', suffix = '' }: { value: number | null; prefix?: string; suffix?: string }) {
  if (value === null) return <td className="px-4 py-3 text-text-muted">-</td>;
  const color = value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text-primary';
  return (
    <td className={`px-4 py-3 font-medium ${color}`}>
      {prefix}{value.toFixed(2)}{suffix}
    </td>
  );
}

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    open: { label: 'Open', className: 'bg-success/15 text-success' },
    closed: { label: 'Closed', className: 'bg-bg-tertiary text-text-secondary' },
    cancelled: { label: 'Cancelled', className: 'bg-danger/15 text-danger' },
  };
  const c = config[status] ?? { label: status, className: 'bg-bg-tertiary text-text-secondary' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}
