import crypto from 'node:crypto';
import { prisma } from '../../infrastructure/db/prisma.js';
import { encrypt, decrypt } from '../../infrastructure/encryption/index.js';
import { logger } from '../../infrastructure/logger/index.js';

export interface DecryptedCredentials {
  apiKey: string;
  apiSecret: string;
  environment: string;
}

/**
 * Fetch the active Binance credentials from the database.
 * Returns null if no credentials are configured.
 */
export async function getBinanceCredentials(environment?: string): Promise<DecryptedCredentials | null> {
  const cred = await prisma.exchangeCredential.findFirst({
    where: {
      exchange: 'binance',
      enabled: true,
      revokedAt: null,
      ...(environment ? { environment } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!cred) return null;

  try {
    const apiKey = decrypt(cred.apiKeyCiphertext, cred.apiKeyNonce, cred.apiKeyTag);
    const apiSecret = decrypt(cred.apiSecretCiphertext, cred.apiSecretNonce, cred.apiSecretTag);

    return {
      apiKey,
      apiSecret,
      environment: cred.environment,
    };
  } catch (err) {
    logger.error({ err }, 'Failed to decrypt Binance credentials');
    return null;
  }
}

/**
 * Save Binance credentials to the database (encrypted).
 * Revokes any previous credentials for the same environment.
 */
async function ensureSystemUser(): Promise<string> {
  const userId = 'system';
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) {
    await prisma.user.create({
      data: {
        id: userId,
        emailLookupHash: crypto.createHash('sha256').update('system@cryptorsi.internal').digest('hex'),
        passwordHash: '!',
        role: 'system',
      },
    });
  }
  return userId;
}

export async function saveBinanceCredentials(params: {
  apiKey: string;
  apiSecret: string;
  environment: string;
  label?: string;
}): Promise<string> {
  // Revoke existing credentials for this environment
  await prisma.exchangeCredential.updateMany({
    where: {
      exchange: 'binance',
      environment: params.environment,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  const encryptedKey = encrypt(params.apiKey);
  const encryptedSecret = encrypt(params.apiSecret);

  await ensureSystemUser();

  const credential = await prisma.exchangeCredential.create({
    data: {
      userId: 'system',
      exchange: 'binance',
      environment: params.environment,
      label: params.label ?? `Binance ${params.environment}`,
      apiKeyCiphertext: encryptedKey.ciphertext,
      apiKeyNonce: encryptedKey.nonce,
      apiKeyTag: encryptedKey.tag,
      apiSecretCiphertext: encryptedSecret.ciphertext,
      apiSecretNonce: encryptedSecret.nonce,
      apiSecretTag: encryptedSecret.tag,
    },
  });

  return credential.id;
}

/**
 * Get masked credential info for the frontend (never returns secrets).
 */
export async function getBinanceCredentialsInfo(): Promise<Array<{
  id: string;
  environment: string;
  label: string;
  enabled: boolean;
  apiKeyPreview: string;
  createdAt: Date;
}>> {
  const creds = await prisma.exchangeCredential.findMany({
    where: { exchange: 'binance', revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  return creds.map((c: Awaited<ReturnType<typeof prisma.exchangeCredential.findMany>>[number]) => {
    let preview = '';
    try {
      const full = decrypt(c.apiKeyCiphertext, c.apiKeyNonce, c.apiKeyTag);
      preview = full.slice(0, 4) + '****' + full.slice(-4);
    } catch {
      preview = '****';
    }
    return {
      id: c.id,
      environment: c.environment,
      label: c.label,
      enabled: c.enabled,
      apiKeyPreview: preview,
      createdAt: c.createdAt,
    };
  });
}
