// Live trading has SEPARATE, stricter limits than demo

export interface LiveRiskLimits {
  maxPositionSizeUsdt: number;      // Hard max per position (e.g. 50 USDT)
  maxTotalExposureUsdt: number;     // Hard max total exposure (e.g. 200 USDT)
  maxDailyLossUsdt: number;         // Hard max daily loss (e.g. 20 USDT)
  maxOrdersPerDay: number;          // Hard max orders per day (e.g. 10)
  minTimeBetweenOrders: number;     // Min ms between orders (e.g. 60000)
  requireOrderTestBeforeLive: boolean; // MUST validate before live order
}

export const DEFAULT_LIVE_LIMITS: LiveRiskLimits = {
  maxPositionSizeUsdt: 50,
  maxTotalExposureUsdt: 200,
  maxDailyLossUsdt: 20,
  maxOrdersPerDay: 10,
  minTimeBetweenOrders: 60_000,
  requireOrderTestBeforeLive: true,
};

/**
 * Validate live risk limits. Returns an array of error messages.
 * Empty array means all limits are valid.
 */
export function validateLiveRiskLimits(limits: LiveRiskLimits): string[] {
  const errors: string[] = [];

  if (limits.maxPositionSizeUsdt <= 0) {
    errors.push('maxPositionSizeUsdt must be positive');
  }
  if (limits.maxPositionSizeUsdt > 100) {
    errors.push('maxPositionSizeUsdt exceeds safe maximum of 100 USDT');
  }
  if (limits.maxTotalExposureUsdt <= 0) {
    errors.push('maxTotalExposureUsdt must be positive');
  }
  if (limits.maxTotalExposureUsdt > 500) {
    errors.push('maxTotalExposureUsdt exceeds safe maximum of 500 USDT');
  }
  if (limits.maxTotalExposureUsdt < limits.maxPositionSizeUsdt) {
    errors.push('maxTotalExposureUsdt must be >= maxPositionSizeUsdt');
  }
  if (limits.maxDailyLossUsdt <= 0) {
    errors.push('maxDailyLossUsdt must be positive');
  }
  if (limits.maxDailyLossUsdt > 50) {
    errors.push('maxDailyLossUsdt exceeds safe maximum of 50 USDT');
  }
  if (limits.maxOrdersPerDay <= 0) {
    errors.push('maxOrdersPerDay must be positive');
  }
  if (limits.maxOrdersPerDay > 50) {
    errors.push('maxOrdersPerDay exceeds safe maximum of 50');
  }
  if (limits.minTimeBetweenOrders < 0) {
    errors.push('minTimeBetweenOrders must be non-negative');
  }
  if (limits.minTimeBetweenOrders < 30_000) {
    errors.push('minTimeBetweenOrders should be at least 30000ms (30 seconds)');
  }

  return errors;
}
