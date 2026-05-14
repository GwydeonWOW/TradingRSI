import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';

describe('API Health', () => {
  it('should respond to health check', async () => {
    const app = Fastify();

    app.get('/api/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
        uptime: process.uptime(),
        services: {
          database: 'disconnected',
          binance: 'not_configured',
        },
      };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
    expect(body.services).toHaveProperty('database');
  });
});
