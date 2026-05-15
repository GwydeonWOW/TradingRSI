import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { StrategyConfig } from '@cryptorsi/shared';
import { strategiesApi } from '../api/strategies.ts';
import type { StrategyDetail } from '../api/strategies.ts';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';

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

const STEPS = [
  'General',
  'Simbolos y Timeframes',
  'Reglas de Entrada',
  'Reglas de Salida',
  'Riesgo y Capital',
  'Ejecucion',
  'Resumen',
];

const COMMON_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT'];
const AVAILABLE_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

export function StrategyEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<StrategyConfig>(defaultConfig);
  const [mode, setMode] = useState<string>('binance_demo');

  useEffect(() => {
    if (!id) return;
    fetchStrategy();
  }, [id]);

  async function fetchStrategy() {
    setLoading(true);
    try {
      const result = await strategiesApi.get(id!);
      const s: StrategyDetail = result.data;
      // Load latest version config
      if (s.versions.length > 0) {
        const latestVersion = s.versions[s.versions.length - 1]!;
        const versionRes = await strategiesApi.getVersion(id!, latestVersion.id);
        setConfig(versionRes.data.config);
      } else {
        setConfig((prev) => ({ ...prev, symbols: s.symbols }));
      }
    } catch {
      // Use defaults if strategy fetch fails
    } finally {
      setLoading(false);
    }
  }

  function updateConfig<K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) {
    setConfig((prev) => ({ ...prev, [section]: value }));
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

  function toggleSymbol(symbol: string) {
    setConfig((prev) => ({
      ...prev,
      symbols: prev.symbols.includes(symbol)
        ? prev.symbols.filter((s) => s !== symbol)
        : [...prev.symbols, symbol],
    }));
  }

  function toggleTimeframe(tf: string) {
    setConfig((prev) => ({
      ...prev,
      timeframes: prev.timeframes.includes(tf)
        ? prev.timeframes.filter((t) => t !== tf)
        : [...prev.timeframes, tf],
    }));
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

      <h1 className="mb-6 text-xl font-bold text-text-primary">Editor de Estrategia</h1>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Step indicator */}
      <div className="mb-6 flex gap-1">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`flex-1 rounded-t-md px-2 py-2 text-xs font-medium transition-colors ${
              i === step
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-muted hover:bg-bg-hover'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-lg border border-border bg-bg-secondary p-6">
        {step === 0 && <StepGeneral config={config} setConfig={setConfig} mode={mode} setMode={setMode} />}
        {step === 1 && (
          <StepSymbolsTimeframes
            config={config}
            toggleSymbol={toggleSymbol}
            toggleTimeframe={toggleTimeframe}
          />
        )}
        {step === 2 && <StepEntry config={config} updateConfig={updateConfig} />}
        {step === 3 && <StepExit config={config} updateConfig={updateConfig} />}
        {step === 4 && <StepRisk config={config} updateConfig={updateConfig} />}
        {step === 5 && <StepExecution config={config} updateConfig={updateConfig} />}
        {step === 6 && <StepSummary config={config} />}
      </div>

      {/* Navigation buttons */}
      <div className="mt-4 flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-md bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Anterior
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Siguiente
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-success px-4 py-2 text-sm font-medium text-white hover:bg-success/80 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---- Shared input styling ---- */
const inputClass =
  'w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';
const labelClass = 'mb-1 block text-sm font-medium text-text-secondary';

/* ---- Step components ---- */

function StepGeneral({
  config,
  setConfig,
  mode,
  setMode,
}: {
  config: StrategyConfig;
  setConfig: React.Dispatch<React.SetStateAction<StrategyConfig>>;
  mode: string;
  setMode: React.Dispatch<React.SetStateAction<string>>;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">General</h2>
      <div>
        <label className={labelClass}>Modo de ejecucion</label>
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
        <label className={labelClass}>Periodo SMA (filtro)</label>
        <input
          type="number"
          className={inputClass}
          value={config.entry.smaPeriod}
          onChange={(e) =>
            setConfig((prev) => ({
              ...prev,
              entry: { ...prev.entry, smaPeriod: Number(e.target.value) },
            }))
          }
        />
      </div>
      <div>
        <label className={labelClass}>Cooldown entre operaciones (minutos)</label>
        <input
          type="number"
          className={inputClass}
          value={config.entry.cooldownMinutes}
          onChange={(e) =>
            setConfig((prev) => ({
              ...prev,
              entry: { ...prev.entry, cooldownMinutes: Number(e.target.value) },
            }))
          }
        />
      </div>
    </div>
  );
}

function StepSymbolsTimeframes({
  config,
  toggleSymbol,
  toggleTimeframe,
}: {
  config: StrategyConfig;
  toggleSymbol: (s: string) => void;
  toggleTimeframe: (tf: string) => void;
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text-primary">Simbolos y Timeframes</h2>
      <div>
        <label className={labelClass}>Simbolos</label>
        <div className="flex flex-wrap gap-2">
          {COMMON_SYMBOLS.map((symbol) => (
            <button
              key={symbol}
              type="button"
              onClick={() => toggleSymbol(symbol)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                config.symbols.includes(symbol)
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
              }`}
            >
              {symbol}
            </button>
          ))}
        </div>
        {config.symbols.length === 0 && (
          <p className="mt-1 text-xs text-danger">Selecciona al menos un simbolo</p>
        )}
      </div>
      <div>
        <label className={labelClass}>Timeframes</label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => toggleTimeframe(tf)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                config.timeframes.includes(tf)
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
        {config.timeframes.length === 0 && (
          <p className="mt-1 text-xs text-danger">Selecciona al menos un timeframe</p>
        )}
      </div>
    </div>
  );
}

