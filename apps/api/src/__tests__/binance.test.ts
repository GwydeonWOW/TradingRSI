import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// Mock fetch for Binance API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock prisma
vi.mock('../infrastructure/db/prisma.js', () => ({
  prisma: {
    auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit1' }) },
    exchangeCredential: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

// Mock encryption
vi.mock('../infrastructure/encryption/index.js', () => ({
  encrypt: vi.fn().mockReturnValue({ ciphertext: 'enc', nonce: 'nonce', tag: 'tag' }),
  decrypt: vi.fn().mockReturnValue('decrypted'),
}));

import { binanceRoutes } from '../modules/binance/routes.js';

describe('Binance API', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  function buildApp() {
    const app = Fastify();
    app.register(binanceRoutes);
    return app;
  }

  it('should return binance status', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/binance/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveProperty('environment');
    expect(body.data).toHaveProperty('connected');
    expect(body.data).toHaveProperty('configured');
  });

  it('should return error for account without credentials', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/binance/account' });
    expect(res.json().success).toBe(false);
  });

  it('should validate required fields for test-order', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/binance/test-order',
      payload: {},
    });
    expect(res.json().success).toBe(false);
  });

  it('should validate required fields for klines', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/binance/klines',
    });
    expect(res.json().success).toBe(false);
  });

  it('should fetch klines with valid params', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        [0, '100', '110', '90', '105', '1000', 1],
      ]),
    });
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/binance/klines?symbol=BTCUSDT&interval=1h',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().data).toHaveLength(1);
    expect(res.json().data[0]).toEqual({
      openTime: 0,
      open: '100',
      high: '110',
      low: '90',
      close: '105',
      volume: '1000',
      closeTime: 1,
    });
  });
});
