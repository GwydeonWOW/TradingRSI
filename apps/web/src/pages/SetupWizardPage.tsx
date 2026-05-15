import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth.ts';
import { useAuth } from '../context/AuthContext.tsx';

const inputClass =
  'w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';
const labelClass = 'mb-1 block text-sm font-medium text-text-secondary';

export function SetupWizardPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    authApi.needsSetup()
      .then((res) => { if (!res.data.needsSetup) navigate('/login', { replace: true }); })
      .catch(() => {});
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('El email es obligatorio');
      return;
    }
    if (password.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden');
      return;
    }

    setLoading(true);
    try {
      await register(email.trim(), password);
      navigate('/settings/2fa');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el administrador');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-text-primary">CryptoRSI</h1>
          <p className="mt-2 text-sm text-text-secondary">Configuracion inicial — Crear cuenta de administrador</p>
        </div>

        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <div className="mb-4 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-text-muted">
            No se han encontrado usuarios en el sistema. El primer usuario sera administrador.
            Despues de crear la cuenta se te pedira configurar 2FA.
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
                autoFocus
              />
            </div>
            <div>
              <label className={labelClass}>Contrasena</label>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 8 caracteres"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className={labelClass}>Confirmar contrasena</label>
              <input
                type="password"
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repetir contrasena"
                required
                minLength={8}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {loading ? 'Creando...' : 'Crear Administrador y configurar 2FA'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
