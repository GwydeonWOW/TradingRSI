import { EnvironmentBadge } from './EnvironmentBadge.tsx';

interface TopbarProps {
  onToggleSidebar: () => void;
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center border-b border-border bg-bg-secondary px-4">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="mr-3 inline-flex items-center justify-center rounded p-1.5 text-text-secondary hover:bg-bg-hover hover:text-text-primary md:hidden"
        aria-label="Toggle sidebar"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      <span className="text-base font-semibold text-text-primary">CryptoRSI v2</span>

      <div className="ml-4 hidden sm:block">
        <EnvironmentBadge environment="SIMULATION" variant="neutral" />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-xs text-text-muted lg:inline">Bot: ---</span>
        <span className="hidden text-xs text-text-muted lg:inline">User: admin</span>
        <span className="hidden text-xs text-text-muted lg:inline">2FA: --</span>
      </div>
    </header>
  );
}
