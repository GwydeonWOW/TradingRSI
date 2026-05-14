import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createAuditEvent } from '../audit/helpers.js';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import { logger } from '../../infrastructure/logger/index.js';

// ---------------------------------------------------------------------------
// Minimal inline signed-request helpers (avoids needing @cryptorsi/binance-client
// as a direct dependency of the api package).
// ---------------------------------------------------------------------------

function signQueryString(queryString: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

function buildSignedQuery(params: Record<string, string>, secret: string): string {
  const allParams = {
    ...params,
    timestamp: Date.now().toString(),
    recvWindow: '5000',
  };
  const qs = new URLSearchParams(allParams).toString();
  const signature = signQueryString(qs, secret);
  return `${qs}&signature=${signature}`;
}

async function signedGet(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string,
): Promise<unknown> {
  const qs = buildSignedQuery(params, apiSecret);
  const url = `${baseUrl}${path}?${qs}`;
  const response = await fetch(url, {
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Binance API error ${response.status}: ${body}`);
  }
  return response.json();
}

async function signedPost(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string,
): Promise<unknown> {
  const qs = buildSignedQuery(params, apiSecret);
  const url = `${baseUrl}${path}?${qs}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Binance API error ${response.status}: ${body}`);
  }
  return response.json();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

type BinanceEnv = 'demo' | 'testnet' | 'production';

function getEnv(): BinanceEnv {
  return (process.env.BINANCE_ENV ?? 'demo') as BinanceEnv;
}

function getBaseUrl(): string {
  return BINANCE_ENVIRONMENTS[getEnv()].restBaseUrl;
}

function getCredentials(): { apiKey: string; apiSecret: string } | null {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

export async function binanceRoutes(app: FastifyInstance) {
  // GET /api/binance/status
  app.get('/api/binance/status', async () => {
    const env = getEnv();
    const hasApiKey = !!process.env.BINANCE_API_KEY;
    const hasApiSecret = !!process.env.BINANCE_API_SECRET;

    let connected = false;
    let latency = 0;
    try {
      const start = Date.now();
      const response = await fetch(`${getBaseUrl()}/v3/ping`);
      connected = response.ok;
      latency = Date.now() - start;
    } catch {
      connected = false;
    }

    return {
      success: true,
      data: {
        environment: env,
        configured: hasApiKey && hasApiSecret,
        connected,
        latency: connected ? latency : null,
        endpoints: BINANCE_ENVIRONMENTS[env],
      },
    };
  });

  // GET /api/binance/account
  app.get('/api/binance/account', async () => {
    const creds = getCredentials();
    if (!creds) {
      return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Binance API credentials not configured' } };
    }

    try {
      const account = await signedGet(getBaseUrl(), '/v3/account', {}, creds.apiKey, creds.apiSecret) as {
        balances: Array<{ asset: string; free: string; locked: string }>;
      };
      return { success: true, data: account };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch account';
      logger.error({ err }, 'Failed to fetch Binance account');
      return { success: false, error: { code: 'BINANCE_ERROR', message } };
    }
  });

  // POST /api/binance/test-order
  app.post('/api/binance/test-order', async (request) => {
    const creds = getCredentials();
    if (!creds) {
      return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Binance API credentials not configured' } };
    }

    const body = request.body as {
      symbol?: string;
      side?: string;
      type?: string;
      quoteOrderQty?: string;
      quantity?: string;
    };

    if (!body.symbol || !body.side || !body.type) {
      return { success: false, error: { code: 'VALIDATION', message: 'symbol, side, type are required' } };
    }

    try {
      const params: Record<string, string> = {
        symbol: body.symbol,
        side: body.side,
        type: body.type,
        newClientOrderId: `cryptorsi_test_${Date.now()}`,
      };
      if (body.quoteOrderQty) params.quoteOrderQty = body.quoteOrderQty;
      if (body.quantity) params.quantity = body.quantity;

      await signedPost(getBaseUrl(), '/v3/order/test', params, creds.apiKey, creds.apiSecret);

      await createAuditEvent({
        actorType: 'user',
        eventType: 'order_test',
        entityType: 'order',
        payload: { symbol: body.symbol, side: body.side, type: body.type },
      });

      return { success: true, data: { message: 'Order validation passed' } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Order test failed';
      logger.error({ err }, 'Binance order test failed');
      return { success: false, error: { code: 'ORDER_TEST_FAILED', message } };
    }
  });

  // POST /api/binance/reconcile
  app.post('/api/binance/reconcile', async () => {
    const creds = getCredentials();
    if (!creds) {
      return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Binance API credentials not configured' } };
    }

    const env = getEnv();

    try {
      const account = await signedGet(getBaseUrl(), '/v3/account', {}, creds.apiKey, creds.apiSecret) as {
        balances: Array<{ asset: string; free: string; locked: string }>;
      };

      const nonZeroBalances = account.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);

      await createAuditEvent({
        actorType: 'system',
        eventType: 'reconciliation',
        entityType: 'account',
        payload: { balances: nonZeroBalances, environment: env },
      });

      return {
        success: true,
        data: {
          message: 'Reconciliation complete',
          balances: nonZeroBalances,
          environment: env,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reconciliation failed';
      return { success: false, error: { code: 'RECONCILE_FAILED', message } };
    }
  });

  // GET /api/binance/klines
  app.get('/api/binance/klines', async (request) => {
    const query = request.query as {
      symbol?: string;
      interval?: string;
      limit?: string;
    };

    if (!query.symbol || !query.interval) {
      return { success: false, error: { code: 'VALIDATION', message: 'symbol and interval are required' } };
    }

    try {
      const params = new URLSearchParams({
        symbol: query.symbol,
        interval: query.interval,
      });
      if (query.limit) params.set('limit', query.limit);

      const response = await fetch(`${getBaseUrl()}/v3/klines?${params}`);
      if (!response.ok) {
        throw new Error(`Binance API error: ${response.status}`);
      }

      const data = (await response.json()) as (string | number)[][];
      const klines = data.map(k => ({
        openTime: k[0] as number,
        open: k[1] as string,
        high: k[2] as string,
        low: k[3] as string,
        close: k[4] as string,
        volume: k[5] as string,
        closeTime: k[6] as number,
      }));

      return { success: true, data: klines };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch klines';
      return { success: false, error: { code: 'KLINES_FAILED', message } };
    }
  });
}
