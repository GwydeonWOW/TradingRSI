import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Topbar } from './Topbar.tsx';
import { Sidebar } from './Sidebar.tsx';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <Topbar onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area: offset by sidebar on desktop, full width on mobile */}
      <main className="pt-14 md:pl-64">
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
