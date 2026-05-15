import { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';

const inputClass =
  'w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

export function LoginPage() {
  const { login, challengeMfa } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await login(email, password);
      if (result.requiresMfa) {
        setRequiresMfa(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesion');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await challengeMfa(mfaCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Codigo invalido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg-secondary p-8">
        <h1 className="mb-6 text-center text-xl font-bold text-text-primary">CryptoRSI</h1>

        {error && (
          <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {!requiresMfa ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Email</label>
              <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Contrasena</label>
              <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? 'Iniciando...' : 'Iniciar Sesion'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfa} className="space-y-4">
            <p className="text-sm text-text-muted">Introduce tu codigo 2FA o un codigo de recuperacion.</p>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-secondary">Codigo</label>
              <input type="text" className={inputClass} value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="000000" required autoFocus />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? 'Verificando...' : 'Verificar'}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-text-muted">
          No tienes cuenta? <a href="/register" className="text-accent hover:text-accent-hover">Registrarse</a>
        </p>
      </div>
    </div>
  );
}
