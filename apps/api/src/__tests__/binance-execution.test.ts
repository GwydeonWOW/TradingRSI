import { describe, it, expect } from 'vitest';
import { processOrderResponse, adjustQuantity } from '../domain/execution/binance.js';
import type { BinanceOrderResponse } from '../domain/execution/binance.js';

describe('processOrderResponse', () => {
  it('should process a FILLED BUY order response', () => {
    const response: BinanceOrderResponse = {
      symbol: 'BTCUSDT',
      orderId: 28,
      clientOrderId: 'cryptorsi_test_123',
      transactTime: 1507725176595,
      price: '0.00000000',
      origQty: '0.00038000',
      executedQty: '0.00038000',
      cummulativeQuoteQty: '25.00000000',
      status: 'FILLED',
      timeInForce: 'GTC',
      type: 'MARKET',
      side: 'BUY',
      fills: [
        {
          price: '65789.00000000',
          qty: '0.00038000',
          commission: '0.00000038',
          commissionAsset: 'BNB',
          tradeId: 5633596,
        },
      ],
    };

    const result = processOrderResponse(response);

    expect(result.status).toBe('FILLED');
    expect(result.executedQty).toBe(0.00038);
    expect(result.cumulativeQuoteQty).toBe(25);
    expect(result.avgPrice).toBeCloseTo(65789, 0);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0]!.tradeId).toBe('5633596');
    expect(result.fills[0]!.price).toBe(65789);
    expect(result.fills[0]!.quantity).toBe(0.00038);
    expect(result.fills[0]!.commission).toBe(0.00000038);
    expect(result.fills[0]!.commissionAsset).toBe('BNB');
  });

  it('should process a SELL order with multiple fills', () => {
    const response: BinanceOrderResponse = {
      symbol: 'ETHUSDT',
      orderId: 29,
      clientOrderId: 'cryptorsi_sell_456',
      transactTime: 1507725200000,
      price: '0.00000000',
      origQty: '0.01000000',
      executedQty: '0.01000000',
      cummulativeQuoteQty: '35.00000000',
      status: 'FILLED',
      timeInForce: 'GTC',
      type: 'MARKET',
      side: 'SELL',
      fills: [
        {
          price: '3500.00000000',
          qty: '0.00500000',
          commission: '0.00000500',
          commissionAsset: 'ETH',
          tradeId: 100,
        },
        {
          price: '3500.00000000',
          qty: '0.00500000',
          commission: '0.00000500',
          commissionAsset: 'ETH',
          tradeId: 101,
        },
      ],
    };

    const result = processOrderResponse(response);

    expect(result.status).toBe('FILLED');
    expect(result.executedQty).toBe(0.01);
    expect(result.cumulativeQuoteQty).toBe(35);
    expect(result.fills).toHaveLength(2);
    expect(result.fills[0]!.quoteQuantity).toBe(17.5);
    expect(result.fills[1]!.quoteQuantity).toBe(17.5);
  });

  it('should handle empty fills array', () => {
    const response: BinanceOrderResponse = {
      symbol: 'BTCUSDT',
      orderId: 30,
      clientOrderId: 'cryptorsi_test_789',
      transactTime: Date.now(),
      price: '0.00000000',
      origQty: '0.00000000',
      executedQty: '0.00000000',
      cummulativeQuoteQty: '0.00000000',
      status: 'NEW',
      timeInForce: 'GTC',
      type: 'MARKET',
      side: 'BUY',
      fills: [],
    };

    const result = processOrderResponse(response);

    expect(result.status).toBe('NEW');
    expect(result.executedQty).toBe(0);
    expect(result.cumulativeQuoteQty).toBe(0);
    expect(result.avgPrice).toBe(0);
    expect(result.fills).toHaveLength(0);
  });
});

describe('adjustQuantity', () => {
  it('should adjust quantity to stepSize', () => {
    expect(adjustQuantity(0.00123456, 0.00001)).toBe(0.00123);
  });

  it('should handle integer stepSize', () => {
    expect(adjustQuantity(1.5, 1)).toBe(1);
  });

  it('should handle small stepSize', () => {
    expect(adjustQuantity(0.00038500, 0.00001)).toBe(0.00038);
  });

  it('should return quantity if stepSize is 0', () => {
    expect(adjustQuantity(1.5, 0)).toBe(1.5);
  });

  it('should handle exact multiples', () => {
    expect(adjustQuantity(0.01, 0.01)).toBe(0.01);
  });
});
