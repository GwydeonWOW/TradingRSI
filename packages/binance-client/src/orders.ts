export interface OrderValidationResult {
  valid: boolean;
  reason?: string;
  filters?: {
    lotSize?: { minQty: string; maxQty: string; stepSize: string };
    minNotional?: { minNotional: string };
    priceFilter?: { minPrice: string; maxPrice: string; tickSize: string };
  };
}

/**
 * Ajusta una cantidad a los filtros LOT_SIZE/stepSize de Binance.
 */
export function adjustQuantityToLotSize(quantity: number, stepSize: number, precision: number): string {
  const adjusted = Math.floor(quantity / stepSize) * stepSize;
  return adjusted.toFixed(precision);
}
