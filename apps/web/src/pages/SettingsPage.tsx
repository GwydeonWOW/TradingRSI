import { useState, useEffect, useCallback } from 'react';
import { tradingApi, type BinanceStatus, type BinanceBalance, type ReconcileResult } from '../api/trading.ts';

export function SettingsPage() {
  const [binanceStatus, setBinanceStatus] = useState<BinanceStatus | null>(null);
  const [balances, setBalances] = useState<BinanceBalance[]>([]);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, accountRes] = await Promise.all([
        tradingApi.getBinanceStatus(),
        tradingApi.getBinanceAccount(),
      ]);
      setBinanceStatus(statusRes.data);
      if (accountRes.success && 'data' in accountRes) {
        const nonZero = (accountRes.data as { balances: BinanceBalance[] }).balances.filter(
          (b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
        );
        setBalances(nonZero);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando configuracion');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReconcile = async () => {
    setReconcileLoading(true);
    try {
      const res = await tradingApi.reconcile();
      if (res.success) {
        setReconcileResult(res.data);
        fetchData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error reconciliando');
    } finally {
      setReconcileLoading(false);
    }
  };

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Configuracion</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Binance Connection */}
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">Exchange / Binance</h2>
            {binanceStatus && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  binanceStatus.connected && binanceStatus.configured
                    ? 'bg-success/10 text-success'
                    : 'bg-danger/10 text-danger'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    binanceStatus.connected && binanceStatus.configured ? 'bg-success' : 'bg-danger'
                  }`}
                />
                {binanceStatus.connected && binanceStatus.configured ? 'Conectado' : 'Desconectado'}
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-text-muted">Cargando...</p>
          ) : binanceStatus ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Entorno</span>
                <span className="font-medium text-text-primary">{binanceStatus.environment}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Configurado</span>
                <span className={binanceStatus.configured ? 'text-success' : 'text-danger'}>
                  {binanceStatus.configured ? 'Si' : 'No'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Conexion</span>
                <span className={binanceStatus.connected ? 'text-success' : 'text-danger'}>
                  {binanceStatus.connected ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              {binanceStatus.latency !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Latencia</span>
                  <span className="text-text-primary">{binanceStatus.latency}ms</span>
                </div>
              )}
              {reconcileResult && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Ultima reconciliacion</span>
                  <span className="text-text-primary">
                    {new Date().toLocaleTimeString('es-ES')}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No se pudo obtener el estado de Binance.</p>
          )}

          <div className="mt-3">
            <button
              onClick={handleReconcile}
              disabled={reconcileLoading}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {reconcileLoading ? 'Reconciliando...' : 'Reconciliar'}
            </button>
          </div>

          {reconcileResult && (
            <div className="mt-3 rounded-lg border border-success/30 bg-success/5 p-3">
              <p className="text-xs font-medium text-success">{reconcileResult.message}</p>
            </div>
          )}
        </div>

        {/* Balances */}
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-3 text-sm font-medium text-text-primary">Saldos Binance Demo</h2>
          {balances.length === 0 ? (
            <p className="text-sm text-text-muted">Sin saldos disponibles.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-muted">
                    <th className="pb-2 pr-4">Asset</th>
                    <th className="pb-2 pr-4">Free</th>
                    <th className="pb-2">Locked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {balances.map((b) => (
                    <tr key={b.asset} className="text-text-primary">
                      <td className="py-2 pr-4 font-medium">{b.asset}</td>
                      <td className="py-2 pr-4">{parseFloat(b.free).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                      <td className="py-2">{parseFloat(b.locked).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Environment selector */}
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Entorno</h2>
          <p className="text-sm text-text-muted">
            Entorno actual: <span className="font-medium text-text-primary">{binanceStatus?.environment ?? 'demo'}</span>
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Configurado via variable de entorno BINANCE_ENV. Valores: demo (por defecto), testnet, production.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Seguridad y 2FA</h2>
          <p className="text-sm text-text-muted">2FA pendiente de activacion.</p>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Riesgo Global</h2>
          <p className="text-sm text-text-muted">Parametros de riesgo no configurados.</p>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Notificaciones</h2>
          <p className="text-sm text-text-muted">Sin canales configurados.</p>
        </div>
      </div>
    </div>
  );
}