function StepEntry({
  config,
  updateConfig,
}: {
  config: StrategyConfig;
  updateConfig: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Reglas de Entrada</h2>
      <div>
        <label className={labelClass}>RSI por debajo de</label>
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
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="multiTf"
          checked={config.entry.requireMultiTimeframeConfirmation}
          onChange={(e) =>
            updateConfig('entry', {
              ...config.entry,
              requireMultiTimeframeConfirmation: e.target.checked,
            })
          }
          className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
        />
        <label htmlFor="multiTf" className="text-sm text-text-primary">
          Confirmacion multi-Timeframe
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="smaFilter"
          checked={config.entry.useSmaFilter}
          onChange={(e) =>
            updateConfig('entry', { ...config.entry, useSmaFilter: e.target.checked })
          }
          className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
        />
        <label htmlFor="smaFilter" className="text-sm text-text-primary">
          Filtro SMA
        </label>
      </div>
      {config.entry.useSmaFilter && (
        <div>
          <label className={labelClass}>Periodo SMA</label>
          <input
            type="number"
            className={inputClass}
            value={config.entry.smaPeriod}
            onChange={(e) =>
              updateConfig('entry', { ...config.entry, smaPeriod: Number(e.target.value) })
            }
          />
        </div>
      )}
      <div>
        <label className={labelClass}>Cooldown (minutos)</label>
        <input
          type="number"
          className={inputClass}
          value={config.entry.cooldownMinutes}
          onChange={(e) =>
            updateConfig('entry', { ...config.entry, cooldownMinutes: Number(e.target.value) })
          }
        />
      </div>
    </div>
  );
}

function StepExit({
  config,
  updateConfig,
}: {
  config: StrategyConfig;
  updateConfig: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Reglas de Salida</h2>
      <div>
        <label className={labelClass}>RSI por encima de</label>
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
      <div>
        <label className={labelClass}>Trailing Stop (%) - opcional</label>
        <input
          type="number"
          step={0.1}
          className={inputClass}
          value={config.exit.trailingStopPct ?? ''}
          placeholder="Desactivado"
          onChange={(e) =>
            updateConfig('exit', {
              ...config.exit,
              trailingStopPct: e.target.value ? Number(e.target.value) : null,
            })
          }
        />
      </div>
    </div>
  );
}

