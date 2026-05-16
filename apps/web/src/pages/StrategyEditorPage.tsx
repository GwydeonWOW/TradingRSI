import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { StrategyConfig } from '@cryptorsi/shared';
import { strategiesApi } from '../api/strategies.ts';
import type { StrategyDetail } from '../api/strategies.ts';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';

const TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;

const STEPS = [
  { key: 'general', label: 'General' },
  { key: 'symbols', label: 'Simbolos y Timeframes' },
  { key: 'entry', label: 'Reglas de Entrada' },
  { key: 'exit', label: 'Reglas de Salida' },
  { key: 'risk', label: 'Riesgo y Capital' },
  { key: 'execution', label: 'Ejecucion' },
  { key: 'summary', label: 'Resumen' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

const defaultConfig: StrategyConfig = {
  symbols: [],
  timeframes: ['15m', '1h', '4h'],
  entry: {
    entryMode: 'rsi_threshold' as const,
    rsiBelow: 30,
    rsiAbove: undefined,
    rsiPeriod: 14,
    requireMultiTimeframeConfirmation: true,
    useSmaFilter: true,
    smaPeriod: 200,
    useVolumeConfirmation: false,
    volumeMultiplier: 1.5,
    cooldownMinutes: 360,
  },
  exit: {
    rsiAbove: 70,
    takeProfitPct: 8,
    stopLossPct: 3,
    trailingStopPct: null,
    exitOnBearishDivergence: false,
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

export function StrategyEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<StrategyConfig>(defaultConfig);
  const [strategyName, setStrategyName] = useState('');
  const [strategyDescription, setStrategyDescription] = useState('');
  const [currentStep, setCurrentStep] = useState<StepKey>('general');

  useEffect(() => {
    if (!id) return;
    fetchStrategy();
  }, [id]);

  async function fetchStrategy() {
    setLoading(true);
    try {
      const result = await strategiesApi.get(id!);
      const s: StrategyDetail = result.data;
      setStrategyName(s.name);
      setStrategyDescription(s.description ?? '');
      if (s.versions.length > 0) {
        const latestVersion = s.versions[0]!;
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
      await strategiesApi.update(id!, { name: strategyName, description: strategyDescription, config });
      navigate(`/strategies/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  function goNext() {
    if (!isLast) setCurrentStep(STEPS[stepIndex + 1]!.key);
  }
  function goPrev() {
    if (!isFirst) setCurrentStep(STEPS[stepIndex - 1]!.key);
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

      <h1 className="mb-6 text-xl font-bold text-text-primary">Editar Estrategia: {strategyName}</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Step tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border pb-px">
        {STEPS.map((step, i) => (
          <button
            key={step.key}
            type="button"
            onClick={() => setCurrentStep(step.key)}
            className={`shrink-0 rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
              currentStep === step.key
                ? 'border border-b-0 border-border bg-bg-secondary text-accent'
                : i < stepIndex
                  ? 'text-success hover:text-text-primary'
                  : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
              currentStep === step.key ? 'bg-accent text-white' : i < stepIndex ? 'bg-success/20 text-success' : 'bg-bg-tertiary text-text-muted'
            }">
              {i + 1}
            </span>
            {step.label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-lg border border-border bg-bg-secondary p-6">
        {currentStep === 'general' && (
          <StepGeneral
            name={strategyName}
            description={strategyDescription}
            onNameChange={setStrategyName}
            onDescriptionChange={setStrategyDescription}
          />
        )}
        {currentStep === 'symbols' && (
          <StepSymbols config={config} onUpdate={updateConfig} onToggleTimeframe={toggleTimeframe} />
        )}
        {currentStep === 'entry' && (
          <StepEntry config={config} onUpdate={updateConfig} />
        )}
        {currentStep === 'exit' && (
          <StepExit config={config} onUpdate={updateConfig} />
        )}
        {currentStep === 'risk' && (
          <StepRisk config={config} onUpdate={updateConfig} />
        )}
        {currentStep === 'execution' && (
          <StepExecution config={config} onUpdate={updateConfig} />
        )}
        {currentStep === 'summary' && (
          <StepSummary config={config} name={strategyName} description={strategyDescription} />
        )}
      </div>

      {/* Navigation */}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={isFirst}
          className="rounded-md bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover disabled:opacity-40"
        >
          &larr; Anterior
        </button>
        <div className="flex gap-3">
          <span className="self-center text-xs text-text-muted">
            Paso {stepIndex + 1} de {STEPS.length}
          </span>
        </div>
        {isLast ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Siguiente &rarr;
          </button>
        )}
      </div>
    </div>
  );
}

/* ---- Step Components ---- */

function StepGeneral({
  name,
  description,
  onNameChange,
  onDescriptionChange,
}: {
  name: string;
  description: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Datos Generales</h2>
      <div>
        <label className={labelClass}>Nombre</label>
        <input
          type="text"
          className={inputClass}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Mi estrategia RSI"
        />
      </div>
      <div>
        <label className={labelClass}>Descripcion</label>
        <textarea
          className={`${inputClass} min-h-[80px] resize-y`}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Descripcion opcional..."
        />
      </div>
    </div>
  );
}

function StepSymbols({
  config,
  onUpdate,
  onToggleTimeframe,
}: {
  config: StrategyConfig;
  onUpdate: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void;
  onToggleTimeframe: (tf: string) => void;
}) {
  const [newSymbol, setNewSymbol] = useState('');

  function addSymbol() {
    const sym = newSymbol.trim().toUpperCase();
    if (sym && !config.symbols.includes(sym)) {
      onUpdate('symbols', [...config.symbols, sym]);
    }
    setNewSymbol('');
  }

  function removeSymbol(sym: string) {
    onUpdate('symbols', config.symbols.filter((s) => s !== sym));
  }

  return (
    <div className="space-y-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Simbolos y Timeframes</h2>
      <div>
        <label className={labelClass}>Anadir simbolo</label>
        <div className="flex gap-2">
          <input
            type="text"
            className={inputClass}
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSymbol(); } }}
            placeholder="BTCUSDC"
          />
          <button
            type="button"
            onClick={addSymbol}
            disabled={!newSymbol.trim()}
            className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Anadir
          </button>
        </div>
      </div>
      {config.symbols.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {config.symbols.map((sym) => (
            <span key={sym} className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-1 text-sm font-medium text-accent">
              {sym}
              <button type="button" onClick={() => removeSymbol(sym)} className="ml-0.5 text-accent/60 hover:text-accent">&times;</button>
            </span>
          ))}
        </div>
      )}
      <div>
        <label className={labelClass}>Timeframes</label>
        <div className="flex flex-wrap gap-2">
          {TIMEFRAME_OPTIONS.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => onToggleTimeframe(tf)}
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
  );
}

function StepEntry({
  config,
  onUpdate,
}: {
  config: StrategyConfig;
  onUpdate: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void;
}) {
  const entry = config.entry as unknown as Record<string, unknown>;
  const entryMode = (config.entry.entryMode ?? (config.entry.useRsiDivergence ? 'divergence' : 'rsi_threshold')) as 'rsi_threshold' | 'divergence';

  return (
    <div className="space-y-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Reglas de Entrada</h2>

      {/* Entry Mode */}
      <div className="rounded-md border border-border bg-bg-primary p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">Modo de Entrada</h3>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
            <input type="radio" name="entryMode" value="rsi_threshold"
              checked={entryMode === 'rsi_threshold'}
              onChange={() => onUpdate('entry', { ...config.entry, entryMode: 'rsi_threshold' } as any)}
              className="h-4 w-4 accent-accent" />
            Umbral RSI
          </label>
          <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
            <input type="radio" name="entryMode" value="divergence"
              checked={entryMode === 'divergence'}
              onChange={() => onUpdate('entry', { ...config.entry, entryMode: 'divergence' } as any)}
              className="h-4 w-4 accent-accent" />
            Divergencia RSI
          </label>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          {entryMode === 'rsi_threshold'
            ? 'Compra cuando RSI cae por debajo del umbral configurado.'
            : 'Compra al detectar divergencia alcista (precio hace minimo menor pero RSI hace minimo mayor).'}
        </p>
      </div>

      {/* RSI Configuration */}
      <div className="rounded-md border border-border bg-bg-primary p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">RSI</h3>
        <div className={`grid gap-4 ${entryMode === 'rsi_threshold' ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <div>
            <label className={labelClass}>Periodo RSI</label>
            <input
              type="number" min={2} max={100} className={inputClass}
              value={(entry.rsiPeriod as number) ?? 14}
              onChange={(e) => onUpdate('entry', { ...config.entry, rsiPeriod: Number(e.target.value) } as any)}
            />
          </div>
          {entryMode === 'rsi_threshold' && (
            <div>
              <label className={labelClass}>RSI Below (sobreventa)</label>
              <input
                type="number" min={0} max={100} className={inputClass}
                value={config.entry.rsiBelow}
                onChange={(e) => onUpdate('entry', { ...config.entry, rsiBelow: Number(e.target.value) })}
              />
            </div>
          )}
          <div>
            <label className={labelClass}>RSI Above (sobrecompra) — opcional</label>
            <input
              type="number" min={0} max={100} className={inputClass}
              value={(entry.rsiAbove as number) ?? ''}
              onChange={(e) => onUpdate('entry', { ...config.entry, rsiAbove: e.target.value ? Number(e.target.value) : undefined } as any)}
              placeholder="No usar"
            />
          </div>
        </div>
      </div>

      {/* Condiciones Combinatorias */}
      <div className="rounded-md border border-border bg-bg-primary p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">Condiciones Combinatorias</h3>
        <p className="mb-3 text-xs text-text-muted">
          Activa las condiciones adicionales que deben cumplirse junto con la señal de entrada.
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={config.entry.requireMultiTimeframeConfirmation}
              onChange={(e) => onUpdate('entry', { ...config.entry, requireMultiTimeframeConfirmation: e.target.checked })}
              className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
            />
            Confirmacion multi-timeframe
          </label>

          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={config.entry.useSmaFilter}
              onChange={(e) => onUpdate('entry', { ...config.entry, useSmaFilter: e.target.checked })}
              className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
            />
            Filtro SMA (precio por encima de SMA)
          </label>
          {config.entry.useSmaFilter && (
            <div className="pl-6">
              <label className={labelClass}>Periodo SMA</label>
              <input
                type="number" min={1} className={inputClass}
                value={config.entry.smaPeriod}
                onChange={(e) => onUpdate('entry', { ...config.entry, smaPeriod: Number(e.target.value) })}
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={(entry.useVolumeConfirmation as boolean) ?? false}
              onChange={(e) => onUpdate('entry', { ...config.entry, useVolumeConfirmation: e.target.checked } as any)}
              className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
            />
            Confirmacion por volumen (multiplicador vs media)
          </label>
          {(entry.useVolumeConfirmation as boolean) && (
            <div className="pl-6">
              <label className={labelClass}>Multiplicador de volumen</label>
              <input
                type="number" min={1} step={0.1} className={inputClass}
                value={(entry.volumeMultiplier as number) ?? 1.5}
                onChange={(e) => onUpdate('entry', { ...config.entry, volumeMultiplier: Number(e.target.value) } as any)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Cooldown */}
      <div>
        <label className={labelClass}>Cooldown entrada (min)</label>
        <input
          type="number" min={0} className={inputClass}
          value={config.entry.cooldownMinutes}
          onChange={(e) => onUpdate('entry', { ...config.entry, cooldownMinutes: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

function StepExit({
  config,
  onUpdate,
}: {
  config: StrategyConfig;
  onUpdate: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void;
}) {
  const entryMode = (config.entry.entryMode ?? (config.entry.useRsiDivergence ? 'divergence' : 'rsi_threshold')) as 'rsi_threshold' | 'divergence';
  const exit = config.exit as unknown as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Reglas de Salida</h2>
      <div>
        <label className={labelClass}>RSI salida (above)</label>
        <input
          type="number" min={0} max={100} className={inputClass}
          value={config.exit.rsiAbove}
          onChange={(e) => onUpdate('exit', { ...config.exit, rsiAbove: Number(e.target.value) })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Take Profit (%) — dejar vacio para desactivar</label>
          <input
            type="number" step={0.1} min={0} className={inputClass}
            value={config.exit.takeProfitPct ?? ''}
            onChange={(e) => onUpdate('exit', { ...config.exit, takeProfitPct: e.target.value ? Number(e.target.value) : null })}
            placeholder="Desactivado"
          />
        </div>
        <div>
          <label className={labelClass}>Stop Loss (%) — dejar vacio para desactivar</label>
          <input
            type="number" step={0.1} min={0} className={inputClass}
            value={config.exit.stopLossPct ?? ''}
            onChange={(e) => onUpdate('exit', { ...config.exit, stopLossPct: e.target.value ? Number(e.target.value) : null })}
            placeholder="Desactivado"
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Trailing Stop (%) — dejar vacio para desactivar</label>
        <input
          type="number" step={0.1} min={0} className={inputClass}
          value={config.exit.trailingStopPct ?? ''}
          onChange={(e) =>
            onUpdate('exit', {
              ...config.exit,
              trailingStopPct: e.target.value ? Number(e.target.value) : null,
            })
          }
          placeholder="Desactivado"
        />
      </div>
      {entryMode === 'divergence' && (
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={(exit.exitOnBearishDivergence as boolean) ?? false}
            onChange={(e) => onUpdate('exit', { ...config.exit, exitOnBearishDivergence: e.target.checked })}
            className="h-4 w-4 rounded border-border bg-bg-primary accent-accent"
          />
          Salir en divergencia bajista
        </label>
      )}
    </div>
  );
}

function StepRisk({
  config,
  onUpdate,
}: {
  config: StrategyConfig;
  onUpdate: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Riesgo y Capital</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Cantidad por trade (USDT)</label>
          <input
            type="number" min={1} step={1} className={inputClass}
            value={config.risk.quoteAmountPerTrade}
            onChange={(e) => onUpdate('risk', { ...config.risk, quoteAmountPerTrade: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Max posiciones abiertas</label>
          <input
            type="number" min={1} className={inputClass}
            value={config.risk.maxOpenPositions}
            onChange={(e) => onUpdate('risk', { ...config.risk, maxOpenPositions: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Max por simbolo</label>
          <input
            type="number" min={1} className={inputClass}
            value={config.risk.maxPositionsPerSymbol}
            onChange={(e) => onUpdate('risk', { ...config.risk, maxPositionsPerSymbol: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Exposicion max (USDT)</label>
          <input
            type="number" min={1} className={inputClass}
            value={config.risk.maxTotalExposureQuote}
            onChange={(e) => onUpdate('risk', { ...config.risk, maxTotalExposureQuote: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Perdida diaria max (%)</label>
          <input
            type="number" min={0} max={100} step={0.5} className={inputClass}
            value={config.risk.maxDailyLossPct}
            onChange={(e) => onUpdate('risk', { ...config.risk, maxDailyLossPct: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={labelClass}>Cooldown (min)</label>
          <input
            type="number" min={0} className={inputClass}
            value={config.risk.cooldownMinutes}
            onChange={(e) => onUpdate('risk', { ...config.risk, cooldownMinutes: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-bg-primary p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-text-primary">Filtro BTC Stability</h3>
            <p className="mt-0.5 text-xs text-text-muted">Bloquear entradas cuando BTC no es estable (ATR%, ADX, SMA20, estructura de precio).</p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input type="checkbox" className="peer sr-only"
              checked={config.btcStability?.enabled ?? false}
              onChange={(e) => onUpdate('btcStability', {
                enabled: e.target.checked,
                minScore: config.btcStability?.minScore ?? 4,
              } as any)} />
            <div className="peer h-5 w-9 rounded-full bg-bg-tertiary after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-text-muted after:transition-all peer-checked:bg-accent peer-checked:after:translate-x-full peer-checked:after:bg-white" />
          </label>
        </div>
        {config.btcStability?.enabled && (
          <div className="mt-3">
            <label className={labelClass}>Score minimo (0-5)</label>
            <input type="number" min={0} max={5} step={1} className={inputClass} value={config.btcStability.minScore}
              onChange={(e) => onUpdate('btcStability', { enabled: true, minScore: Number(e.target.value) } as any)} />
          </div>
        )}
      </div>
    </div>
  );
}

function StepExecution({
  config,
  onUpdate,
}: {
  config: StrategyConfig;
  onUpdate: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Ejecucion</h2>
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
              onChange={(e) => onUpdate('execution', { ...config.execution, useOrderTestBeforeRealOrder: e.target.checked })}
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
          onChange={(e) => onUpdate('execution', { ...config.execution, dryRun: e.target.checked })}
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
  );
}

function StepSummary({
  config,
  name,
  description,
}: {
  config: StrategyConfig;
  name: string;
  description: string;
}) {
  return (
    <div className="space-y-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Resumen de Configuracion</h2>

      <div className="space-y-3">
        <SummarySection title="General">
          <SummaryRow label="Nombre" value={name} />
          {description && <SummaryRow label="Descripcion" value={description} />}
        </SummarySection>

        <SummarySection title="Simbolos y Timeframes">
          <SummaryRow label="Simbolos" value={config.symbols.join(', ')} />
          <SummaryRow label="Timeframes" value={config.timeframes.join(', ')} />
        </SummarySection>

        <SummarySection title="Reglas de Entrada">
          <SummaryRow label="Modo" value={config.entry.entryMode === 'divergence' ? 'Divergencia RSI' : 'Umbral RSI'} />
          <SummaryRow label="RSI Periodo" value={String((config.entry as unknown as Record<string, unknown>).rsiPeriod ?? 14)} />
          {(config.entry.entryMode ?? 'rsi_threshold') === 'rsi_threshold' && (
            <SummaryRow label="RSI Below" value={String(config.entry.rsiBelow)} />
          )}
          <SummaryRow label="RSI Above" value={String((config.entry as unknown as Record<string, unknown>).rsiAbove ?? 'No')} />
          <SummaryRow label="SMA Filter" value={config.entry.useSmaFilter ? `Si (${config.entry.smaPeriod})` : 'No'} />
          <SummaryRow label="Multi-TF Confirm" value={config.entry.requireMultiTimeframeConfirmation ? 'Si' : 'No'} />
          <SummaryRow label="Vol. Confirmacion" value={((config.entry as unknown as Record<string, unknown>).useVolumeConfirmation as boolean) ? `Si (${(config.entry as unknown as Record<string, unknown>).volumeMultiplier ?? 1.5}x)` : 'No'} />
          <SummaryRow label="Cooldown" value={`${config.entry.cooldownMinutes} min`} />
        </SummarySection>

        <SummarySection title="Reglas de Salida">
          <SummaryRow label="RSI Above" value={String(config.exit.rsiAbove)} />
          <SummaryRow label="Take Profit" value={config.exit.takeProfitPct != null ? `${config.exit.takeProfitPct}%` : 'Desactivado'} />
          <SummaryRow label="Stop Loss" value={config.exit.stopLossPct != null ? `${config.exit.stopLossPct}%` : 'Desactivado'} />
          <SummaryRow label="Trailing Stop" value={config.exit.trailingStopPct != null ? `${config.exit.trailingStopPct}%` : 'Desactivado'} />
          {(config.entry.entryMode ?? 'rsi_threshold') === 'divergence' && (
            <SummaryRow label="Salida divergencia bajista" value={((config.exit as unknown as Record<string, unknown>).exitOnBearishDivergence as boolean) ? 'Si' : 'No'} />
          )}
        </SummarySection>

        <SummarySection title="Riesgo y Capital">
          <SummaryRow label="Cantidad por trade" value={`${config.risk.quoteAmountPerTrade} USDT`} />
          <SummaryRow label="Max posiciones" value={String(config.risk.maxOpenPositions)} />
          <SummaryRow label="Max por simbolo" value={String(config.risk.maxPositionsPerSymbol)} />
          <SummaryRow label="Exposicion max" value={`${config.risk.maxTotalExposureQuote} USDT`} />
          <SummaryRow label="Perdida diaria max" value={`${config.risk.maxDailyLossPct}%`} />
        </SummarySection>

        <SummarySection title="Ejecucion">
          <SummaryRow label="Tipo de orden" value={config.execution.orderType} />
          <SummaryRow label="Test antes de real" value={config.execution.useOrderTestBeforeRealOrder ? 'Si' : 'No'} />
          <SummaryRow label="Dry Run" value={config.execution.dryRun ? 'Si (simulacion)' : 'No (real)'} />
        </SummarySection>
      </div>
    </div>
  );
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-bg-primary p-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text-primary">{value}</span>
    </div>
  );
}
