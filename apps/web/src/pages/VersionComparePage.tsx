import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { strategiesApi } from '../api/strategies.ts';
import type { StrategyDetail, StrategyVersion } from '../api/strategies.ts';
import type { StrategyConfig } from '@cryptorsi/shared';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';

interface ConfigField {
  label: string;
  getValue: (config: StrategyConfig) => string;
}

const CONFIG_FIELDS: ConfigField[] = [
  { label: 'Simbolos', getValue: (c) => c.symbols.join(', ') },
  { label: 'Timeframes', getValue: (c) => c.timeframes.join(', ') },
  { label: 'RSI Below (entrada)', getValue: (c) => String(c.entry.rsiBelow) },
  { label: 'RSI Above (salida)', getValue: (c) => String(c.exit.rsiAbove) },
  { label: 'SMA Period', getValue: (c) => String(c.entry.smaPeriod) },
  { label: 'SMA Filter', getValue: (c) => c.entry.useSmaFilter ? 'Si' : 'No' },
  { label: 'Multi-TF Confirm', getValue: (c) => c.entry.requireMultiTimeframeConfirmation ? 'Si' : 'No' },
  { label: 'Take Profit %', getValue: (c) => `${c.exit.takeProfitPct}%` },
  { label: 'Stop Loss %', getValue: (c) => `${c.exit.stopLossPct}%` },
  { label: 'Trailing Stop %', getValue: (c) => c.exit.trailingStopPct != null ? `${c.exit.trailingStopPct}%` : '-' },
  { label: 'Quote por trade', getValue: (c) => `${c.risk.quoteAmountPerTrade} USDT` },
  { label: 'Max posiciones abiertas', getValue: (c) => String(c.risk.maxOpenPositions) },
  { label: 'Max posiciones/simbolo', getValue: (c) => String(c.risk.maxPositionsPerSymbol) },
  { label: 'Max exposicion', getValue: (c) => `${c.risk.maxTotalExposureQuote} USDT` },
  { label: 'Max perdida diaria %', getValue: (c) => `${c.risk.maxDailyLossPct}%` },
  { label: 'Cooldown (min)', getValue: (c) => String(c.risk.cooldownMinutes) },
  { label: 'Dry Run', getValue: (c) => c.execution.dryRun ? 'Si' : 'No' },
  { label: 'Order test previo', getValue: (c) => c.execution.useOrderTestBeforeRealOrder ? 'Si' : 'No' },
];

export function VersionComparePage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const versionAParam = searchParams.get('a');
  const versionBParam = searchParams.get('b');

  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [versionA, setVersionA] = useState<StrategyVersion | null>(null);
  const [versionB, setVersionB] = useState<StrategyVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local selectors for when no query params are provided
  const [selectedA, setSelectedA] = useState(versionAParam ?? '');
  const [selectedB, setSelectedB] = useState(versionBParam ?? '');

  useEffect(() => {
    if (!id) return;
    fetchStrategy();
  }, [id]);

  async function fetchStrategy() {
    setLoading(true);
    setError(null);
    try {
      const res = await strategiesApi.get(id!);
      setStrategy(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar estrategia');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id || !strategy) return;
    const a = selectedA || versionAParam;
    const b = selectedB || versionBParam;
    if (!a || !b) return;

    const versionAObj = strategy.versions.find((v) => String(v.version) === a);
    const versionBObj = strategy.versions.find((v) => String(v.version) === b);

    if (versionAObj) {
      strategiesApi.getVersion(id, versionAObj.id)
        .then((res) => setVersionA(res.data))
        .catch(() => {});
    }
    if (versionBObj) {
      strategiesApi.getVersion(id, versionBObj.id)
        .then((res) => setVersionB(res.data))
        .catch(() => {});
    }
  }, [id, strategy, selectedA, selectedB, versionAParam, versionBParam]);

  if (loading) return <LoadingSpinner />;

  if (error || !strategy) {
    return (
      <div>
        <button
          type="button"
          onClick={() => navigate(`/strategies/${id}`)}
          className="mb-4 text-sm text-accent hover:text-accent-hover"
        >
          &larr; Volver a la estrategia
        </button>
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error ?? 'Estrategia no encontrada'}
        </div>
      </div>
    );
  }

  const configA = versionA?.config;
  const configB = versionB?.config;

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate(`/strategies/${id}`)}
        className="mb-4 text-sm text-accent hover:text-accent-hover"
      >
        &larr; Volver a {strategy.name}
      </button>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Comparar Versiones</h1>
        <p className="mt-1 text-sm text-text-secondary">{strategy.name}</p>
      </div>

      {/* Version selectors */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Version A</label>
          <select
            value={selectedA || versionAParam || ''}
            onChange={(e) => setSelectedA(e.target.value)}
            className="rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">Seleccionar</option>
            {strategy.versions.map((v) => (
              <option key={v.id} value={String(v.version)}>v{v.version}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center pb-2 text-text-muted">
          <span className="text-sm">vs</span>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Version B</label>
          <select
            value={selectedB || versionBParam || ''}
            onChange={(e) => setSelectedB(e.target.value)}
            className="rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="">Seleccionar</option>
            {strategy.versions.map((v) => (
              <option key={v.id} value={String(v.version)}>v{v.version}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison table */}
      {configA && configB ? (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-bg-tertiary">
                <tr>
                  <th className="px-4 py-3 font-medium text-text-secondary">Campo</th>
                  <th className="px-4 py-3 font-medium text-text-secondary">v{versionA?.version}</th>
                  <th className="px-4 py-3 font-medium text-text-secondary">v{versionB?.version}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {CONFIG_FIELDS.map((field) => {
                  const valA = field.getValue(configA);
                  const valB = field.getValue(configB);
                  const isDifferent = valA !== valB;
                  return (
                    <tr key={field.label} className={isDifferent ? 'bg-warning/5' : ''}>
                      <td className="px-4 py-2 text-text-secondary">{field.label}</td>
                      <td className={`px-4 py-2 ${isDifferent ? 'text-warning font-medium' : 'text-text-primary'}`}>
                        {valA}
                      </td>
                      <td className={`px-4 py-2 ${isDifferent ? 'text-warning font-medium' : 'text-text-primary'}`}>
                        {valB}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Run backtest comparison */}
          <button
            type="button"
            onClick={() => navigate(`/backtests?strategyId=${strategy.id}`)}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Ejecutar Backtest Comparativo
          </button>
        </div>
      ) : (selectedA || versionAParam) && (selectedB || versionBParam) ? (
        <LoadingSpinner />
      ) : (
        <p className="text-sm text-text-muted">Selecciona dos versiones para comparar.</p>
      )}
    </div>
  );
}
