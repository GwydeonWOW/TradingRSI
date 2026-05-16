import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { authApi, type PendingUser } from '../api/auth.ts';
import { LoadingSpinner } from '../components/LoadingSpinner.tsx';

export function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const inputClass =
    'w-full rounded-md border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

  const fetchUsers = useCallback(async () => {
    try {
      const res = await authApi.listUsers();
      setUsers(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleApprove(id: string) {
    setApproving(id);
    setError(null);
    try {
      await authApi.approveUser(id);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al aprobar usuario');
    } finally {
      setApproving(null);
    }
  }

  if (user?.role !== 'admin') {
    return (
      <div>
        <h1 className="mb-6 text-xl font-bold text-text-primary">Gestion de Usuarios</h1>
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-6">
          <p className="text-sm text-danger">Solo los administradores pueden gestionar usuarios.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-text-primary">Gestion de Usuarios</h1>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : users.length === 0 ? (
        <div className="rounded-lg border border-border bg-bg-secondary p-6">
          <p className="text-sm text-text-muted">No hay usuarios registrados.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-bg-secondary">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="px-4 py-3 font-medium text-text-muted">ID</th>
                <th className="px-4 py-3 font-medium text-text-muted">Rol</th>
                <th className="px-4 py-3 font-medium text-text-muted">2FA</th>
                <th className="px-4 py-3 font-medium text-text-muted">Creado</th>
                <th className="px-4 py-3 font-medium text-text-muted">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-mono text-xs text-text-primary">{u.id.slice(0, 8)}...</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-accent/10 text-accent'
                          : u.role === 'pending'
                            ? 'bg-warning/10 text-warning'
                            : 'bg-success/10 text-success'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${u.mfaEnabled ? 'text-success' : 'text-text-muted'}`}>
                      {u.mfaEnabled ? 'Activado' : 'No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">
                    {new Date(u.createdAt).toLocaleDateString('es-ES', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => handleApprove(u.id)}
                        disabled={approving === u.id}
                        className="rounded-md bg-success/15 px-3 py-1 text-xs font-medium text-success hover:bg-success/25 disabled:opacity-50"
                      >
                        {approving === u.id ? 'Aprobando...' : 'Aprobar'}
                      </button>
                    ) : (
                      <span className="text-xs text-text-muted">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="mb-3 text-sm font-medium text-text-primary">Crear Nuevo Usuario</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newEmail || !newPassword) return;
            setCreating(true);
            setError(null);
            try {
              await authApi.createUser({ email: newEmail, password: newPassword });
              setNewEmail('');
              setNewPassword('');
              await fetchUsers();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Error al crear usuario');
            } finally {
              setCreating(false);
            }
          }}
          className="flex items-end gap-3"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-text-secondary">Email</label>
            <input type="email" className={inputClass} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required placeholder="user@example.com" />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-text-secondary">Contrasena</label>
            <input type="password" className={inputClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} placeholder="Minimo 8 caracteres" />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {creating ? 'Creando...' : 'Crear'}
          </button>
        </form>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-bg-secondary p-4">
        <h2 className="mb-2 text-sm font-medium text-text-primary">Info</h2>
        <ul className="space-y-1 text-xs text-text-muted">
          <li>El primer usuario registrado se convierte automaticamente en admin.</li>
          <li>Los siguientes usuarios necesitan aprobacion del admin para acceder.</li>
          <li>Los usuarios pueden activar 2FA desde su pagina de Seguridad.</li>
        </ul>
      </div>
    </div>
  );
}