function StepRisk({
  config,
  updateConfig,
}: {
  config: StrategyConfig;
  updateConfig: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Riesgo y Capital</h2>
      <div>
        <label className={labelClass}>Importe por operacion (USDT)</label>
        <input
          type="number"
          step={1}
          className={inputClass}
          value={config.risk.quoteAmountPerTrade}
          onChange={(e) =>
            updateConfig('risk', { ...config.risk, quoteAmountPerTrade: Number(e.target.value) })
          }
        />
      </div>
      <div>
        <label className={labelClass}>Max posiciones abiertas</label>
        <input
          type="number"
          className={inputClass}
          value={config.risk.maxOpenPositions}
          onChange={(e) =>
            updateConfig('risk', { ...config.risk, maxOpenPositions: Number(e.target.value) })
          }
        />
      </div>
      <div>
        <label className={labelClass}>Max posiciones por simbolo</label>
        <input
          type="number"
          className={inputClass}
          value={config.risk.maxPositionsPerSymbol}
          onChange={(e) =>
            updateConfig('risk', { ...config.risk, maxPositionsPerSymbol: Number(e.target.value) })
          }
        />
      </div>
      <div>
        <label className={labelClass}>Exposicion maxima total (USDT)</label>
        <input
          type="number"
          step={10}
          className={inputClass}
          value={config.risk.maxTotalExposureQuote}
          onChange={(e) =>
            updateConfig('risk', { ...config.risk, maxTotalExposureQuote: Number(e.target.value) })
          }
        />
      </div>
      <div>
        <label className={labelClass}>Perdida diaria maxima (%)</label>
        <input
          type="number"
          step={0.5}
          className={inputClass}
          value={config.risk.maxDailyLossPct}
          onChange={(e) =>
            updateConfig('risk', { ...config.risk, maxDailyLossPct: Number(e.target.value) })
          }
        />
      </div>
      <div>
        <label className={labelClass}>Cooldown riesgo (minutos)</label>
        <input
          type="number"
          className={inputClass}
          value={config.risk.cooldownMinutes}
          onChange={(e) =>
            updateConfig('risk', { ...config.risk, cooldownMinutes: Number(e.target.value) })
          }
        />
      </div>
    </div>
  );
}

function StepExecution({
  config,
  updateConfig,
}: {
  config: StrategyConfig;
  updateConfig: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Ejecucion</h2>
      {!config.execution.dryRun && (
        <div className="rounded-lg border border-warning bg-warning/10 px-4 py-3 text-sm font-medium text-warning">
          ATENCION: Las ordenes se ejecutaran con dinero real en Binance Demo
        </div>
      )}
      <div>
        <label className={labelClass}>Tipo de orden</label>
        <select
          className={inputClass}
          value={config.execution.orderType}
          onChange={(e) =>
            updateConfig('execution', {
              ...config.execution,
              orderType: e.target.value as 'MARKET',
            })
          }
        >
          <option value="MARKET">MARKET</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="orderTest"
          checked={config.execution.useOrderTestBeforeRealOrder}
          onChange={(e) =>
            updateConfig('execution', {
              ...config.execution,
              useOrderTestBeforeRealOrder: e.target.checked,
            })
          }
          className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
        />
        <label htmlFor="orderTest" className="text-sm text-text-primary">
          Order test antes de orden real
        </label>
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
          Dry Run (simulacion sin ordenes reales)
        </label>
      </div>
    </div>
  );
}

function StepSummary({ config }: { config: StrategyConfig }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Resumen de Configuracion</h2>
      <pre className="overflow-auto rounded-lg bg-bg-primary p-4 text-xs text-text-muted">
        {JSON.stringify(config, null, 2)}
      </pre>
    </div>
  );
}
