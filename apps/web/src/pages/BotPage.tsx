import { useState, useEffect, useCallback } from 'react';
import { MetricCard } from '../components/MetricCard.tsx';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { BotStatusBadge } from '../components/BotStatusBadge.tsx';
import { botApi, type BotStatus, type BotEvent, type BotStatusType } from '../api/bot.ts';
import { strategiesApi, type StrategyListItem } from '../api/strategies.ts';
import { tradingApi, type BinanceOpenOrder, type ReconcileResult, type StreamStatus } from '../api/trading.ts';
import { StreamStatusBadge } from '../components/StreamStatusBadge.tsx';

function formatTime(ts: number | null): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(ts: number | null): string {
  if (!ts) return '--';
  return new Date(ts).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatUptime(startedAt: number | null): string {
  if (!startedAt) return '0h 0m';
  const diff = Date.now() - startedAt;
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    bot_started: 'Bot iniciado',
    bot_stopped: 'Bot detenido',
    evaluation: 'Evaluacion',
    signal: 'Senal generada',
    order_placed: 'Orden colocada',
    error: 'Error',
    kill_switch: 'Kill Switch',
    risk_check: 'Check de riesgo',
    position_opened: 'Posicion abierta',
    position_closed: 'Posicion cerrada',
    kline_close: 'Kline Cierre',
  };
  return labels[type] ?? type;
}

const pipelineSteps = [
  { key: 'market', label: 'Market Data' },
  { key: 'indicators', label: 'Indicadores' },
  { key: 'signal', label: 'Senal' },
  { key: 'risk', label: 'Riesgo' },
  { key: 'order', label: 'Orden' },
  { key: 'position', label: 'Posicion' },
];

