import { useEffect, useState, useCallback } from 'react';
import { tradingApi, type Signal } from '../api/trading.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';

export function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [symbolFilter, setSymbolFilter] = useState('');
  const [signalTypeFilter, setSignalTypeFilter] = useState('');

  const fetchSignals = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (symbolFilter) params.symbol = symbolFilter;
      if (signalTypeFilter) params.signalType = signalTypeFilter;
      const res = await tradingApi.getSignals(Object.keys(params).length > 0 ? params : undefined);
      setSignals(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar senales');
    } finally {
      setLoading(false);
    }
  }, [symbolFilter, signalTypeFilter]);

  useEffect(() => {
    setLoading(true);
    fetchSignals();
  }, [fetchSignals]);

  useEffect(() => {
    const interval = setInterval(fetchSignals, 30000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Senales y Decisiones</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Simbolo..."
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
          className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
        />
        <select
          value={signalTypeFilter}
          onChange={(e) => setSignalTypeFilter(e.target.value)}
          className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
        >
          <option value="">Todas</option>
          <option value="BUY_SIGNAL">Buy Signal</option>
          <option value="SELL_SIGNAL">Sell Signal</option>
          <option value="HOLD">Hold</option>
          <option value="BLOCKED_NO_POSITION">Blocked (No Position)</option>
          <option value="BLOCKED_ALREADY_POSITION">Blocked (Already Position)</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      ) : signals.length === 0 ? (
        <EmptyState
          title="Sin senales"
          description="Las senales generadas por las estrategias apareceran aqui."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-secondary text-left">
                <th className="w-8 px-4 py-3"></th>
                <th className="px-4 py-3 font-medium text-text-secondary">Date</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Symbol</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Timeframe</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Signal</th>
                <th className="px-4 py-3 font-medium text-text-secondary">RSI</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Price</th>
                <th className="px-4 py-3 font-medium text-text-secondary">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s) => {
                const isExpanded = expandedId === s.id;
                const reasons = extractReasons(s.payload);
                return (
                  <SignalRow
                    key={s.id}
                    signal={s}
                    isExpanded={isExpanded}
                    onToggle={() => toggleExpand(s.id)}
                    reasons={reasons}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SignalRow({
  signal,
  isExpanded,
  onToggle,
  reasons,
}: {
  signal: Signal;
  isExpanded: boolean;
  onToggle: () => void;
  reasons: string[];
}) {
  return (
    <>
      <tr className="border-b border-border hover:bg-bg-hover">
        <td className="px-4 py-3">
          <button
            onClick={onToggle}
            className="text-text-muted transition-colors hover:text-text-primary"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </td>
        <td className="px-4 py-3 text-text-secondary">
          {new Date(signal.createdAt).toLocaleString()}
        </td>
        <td className="px-4 py-3 font-medium text-text-primary">{signal.symbol}</td>
        <td className="px-4 py-3 text-text-secondary">{signal.timeframe}</td>
        <td className="px-4 py-3">
          <SignalTypePill signalType={signal.signalType} />
        </td>
        <td className="px-4 py-3 text-text-primary">
          {signal.rsiValue !== null ? signal.rsiValue.toFixed(2) : '-'}
        </td>
        <td className="px-4 py-3 text-text-primary">
          {signal.price !== null ? `$${signal.price.toFixed(2)}` : '-'}
        </td>
        <td className="max-w-[200px] truncate px-4 py-3 text-text-secondary">
          {reasons.length > 0 ? reasons.join(', ') : '-'}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-border bg-bg-secondary/50">
          <td colSpan={8} className="px-4 py-3">
            <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-text-secondary">
              {JSON.stringify(signal.payload, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function extractReasons(payload: Record<string, unknown>): string[] {
  const reasons = payload.reasons;
  if (Array.isArray(reasons)) return reasons.map(String);
  return [];
}

function SignalTypePill({ signalType }: { signalType: string }) {
  const config: Record<string, { label: string; className: string }> = {
    BUY_SIGNAL: { label: 'BUY', className: 'bg-success/15 text-success' },
    SELL_SIGNAL: { label: 'SELL', className: 'bg-danger/15 text-danger' },
    HOLD: { label: 'HOLD', className: 'bg-bg-tertiary text-text-secondary' },
    BLOCKED_NO_POSITION: { label: 'BLOCKED', className: 'bg-warning/15 text-warning' },
    BLOCKED_ALREADY_POSITION: { label: 'BLOCKED', className: 'bg-warning/15 text-warning' },
  };
  const c = config[signalType] ?? { label: signalType, className: 'bg-bg-tertiary text-text-secondary' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${c.className}`}>
      {c.label}
    </span>
  );
}
