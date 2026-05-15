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

export async function collectLiquidityData(
  symbol: string,
  side: 'BUY' | 'SELL',
  quoteAmount: number,
): Promise<{ input: LiquidityInput; latencyMs: number }> {
  const baseUrl = getBaseUrl();
  const futuresUrl = getFuturesBaseUrl();

  const startAll = Date.now();

  // Spot API calls (always available)
  const [bookTickerRes, depthRes, ticker24hRes, aggTradesRes, klinesRes] = await Promise.all([
    fetch(`${baseUrl}/v3/ticker/bookTicker?symbol=${symbol}`),
    fetch(`${baseUrl}/v3/depth?symbol=${symbol}&limit=20`),
    fetch(`${baseUrl}/v3/ticker/24hr?symbol=${symbol}`),
    fetch(`${baseUrl}/v3/aggTrades?symbol=${symbol}&limit=50`),
    fetch(`${baseUrl}/v3/klines?symbol=${symbol}&interval=1m&limit=60`),
  ]);

  // Futures API calls (may fail on demo — graceful fallback)
  const futuresSymbol = symbol;
  const [premiumIndexRes, openInterestRes, longShortRes, takerBuySellRes] = await Promise.all([
    fetch(`${futuresUrl}/fapi/v1/premiumIndex?symbol=${futuresSymbol}`).catch(() => null),
    fetch(`${futuresUrl}/fapi/v1/openInterest?symbol=${futuresSymbol}`).catch(() => null),
    fetch(`${futuresUrl}/futures/data/globalLongShortAccountRatio?symbol=${futuresSymbol}&period=1h&limit=1`).catch(() => null),
    fetch(`${futuresUrl}/futures/data/takerlongshortRatio?symbol=${futuresSymbol}&period=1h&limit=1`).catch(() => null),
  ]);

  const latencyMs = Date.now() - startAll;

  const bookTicker = (await bookTickerRes.json()) as {
    bidPrice: string; bidQty: string; askPrice: string; askQty: string;
  };
  const depth = (await depthRes.json()) as {
    bids: string[][]; asks: string[][];
  };
  const ticker24h = (await ticker24hRes.json()) as {
    quoteVolume: string; count: number;
  };
  const aggTrades = (await aggTradesRes.json()) as Array<{
    a: number; p: string; q: string; T: number; m?: boolean;
  }>;
  const klines = (await klinesRes.json()) as (string | number)[][];

  const bestBid = parseFloat(bookTicker.bidPrice);
  const bestAsk = parseFloat(bookTicker.askPrice);

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
  const oneMinuteAgo = now - 60_000;
  const recentTrades = aggTrades.filter((t) => t.T >= oneMinuteAgo);
  const tradesPerMinute = recentTrades.length;

  // Time since last trade
  const lastTradeTime = aggTrades.length > 0 ? aggTrades[aggTrades.length - 1]!.T : now;
  const timeSinceLastTradeMs = now - lastTradeTime;

  // 1m closes for volatility
  const closes1m = klines.map((k) => parseFloat(k[4] as string));

  // Parse trade data for Amihud/Kyle's Lambda
  const tradesData = aggTrades.map((t) => ({
    price: parseFloat(t.p),
    qty: parseFloat(t.q),
    quoteQty: parseFloat(t.p) * parseFloat(t.q),
    isBuyerMaker: t.m ?? false,
  }));

  // Parse futures data (graceful fallback on error)
  let fundingRate: number | null = null;
  let openInterest: number | null = null;
  let longShortRatio: number | null = null;
  let takerBuySellRatio: number | null = null;
  let openInterestChange24hPct: number | null = null;

  try {
    if (premiumIndexRes?.ok) {
      const premiumData = (await premiumIndexRes.json()) as Array<{
        symbol: string; lastFundingRate: string; interestRate?: string;
      }>;
      const entry = Array.isArray(premiumData)
        ? premiumData.find((e) => e.symbol === futuresSymbol)
        : premiumData;
      if (entry && entry.lastFundingRate) {
        fundingRate = parseFloat(entry.lastFundingRate);
      }
    }
  } catch { /* ignore */ }

  try {
    if (openInterestRes?.ok) {
      const oiData = (await openInterestRes.json()) as {
        openInterest: string; symbol: string;
      };
      if (oiData?.openInterest) {
        openInterest = parseFloat(oiData.openInterest);
      }
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
        buyVol: string; sellVol: string; buySellRatio: string;
      }>;
      if (Array.isArray(takerData) && takerData.length > 0) {
        takerBuySellRatio = parseFloat(takerData[0]!.buySellRatio);
      }
    }
  } catch { /* ignore */ }

  const input: LiquidityInput = {
    execution: { bestBid, bestAsk, asks, bids, side, quoteAmount },
    activity: {
      quoteVolume24h: parseFloat(ticker24h.quoteVolume),
      tradesCount1m: tradesPerMinute,
      timeSinceLastTradeMs,
      relativeVolume: null,
    },
    fragility: { closes1m, trades: tradesData },
    apiLatencyMs: latencyMs,
    cryptoSystemic: {
      stablecoinPegDeviationBps: null, // Requires external API (DefiLlama) — fallback to null
      fundingRate,
      fundingRateZScore: null, // Requires historical funding data — fallback
      openInterest,
      openInterestChange24hPct,
      longShortRatio,
      takerBuySellRatio,
    },
  };

  return { input, latencyMs };
}