function PipelineVisual({ status }: { status: BotStatusType }) {
  const isActive = status === 'running';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pipelineSteps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              isActive
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-border bg-bg-tertiary text-text-muted'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${isActive ? 'bg-success animate-pulse' : 'bg-text-muted'}`}
            />
            {step.label}
          </div>
          {i < pipelineSteps.length - 1 && (
            <svg
              className={`h-4 w-4 ${isActive ? 'text-success/50' : 'text-text-muted'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

export function BotPage() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [events, setEvents] = useState<BotEvent[]>([]);
  const [strategies, setStrategies] = useState<StrategyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showStrategySelect, setShowStrategySelect] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const [killInput, setKillInput] = useState('');
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [openOrders, setOpenOrders] = useState<BinanceOpenOrder[]>([]);
  const [openOrdersLoading, setOpenOrdersLoading] = useState(false);
  const [streamStatus, setStreamStatus] = useState<StreamStatus | null>(null);
  const [streamActionLoading, setStreamActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, eventsRes] = await Promise.all([
        botApi.getStatus(),
        botApi.getEvents(30),
      ]);
      setStatus(statusRes.data);
      setEvents(eventsRes.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStrategies = useCallback(async () => {
    try {
      const res = await strategiesApi.list({ status: 'active' });
      setStrategies(res.data);
    } catch {
      // Strategies fetch failure is non-critical
    }
  }, []);

  const fetchStreamStatus = useCallback(async () => {
    try {
      const res = await tradingApi.getStreamStatus();
      if (res.success) {
        setStreamStatus(res.data);
      }
    } catch {
      // Stream status fetch failure is non-critical
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  useEffect(() => {
    fetchStreamStatus();
    const interval = setInterval(fetchStreamStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStreamStatus]);

  const handleStart = async (strategyId: string) => {
    setActionLoading(true);
    try {
      const res = await botApi.start(strategyId);
      if (res.success) {
        setStatus(res.data);
        setShowStrategySelect(false);
      } else {
        setError((res as any).error?.message ?? 'Error iniciando bot');
      }
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error iniciando bot');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      const res = await botApi.stop();
      setStatus(res.data);
      setConfirmStop(false);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deteniendo bot');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEvaluateNow = async () => {
    setActionLoading(true);
    try {
      await botApi.evaluateNow();
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error evaluando');
    } finally {
      setActionLoading(false);
    }
  };

  const handleKillSwitch = async () => {
    setActionLoading(true);
    try {
      await botApi.killSwitch();
      setConfirmKill(false);
      setKillInput('');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error ejecutando kill switch');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReconcile = async () => {
    setReconcileLoading(true);
    try {
      const res = await tradingApi.reconcile();
      if (res.success) {
        setReconcileResult(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error reconciliando');
    } finally {
      setReconcileLoading(false);
    }
  };

  const handleFetchOpenOrders = async () => {
    setOpenOrdersLoading(true);
    try {
      const res = await tradingApi.getOpenOrders();
      if (res.success) {
        setOpenOrders(res.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando ordenes');
    } finally {
      setOpenOrdersLoading(false);
    }
  };

  useEffect(() => {
    handleFetchOpenOrders();
  }, []);

  const handleStartStreams = async () => {
    setStreamActionLoading(true);
    try {
      await tradingApi.startStreams();
      fetchStreamStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error iniciando streams');
    } finally {
      setStreamActionLoading(false);
    }
  };

  const handleStopStreams = async () => {
    setStreamActionLoading(true);
    try {
      await tradingApi.stopStreams();
      fetchStreamStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deteniendo streams');
    } finally {
      setStreamActionLoading(false);
    }
  };

  if (loading) return <LoadingSpinner size="lg" />;

  if (error && !status) {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-text-primary">Bot en Vivo</h1>
        <EmptyState title="Error de conexion" description={error} />
      </div>
    );
  }

  const isRunning = status?.status === 'running';
  const isIdle = status?.status === 'idle';

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-text-primary">Bot en Vivo</h1>
            {status && <BotStatusBadge status={status.status} />}
          </div>
          <div className="flex flex-wrap gap-2">
            {isIdle && (
              <button
                onClick={() => setShowStrategySelect(!showStrategySelect)}
                className="rounded-lg bg-success px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                disabled={actionLoading}
              >
                Iniciar Bot
              </button>
            )}
            {isRunning && (
              <button
                onClick={() => setConfirmStop(true)}
                className="rounded-lg bg-warning px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-warning/90 disabled:opacity-50"
                disabled={actionLoading}
              >
                Detener
              </button>
            )}
            {isRunning && (
              <button
                onClick={handleEvaluateNow}
                className="rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover disabled:opacity-50"
                disabled={actionLoading}
              >
                Evaluar Ahora
              </button>
            )}
            <button
              onClick={() => setConfirmKill(true)}
              className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
              disabled={actionLoading}
            >
              Kill Switch
            </button>
            <button
              onClick={handleReconcile}
              className="rounded-lg border border-accent/50 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
              disabled={reconcileLoading}
            >
              {reconcileLoading ? 'Reconciliando...' : 'Reconciliar con Binance'}
            </button>
          </div>
        </div>

        {/* Strategy selector */}
        {showStrategySelect && (
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <p className="mb-3 text-sm font-medium text-text-secondary">Selecciona una estrategia activa:</p>
            {strategies.length === 0 ? (
              <p className="text-sm text-text-muted">No hay estrategias activas disponibles.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {strategies.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleStart(s.id)}
                    className="rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:bg-bg-hover"
                    disabled={actionLoading}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active strategy display */}
        {status?.strategyName && (
          <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm text-accent">
            Estrategia activa: <span className="font-medium">{status.strategyName}</span>
            {status.activeStrategyId && (
              <span className="ml-2 text-xs text-text-muted">({status.activeStrategyId.slice(0, 8)}...)</span>
            )}
          </div>
        )}

        {/* Error message */}
        {status?.errorMessage && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-danger">
            {status.errorMessage}
          </div>
        )}

        {/* Mode indicator for live binance_demo */}
        {isRunning && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm font-medium text-warning">
            MODO DEMO - Ordenes reales
          </div>
        )}

        {/* Reconciliation results */}
        {reconcileResult && (
          <div className="rounded-lg border border-success/30 bg-success/10 p-4">
            <p className="mb-2 text-sm font-medium text-success">{reconcileResult.message}</p>
            <p className="text-xs text-text-muted">Entorno: {reconcileResult.environment}</p>
            {reconcileResult.balances.length > 0 && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-text-muted">
                      <th className="pb-1 pr-4">Asset</th>
                      <th className="pb-1 pr-4">Free</th>
                      <th className="pb-1">Locked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconcileResult.balances.map((b) => (
                      <tr key={b.asset} className="text-text-primary">
                        <td className="py-0.5 pr-4 font-medium">{b.asset}</td>
                        <td className="py-0.5 pr-4">{b.free}</td>
                        <td className="py-0.5">{b.locked}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm Stop dialog */}
      {confirmStop && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <p className="mb-3 text-sm text-text-primary">
            Confirmas que deseas detener el bot?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleStop}
              className="rounded-lg bg-warning px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-warning/90 disabled:opacity-50"
              disabled={actionLoading}
            >
              Si, detener
            </button>
            <button
              onClick={() => setConfirmStop(false)}
              className="rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-hover"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Confirm Kill Switch dialog */}
      {confirmKill && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-4">
          <p className="mb-2 text-sm font-medium text-danger">KILL SWITCH - Accion critica</p>
          <p className="mb-3 text-sm text-text-secondary">
            Esto detendra inmediatamente todo el procesamiento del bot.
            Escribe <strong className="text-danger">KILL</strong> para confirmar.
          </p>
          <input
            type="text"
            value={killInput}
            onChange={(e) => setKillInput(e.target.value)}
            className="mb-3 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
            placeholder='Escribe "KILL" para confirmar'
          />
          <div className="flex gap-2">
            <button
              onClick={handleKillSwitch}
              className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
              disabled={killInput !== 'KILL' || actionLoading}
            >
              Ejecutar Kill Switch
            </button>
            <button
              onClick={() => { setConfirmKill(false); setKillInput(''); }}
              className="rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm text-text-primary transition-colors hover:bg-bg-hover"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Metrics row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Estado"
          value={status ? <BotStatusBadge status={status.status} /> : '--'}
          variant={isRunning ? 'success' : status?.status === 'error' ? 'danger' : 'default'}
        />
        <MetricCard
          title="Estrategia Activa"
          value={status?.strategyName ?? 'Ninguna'}
          variant={status?.activeStrategyId ? 'success' : 'default'}
        />
        <MetricCard
          title="Ultima Evaluacion"
          value={formatTime(status?.lastEvaluationAt ?? null)}
          subtitle={status?.lastEvaluationAt ? formatDate(status.lastEvaluationAt) : undefined}
          variant="default"
        />
        <MetricCard
          title="Uptime"
          value={formatUptime(status?.startedAt ?? null)}
          subtitle={status?.startedAt ? `Desde ${new Date(status.startedAt).toLocaleTimeString('es-ES')}` : undefined}
          variant={isRunning ? 'success' : 'default'}
        />
      </div>

      {/* Pipeline visual */}
      <div className="mt-6 rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">Pipeline de Procesamiento</h2>
        <PipelineVisual status={status?.status ?? 'idle'} />
      </div>

      {/* Stream status */}
      <div className="mt-6 rounded-lg border border-border bg-bg-secondary p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-secondary">WebSocket Streams</h2>
          {streamStatus && (
            <StreamStatusBadge
              klineConnected={streamStatus.klineConnected}
              userStreamConnected={streamStatus.userStreamConnected}
              subscriptionsCount={streamStatus.subscriptionsCount}
            />
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Kline Stream</span>
            <span className={streamStatus?.klineConnected ? 'text-success' : 'text-text-muted'}>
              {streamStatus?.klineConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">User Stream</span>
            <span className={streamStatus?.userStreamConnected ? 'text-success' : streamStatus?.klineConnected ? 'text-text-muted' : 'text-danger'}>
              {streamStatus?.userStreamConnected ? 'Conectado' : streamStatus?.klineConnected ? 'No disponible (Demo)' : 'Desconectado'}
            </span>
          </div>
          {streamStatus?.listenKeyAge != null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Listen Key Age</span>
              <span className="text-text-primary">{Math.floor(streamStatus.listenKeyAge / 60_000)}m</span>
            </div>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={handleStartStreams}
            className="rounded-lg bg-success px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
            disabled={streamActionLoading || streamStatus?.klineConnected === true}
          >
            {streamActionLoading ? 'Iniciando...' : 'Iniciar Streams'}
          </button>
          <button
            onClick={handleStopStreams}
            className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
            disabled={streamActionLoading || !streamStatus?.klineConnected}
          >
            {streamActionLoading ? 'Deteniendo...' : 'Detener Streams'}
          </button>
        </div>
      </div>

      {/* Last evaluation detail */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-3 text-sm font-medium text-text-secondary">Ultima Evaluacion</h2>
          {status?.lastEvaluationAt ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Timestamp</span>
                <span className="text-text-primary">{formatDate(status.lastEvaluationAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Senal Generada</span>
                <span
                  className={
                    status.lastSignalType === 'BUY_SIGNAL' || status.lastSignalType === 'SELL_SIGNAL'
                      ? 'text-success'
                      : 'text-text-primary'
                  }
                >
                  {status.lastSignalType ?? 'Sin senal'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Ciclo #</span>
                <span className="text-text-primary">{status.cycleCount}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Sin evaluaciones registradas</p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-3 text-sm font-medium text-text-secondary">Resumen</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Total Evaluaciones</span>
              <span className="text-text-primary">{status?.cycleCount ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Senal Actual</span>
              <span className="text-text-primary">{status?.lastSignalType ?? 'Ninguna'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Iniciado</span>
              <span className="text-text-primary">
                {status?.startedAt ? formatDate(status.startedAt) : 'No iniciado'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Events */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">
          Eventos en Vivo
          <span className="ml-2 text-xs text-text-muted">(ultimos 30)</span>
        </h2>
        <div className="rounded-lg border border-border bg-bg-secondary">
          {events.length === 0 ? (
            <div className="p-4 text-sm text-text-muted">
              Sin eventos registrados. Inicia el bot para ver actividad.
            </div>
          ) : (
            <ul className="divide-y divide-border max-h-96 overflow-y-auto">
              {events.map((event, i) => (
                <li key={`${event.timestamp}-${i}`} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          event.type === 'error' || event.type === 'kill_switch'
                            ? 'bg-danger'
                            : event.type === 'signal' || event.type === 'order_placed' || event.type === 'kline_close'
                              ? 'bg-success'
                              : event.type === 'bot_started' || event.type === 'bot_stopped'
                                ? 'bg-warning'
                                : 'bg-accent'
                        }`}
                      />
                      <span className="text-sm text-text-primary">{eventTypeLabel(event.type)}</span>
                    </div>
                    <span className="text-xs text-text-muted">
                      {new Date(event.timestamp).toLocaleTimeString('es-ES')}
                    </span>
                  </div>
                  {event.data && Object.keys(event.data).length > 0 && (
                    <pre className="mt-1 overflow-x-auto text-xs text-text-muted">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Open Orders */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-secondary">
            Ordenes Abiertas
            <span className="ml-2 text-xs text-text-muted">({openOrders.length})</span>
          </h2>
          <button
            onClick={handleFetchOpenOrders}
            className="text-xs text-accent hover:text-accent-hover"
            disabled={openOrdersLoading}
          >
            {openOrdersLoading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
        <div className="rounded-lg border border-border bg-bg-secondary">
          {openOrders.length === 0 ? (
            <div className="p-4 text-sm text-text-muted">Sin ordenes abiertas en Binance</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-muted">
                    <th className="px-4 py-2">Symbol</th>
                    <th className="px-4 py-2">Side</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Price</th>
                    <th className="px-4 py-2">Qty</th>
                    <th className="px-4 py-2">Filled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {openOrders.map((o) => (
                    <tr key={o.orderId} className="text-text-primary">
                      <td className="px-4 py-2 font-medium">{o.symbol}</td>
                      <td className={o.side === 'BUY' ? 'text-success' : 'text-danger'}>{o.side}</td>
                      <td className="px-4 py-2">{o.type}</td>
                      <td className="px-4 py-2">{o.price}</td>
                      <td className="px-4 py-2">{o.origQty}</td>
                      <td className="px-4 py-2">{o.executedQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
