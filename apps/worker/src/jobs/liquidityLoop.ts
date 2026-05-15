import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import { calculateLiquidityHealth } from '@cryptorsi/liquidity';
import type { LiquidityInput } from '@cryptorsi/liquidity';
import { prisma } from '../db.js';
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'] as const;

type BinanceEnv = 'demo' | 'testnet' | 'production';

function getBaseUrl(): string {
  const env = (process.env.BINANCE_ENV ?? 'demo') as BinanceEnv;
  return BINANCE_ENVIRONMENTS[env].restBaseUrl;
}

async function collectAndSave(symbol: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const startAll = Date.now();

  const [bookTickerRes, depthRes, ticker24hRes, aggTradesRes, klinesRes] = await Promise.all([
    fetch(`${baseUrl}/api/v3/ticker/bookTicker?symbol=${symbol}`),
    fetch(`${baseUrl}/api/v3/depth?symbol=${symbol}&limit=20`),
    fetch(`${baseUrl}/api/v3/ticker/24hr?symbol=${symbol}`),
    fetch(`${baseUrl}/api/v3/aggTrades?symbol=${symbol}&limit=50`),
    fetch(`${baseUrl}/api/v3/klines?symbol=${symbol}&interval=1m&limit=60`),
  ]);

  const latencyMs = Date.now() - startAll;

  const bookTicker = (await bookTickerRes.json()) as {
    bidPrice: string; bidQty: string; askPrice: string; askQty: string;
  };
  const depth = (await depthRes.json()) as { bids: string[][]; asks: string[][] };
  const ticker24h = (await ticker24hRes.json()) as { quoteVolume: string; count: number };
  const aggTrades = (await aggTradesRes.json()) as Array<{ a: number; p: string; q: string; T: number }>;
  const klines = (await klinesRes.json()) as (string | number)[][];

  const bestBid = parseFloat(bookTicker.bidPrice);
  const bestAsk = parseFloat(bookTicker.askPrice);

  const asks = depth.asks.map((a) => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) }));
  const bids = depth.bids.map((b) => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) }));

  const now = Date.now();
  const recentTrades = aggTrades.filter((t) => t.T >= now - 60_000);
  const lastTradeTime = aggTrades.length > 0 ? aggTrades[aggTrades.length - 1]!.T : now;

  const input: LiquidityInput = {
    execution: { bestBid, bestAsk, asks, bids, side: 'BUY', quoteAmount: 100 },
    activity: {
      quoteVolume24h: parseFloat(ticker24h.quoteVolume),
      tradesCount1m: recentTrades.length,
      timeSinceLastTradeMs: now - lastTradeTime,
      relativeVolume: null,
    },
    fragility: { closes1m: klines.map((k) => parseFloat(k[4] as string)) },
    apiLatencyMs: latencyMs,
  };

  const result = calculateLiquidityHealth(input);

  await prisma.liquiditySnapshot.create({
    data: {
      symbol,
      environment: process.env.BINANCE_ENV ?? 'demo',
      score: result.score,
      confidence: result.confidence,
      state: result.state,
      executionScore: result.execution.score,
      activityScore: result.activity.score,
      fragilityScore: result.fragility.score,
      spreadBps: result.execution.metrics['spreadBps'] ?? null,
      slippageBps: result.execution.metrics['slippageBps'] ?? null,
      depth25bpsQuote: result.execution.metrics['depth25bpsQuote'] ?? null,
      quoteVolume24h: result.activity.metrics['quoteVolume24h'] ?? null,
      volatility1h: result.fragility.metrics['realizedVolatility'] ?? null,
      apiLatencyMs: latencyMs,
      reasons: result.reasons as any,
    },
  });

  if (result.state === 'weak' || result.state === 'critical') {
    console.warn(`[LIQUIDITY] ${symbol}: ${result.state} (${result.score}) — ${result.reasons.join(', ')}`);
  }
}

export async function liquidityLoop(): Promise<void> {
  for (const symbol of SYMBOLS) {
    try {
      await collectAndSave(symbol);
    } catch (err) {
      console.error(`[LIQUIDITY] Error collecting ${symbol}:`, err);
    }
  }
}
