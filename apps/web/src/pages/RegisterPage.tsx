import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth.ts';

const inputClass =
  'w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.register({ email, password });
      if (res.data.role === 'pending') {
        setPending(true);
      } else {
        // First user (admin) — store token and redirect
        localStorage.setItem('token', res.data.token);
        navigate('/');
      }
    } catch (err: any) {
      if (err?.message?.includes('already registered')) {
        setError('Ese email ya esta registrado. Inicia sesion.');
      } else {
        setError(err instanceof Error ? err.message : 'Error al registrarse');
      }
    } finally {
      setLoading(false);
    }
  }

  if (pending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-bg-secondary p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
            <svg className="h-8 w-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="mb-2 text-lg font-semibold text-text-primary">Registro completado</h2>
          <p className="mb-4 text-sm text-text-secondary">
            Tu cuenta esta pendiente de aprobacion por un administrador. Recibiras acceso una vez sea aprobada.
          </p>
          <a href="/login" className="text-sm text-accent hover:text-accent-hover">
            Volver a iniciar sesion
          </a>
        </div>
      </div>
    );
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

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Email</label>
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Contrasena</label>
            <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-secondary">Confirmar contrasena</label>
            <input type="password" className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? 'Creando...' : 'Crear Cuenta'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-text-muted">
          Ya tienes cuenta? <a href="/login" className="text-accent hover:text-accent-hover">Iniciar sesion</a>
        </p>
      </div>
    </div>
  );
}
