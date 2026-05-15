import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import type { LiquidityInput } from '@cryptorsi/liquidity';

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

async function safeJsonFetch(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function collectLiquidityData(
  symbol: string,
  side: 'BUY' | 'SELL',
  quoteAmount: number,
): Promise<{ input: LiquidityInput; latencyMs: number }> {
  const baseUrl = getBaseUrl();
  const futuresUrl = getFuturesBaseUrl();

  const startAll = Date.now();

  // Spot API calls
  const [bookTickerData, depthData, ticker24hData, aggTradesData, klinesData] = await Promise.all([
    safeJsonFetch(`${baseUrl}/v3/ticker/bookTicker?symbol=${symbol}`),
    safeJsonFetch(`${baseUrl}/v3/depth?symbol=${symbol}&limit=20`),
    safeJsonFetch(`${baseUrl}/v3/ticker/24hr?symbol=${symbol}`),
    safeJsonFetch(`${baseUrl}/v3/aggTrades?symbol=${symbol}&limit=50`),
    safeJsonFetch(`${baseUrl}/v3/klines?symbol=${symbol}&interval=1m&limit=60`),
  ]);

  // Futures API calls
  const [premiumIndexData, openInterestData, longShortData, takerBuySellData] = await Promise.all([
    safeJsonFetch(`${futuresUrl}/fapi/v1/premiumIndex?symbol=${symbol}`),
    safeJsonFetch(`${futuresUrl}/fapi/v1/openInterest?symbol=${symbol}`),
    safeJsonFetch(`${futuresUrl}/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`),
    safeJsonFetch(`${futuresUrl}/futures/data/takerlongshortRatio?symbol=${symbol}&period=1h&limit=1`),
  ]);

  const latencyMs = Date.now() - startAll;

  // Validate spot data — all required
  const bookTicker = bookTickerData as { bidPrice?: string; askPrice?: string } | null;
  const depth = depthData as { bids?: string[][]; asks?: string[][] } | null;
  const ticker24h = ticker24hData as { quoteVolume?: string } | null;
  const aggTrades = aggTradesData as Array<{ p?: string; q?: string; T?: number; m?: boolean }> | null;
  const klines = klinesData as (string | number)[][] | null;

  if (!bookTicker?.bidPrice || !bookTicker?.askPrice || !depth?.bids || !depth?.asks) {
    throw new Error('Unable to fetch order book data from Binance');
  }

  const bestBid = parseFloat(bookTicker.bidPrice);
  const bestAsk = parseFloat(bookTicker.askPrice);
  if (isNaN(bestBid) || isNaN(bestAsk) || bestBid <= 0 || bestAsk <= 0) {
    throw new Error('Invalid bid/ask prices from Binance');
  }

  const asks = depth.asks.map((a) => ({
    price: parseFloat(a[0]!),
    qty: parseFloat(a[1]!),
  }));
  const bids = depth.bids.map((b) => ({
    price: parseFloat(b[0]!),
    qty: parseFloat(b[1]!),
  }));

  // Trades per minute
  const now = Date.now();
  const trades = aggTrades ?? [];
  const recentTrades = trades.filter((t) => (t.T ?? 0) >= now - 60_000);
  const lastTradeTime = trades.length > 0 ? trades[trades.length - 1]!.T ?? now : now;
  const timeSinceLastTradeMs = now - lastTradeTime;

  // 1m closes for volatility
  const closes1m = (klines ?? []).map((k) => parseFloat(k[4] as string));

  // Trade data for Amihud/Kyle's Lambda
  const tradesData = trades.map((t) => ({
    price: parseFloat(t.p ?? '0'),
    qty: parseFloat(t.q ?? '0'),
    quoteQty: parseFloat(t.p ?? '0') * parseFloat(t.q ?? '0'),
    isBuyerMaker: t.m ?? false,
  }));

  // Parse futures data
  let fundingRate: number | null = null;
  let openInterest: number | null = null;
  let longShortRatio: number | null = null;
  let takerBuySellRatio: number | null = null;

  if (premiumIndexData) {
    const pd = premiumIndexData as Array<{ symbol: string; lastFundingRate: string }> | { lastFundingRate?: string; symbol?: string };
    const entry = Array.isArray(pd) ? pd.find((e) => e.symbol === symbol) : pd;
    if (entry?.lastFundingRate) {
      const val = parseFloat(entry.lastFundingRate);
      if (!isNaN(val)) fundingRate = val;
    }
  }

  if (openInterestData) {
    const od = openInterestData as { openInterest?: string };
    if (od?.openInterest) {
      const val = parseFloat(od.openInterest);
      if (!isNaN(val)) openInterest = val;
    }
  }

  if (longShortData) {
    const ld = longShortData as Array<{ longAccount: string; shortAccount: string }>;
    if (Array.isArray(ld) && ld.length > 0) {
      const la = parseFloat(ld[0]!.longAccount);
      const sa = parseFloat(ld[0]!.shortAccount);
      if (!isNaN(la) && !isNaN(sa) && sa > 0) longShortRatio = la / sa;
    }
  }

  if (takerBuySellData) {
    const td = takerBuySellData as Array<{ buySellRatio: string }>;
    if (Array.isArray(td) && td.length > 0) {
      const val = parseFloat(td[0]!.buySellRatio);
      if (!isNaN(val)) takerBuySellRatio = val;
    }
  }

  const input: LiquidityInput = {
    execution: { bestBid, bestAsk, asks, bids, side, quoteAmount },
    activity: {
      quoteVolume24h: ticker24h?.quoteVolume ? parseFloat(ticker24h.quoteVolume) : 0,
      tradesCount1m: recentTrades.length,
      timeSinceLastTradeMs,
      relativeVolume: null,
    },
    fragility: { closes1m, trades: tradesData },
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

  return { input, latencyMs };
}
