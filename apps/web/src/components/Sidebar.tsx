import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Bot,
  TrendingUp,
  ClipboardList,
  Radio,
  Settings,
  ShieldCheck,
  Users,
  ScrollText,
  Droplets,
  FlaskConical,
  Cog,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
  roles?: string[];
}

const groups: NavGroup[] = [
  {
    title: 'Monitorizacion',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={18} /> },
      { label: 'Bot en vivo', path: '/bot', icon: <Bot size={18} />, roles: ['admin', 'operator'] },
      { label: 'Posiciones', path: '/positions', icon: <TrendingUp size={18} /> },
      { label: 'Ordenes', path: '/orders', icon: <ClipboardList size={18} />, roles: ['admin', 'operator'] },
      { label: 'Senales', path: '/signals', icon: <Radio size={18} /> },
    ],
  },
  {
    title: 'Estrategias',
    items: [
      { label: 'Estrategias', path: '/strategies', icon: <Cog size={18} /> },
      { label: 'Backtesting', path: '/backtests', icon: <FlaskConical size={18} /> },
    ],
  },
  {
    title: 'Mercado',
    items: [
      { label: 'Datos de mercado', path: '/market', icon: <TrendingUp size={18} /> },
      { label: 'Liquidity Health', path: '/liquidity', icon: <Droplets size={18} /> },
    ],
  },
  {
    title: 'Configuracion',
    roles: ['admin'],
    items: [
      { label: 'Settings', path: '/settings', icon: <Settings size={18} /> },
      { label: 'Seguridad 2FA', path: '/settings/2fa', icon: <ShieldCheck size={18} /> },
      { label: 'Usuarios', path: '/users', icon: <Users size={18} /> },
    ],
  },
  {
    title: 'Seguridad',
    roles: ['operator'],
    items: [
      { label: 'Seguridad 2FA', path: '/settings/2fa', icon: <ShieldCheck size={18} /> },
    ],
  },
  {
    title: 'Auditoria',
    roles: ['admin'],
    items: [
      { label: 'Eventos', path: '/audit', icon: <ScrollText size={18} /> },
    ],
  },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user } = useAuth();
  const role = user?.role ?? '';

  const filteredGroups = groups
    .filter((g) => !g.roles || g.roles.includes(role))
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => !item.roles || item.roles.includes(role)),
    }));

  return (
    <>
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

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-bg-secondary transition-transform duration-200 md:z-30 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
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

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {filteredGroups.map((group) => (
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
                      {item.icon}
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
