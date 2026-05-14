import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key || key.length < 16) throw new Error('APP_ENCRYPTION_KEY must be at least 16 characters');
  return crypto.createHash('sha256').update(key).digest();
}

export function encrypt(plaintext: string): { ciphertext: string; nonce: string; tag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext: encrypted,
    nonce: iv.toString('hex'),
    tag,
  };
}

export function decrypt(ciphertext: string, nonce: string, tag: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(nonce, 'hex');
  const authTag = Buffer.from(tag, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
