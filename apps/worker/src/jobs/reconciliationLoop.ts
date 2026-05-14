import crypto from 'node:crypto';
import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import type { ExchangeEnvironment } from '@cryptorsi/shared';
import { prisma } from '../db.js';

import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
  level: process.env.LOG_LEVEL ?? 'info',
});

// ---------------------------------------------------------------------------
// Signed-request helpers
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

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

interface BinanceOpenOrder {
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
}

export async function reconciliationLoop(): Promise<void> {
  const env = (process.env.BINANCE_ENV ?? 'demo') as ExchangeEnvironment;
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;

  if (!apiKey || !apiSecret) {
    logger.warn('Binance credentials not configured, skipping reconciliation');
    return;
  }

  const config = BINANCE_ENVIRONMENTS[env];
  if (!config) {
    logger.error({ env }, 'Unknown Binance environment');
    return;
  }

  logger.info({ env }, 'Starting reconciliation loop');

  try {
    // 1. Fetch open orders from Binance
    const binanceOrdersRaw = await signedGet(
      config.restBaseUrl,
      '/v3/openOrders',
      {},
      apiKey,
      apiSecret,
    ) as BinanceOpenOrder[];

    // 2. Fetch local ExchangeOrder records with open statuses
    const localOrders: Array<{
      id: string;
      clientOrderId: string | null;
      exchangeOrderId: string | null;
      status: string;
      symbol: string;
    }> = await prisma.exchangeOrder.findMany({
      where: {
        status: { in: ['NEW', 'PARTIALLY_FILLED'] },
      },
    });

    const divergences: Array<{
      localOrderId: string;
      localStatus: string;
      binanceStatus: string;
      action: string;
      clientOrderId?: string;
      symbol: string;
    }> = [];

    // 3. Check local orders against Binance
    for (const localOrder of localOrders) {
      const binanceMatch = binanceOrdersRaw.find(
        (bo) => bo.clientOrderId === localOrder.clientOrderId
          || bo.orderId.toString() === localOrder.exchangeOrderId,
      );

      if (!binanceMatch) {
        // Order not in Binance open orders -- it was filled, canceled, or expired
        divergences.push({
          localOrderId: localOrder.id,
          localStatus: localOrder.status,
          binanceStatus: 'NOT_FOUND (likely FILLED or CANCELED)',
          action: 'Local order not found in Binance open orders -- status may need update',
          clientOrderId: localOrder.clientOrderId ?? undefined,
          symbol: localOrder.symbol,
        });

        // Update local status to reflect it is no longer open on Binance
        await prisma.exchangeOrder.update({
          where: { id: localOrder.id },
          data: { status: 'EXPIRED' },
        });

        // Create audit event
        await prisma.auditEvent.create({
          data: {
            actorType: 'system',
            eventType: 'reconciliation_auto_fix',
            entityType: 'order',
            entityId: localOrder.id,
            payload: {
              localStatus: localOrder.status,
              binanceStatus: 'NOT_FOUND',
              symbol: localOrder.symbol,
              clientOrderId: localOrder.clientOrderId,
              fix: 'Updated local status to EXPIRED',
            },
          },
        });
      } else if (binanceMatch.status !== localOrder.status) {
        divergences.push({
          localOrderId: localOrder.id,
          localStatus: localOrder.status,
          binanceStatus: binanceMatch.status,
          action: 'Status mismatch detected',
          clientOrderId: localOrder.clientOrderId ?? undefined,
          symbol: localOrder.symbol,
        });

        // Fix local status to match Binance
        await prisma.exchangeOrder.update({
          where: { id: localOrder.id },
          data: { status: binanceMatch.status },
        });

        await prisma.auditEvent.create({
          data: {
            actorType: 'system',
            eventType: 'reconciliation_status_fix',
            entityType: 'order',
            entityId: localOrder.id,
            payload: {
              localStatus: localOrder.status,
              binanceStatus: binanceMatch.status,
              symbol: localOrder.symbol,
              fix: `Updated local status from ${localOrder.status} to ${binanceMatch.status}`,
            },
          },
        });
      }
    }

    // 4. Check for Binance orders not tracked locally
    for (const binanceOrder of binanceOrdersRaw) {
      const localMatch = localOrders.find(
        (lo) => lo.clientOrderId === binanceOrder.clientOrderId
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

        await prisma.auditEvent.create({
          data: {
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
          },
        });
      }
    }

    // 5. Fetch account balances for verification
    const account = await signedGet(
      config.restBaseUrl,
      '/v3/account',
      {},
      apiKey,
      apiSecret,
    ) as {
      balances: Array<{ asset: string; free: string; locked: string }>;
    };

    const nonZeroBalances = account.balances.filter(
      (b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0,
    );

    // Create summary audit event
    await prisma.auditEvent.create({
      data: {
        actorType: 'system',
        eventType: 'reconciliation_complete',
        entityType: 'account',
        payload: {
          environment: env,
          localOrdersCount: localOrders.length,
          binanceOpenOrdersCount: binanceOrdersRaw.length,
          divergencesCount: divergences.length,
          balancesCount: nonZeroBalances.length,
          balances: nonZeroBalances,
        },
      },
    });

    logger.info({
      env,
      localOrders: localOrders.length,
      binanceOpenOrders: binanceOrdersRaw.length,
      divergences: divergences.length,
      balances: nonZeroBalances.length,
    }, 'Reconciliation complete');
  } catch (err) {
    logger.error({ err }, 'Reconciliation loop failed');
  }
}
