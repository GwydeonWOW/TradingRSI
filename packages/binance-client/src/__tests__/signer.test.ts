import { describe, it, expect } from 'vitest';
import { signBinanceQuery, buildSignedQuery } from '../signer.js';
import crypto from 'node:crypto';

describe('signBinanceQuery', () => {
  it('should produce a valid HMAC-SHA256 hex digest', () => {
    const query = 'symbol=BTCUSDT&side=BUY&type=MARKET&quoteOrderQty=25';
    const secret = 'test_secret_key';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(query)
      .digest('hex');

    const result = signBinanceQuery(query, secret);
    expect(result).toBe(expected);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce different signatures for different queries', () => {
    const secret = 'test_secret_key';
    const sig1 = signBinanceQuery('query1=value1', secret);
    const sig2 = signBinanceQuery('query2=value2', secret);
    expect(sig1).not.toBe(sig2);
  });
});

describe('buildSignedQuery', () => {
  it('should include timestamp, recvWindow and signature', () => {
    const params = { symbol: 'BTCUSDT', side: 'BUY' };
    const secret = 'test_secret_key';
    const result = buildSignedQuery(params, secret);

    expect(result).toContain('timestamp=');
    expect(result).toContain('recvWindow=');
    expect(result).toContain('signature=');
    expect(result).toContain('symbol=BTCUSDT');
    expect(result).toContain('side=BUY');
  });

  it('should use custom recvWindow', () => {
    const params = { symbol: 'BTCUSDT' };
    const secret = 'test_secret_key';
    const result = buildSignedQuery(params, secret, { recvWindow: 10000 });

    expect(result).toContain('recvWindow=10000');
  });
});
