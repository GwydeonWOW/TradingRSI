import type { RiskResult, RiskCheck, StrategyConfig } from '@cryptorsi/shared';

export interface RiskContext {
  config: StrategyConfig;
  symbol: string;
  strategyStatus: string;
  strategyMode: string;
  environment: string;
  openPositionsCount: number;
  openPositionsBySymbol: number;
  totalExposure: number;
  dailyLoss: number;
  dailyLossPct: number;
  lastTradeTimestamp: number | null;
  allowLiveTrading: boolean;
}

/**
 * Evalua todas las reglas de riesgo antes de ejecutar una orden.
 */
export function evaluateRisk(ctx: RiskContext): RiskResult {
  const checks: RiskCheck[] = [];

  // Rule: Strategy must be active
  checks.push(check('strategy_active', ctx.strategyStatus === 'active',
    `Strategy status is ${ctx.strategyStatus}, must be active`));

  // Rule: Environment must match mode
  const envAllowed = isEnvironmentAllowed(ctx.strategyMode, ctx.environment);
  checks.push(check('environment_match', envAllowed,
    `Mode ${ctx.strategyMode} not allowed in environment ${ctx.environment}`));

  // Rule: Max open positions
  checks.push(check('max_open_positions', ctx.openPositionsCount < ctx.config.risk.maxOpenPositions,
    `Open positions ${ctx.openPositionsCount} >= max ${ctx.config.risk.maxOpenPositions}`));

  // Rule: Max positions per symbol
  checks.push(check('max_positions_per_symbol', ctx.openPositionsBySymbol < ctx.config.risk.maxPositionsPerSymbol,
    `Positions for ${ctx.symbol} (${ctx.openPositionsBySymbol}) >= max ${ctx.config.risk.maxPositionsPerSymbol}`));

  // Rule: Max total exposure
  checks.push(check('max_total_exposure', ctx.totalExposure + ctx.config.risk.quoteAmountPerTrade <= ctx.config.risk.maxTotalExposureQuote,
    `Total exposure ${ctx.totalExposure} + ${ctx.config.risk.quoteAmountPerTrade} > max ${ctx.config.risk.maxTotalExposureQuote}`));

  // Rule: Daily loss limit
  checks.push(check('daily_loss_limit', ctx.dailyLossPct < ctx.config.risk.maxDailyLossPct,
    `Daily loss ${ctx.dailyLossPct.toFixed(2)}% >= max ${ctx.config.risk.maxDailyLossPct}%`));

  // Rule: Cooldown
  const now = Date.now();
  const cooldownMs = ctx.config.risk.cooldownMinutes * 60 * 1000;
  const cooldownPassed = ctx.lastTradeTimestamp === null || (now - ctx.lastTradeTimestamp) >= cooldownMs;
  checks.push(check('cooldown_passed', cooldownPassed,
    `Cooldown not passed (${Math.round((now - (ctx.lastTradeTimestamp ?? 0)) / 60000)}min / ${ctx.config.risk.cooldownMinutes}min)`));

  // Rule: Live trading guard
  if (ctx.environment === 'production') {
    checks.push(check('live_trading_allowed', ctx.allowLiveTrading,
      'Live trading is disabled by hard guard'));
  }

  const failed = checks.find(c => !c.passed);
  if (failed) {
    return { allowed: false, reason: failed.reason ?? 'Risk check failed', checks };
  }
  return { allowed: true, checks };
}

function check(rule: string, passed: boolean, reason: string): RiskCheck {
  return passed ? { rule, passed } : { rule, passed, reason };
}

function isEnvironmentAllowed(mode: string, environment: string): boolean {
  if (mode === 'simulation') return true;
  if (mode === 'binance_demo' || mode === 'binance_demo_dry_run' || mode === 'binance_demo_live') return environment === 'demo';
  if (mode === 'binance_live' || mode === 'binance_live_dry_run') return environment === 'production';
  return false;
}
