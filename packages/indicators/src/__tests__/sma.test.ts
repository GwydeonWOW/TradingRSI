import { describe, it, expect } from 'vitest';
import { calculateSma } from '../sma.js';

describe('calculateSma', () => {
  it('should calculate SMA correctly', () => {
    const values = [1, 2, 3, 4, 5];
    const result = calculateSma(values, 3);
    expect(Number.isNaN(result[0])).toBe(true);
    expect(Number.isNaN(result[1])).toBe(true);
    expect(result[2]).toBeCloseTo(2);
    expect(result[3]).toBeCloseTo(3);
    expect(result[4]).toBeCloseTo(4);
  });

  it('should return empty array for empty input', () => {
    const result = calculateSma([], 3);
    expect(result.length).toBe(0);
  });

  it('should handle period equal to array length', () => {
    const values = [10, 20, 30];
    const result = calculateSma(values, 3);
    expect(Number.isNaN(result[0])).toBe(true);
    expect(Number.isNaN(result[1])).toBe(true);
    expect(result[2]).toBeCloseTo(20);
  });

  it('should handle period of 1', () => {
    const values = [5, 10, 15];
    const result = calculateSma(values, 1);
    expect(result).toEqual([5, 10, 15]);
  });
});
