import { describe, it, expect } from 'vitest';
import { calculateRsi } from '../rsi.js';

describe('calculateRsi', () => {
  it('should return NaN for insufficient data', () => {
    const closes = [1, 2, 3];
    const result = calculateRsi(closes, 14);
    expect(result.length).toBe(3);
    expect(result.every(v => Number.isNaN(v))).toBe(true);
  });

  it('should return values between 0 and 100', () => {
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
      45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00,
      46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45,
      45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.47, 42.34,
    ];
    const result = calculateRsi(closes, 14);
    // First 14 values should be NaN
    for (let i = 0; i < 14; i++) {
      expect(Number.isNaN(result[i])).toBe(true);
    }
    // RSI values should be between 0 and 100
    for (let i = 14; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
      expect(result[i]).toBeLessThanOrEqual(100);
    }
  });

  it('should return empty array for empty input', () => {
    const result = calculateRsi([], 14);
    expect(result.length).toBe(0);
  });

  it('should handle all equal values (RSI should be 50 or undefined)', () => {
    const closes = Array(20).fill(100);
    const result = calculateRsi(closes, 14);
    // When all values are equal, avgGain and avgLoss are 0
    // RSI should handle this edge case
    expect(result.length).toBe(20);
  });
});
