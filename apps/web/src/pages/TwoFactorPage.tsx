import { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { authApi } from '../api/auth.ts';

const inputClass =
  'w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

export function TwoFactorPage() {
  const { user } = useAuth();
  const [step, setStep] = useState<'idle' | 'setup' | 'verify' | 'done'>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSetup() {
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.setup2fa();
      setQr(res.data.qr);
      setSecret(res.data.secret);
      setStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al configurar 2FA');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.verify2fa({ code });
      setRecoveryCodes(res.data.recoveryCodes);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Codigo invalido');
    } finally {
      setLoading(false);
    }
  }

  if (user?.mfaEnabled && step !== 'done') {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-text-primary">Autenticacion 2FA</h1>
        <div className="rounded-lg border border-success/30 bg-success/5 p-6">
          <div className="flex items-center gap-3">
            <svg className="h-8 w-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <div>
              <h2 className="text-lg font-medium text-success">2FA Activado</h2>
              <p className="text-sm text-text-muted">Tu cuenta tiene autenticacion de dos factores activa.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Autenticacion 2FA</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {step === 'idle' && (
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <h2 className="mb-3 text-sm font-medium text-text-primary">Configurar 2FA</h2>
          <p className="mb-4 text-sm text-text-muted">
            La autenticacion de dos factores anade una capa extra de seguridad a tu cuenta.
            Necesitaras una app como Google Authenticator o Authy para generar codigos.
          </p>
          <button
            type="button"
            onClick={handleSetup}
            disabled={loading}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? 'Generando...' : 'Comenzar configuracion'}
          </button>
        </div>
      )}

      {step === 'verify' && qr && (
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <h2 className="mb-3 text-sm font-medium text-text-primary">Escanear QR Code</h2>
          <p className="mb-4 text-sm text-text-muted">
            Escanea este codigo con tu app de autenticacion (Google Authenticator, Authy, etc.).
          </p>

          <div className="mb-4 flex justify-center">
            <img src={qr} alt="2FA QR Code" className="rounded-lg border border-border" />
          </div>

          <div className="mb-4 rounded-lg border border-accent/20 bg-accent/5 p-3">
            <p className="mb-1 text-xs font-medium text-text-secondary">Clave manual (si no puedes escanear):</p>
            <code className="break-all text-xs text-accent">{secret}</code>
          </div>

          <form onSubmit={handleVerify} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Introduce el codigo de tu app
              </label>
              <input
                type="text"
                className={inputClass}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? 'Verificando...' : 'Verificar y activar'}
            </button>
          </form>
        </div>
      )}

      {step === 'done' && recoveryCodes.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <h2 className="mb-3 text-sm font-medium text-success">2FA Activado correctamente</h2>
          <div className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <p className="mb-2 text-xs font-medium text-warning">
              Guarda estos codigos de recuperacion en un lugar seguro. Solo se muestran una vez.
            </p>
            <div className="grid grid-cols-2 gap-1">
              {recoveryCodes.map((c, i) => (
                <code key={i} className="rounded bg-bg-primary px-2 py-1 text-center text-xs text-text-primary">
                  {c}
                </code>
              ))}
            </div>
          </div>
          <p className="text-xs text-text-muted">
            Si pierdes acceso a tu app de autenticacion, puedes usar uno de estos codigos para entrar.
            Cada codigo solo se puede usar una vez.
          </p>
        </div>
      )}
    </div>
  );
}
