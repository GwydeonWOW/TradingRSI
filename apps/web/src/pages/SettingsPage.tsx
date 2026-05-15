import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  tradingApi,
  settingsApi,
  type BinanceStatus,
  type BinanceBalance,
  type ReconcileResult,
  type BinanceCredentialInfo,
} from '../api/trading.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useSymbols, getAllAvailableSymbols } from '../api/config.ts';

const inputClass =
  'w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';
const labelClass = 'mb-1 block text-sm font-medium text-text-secondary';

export function SettingsPage() {
  const { user } = useAuth();
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
        {/* Binance API Credentials */}
        <CredentialsSection onCredentialChange={fetchData} />

        {/* Binance Connection */}
        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-text-primary">Estado de Conexion</h2>
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
            Configurado via credenciales o variable de entorno BINANCE_ENV. Valores: demo (por defecto), testnet, production.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-2 text-sm font-medium text-text-primary">Preparacion para Live</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">ALLOW_LIVE_TRADING</span>
              <span className="text-warning">
                Bloqueado por defecto
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Entorno actual</span>
              <span className={`font-medium ${binanceStatus?.environment === 'production' ? 'text-danger' : 'text-success'}`}>
                {binanceStatus?.environment ?? 'demo'}
              </span>
            </div>
            <div className="mt-2">
              <Link
                to="/settings/live-readiness"
                className="inline-block rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Verificar preparacion para Live
              </Link>
            </div>
            <p className="text-xs text-text-muted">
              Verifica todas las condiciones necesarias antes de habilitar trading con dinero real.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="mb-1 text-sm font-medium text-text-primary">Seguridad y 2FA</h2>
              <p className="text-sm text-text-muted">
                Estado: <span className={binanceStatus ? 'text-success' : 'text-warning'}>{user?.mfaEnabled ? '2FA Activado' : '2FA Desactivado'}</span>
              </p>
            </div>
            <Link
              to="/settings/2fa"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              {user?.mfaEnabled ? 'Ver 2FA' : 'Configurar 2FA'}
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-4">
          <h2 className="mb-3 text-sm font-medium text-text-primary">Tokens Configurados</h2>
          <p className="mb-3 text-xs text-text-muted">
            Selecciona los tokens que apareceran en las paginas de mercado, dashboard y bot.
            Para Liquidity Health se usan los 4 principales (BTC, ETH, SOL, BNB).
          </p>
          <TokenConfig />
        </div>

        {user?.role === 'admin' && (
          <div className="rounded-lg border border-border bg-bg-secondary p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="mb-1 text-sm font-medium text-text-primary">Gestion de Usuarios</h2>
                <p className="text-sm text-text-muted">Aprobar y gestionar usuarios del sistema.</p>
              </div>
              <Link
                to="/users"
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Gestionar Usuarios
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TokenConfig() {
  const { symbols, addSymbol, removeSymbol } = useSymbols();
  const available = getAllAvailableSymbols();
  const [customInput, setCustomInput] = useState('');

  function handleAdd() {
    const val = customInput.trim().toUpperCase();
    if (val && !symbols.includes(val)) {
      addSymbol(val);
      setCustomInput('');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {available.map((sym) => {
          const active = symbols.includes(sym);
          return (
            <button
              key={sym}
              type="button"
              onClick={() => active ? removeSymbol(sym) : addSymbol(sym)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
              }`}
            >
              {sym.slice(0, -4)}/{sym.slice(-4)}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value.toUpperCase())}
          placeholder="CUSTOMUSDT"
          className="flex-1 rounded-md border border-border bg-bg-primary px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!customInput.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          Añadir
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {symbols.map((sym) => (
          <span key={sym} className="inline-flex items-center gap-1 rounded-full bg-bg-tertiary px-2.5 py-1 text-xs font-medium text-text-primary">
            {sym}
            <button type="button" onClick={() => removeSymbol(sym)} className="text-text-muted hover:text-danger">×</button>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---- Credentials Management Section ---- */

function CredentialsSection({ onCredentialChange }: { onCredentialChange: () => void }) {
  const [credentials, setCredentials] = useState<BinanceCredentialInfo[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [environment, setEnvironment] = useState('demo');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(true);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await settingsApi.getCredentials();
      setCredentials(res.data);
    } catch {
      // Credentials endpoint may not exist yet; silently ignore
    } finally {
      setLoadingCreds(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      await settingsApi.saveCredentials({
        apiKey,
        apiSecret,
        environment,
        label: label.trim() || undefined,
      });
      setFeedback({ type: 'success', message: 'Credenciales guardadas correctamente.' });
      setApiKey('');
      setApiSecret('');
      setLabel('');
      fetchCredentials();
      onCredentialChange();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Error guardando credenciales' });
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    setFeedback(null);
    try {
      await settingsApi.revokeCredentials(id);
      setFeedback({ type: 'success', message: 'Credenciales revocadas.' });
      fetchCredentials();
      onCredentialChange();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Error revocando credenciales' });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <h2 className="mb-3 text-sm font-medium text-text-primary">Credenciales Binance API</h2>

      {/* Security note */}
      <div className="mb-4 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-text-muted">
        Las credenciales se guardan cifradas en la base de datos (AES-256-GCM).
        Nunca se muestran completas tras guardar.
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-xs ${
            feedback.type === 'success'
              ? 'border-success/30 bg-success/5 text-success'
              : 'border-danger/30 bg-danger/5 text-danger'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Credentials Form */}
      <form onSubmit={handleSave} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>API Key</label>
            <input
              type="password"
              className={inputClass}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="API Key de Binance"
              required
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelClass}>API Secret</label>
            <input
              type="password"
              className={inputClass}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="API Secret de Binance"
              required
              autoComplete="off"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <div>
            <label className={labelClass}>Etiqueta (opcional)</label>
            <input
              type="text"
              className={inputClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej: Binance Demo Principal"
              autoComplete="off"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !apiKey || !apiSecret}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Guardando...' : 'Guardar Credenciales'}
        </button>
      </form>

      {/* Saved Credentials List */}
      {loadingCreds ? (
        <p className="mt-4 text-sm text-text-muted">Cargando credenciales...</p>
      ) : credentials.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">Credenciales Guardadas</h3>
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex flex-col gap-2 rounded-md border border-border bg-bg-primary p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <span>{cred.label || cred.environment}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      cred.enabled
                        ? 'bg-success/10 text-success'
                        : 'bg-danger/10 text-danger'
                    }`}
                  >
                    {cred.enabled ? 'Activa' : 'Revocada'}
                  </span>
                  <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                    {cred.environment}
                  </span>
                </div>
                <div className="text-xs text-text-muted">
                  <span>API Key: {cred.apiKeyPreview}</span>
                  <span className="mx-2">|</span>
                  <span>Creada: {new Date(cred.createdAt).toLocaleDateString('es-ES')}</span>
                </div>
              </div>
              {cred.enabled && (
                <button
                  onClick={() => handleRevoke(cred.id)}
                  disabled={revokingId === cred.id}
                  className="shrink-0 rounded-md border border-danger/30 bg-danger/10 px-3 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
                >
                  {revokingId === cred.id ? 'Revocando...' : 'Revocar'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
