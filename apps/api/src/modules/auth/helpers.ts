import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Secret } from 'otpauth';
import { prisma } from '../../infrastructure/db/prisma.js';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateTotpSecret(): { secret: string; uri: string } {
  const secretObj = new Secret({ size: 20 });
  const secret = secretObj.base32;
  const uri = `otpauth://totp/CryptoRSI?secret=${encodeURIComponent(secret)}&issuer=CryptoRSI`;
  return { secret, uri };
}

export function hashRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString('hex'),
  );
}

export async function ensureAdminUser(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required for seeding');
  }
  const lookupHash = crypto.createHash('sha256').update(adminEmail).digest('hex');

  const existing = await prisma.user.findUnique({ where: { emailLookupHash: lookupHash } });
  if (existing) return;

  await prisma.user.create({
    data: {
      id: 'admin',
      emailLookupHash: lookupHash,
      passwordHash: await hashPassword(adminPassword),
      role: 'admin',
      mfaRequired: true,
      mfaEnabled: false,
    },
  });
}
