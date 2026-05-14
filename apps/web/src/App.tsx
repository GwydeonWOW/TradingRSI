import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { BotPage } from './pages/BotPage.tsx';
import { StrategiesPage } from './pages/StrategiesPage.tsx';
import { OrdersPage } from './pages/OrdersPage.tsx';
import { PositionsPage } from './pages/PositionsPage.tsx';
import { SignalsPage } from './pages/SignalsPage.tsx';
import { MarketPage } from './pages/MarketPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { AuditPage } from './pages/AuditPage.tsx';
import { BacktestsPage } from './pages/BacktestsPage.tsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/bot" element={<BotPage />} />
        <Route path="/strategies" element={<StrategiesPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/positions" element={<PositionsPage />} />
        <Route path="/signals" element={<SignalsPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/backtests" element={<BacktestsPage />} />
      </Route>
    </Routes>
  );
}
