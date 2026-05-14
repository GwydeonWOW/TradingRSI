import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Types for Binance order response processing
// ---------------------------------------------------------------------------

export interface BinanceOrderFill {
  price: string;
  qty: string;
  commission: string;
  commissionAsset: string;
  tradeId: number;
}

export interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED';
  timeInForce: string;
  type: string;
  side: 'BUY' | 'SELL';
  fills: BinanceOrderFill[];
}

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
// Place a real order on Binance Demo
// ---------------------------------------------------------------------------

export async function placeBinanceOrder(params: {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET';
  quoteOrderQty?: string;
  quantity?: string;
  clientOrderId: string;
}): Promise<BinanceOrderResponse> {
  const orderParams: Record<string, string> = {
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    newClientOrderId: params.clientOrderId,
    newOrderRespType: 'FULL',
  };

  if (params.quoteOrderQty) {
    orderParams.quoteOrderQty = params.quoteOrderQty;
  }
  if (params.quantity) {
    orderParams.quantity = params.quantity;
  }

  const response = await signedPost(
    params.baseUrl,
    '/v3/order',
    orderParams,
    params.apiKey,
    params.apiSecret,
  );

  return response as BinanceOrderResponse;
}

// ---------------------------------------------------------------------------
// Process fills from order response
// ---------------------------------------------------------------------------

export function processOrderResponse(response: BinanceOrderResponse): {
  status: string;
  executedQty: number;
  cumulativeQuoteQty: number;
  avgPrice: number;
  fills: Array<{
    tradeId: string;
    price: number;
    quantity: number;
    quoteQuantity: number;
    commission: number;
    commissionAsset: string;
  }>;
} {
  const executedQty = parseFloat(response.executedQty);
  const cumulativeQuoteQty = parseFloat(response.cummulativeQuoteQty);
  const avgPrice = executedQty > 0 ? cumulativeQuoteQty / executedQty : 0;

  const fills = (response.fills ?? []).map((fill) => ({
    tradeId: fill.tradeId.toString(),
    price: parseFloat(fill.price),
    quantity: parseFloat(fill.qty),
    quoteQuantity: parseFloat(fill.price) * parseFloat(fill.qty),
    commission: parseFloat(fill.commission),
    commissionAsset: fill.commissionAsset,
  }));

  return {
    status: response.status,
    executedQty,
    cumulativeQuoteQty,
    avgPrice,
    fills,
  };
}

// ---------------------------------------------------------------------------
// Adjust quantity to LOT_SIZE stepSize
// ---------------------------------------------------------------------------

export function adjustQuantity(quantity: number, stepSize: number): number {
  if (stepSize <= 0) return quantity;
  const adjusted = Math.floor(quantity / stepSize) * stepSize;
  // Trim to stepSize precision
  const precision = stepSize.toString().includes('.')
    ? stepSize.toString().split('.')[1]!.length
    : 0;
  return parseFloat(adjusted.toFixed(precision));
}

// ---------------------------------------------------------------------------
// Exchange info cache (5-minute TTL)
// ---------------------------------------------------------------------------

const symbolInfoCache = new Map<string, { data: SymbolInfo; expiresAt: number }>();

interface SymbolInfo {
  stepSize: number;
  minNotional: number;
  minQty: number;
  maxQty: number;
  tickSize: number;
}

export async function getSymbolInfo(baseUrl: string, symbol: string): Promise<SymbolInfo> {
  const cached = symbolInfoCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = `${baseUrl}/v3/exchangeInfo?symbol=${symbol}`;
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Binance exchangeInfo error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    symbols: Array<{
      filters: Array<{
        filterType: string;
        stepSize?: string;
        minQty?: string;
        maxQty?: string;
        tickSize?: string;
        minNotional?: string;
        notional?: string;
      }>;
    }>;
  };

  const symbolData = data.symbols[0];
  if (!symbolData) {
    throw new Error(`Symbol ${symbol} not found in exchange info`);
  }

  let stepSize = 1;
  let minNotional = 0;
  let minQty = 0;
  let maxQty = Infinity;
  let tickSize = 1;

  for (const filter of symbolData.filters) {
    switch (filter.filterType) {
      case 'LOT_SIZE':
        if (filter.stepSize) stepSize = parseFloat(filter.stepSize);
        if (filter.minQty) minQty = parseFloat(filter.minQty);
        if (filter.maxQty) maxQty = parseFloat(filter.maxQty);
        break;
      case 'MIN_NOTIONAL':
        if (filter.minNotional) minNotional = parseFloat(filter.minNotional);
        if (filter.notional) minNotional = parseFloat(filter.notional);
        break;
      case 'PRICE_FILTER':
        if (filter.tickSize) tickSize = parseFloat(filter.tickSize);
        break;
    }
  }

  const info: SymbolInfo = { stepSize, minNotional, minQty, maxQty, tickSize };
  symbolInfoCache.set(symbol, { data: info, expiresAt: Date.now() + 5 * 60 * 1000 });
  return info;
}

// ---------------------------------------------------------------------------
// Fetch open orders from Binance (for reconciliation)
// ---------------------------------------------------------------------------

export async function fetchOpenOrders(
  baseUrl: string,
  apiKey: string,
  apiSecret: string,
  symbol?: string,
): Promise<BinanceOrderResponse[]> {
  const params: Record<string, string> = {};
  if (symbol) params.symbol = symbol;
  const result = await signedGet(baseUrl, '/v3/openOrders', params, apiKey, apiSecret);
  return result as BinanceOrderResponse[];
}
