// Hard guards that BLOCK production trading unless ALL conditions are met

export interface LiveTradingChecklist {
  allowLiveTradingEnvSet: boolean;    // ALLOW_LIVE_TRADING=true in .env
  strategyApprovedForLive: boolean;    // Strategy explicitly approved
  riskLimitsConfigured: boolean;       // Live-specific risk limits exist
  reconciliationActive: boolean;       // Reconciliation has run recently
  testOrdersPassed: boolean;           // At least one test order validated
  auditLogHealthy: boolean;            // Audit events are being written
  binanceConnected: boolean;           // Can reach Binance API
  credentialsValid: boolean;           // API keys work for account endpoint
}

export function checkLiveReadiness(checklist: LiveTradingChecklist): {
  allowed: boolean;
  missing: string[];
  checks: LiveTradingChecklist;
} {
  const missing: string[] = [];

  if (!checklist.allowLiveTradingEnvSet) missing.push('ALLOW_LIVE_TRADING env var is not set to true');
  if (!checklist.strategyApprovedForLive) missing.push('No strategy has been approved for live trading');
  if (!checklist.riskLimitsConfigured) missing.push('Live-specific risk limits are not configured');
  if (!checklist.reconciliationActive) missing.push('Reconciliation has not run recently');
  if (!checklist.testOrdersPassed) missing.push('No test orders have been validated');
  if (!checklist.auditLogHealthy) missing.push('Audit log is not healthy');
  if (!checklist.binanceConnected) missing.push('Cannot reach Binance API');
  if (!checklist.credentialsValid) missing.push('API keys do not work for account endpoint');

  return {
    allowed: missing.length === 0,
    missing,
    checks: checklist,
  };
}

/**
 * Throws if environment is production and ALLOW_LIVE_TRADING !== 'true'.
 * This is a hard guard that prevents any live trading without explicit opt-in.
 */
export function assertLiveGuard(environment: string): void {
  if (isLiveEnvironment(environment) && process.env.ALLOW_LIVE_TRADING !== 'true') {
    throw new Error(
      `Live trading is BLOCKED for environment "${environment}". ` +
      `Set ALLOW_LIVE_TRADING=true to enable.`,
    );
  }
}

/**
 * Returns true if this environment represents live/real-money trading.
 */
export function isLiveEnvironment(environment: string): boolean {
  return environment === 'production';
}

/**
 * Check if a strategy can be promoted to live trading.
 */
export function canPromoteToLive(strategy: {
  status: string;
  mode: string;
  environment: string;
  hasDemoHistory: boolean;
  backtestResults: { winRate: number; maxDrawdown: number } | null;
}): { allowed: boolean; reason?: string } {
  if (strategy.status !== 'active') {
    return { allowed: false, reason: `Strategy status is "${strategy.status}", must be "active"` };
  }

  if (strategy.mode !== 'binance_demo') {
    return { allowed: false, reason: `Strategy mode is "${strategy.mode}", must have demo history (binance_demo)` };
  }

  if (strategy.environment !== 'demo') {
    return { allowed: false, reason: `Strategy environment is "${strategy.environment}", must be "demo"` };
  }

  if (!strategy.hasDemoHistory) {
    return { allowed: false, reason: 'Strategy has no demo trading history' };
  }

  if (!strategy.backtestResults) {
    return { allowed: false, reason: 'Strategy has no backtest results' };
  }

  if (strategy.backtestResults.winRate < 50) {
    return { allowed: false, reason: `Win rate ${strategy.backtestResults.winRate.toFixed(1)}% is below 50% threshold` };
  }

  if (strategy.backtestResults.maxDrawdown > 20) {
    return { allowed: false, reason: `Max drawdown ${strategy.backtestResults.maxDrawdown.toFixed(1)}% exceeds 20% threshold` };
  }

  return { allowed: true };
}
