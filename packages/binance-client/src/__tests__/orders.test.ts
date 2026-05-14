import { describe, it, expect } from 'vitest';
import { adjustQuantityToLotSize, validateOrder, generateClientOrderId, getStepSizePrecision } from '../orders.js';
import type { ExchangeSymbolInfo } from '../orders.js';

describe('adjustQuantityToLotSize', () => {
  it('should adjust quantity to step size', () => {
    expect(adjustQuantityToLotSize(0.00123, 0.001, 3)).toBe('0.001');
    expect(adjustQuantityToLotSize(0.00199, 0.001, 3)).toBe('0.001');
    expect(adjustQuantityToLotSize(0.002, 0.001, 3)).toBe('0.002');
  });
});

describe('getStepSizePrecision', () => {
  it('should return correct decimal precision', () => {
    expect(getStepSizePrecision('0.00100000')).toBe(3);
    expect(getStepSizePrecision('0.01000000')).toBe(2);
    expect(getStepSizePrecision('1.00000000')).toBe(0);
    expect(getStepSizePrecision('0.00001000')).toBe(5);
  });
});

describe('validateOrder', () => {
  const symbolInfo: ExchangeSymbolInfo = {
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    status: 'TRADING',
    filters: [
      { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '100', stepSize: '0.001' },
      { filterType: 'MIN_NOTIONAL', minNotional: '10', applyToMarket: true },
      { filterType: 'PRICE_FILTER', minPrice: '0.01', maxPrice: '1000000', tickSize: '0.01' },
    ],
  };

  it('should validate a valid BUY with quoteOrderQty', () => {
    const result = validateOrder(symbolInfo, { side: 'BUY', type: 'MARKET', quoteOrderQty: 25 });
    expect(result.valid).toBe(true);
  });

  it('should reject BUY below MIN_NOTIONAL', () => {
    const result = validateOrder(symbolInfo, { side: 'BUY', type: 'MARKET', quoteOrderQty: 5 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('minimum notional');
  });

  it('should reject SELL quantity below LOT_SIZE min', () => {
    const result = validateOrder(symbolInfo, { side: 'SELL', type: 'MARKET', quantity: 0.0001 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('below minimum');
  });

  it('should reject SELL quantity above LOT_SIZE max', () => {
    const result = validateOrder(symbolInfo, { side: 'SELL', type: 'MARKET', quantity: 200 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('exceeds maximum');
  });

  it('should reject for non-TRADING symbol', () => {
    const halted = { ...symbolInfo, status: 'HALT' };
    const result = validateOrder(halted, { side: 'BUY', type: 'MARKET', quoteOrderQty: 25 });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('HALT');
  });

  it('should provide adjustedQuantity when needed', () => {
    const result = validateOrder(symbolInfo, { side: 'SELL', type: 'MARKET', quantity: 0.0015 });
    expect(result.adjustedQuantity).toBeDefined();
  });
});

describe('generateClientOrderId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateClientOrderId('buy');
    const id2 = generateClientOrderId('sell');
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^cryptorsi_buy_/);
    expect(id2).toMatch(/^cryptorsi_sell_/);
  });
});
