import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StrategyConfig } from '@cryptorsi/shared';
import { strategiesApi } from '../api/strategies.ts';

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

export function NewStrategyPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState('binance_demo');
  const [environment, setEnvironment] = useState('demo');
  const [config, setConfig] = useState<StrategyConfig>(defaultConfig);
  const [currentStep, setCurrentStep] = useState<StepKey>('general');

  function updateConfig<K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) {
    setConfig((prev) => ({ ...prev, [section]: value }));
  }

  function toggleTimeframe(tf: string) {
    const current = config.timeframes;
    const next = current.includes(tf) ? current.filter((t) => t !== tf) : [...current, tf];
    if (next.length > 0) updateConfig('timeframes', next);
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (config.symbols.length === 0) {
      setError('Debes anadir al menos un simbolo');
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

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  function goNext() { if (!isLast) setCurrentStep(STEPS[stepIndex + 1]!.key); }
  function goPrev() { if (!isFirst) setCurrentStep(STEPS[stepIndex - 1]!.key); }

  return (
    <div>
      <button type="button" onClick={() => navigate('/strategies')} className="mb-4 text-sm text-accent hover:text-accent-hover">
        &larr; Volver a estrategias
      </button>

      <h1 className="mb-6 text-xl font-bold text-text-primary">Nueva Estrategia</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {/* Step tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border pb-px">
        {STEPS.map((step, i) => (
          <button
            key={step.key} type="button" onClick={() => setCurrentStep(step.key)}
            className={`shrink-0 rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
              currentStep === step.key ? 'border border-b-0 border-border bg-bg-secondary text-accent'
                : i < stepIndex ? 'text-success hover:text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <span className={`mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
              currentStep === step.key ? 'bg-accent text-white' : i < stepIndex ? 'bg-success/20 text-success' : 'bg-bg-tertiary text-text-muted'
            }`}>
              {i + 1}
            </span>
            {step.label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-lg border border-border bg-bg-secondary p-6">
        {currentStep === 'general' && (
          <div className="space-y-4">
            <h2 className="mb-3 text-sm font-medium text-text-secondary">Datos Generales</h2>
            <div>
              <label className={labelClass}>Nombre *</label>
              <input type="text" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi estrategia RSI" />
            </div>
            <div>
              <label className={labelClass}>Descripcion</label>
              <textarea className={`${inputClass} min-h-[80px] resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripcion opcional..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Modo</label>
                <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="simulation">Simulation</option>
                  <option value="signal_only">Signal Only (Paper Trading)</option>
                  <option value="binance_demo">Binance Demo</option>
                  <option value="binance_live">Binance Live</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Entorno</label>
                <select className={inputClass} value={environment} onChange={(e) => setEnvironment(e.target.value)}>
                  <option value="demo">Demo</option>
                  <option value="testnet">Testnet</option>
                  <option value="production">Production</option>
                </select>
              </div>
            </div>
          </div>
        )}
        {currentStep === 'symbols' && <StepSymbols config={config} onUpdate={updateConfig} onToggleTimeframe={toggleTimeframe} />}
        {currentStep === 'entry' && <StepEntry config={config} onUpdate={updateConfig} />}
        {currentStep === 'exit' && <StepExit config={config} onUpdate={updateConfig} />}
        {currentStep === 'risk' && <StepRisk config={config} onUpdate={updateConfig} />}
        {currentStep === 'execution' && <StepExecution config={config} onUpdate={updateConfig} />}
        {currentStep === 'summary' && <StepSummary config={config} name={name} description={description} />}
      </div>

      {/* Navigation */}
      <div className="mt-4 flex items-center justify-between">
        <button type="button" onClick={goPrev} disabled={isFirst}
          className="rounded-md bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg-hover disabled:opacity-40">
          &larr; Anterior
        </button>
        <span className="text-xs text-text-muted">Paso {stepIndex + 1} de {STEPS.length}</span>
        {isLast ? (
          <button type="button" onClick={handleCreate} disabled={saving || !name.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
            {saving ? 'Creando...' : 'Crear Estrategia'}
          </button>
        ) : (
          <button type="button" onClick={goNext}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
            Siguiente &rarr;
          </button>
        )}
      </div>
    </div>
  );
}

function StepSymbols({ config, onUpdate, onToggleTimeframe }: {
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
          <input type="text" className={inputClass} value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSymbol(); } }}
            placeholder="BTCUSDC" />
          <button type="button" onClick={addSymbol} disabled={!newSymbol.trim()}
            className="shrink-0 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
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
            <button key={tf} type="button" onClick={() => onToggleTimeframe(tf)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                config.timeframes.includes(tf) ? 'bg-accent text-white' : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
              }`}>{tf}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepEntry({ config, onUpdate }: { config: StrategyConfig; onUpdate: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void }) {
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

      <div className="rounded-md border border-border bg-bg-primary p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">RSI</h3>
        <div className={`grid gap-4 ${entryMode === 'rsi_threshold' ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <div>
            <label className={labelClass}>Periodo RSI</label>
            <input type="number" min={2} max={100} className={inputClass} value={(entry.rsiPeriod as number) ?? 14}
              onChange={(e) => onUpdate('entry', { ...config.entry, rsiPeriod: Number(e.target.value) } as any)} />
          </div>
          {entryMode === 'rsi_threshold' && (
            <div>
              <label className={labelClass}>RSI Below (sobreventa)</label>
              <input type="number" min={0} max={100} className={inputClass} value={config.entry.rsiBelow}
                onChange={(e) => onUpdate('entry', { ...config.entry, rsiBelow: Number(e.target.value) })} />
            </div>
          )}
          <div>
            <label className={labelClass}>RSI Above — opcional</label>
            <input type="number" min={0} max={100} className={inputClass} value={(entry.rsiAbove as number) ?? ''}
              onChange={(e) => onUpdate('entry', { ...config.entry, rsiAbove: e.target.value ? Number(e.target.value) : undefined } as any)} placeholder="No usar" />
          </div>
        </div>
      </div>
      <div className="rounded-md border border-border bg-bg-primary p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">Condiciones Combinatorias</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={config.entry.requireMultiTimeframeConfirmation}
              onChange={(e) => onUpdate('entry', { ...config.entry, requireMultiTimeframeConfirmation: e.target.checked })} className="h-4 w-4 rounded border-border bg-bg-primary accent-accent" />
            Confirmacion multi-timeframe
          </label>
          {config.entry.requireMultiTimeframeConfirmation && (
            <div className="space-y-2 pl-6">
              <p className="text-xs text-text-muted">Condiciones por timeframe (RSI debe cumplir TODAS para señal de compra)</p>
              {(config.entry.multiTimeframeConditions ?? []).map((cond, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="w-20">
                    <label className={labelClass}>Timeframe</label>
                    <select className={inputClass} value={cond.timeframe}
                      onChange={(e) => {
                        const conditions = [...(config.entry.multiTimeframeConditions ?? [])];
                        conditions[idx] = { ...conditions[idx]!, timeframe: e.target.value };
                        onUpdate('entry', { ...config.entry, multiTimeframeConditions: conditions });
                      }}>
                      {['1m','5m','15m','30m','1h','4h','1d'].map((tf) => (
                        <option key={tf} value={tf}>{tf}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-20">
                    <label className={labelClass}>RSI &gt;=</label>
                    <input type="number" min={0} max={100} className={inputClass} value={cond.rsiAbove ?? ''}
                      placeholder="—"
                      onChange={(e) => {
                        const conditions = [...(config.entry.multiTimeframeConditions ?? [])];
                        conditions[idx] = { ...conditions[idx]!, rsiAbove: e.target.value ? Number(e.target.value) : undefined };
                        onUpdate('entry', { ...config.entry, multiTimeframeConditions: conditions });
                      }} />
                  </div>
                  <div className="w-20">
                    <label className={labelClass}>RSI &lt;=</label>
                    <input type="number" min={0} max={100} className={inputClass} value={cond.rsiBelow ?? ''}
                      placeholder="—"
                      onChange={(e) => {
                        const conditions = [...(config.entry.multiTimeframeConditions ?? [])];
                        conditions[idx] = { ...conditions[idx]!, rsiBelow: e.target.value ? Number(e.target.value) : undefined };
                        onUpdate('entry', { ...config.entry, multiTimeframeConditions: conditions });
                      }} />
                  </div>
                  <button type="button" onClick={() => {
                    const conditions = (config.entry.multiTimeframeConditions ?? []).filter((_, i) => i !== idx);
                    onUpdate('entry', { ...config.entry, multiTimeframeConditions: conditions });
                  }} className="text-xs text-danger hover:text-danger/80 pb-1">✕</button>
                </div>
              ))}
              <button type="button" onClick={() => {
                const conditions = [...(config.entry.multiTimeframeConditions ?? []), { timeframe: '15m' }];
                onUpdate('entry', { ...config.entry, multiTimeframeConditions: conditions });
              }} className="text-xs text-accent hover:text-accent-hover">+ Añadir timeframe</button>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={config.entry.useSmaFilter}
              onChange={(e) => onUpdate('entry', { ...config.entry, useSmaFilter: e.target.checked })} className="h-4 w-4 rounded border-border bg-bg-primary accent-accent" />
            Filtro SMA
          </label>
          {config.entry.useSmaFilter && (
            <div className="pl-6">
              <label className={labelClass}>Periodo SMA</label>
              <input type="number" min={1} className={inputClass} value={config.entry.smaPeriod}
                onChange={(e) => onUpdate('entry', { ...config.entry, smaPeriod: Number(e.target.value) })} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={(entry.useVolumeConfirmation as boolean) ?? false}
              onChange={(e) => onUpdate('entry', { ...config.entry, useVolumeConfirmation: e.target.checked } as any)} className="h-4 w-4 rounded border-border bg-bg-primary accent-accent" />
            Confirmacion por volumen
          </label>
          {(entry.useVolumeConfirmation as boolean) && (
            <div className="pl-6">
              <label className={labelClass}>Multiplicador de volumen</label>
              <input type="number" min={1} step={0.1} className={inputClass} value={(entry.volumeMultiplier as number) ?? 1.5}
                onChange={(e) => onUpdate('entry', { ...config.entry, volumeMultiplier: Number(e.target.value) } as any)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepExit({ config, onUpdate }: { config: StrategyConfig; onUpdate: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void }) {
  const entryMode = (config.entry.entryMode ?? (config.entry.useRsiDivergence ? 'divergence' : 'rsi_threshold')) as 'rsi_threshold' | 'divergence';
  const exit = config.exit as unknown as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Reglas de Salida</h2>
      <div>
        <label className={labelClass}>RSI salida (above)</label>
        <input type="number" min={0} max={100} className={inputClass} value={config.exit.rsiAbove}
          onChange={(e) => onUpdate('exit', { ...config.exit, rsiAbove: Number(e.target.value) })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Take Profit (%) — dejar vacio para desactivar</label>
          <input type="number" step={0.1} min={0} className={inputClass} value={config.exit.takeProfitPct ?? ''}
            onChange={(e) => onUpdate('exit', { ...config.exit, takeProfitPct: e.target.value ? Number(e.target.value) : null })} placeholder="Desactivado" />
        </div>
        <div>
          <label className={labelClass}>Stop Loss (%) — dejar vacio para desactivar</label>
          <input type="number" step={0.1} min={0} className={inputClass} value={config.exit.stopLossPct ?? ''}
            onChange={(e) => onUpdate('exit', { ...config.exit, stopLossPct: e.target.value ? Number(e.target.value) : null })} placeholder="Desactivado" />
        </div>
      </div>
      <div>
        <label className={labelClass}>Trailing Stop (%) — dejar vacio para desactivar</label>
        <input type="number" step={0.1} min={0} className={inputClass} value={config.exit.trailingStopPct ?? ''}
          onChange={(e) => onUpdate('exit', { ...config.exit, trailingStopPct: e.target.value ? Number(e.target.value) : null })} placeholder="Desactivado" />
      </div>
      {entryMode === 'divergence' && (
        <label className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox"
            checked={(exit.exitOnBearishDivergence as boolean) ?? false}
            onChange={(e) => onUpdate('exit', { ...config.exit, exitOnBearishDivergence: e.target.checked })}
            className="h-4 w-4 rounded border-border bg-bg-primary accent-accent" />
          Salir en divergencia bajista
        </label>
      )}
    </div>
  );
}

function StepRisk({ config, onUpdate }: { config: StrategyConfig; onUpdate: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Riesgo y Capital</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Cantidad por trade (USDT)</label>
          <input type="number" min={1} step={1} className={inputClass} value={config.risk.quoteAmountPerTrade}
            onChange={(e) => onUpdate('risk', { ...config.risk, quoteAmountPerTrade: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelClass}>Max posiciones abiertas</label>
          <input type="number" min={1} className={inputClass} value={config.risk.maxOpenPositions}
            onChange={(e) => onUpdate('risk', { ...config.risk, maxOpenPositions: Number(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Max por simbolo</label>
          <input type="number" min={1} className={inputClass} value={config.risk.maxPositionsPerSymbol}
            onChange={(e) => onUpdate('risk', { ...config.risk, maxPositionsPerSymbol: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelClass}>Exposicion max (USDT)</label>
          <input type="number" min={1} className={inputClass} value={config.risk.maxTotalExposureQuote}
            onChange={(e) => onUpdate('risk', { ...config.risk, maxTotalExposureQuote: Number(e.target.value) })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Perdida diaria max (%)</label>
          <input type="number" min={0} max={100} step={0.5} className={inputClass} value={config.risk.maxDailyLossPct}
            onChange={(e) => onUpdate('risk', { ...config.risk, maxDailyLossPct: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelClass}>Cooldown (min)</label>
          <input type="number" min={0} className={inputClass} value={config.risk.cooldownMinutes}
            onChange={(e) => onUpdate('risk', { ...config.risk, cooldownMinutes: Number(e.target.value) })} />
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

function StepExecution({ config, onUpdate }: { config: StrategyConfig; onUpdate: <K extends keyof StrategyConfig>(section: K, value: StrategyConfig[K]) => void }) {
  return (
    <div className="space-y-4">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Ejecucion</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Tipo de orden</label>
          <select className={inputClass} value={config.execution.orderType} disabled><option value="MARKET">MARKET</option></select>
        </div>
        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={config.execution.useOrderTestBeforeRealOrder}
              onChange={(e) => onUpdate('execution', { ...config.execution, useOrderTestBeforeRealOrder: e.target.checked })} className="h-4 w-4 rounded border-border bg-bg-primary accent-accent" />
            Test antes de orden real
          </label>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input type="checkbox" checked={config.execution.dryRun}
          onChange={(e) => onUpdate('execution', { ...config.execution, dryRun: e.target.checked })} className="h-4 w-4 rounded border-border bg-bg-primary accent-accent" />
        Dry Run (simulacion)
      </label>
      {!config.execution.dryRun && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">ATENCION: Las ordenes se ejecutaran con dinero real</div>
      )}
    </div>
  );
}

function StepSummary({ config, name, description }: { config: StrategyConfig; name: string; description: string }) {
  const entry = config.entry as unknown as Record<string, unknown>;
  return (
    <div className="space-y-3">
      <h2 className="mb-3 text-sm font-medium text-text-secondary">Resumen de Configuracion</h2>
      <div className="rounded-md border border-border bg-bg-primary p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">General</h3>
        <div className="space-y-1">
          <div className="flex justify-between text-sm"><span className="text-text-muted">Nombre</span><span className="font-medium text-text-primary">{name}</span></div>
          {description && <div className="flex justify-between text-sm"><span className="text-text-muted">Descripcion</span><span className="font-medium text-text-primary">{description}</span></div>}
        </div>
      </div>
      <div className="rounded-md border border-border bg-bg-primary p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">Simbolos y Timeframes</h3>
        <div className="space-y-1">
          <div className="flex justify-between text-sm"><span className="text-text-muted">Simbolos</span><span className="font-medium text-text-primary">{config.symbols.join(', ') || 'Ninguno'}</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Timeframes</span><span className="font-medium text-text-primary">{config.timeframes.join(', ')}</span></div>
        </div>
      </div>
      <div className="rounded-md border border-border bg-bg-primary p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">Reglas de Entrada</h3>
        <div className="space-y-1">
          <div className="flex justify-between text-sm"><span className="text-text-muted">Modo</span><span className="font-medium text-text-primary">{config.entry.entryMode === 'divergence' ? 'Divergencia RSI' : 'Umbral RSI'}</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">RSI Periodo</span><span className="font-medium text-text-primary">{(entry.rsiPeriod as number) ?? 14}</span></div>
          {(config.entry.entryMode ?? 'rsi_threshold') === 'rsi_threshold' && (
            <div className="flex justify-between text-sm"><span className="text-text-muted">RSI Below</span><span className="font-medium text-text-primary">{config.entry.rsiBelow}</span></div>
          )}
          <div className="flex justify-between text-sm"><span className="text-text-muted">SMA Filter</span><span className="font-medium text-text-primary">{config.entry.useSmaFilter ? `Si (${config.entry.smaPeriod})` : 'No'}</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Multi-TF</span><span className="font-medium text-text-primary">{config.entry.requireMultiTimeframeConfirmation ? 'Si' : 'No'}</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Vol. Confirmacion</span><span className="font-medium text-text-primary">{(entry.useVolumeConfirmation as boolean) ? `Si (${(entry.volumeMultiplier as number) ?? 1.5}x)` : 'No'}</span></div>
        </div>
      </div>
      <div className="rounded-md border border-border bg-bg-primary p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">Reglas de Salida</h3>
        <div className="space-y-1">
          <div className="flex justify-between text-sm"><span className="text-text-muted">RSI Above</span><span className="font-medium text-text-primary">{config.exit.rsiAbove}</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Take Profit</span><span className="font-medium text-text-primary">{config.exit.takeProfitPct != null ? `${config.exit.takeProfitPct}%` : 'Desactivado'}</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Stop Loss</span><span className="font-medium text-text-primary">{config.exit.stopLossPct != null ? `${config.exit.stopLossPct}%` : 'Desactivado'}</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Trailing Stop</span><span className="font-medium text-text-primary">{config.exit.trailingStopPct != null ? `${config.exit.trailingStopPct}%` : 'Desactivado'}</span></div>
          {(config.entry.entryMode ?? 'rsi_threshold') === 'divergence' && (
            <div className="flex justify-between text-sm"><span className="text-text-muted">Salida divergencia bajista</span><span className="font-medium text-text-primary">{((config.exit as unknown as Record<string, unknown>).exitOnBearishDivergence as boolean) ? 'Si' : 'No'}</span></div>
          )}
        </div>
      </div>
      <div className="rounded-md border border-border bg-bg-primary p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">Riesgo</h3>
        <div className="space-y-1">
          <div className="flex justify-between text-sm"><span className="text-text-muted">Por trade</span><span className="font-medium text-text-primary">{config.risk.quoteAmountPerTrade} USDT</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Max posiciones</span><span className="font-medium text-text-primary">{config.risk.maxOpenPositions}</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Max por simbolo</span><span className="font-medium text-text-primary">{config.risk.maxPositionsPerSymbol}</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Exposicion max</span><span className="font-medium text-text-primary">{config.risk.maxTotalExposureQuote} USDT</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Perdida diaria max</span><span className="font-medium text-text-primary">{config.risk.maxDailyLossPct}%</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Cooldown</span><span className="font-medium text-text-primary">{config.risk.cooldownMinutes > 0 ? `${config.risk.cooldownMinutes} min` : 'Desactivado'}</span></div>
          {config.btcStability?.enabled && (
            <div className="flex justify-between text-sm"><span className="text-text-muted">BTC Stability</span><span className="font-medium text-text-primary">Activado (min {config.btcStability.minScore}/5)</span></div>
          )}
        </div>
      </div>
      <div className="rounded-md border border-border bg-bg-primary p-3">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-accent">Ejecucion</h3>
        <div className="space-y-1">
          <div className="flex justify-between text-sm"><span className="text-text-muted">Tipo</span><span className="font-medium text-text-primary">{config.execution.orderType}</span></div>
          <div className="flex justify-between text-sm"><span className="text-text-muted">Dry Run</span><span className="font-medium text-text-primary">{config.execution.dryRun ? 'Si' : 'No'}</span></div>
        </div>
      </div>
    </div>
  );
}
