import { BINANCE_ENVIRONMENTS } from '@cryptorsi/shared';
import type { LiquidityInput } from '@cryptorsi/liquidity';

type BinanceEnv = 'demo' | 'testnet' | 'production';

function getBaseUrl(): string {
  const env = (process.env.BINANCE_ENV ?? 'demo') as BinanceEnv;
  return BINANCE_ENVIRONMENTS[env].restBaseUrl;
}

export async function collectLiquidityData(
  symbol: string,
  side: 'BUY' | 'SELL',
  quoteAmount: number,
): Promise<{ input: LiquidityInput; latencyMs: number }> {
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
  const depth = (await depthRes.json()) as {
    bids: string[][]; asks: string[][];
  };
  const ticker24h = (await ticker24hRes.json()) as {
    quoteVolume: string; count: number;
  };
  const aggTrades = (await aggTradesRes.json()) as Array<{
    a: number; p: string; q: string; T: number;
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

  const input: LiquidityInput = {
    execution: { bestBid, bestAsk, asks, bids, side, quoteAmount },
    activity: {
      quoteVolume24h: parseFloat(ticker24h.quoteVolume),
      tradesCount1m: tradesPerMinute,
      timeSinceLastTradeMs,
      relativeVolume: null,
    },
    fragility: { closes1m },
    apiLatencyMs: latencyMs,
  };

  return { input, latencyMs };
}
