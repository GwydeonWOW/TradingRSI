import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { StrategyConfig } from '@cryptorsi/shared';
import { strategiesApi } from '../api/strategies.ts';
import type { StrategyDetail } from '../api/strategies.ts';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';

const TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;

const defaultConfig: StrategyConfig = {
  symbols: ['BTCUSDT', 'ETHUSDT'],
  timeframes: ['15m', '1h', '4h'],
  entry: {
    rsiBelow: 30,
    requireMultiTimeframeConfirmation: true,
    useSmaFilter: true,
    smaPeriod: 200,
    cooldownMinutes: 360,
  },
  exit: {
    rsiAbove: 70,
    takeProfitPct: 8,
    stopLossPct: 3,
    trailingStopPct: null,
  },
  risk: {
    quoteAmountPerTrade: 25,
    maxOpenPositions: 5,
    maxPositionsPerSymbol: 2,
    maxTotalExposureQuote: 500,
    maxDailyLossPct: 5,
    cooldownMinutes: 360,
  },
  execution: {
    orderType: 'MARKET',
    useOrderTestBeforeRealOrder: true,
    dryRun: true,
  },
};

const inputClass =
  'w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';
const labelClass = 'mb-1 block text-sm font-medium text-text-secondary';
const sectionTitle = 'mb-3 text-sm font-medium text-text-secondary';

