import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StrategyConfig } from '@cryptorsi/shared';
import { strategiesApi } from '../api/strategies.ts';

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

export function NewStrategyPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState('binance_demo');
  const [environment, setEnvironment] = useState('demo');
  const [config, setConfig] = useState<StrategyConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await strategiesApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        mode,
        environment,
        config,
      });
      navigate(`/strategies/${result.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear estrategia');
    } finally {
      setSaving(false);
    }
  }

  function updateConfig<K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) {
    setConfig((prev) => ({ ...prev, [section]: value }));
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/strategies')}
        className="mb-4 text-sm text-accent hover:text-accent-hover"
      >
        &larr; Volver a estrategias
      </button>

      <h1 className="mb-6 text-xl font-bold text-text-primary">Nueva Estrategia</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: basic info */}
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <h2 className="mb-4 text-sm font-medium text-text-secondary">Datos Generales</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nombre *</label>
              <input
                type="text"
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Mi estrategia RSI"
              />
            </div>
            <div>
              <label className={labelClass}>Descripcion</label>
              <textarea
                className={`${inputClass} min-h-[80px] resize-y`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripcion opcional..."
              />
            </div>
            <div>
              <label className={labelClass}>Modo</label>
              <select
                className={inputClass}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="simulation">Simulation</option>
                <option value="binance_demo">Binance Demo</option>
                <option value="binance_live">Binance Live</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Entorno</label>
              <select
                className={inputClass}
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
              >
                <option value="demo">Demo</option>
                <option value="testnet">Testnet</option>
                <option value="production">Production</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right: config preview */}
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-bg-secondary p-6">
            <h2 className="mb-4 text-sm font-medium text-text-secondary">Configuracion</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>RSI entrada (below)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputClass}
                  value={config.entry.rsiBelow}
                  onChange={(e) =>
                    updateConfig('entry', { ...config.entry, rsiBelow: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className={labelClass}>RSI salida (above)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputClass}
                  value={config.exit.rsiAbove}
                  onChange={(e) =>
                    updateConfig('exit', { ...config.exit, rsiAbove: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Take Profit (%)</label>
                <input
                  type="number"
                  step={0.1}
                  className={inputClass}
                  value={config.exit.takeProfitPct}
                  onChange={(e) =>
                    updateConfig('exit', { ...config.exit, takeProfitPct: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Stop Loss (%)</label>
                <input
                  type="number"
                  step={0.1}
                  className={inputClass}
                  value={config.exit.stopLossPct}
                  onChange={(e) =>
                    updateConfig('exit', { ...config.exit, stopLossPct: Number(e.target.value) })
                  }
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dryRun"
                  checked={config.execution.dryRun}
                  onChange={(e) =>
                    updateConfig('execution', { ...config.execution, dryRun: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
                />
                <label htmlFor="dryRun" className="text-sm text-text-primary">
                  Dry Run (simulacion)
                </label>
              </div>
              {!config.execution.dryRun && mode !== 'simulation' && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                  ATENCION: Las ordenes se ejecutaran con dinero real en Binance Demo
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-bg-secondary p-6">
            <h2 className="mb-4 text-sm font-medium text-text-secondary">JSON Config</h2>
            <pre className="overflow-auto rounded bg-bg-primary p-3 text-xs text-text-muted">
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate('/strategies')}
          className="rounded-md bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !name.trim()}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Creando...' : 'Crear Estrategia'}
        </button>
      </div>
    </div>
  );
}
