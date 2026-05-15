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

function getFuturesBaseUrl(): string {
  const env = (process.env.BINANCE_ENV ?? 'demo') as BinanceEnv;
  if (env === 'production') return 'https://fapi.binance.com';
  if (env === 'testnet') return 'https://testnet.binancefuture.com';
  return 'https://demo-fapi.binance.com';
}

async function collectAndSave(symbol: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const futuresUrl = getFuturesBaseUrl();
  const startAll = Date.now();

  const [bookTickerRes, depthRes, ticker24hRes, aggTradesRes, klinesRes] = await Promise.all([
    fetch(`${baseUrl}/api/v3/ticker/bookTicker?symbol=${symbol}`),
    fetch(`${baseUrl}/api/v3/depth?symbol=${symbol}&limit=20`),
    fetch(`${baseUrl}/api/v3/ticker/24hr?symbol=${symbol}`),
    fetch(`${baseUrl}/api/v3/aggTrades?symbol=${symbol}&limit=50`),
    fetch(`${baseUrl}/api/v3/klines?symbol=${symbol}&interval=1m&limit=60`),
  ]);

  // Futures data (graceful fallback)
  const [premiumIndexRes, openInterestRes, longShortRes, takerBuySellRes] = await Promise.all([
    fetch(`${futuresUrl}/fapi/v1/premiumIndex?symbol=${symbol}`).catch(() => null),
    fetch(`${futuresUrl}/fapi/v1/openInterest?symbol=${symbol}`).catch(() => null),
    fetch(`${futuresUrl}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`).catch(() => null),
    fetch(`${futuresUrl}/futures/data/takerlongshortRatio?symbol=${symbol}&period=1h&limit=1`).catch(() => null),
  ]);

  const latencyMs = Date.now() - startAll;

  const bookTicker = (await bookTickerRes.json()) as {
    bidPrice: string; bidQty: string; askPrice: string; askQty: string;
  };
  const depth = (await depthRes.json()) as { bids: string[][]; asks: string[][] };
  const ticker24h = (await ticker24hRes.json()) as { quoteVolume: string; count: number };
  const aggTrades = (await aggTradesRes.json()) as Array<{ a: number; p: string; q: string; T: number; m?: boolean }>;
  const klines = (await klinesRes.json()) as (string | number)[][];

  const bestBid = parseFloat(bookTicker.bidPrice);
  const bestAsk = parseFloat(bookTicker.askPrice);

  const asks = depth.asks.map((a) => ({ price: parseFloat(a[0]!), qty: parseFloat(a[1]!) }));
  const bids = depth.bids.map((b) => ({ price: parseFloat(b[0]!), qty: parseFloat(b[1]!) }));

  const now = Date.now();
  const recentTrades = aggTrades.filter((t) => t.T >= now - 60_000);
  const lastTradeTime = aggTrades.length > 0 ? aggTrades[aggTrades.length - 1]!.T : now;

  // Trade data for Amihud/Kyle's Lambda
  const tradesData = aggTrades.map((t) => ({
    price: parseFloat(t.p),
    qty: parseFloat(t.q),
    quoteQty: parseFloat(t.p) * parseFloat(t.q),
    isBuyerMaker: t.m ?? false,
  }));

  // Parse futures data
  let fundingRate: number | null = null;
  let openInterest: number | null = null;
  let longShortRatio: number | null = null;
  let takerBuySellRatio: number | null = null;

  try {
    if (premiumIndexRes?.ok) {
      const premiumData = (await premiumIndexRes.json()) as Array<{
        symbol: string; lastFundingRate: string;
      }>;
      const entry = Array.isArray(premiumData)
        ? premiumData.find((e) => e.symbol === symbol)
        : premiumData;
      if (entry?.lastFundingRate) fundingRate = parseFloat(entry.lastFundingRate);
    }
  } catch { /* ignore */ }

  try {
    if (openInterestRes?.ok) {
      const oiData = (await openInterestRes.json()) as { openInterest: string };
      if (oiData?.openInterest) openInterest = parseFloat(oiData.openInterest);
    }
  } catch { /* ignore */ }

  try {
    if (longShortRes?.ok) {
      const lsData = (await longShortRes.json()) as Array<{
        longShortRatio: string; longAccount: string; shortAccount: string;
      }>;
      if (Array.isArray(lsData) && lsData.length > 0) {
        const ls = lsData[0]!;
        longShortRatio = parseFloat(ls.longAccount) / parseFloat(ls.shortAccount);
      }
    }
  } catch { /* ignore */ }

  try {
    if (takerBuySellRes?.ok) {
      const takerData = (await takerBuySellRes.json()) as Array<{
        buySellRatio: string;
      }>;
      if (Array.isArray(takerData) && takerData.length > 0) {
        takerBuySellRatio = parseFloat(takerData[0]!.buySellRatio);
      }
    }
  } catch { /* ignore */ }

  const input: LiquidityInput = {
    execution: { bestBid, bestAsk, asks, bids, side: 'BUY', quoteAmount: 100 },
    activity: {
      quoteVolume24h: parseFloat(ticker24h.quoteVolume),
      tradesCount1m: recentTrades.length,
      timeSinceLastTradeMs: now - lastTradeTime,
      relativeVolume: null,
    },
    fragility: {
      closes1m: klines.map((k) => parseFloat(k[4] as string)),
      trades: tradesData,
    },
    apiLatencyMs: latencyMs,
    cryptoSystemic: {
      stablecoinPegDeviationBps: null,
      fundingRate,
      fundingRateZScore: null,
      openInterest,
      openInterestChange24hPct: null,
      longShortRatio,
      takerBuySellRatio,
    },
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
