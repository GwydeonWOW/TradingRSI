import { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';

const inputClass =
  'w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

export function RegisterPage() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await register(email, password);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        setError('Ese email ya esta registrado. Inicia sesion.');
      } else {
        setError(err instanceof Error ? err.message : 'Error al registrarse');
      }
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
