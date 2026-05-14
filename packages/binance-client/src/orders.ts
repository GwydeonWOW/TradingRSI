export interface OrderValidationResult {
  valid: boolean;
  reason?: string;
  adjustedQuantity?: string;
  filters?: {
    lotSize?: { minQty: string; maxQty: string; stepSize: string; precision: number };
    minNotional?: { minNotional: string };
    priceFilter?: { minPrice: string; maxPrice: string; tickSize: string };
  };
}

export interface ExchangeSymbolFilter {
  filterType: string;
  minQty?: string;
  maxQty?: string;
  stepSize?: string;
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  minNotional?: string;
  applyToMarket?: boolean;
}

export interface ExchangeSymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  filters: ExchangeSymbolFilter[];
}

/**
 * Ajusta una cantidad a los filtros LOT_SIZE/stepSize de Binance.
 */
export function adjustQuantityToLotSize(quantity: number, stepSize: number, precision: number): string {
  const adjusted = Math.floor(quantity / stepSize) * stepSize;
  return adjusted.toFixed(precision);
}

/**
 * Obtiene la precisión decimal de un stepSize.
 */
export function getStepSizePrecision(stepSize: string): number {
  const parts = stepSize.split('.');
  if (parts.length === 1) return 0;
  const decimalPart = parts[1]!.replace(/0+$/, '');
  return decimalPart.length;
}

/**
 * Valida una orden contra los filtros de un símbolo de Binance.
 */
export function validateOrder(
  symbolInfo: ExchangeSymbolInfo,
  params: {
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT';
    quantity?: number;
    quoteOrderQty?: number;
    price?: number;
  },
): OrderValidationResult {
  // Check symbol is trading
  if (symbolInfo.status !== 'TRADING') {
    return { valid: false, reason: `Symbol ${symbolInfo.symbol} status is ${symbolInfo.status}, not TRADING` };
  }

  // Extract relevant filters
  const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
  const minNotionalFilter = symbolInfo.filters.find(f => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL');
  const priceFilter = symbolInfo.filters.find(f => f.filterType === 'PRICE_FILTER');

  const result: OrderValidationResult = {
    valid: true,
    filters: {
      lotSize: lotSizeFilter ? {
        minQty: lotSizeFilter.minQty ?? '0',
        maxQty: lotSizeFilter.maxQty ?? '0',
        stepSize: lotSizeFilter.stepSize ?? '1',
        precision: lotSizeFilter.stepSize ? getStepSizePrecision(lotSizeFilter.stepSize) : 0,
      } : undefined,
      minNotional: minNotionalFilter ? {
        minNotional: minNotionalFilter.minNotional ?? '0',
      } : undefined,
      priceFilter: priceFilter ? {
        minPrice: priceFilter.minPrice ?? '0',
        maxPrice: priceFilter.maxPrice ?? '0',
        tickSize: priceFilter.tickSize ?? '1',
      } : undefined,
    },
  };

  // For BUY with quoteOrderQty (buying with USDT amount)
  if (params.side === 'BUY' && params.quoteOrderQty !== undefined) {
    // Check MIN_NOTIONAL
    if (minNotionalFilter?.minNotional) {
      if (params.quoteOrderQty < parseFloat(minNotionalFilter.minNotional)) {
        return {
          ...result,
          valid: false,
          reason: `quoteOrderQty ${params.quoteOrderQty} is below minimum notional ${minNotionalFilter.minNotional}`,
        };
      }
    }
  }

  // For SELL with quantity
  if (params.quantity !== undefined && lotSizeFilter) {
    const minQty = parseFloat(lotSizeFilter.minQty ?? '0');
    const maxQty = parseFloat(lotSizeFilter.maxQty ?? '0');
    const stepSize = parseFloat(lotSizeFilter.stepSize ?? '1');
    const precision = lotSizeFilter.stepSize ? getStepSizePrecision(lotSizeFilter.stepSize) : 0;

    // Check min quantity
    if (params.quantity < minQty) {
      return {
        ...result,
        valid: false,
        reason: `Quantity ${params.quantity} is below minimum ${minQty}`,
      };
    }

    // Check max quantity
    if (maxQty > 0 && params.quantity > maxQty) {
      return {
        ...result,
        valid: false,
        reason: `Quantity ${params.quantity} exceeds maximum ${maxQty}`,
      };
    }

    // Adjust to stepSize
    const adjusted = adjustQuantityToLotSize(params.quantity, stepSize, precision);
    if (adjusted !== params.quantity.toFixed(precision)) {
      result.adjustedQuantity = adjusted;
    }
  }

  // For LIMIT orders, check price filter
  if (params.type === 'LIMIT' && params.price !== undefined && priceFilter) {
    const minPrice = parseFloat(priceFilter.minPrice ?? '0');
    const maxPrice = parseFloat(priceFilter.maxPrice ?? '0');

    if (params.price < minPrice) {
      return {
        ...result,
        valid: false,
        reason: `Price ${params.price} is below minimum ${minPrice}`,
      };
    }

    if (maxPrice > 0 && params.price > maxPrice) {
      return {
        ...result,
        valid: false,
        reason: `Price ${params.price} exceeds maximum ${maxPrice}`,
      };
    }
  }

  return result;
}

/**
 * Genera un clientOrderId único para Binance.
 */
export function generateClientOrderId(prefix: string): string {
  return `cryptorsi_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
