import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { AppShell } from './components/AppShell.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { BotPage } from './pages/BotPage.tsx';
import { StrategiesPage } from './pages/StrategiesPage.tsx';
import { StrategyDetailPage } from './pages/StrategyDetailPage.tsx';
import { StrategyEditorPage } from './pages/StrategyEditorPage.tsx';
import { NewStrategyPage } from './pages/NewStrategyPage.tsx';
import { OrdersPage } from './pages/OrdersPage.tsx';
import { PositionsPage } from './pages/PositionsPage.tsx';
import { SignalsPage } from './pages/SignalsPage.tsx';
import { MarketPage } from './pages/MarketPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { LiveReadinessPage } from './pages/LiveReadinessPage.tsx';
import { AuditPage } from './pages/AuditPage.tsx';
import { BacktestsPage } from './pages/BacktestsPage.tsx';
import { LiquidityPage } from './pages/LiquidityPage.tsx';
import { VersionComparePage } from './pages/VersionComparePage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { TwoFactorPage } from './pages/TwoFactorPage.tsx';
import { UsersPage } from './pages/UsersPage.tsx';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <p className="text-text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/bot" element={<BotPage />} />
        <Route path="/strategies" element={<StrategiesPage />} />
        <Route path="/strategies/new" element={<NewStrategyPage />} />
        <Route path="/strategies/:id" element={<StrategyDetailPage />} />
        <Route path="/strategies/:id/editor" element={<StrategyEditorPage />} />
        <Route path="/strategies/:id/versions/compare" element={<VersionComparePage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/positions" element={<PositionsPage />} />
        <Route path="/signals" element={<SignalsPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/2fa" element={<TwoFactorPage />} />
        <Route path="/settings/live-readiness" element={<LiveReadinessPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/liquidity" element={<LiquidityPage />} />
        <Route path="/backtests" element={<BacktestsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