export function StrategyEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<StrategyConfig>(defaultConfig);

  useEffect(() => {
    if (!id) return;
    fetchStrategy();
  }, [id]);

  async function fetchStrategy() {
    setLoading(true);
    try {
      const result = await strategiesApi.get(id!);
      const s: StrategyDetail = result.data;
      if (s.versions.length > 0) {
        const latestVersion = s.versions[s.versions.length - 1]!;
        const versionRes = await strategiesApi.getVersion(id!, latestVersion.id);
        setConfig(versionRes.data.config);
      } else {
        setConfig((prev) => ({ ...prev, symbols: s.symbols }));
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  }

  function updateConfig<K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) {
    setConfig((prev) => ({ ...prev, [section]: value }));
  }

  function toggleTimeframe(tf: string) {
    const current = config.timeframes;
    const next = current.includes(tf) ? current.filter((t) => t !== tf) : [...current, tf];
    if (next.length > 0) updateConfig('timeframes', next);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await strategiesApi.update(id!, { config });
      navigate(`/strategies/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate(`/strategies/${id}`)}
        className="mb-4 text-sm text-accent hover:text-accent-hover"
      >
        &larr; Volver a la estrategia
      </button>

      <h1 className="mb-6 text-xl font-bold text-text-primary">Editar Estrategia</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-bg-secondary p-6">
            <h2 className={sectionTitle}>Simbolos y Timeframes</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Simbolos (separados por coma)</label>
                <input
                  type="text"
                  className={inputClass}
                  value={config.symbols.join(', ')}
                  onChange={(e) =>
                    updateConfig(
                      'symbols',
                      e.target.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
                    )
                  }
                  placeholder="BTCUSDT, ETHUSDT, SOLUSDT"
                />
              </div>
              <div>
                <label className={labelClass}>Timeframes</label>
                <div className="flex flex-wrap gap-2">
                  {TIMEFRAME_OPTIONS.map((tf) => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => toggleTimeframe(tf)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        config.timeframes.includes(tf)
                          ? 'bg-accent text-white'
                          : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-secondary p-6">
            <h2 className={sectionTitle}>Gestion de Riesgo</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Cantidad por trade (USDT)</label>
                  <input
                    type="number" min={1} step={1} className={inputClass}
                    value={config.risk.quoteAmountPerTrade}
                    onChange={(e) => updateConfig('risk', { ...config.risk, quoteAmountPerTrade: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max posiciones abiertas</label>
                  <input
                    type="number" min={1} className={inputClass}
                    value={config.risk.maxOpenPositions}
                    onChange={(e) => updateConfig('risk', { ...config.risk, maxOpenPositions: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Max por simbolo</label>
                  <input
                    type="number" min={1} className={inputClass}
                    value={config.risk.maxPositionsPerSymbol}
                    onChange={(e) => updateConfig('risk', { ...config.risk, maxPositionsPerSymbol: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Exposicion max (USDT)</label>
                  <input
                    type="number" min={1} className={inputClass}
                    value={config.risk.maxTotalExposureQuote}
                    onChange={(e) => updateConfig('risk', { ...config.risk, maxTotalExposureQuote: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Perdida diaria max (%)</label>
                  <input
                    type="number" min={0} max={100} step={0.5} className={inputClass}
                    value={config.risk.maxDailyLossPct}
                    onChange={(e) => updateConfig('risk', { ...config.risk, maxDailyLossPct: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Cooldown (min)</label>
                  <input
                    type="number" min={0} className={inputClass}
                    value={config.risk.cooldownMinutes}
                    onChange={(e) => updateConfig('risk', { ...config.risk, cooldownMinutes: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-bg-secondary p-6">
            <h2 className={sectionTitle}>Entrada</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>RSI entrada (below)</label>
                  <input
                    type="number" min={0} max={100} className={inputClass}
                    value={config.entry.rsiBelow}
                    onChange={(e) => updateConfig('entry', { ...config.entry, rsiBelow: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Cooldown entrada (min)</label>
                  <input
                    type="number" min={0} className={inputClass}
                    value={config.entry.cooldownMinutes}
                    onChange={(e) => updateConfig('entry', { ...config.entry, cooldownMinutes: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={config.entry.useSmaFilter}
                    onChange={(e) => updateConfig('entry', { ...config.entry, useSmaFilter: e.target.checked })}
                    className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
                  />
                  Filtro SMA
                </label>
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={config.entry.requireMultiTimeframeConfirmation}
                    onChange={(e) => updateConfig('entry', { ...config.entry, requireMultiTimeframeConfirmation: e.target.checked })}
                    className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
                  />
                  Confirmacion multi-timeframe
                </label>
              </div>
              {config.entry.useSmaFilter && (
                <div>
                  <label className={labelClass}>Periodo SMA</label>
                  <input
                    type="number" min={1} className={inputClass}
                    value={config.entry.smaPeriod}
                    onChange={(e) => updateConfig('entry', { ...config.entry, smaPeriod: Number(e.target.value) })}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-secondary p-6">
            <h2 className={sectionTitle}>Salida</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>RSI salida (above)</label>
                <input
                  type="number" min={0} max={100} className={inputClass}
                  value={config.exit.rsiAbove}
                  onChange={(e) => updateConfig('exit', { ...config.exit, rsiAbove: Number(e.target.value) })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Take Profit (%)</label>
                  <input
                    type="number" step={0.1} min={0} className={inputClass}
                    value={config.exit.takeProfitPct}
                    onChange={(e) => updateConfig('exit', { ...config.exit, takeProfitPct: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Stop Loss (%)</label>
                  <input
                    type="number" step={0.1} min={0} className={inputClass}
                    value={config.exit.stopLossPct}
                    onChange={(e) => updateConfig('exit', { ...config.exit, stopLossPct: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Trailing Stop (%) — dejar vacio para desactivar</label>
                <input
                  type="number" step={0.1} min={0} className={inputClass}
                  value={config.exit.trailingStopPct ?? ''}
                  onChange={(e) =>
                    updateConfig('exit', {
                      ...config.exit,
                      trailingStopPct: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="Desactivado"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-secondary p-6">
            <h2 className={sectionTitle}>Ejecucion</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Tipo de orden</label>
                  <select className={inputClass} value={config.execution.orderType} disabled>
                    <option value="MARKET">MARKET</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={config.execution.useOrderTestBeforeRealOrder}
                      onChange={(e) => updateConfig('execution', { ...config.execution, useOrderTestBeforeRealOrder: e.target.checked })}
                      className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
                    />
                    Test antes de orden real
                  </label>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={config.execution.dryRun}
                  onChange={(e) => updateConfig('execution', { ...config.execution, dryRun: e.target.checked })}
                  className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
                />
                Dry Run (simulacion)
              </label>
              {!config.execution.dryRun && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                  ATENCION: Las ordenes se ejecutaran con dinero real
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate(`/strategies/${id}`)}
          className="rounded-md bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  );
}
