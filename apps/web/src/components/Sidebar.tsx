import { NavLink } from 'react-router-dom';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const groups: NavGroup[] = [
  {
    title: 'Monitorizacion',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: '📊' },
      { label: 'Bot en vivo', path: '/bot', icon: '🤖' },
      { label: 'Posiciones', path: '/positions', icon: '📈' },
      { label: 'Ordenes', path: '/orders', icon: '📋' },
      { label: 'Senales', path: '/signals', icon: '📡' },
    ],
  },
  {
    title: 'Estrategias',
    items: [
      { label: 'Estrategias', path: '/strategies', icon: '⚙️' },
      { label: 'Backtesting', path: '/backtests', icon: '🧪' },
    ],
  },
  {
    title: 'Mercado',
    items: [
      { label: 'Datos de mercado', path: '/market', icon: '🌍' },
      { label: 'Liquidity Health', path: '/liquidity', icon: '💧' },
    ],
  },
  {
    title: 'Configuracion',
    items: [
      { label: 'Settings', path: '/settings', icon: '🔧' },
      { label: 'Seguridad 2FA', path: '/settings/2fa', icon: '🔐' },
      { label: 'Usuarios', path: '/users', icon: '👥' },
    ],
  },
  {
    title: 'Auditoria',
    items: [
      { label: 'Eventos', path: '/audit', icon: '📜' },
    ],
  },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
          role="button"
          tabIndex={-1}
          aria-label="Close sidebar"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-bg-secondary transition-transform duration-200 md:z-30 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Sidebar header (mobile close) */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4 md:justify-end">
          <span className="text-sm font-semibold text-text-primary md:hidden">Menu</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary md:hidden"
            aria-label="Close sidebar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.title} className="mb-4">
              <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-accent/10 text-accent'
                            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                        }`
                      }
                    >
                      <span className="text-base" role="img" aria-hidden="true">
                        {item.icon}
                      </span>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
