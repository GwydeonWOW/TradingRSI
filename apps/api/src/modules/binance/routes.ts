import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createAuditEvent } from '../audit/helpers.js';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import { logger } from '../../infrastructure/logger/index.js';
import { prisma } from '../../infrastructure/db/prisma.js';
import { fetchOpenOrders } from '../../domain/execution/binance.js';

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
      // Fetch account balances
      const account = await signedGet(getBaseUrl(), '/v3/account', {}, creds.apiKey, creds.apiSecret) as {
        balances: Array<{ asset: string; free: string; locked: string }>;
      };

      const nonZeroBalances = account.balances.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);

      // Fetch open orders from Binance
      const binanceOpenOrdersRaw = await fetchOpenOrders(getBaseUrl(), creds.apiKey, creds.apiSecret) as unknown as Array<{
        symbol: string;
        orderId: number;
        clientOrderId: string;
        side: string;
        type: string;
        status: string;
        executedQty: string;
        origQty: string;
        price: string;
        time: number;
        updateTime: number;
      }>;

      // Fetch local DB orders that might be open
      const localOrders = await prisma.exchangeOrder.findMany({
        where: {
          status: { in: ['NEW', 'PARTIALLY_FILLED'] },
        },
        include: { fills: true },
      });

      const divergences: Array<{
        localOrderId: string;
        localStatus: string;
        binanceStatus: string;
        action: string;
        clientOrderId?: string;
        symbol: string;
      }> = [];

      // Check local orders against Binance
      for (const localOrder of localOrders) {
        const binanceMatch = binanceOpenOrdersRaw.find(
          (bo) => bo.clientOrderId === localOrder.clientOrderId
            || bo.orderId.toString() === localOrder.exchangeOrderId,
        );

        if (!binanceMatch) {
          // Order not in Binance open orders — it was filled, canceled, or expired
          divergences.push({
            localOrderId: localOrder.id,
            localStatus: localOrder.status,
            binanceStatus: 'NOT_FOUND (likely FILLED or CANCELED)',
            action: 'Local order not found in Binance open orders — status may need update',
            clientOrderId: localOrder.clientOrderId ?? undefined,
            symbol: localOrder.symbol,
          });

          // Log as audit event
          await createAuditEvent({
            actorType: 'system',
            eventType: 'reconciliation_divergence',
            entityType: 'order',
            entityId: localOrder.id,
            payload: {
              localStatus: localOrder.status,
              binanceStatus: 'NOT_FOUND',
              symbol: localOrder.symbol,
              clientOrderId: localOrder.clientOrderId,
            },
          });
        } else if (binanceMatch.status !== localOrder.status) {
          // Status mismatch
          divergences.push({
            localOrderId: localOrder.id,
            localStatus: localOrder.status,
            binanceStatus: binanceMatch.status,
            action: 'Status mismatch detected',
            clientOrderId: localOrder.clientOrderId ?? undefined,
            symbol: localOrder.symbol,
          });

          await createAuditEvent({
            actorType: 'system',
            eventType: 'reconciliation_status_mismatch',
            entityType: 'order',
            entityId: localOrder.id,
            payload: {
              localStatus: localOrder.status,
              binanceStatus: binanceMatch.status,
              symbol: localOrder.symbol,
              clientOrderId: localOrder.clientOrderId,
            },
          });
        }
      }

      // Check for Binance orders not tracked locally
      for (const binanceOrder of binanceOpenOrdersRaw) {
        const localMatch = localOrders.find(
          (lo: { clientOrderId: string | null; exchangeOrderId: string | null }) =>
            lo.clientOrderId === binanceOrder.clientOrderId
            || lo.exchangeOrderId === binanceOrder.orderId.toString(),
        );

        if (!localMatch) {
          divergences.push({
            localOrderId: 'NONE',
            localStatus: 'NOT_TRACKED',
            binanceStatus: binanceOrder.status,
            action: 'Binance order not tracked in local DB',
            clientOrderId: binanceOrder.clientOrderId,
            symbol: binanceOrder.symbol,
          });

          await createAuditEvent({
            actorType: 'system',
            eventType: 'reconciliation_untracked_order',
            entityType: 'order',
            payload: {
              binanceOrderId: binanceOrder.orderId,
              clientOrderId: binanceOrder.clientOrderId,
              symbol: binanceOrder.symbol,
              side: binanceOrder.side,
              status: binanceOrder.status,
            },
          });
        }
      }

      await createAuditEvent({
        actorType: 'system',
        eventType: 'reconciliation',
        entityType: 'account',
        payload: {
          balances: nonZeroBalances,
          environment: env,
          localOrdersCount: localOrders.length,
          binanceOpenOrdersCount: binanceOpenOrdersRaw.length,
          divergencesCount: divergences.length,
        },
      });

      return {
        success: true,
        data: {
          message: 'Reconciliation complete',
          balances: nonZeroBalances,
          environment: env,
          binanceOpenOrders: binanceOpenOrdersRaw.length,
          localTrackedOrders: localOrders.length,
          divergences,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reconciliation failed';
      return { success: false, error: { code: 'RECONCILE_FAILED', message } };
    }
  });

  // GET /api/binance/open-orders
  app.get('/api/binance/open-orders', async (request) => {
    const creds = getCredentials();
    if (!creds) {
      return { success: false, error: { code: 'NOT_CONFIGURED', message: 'Binance API credentials not configured' } };
    }

    const query = request.query as { symbol?: string };
    const params: Record<string, string> = {};
    if (query.symbol) params.symbol = query.symbol;

    try {
      const orders = await signedGet(getBaseUrl(), '/v3/openOrders', params, creds.apiKey, creds.apiSecret) as Array<{
        symbol: string;
        orderId: number;
        clientOrderId: string;
        side: string;
        type: string;
        status: string;
        price: string;
        origQty: string;
        executedQty: string;
        time: number;
        updateTime: number;
      }>;
      return { success: true, data: orders };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch open orders';
      return { success: false, error: { code: 'OPEN_ORDERS_FAILED', message } };
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
