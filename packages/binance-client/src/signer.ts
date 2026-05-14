import crypto from 'node:crypto';

/**
 * Firma una query string con HMAC-SHA256 para Binance API.
 * (Anexo 21.4 del plan tecnico)
 */
export function signBinanceQuery(queryString: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}

/**
 * Construye una query firmada con timestamp, recvWindow y signature.
 */
export function buildSignedQuery(
  params: Record<string, string>,
  secret: string,
  options?: { recvWindow?: number },
): string {
  const timestamp = Date.now().toString();
  const recvWindow = (options?.recvWindow ?? 5000).toString();

  const allParams = {
    ...params,
    timestamp,
    recvWindow,
  };

  const queryString = new URLSearchParams(allParams).toString();
  const signature = signBinanceQuery(queryString, secret);

  return `${queryString}&signature=${signature}`;
}
