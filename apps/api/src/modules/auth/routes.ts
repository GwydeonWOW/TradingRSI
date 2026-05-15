import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { TOTP } from 'otpauth';
import { prisma } from '../../infrastructure/db/prisma.js';
import { logger } from '../../infrastructure/logger/index.js';
import { hashPassword, verifyPassword, generateTotpSecret, hashRecoveryCodes } from './helpers.js';
import { encrypt, decrypt } from '../../infrastructure/encryption/index.js';
import { createAuditEvent } from '../audit/helpers.js';

const JWT_EXPIRES_IN = '7d';

interface JwtPayload {
  userId: string;
  role: string;
  mfaVerified: boolean;
}

export function verifyToken(request: FastifyRequest): JwtPayload | null {
  try {
    const app = request.server as any;
    const authHeader = request.headers.authorization;
    if (!authHeader) return null;
    return app.jwt.verify(authHeader.replace('Bearer ', '')) as JwtPayload;
  } catch {
    return null;
  }
}

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register — only allowed during initial setup
  app.post('/api/auth/register', async (request, reply) => {
    try {
      const userCount = await prisma.user.count();
      if (userCount > 0) {
        return reply.code(403).send({ success: false, error: { code: 'SETUP_COMPLETE', message: 'Setup already completed' } });
      }

      const body = request.body as { email?: string; password?: string };
      if (!body.email || !body.password) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION', message: 'Email and password required' } });
      }
      if (body.password.length < 8) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION', message: 'Password must be at least 8 characters' } });
      }

      const lookupHash = crypto.createHash('sha256').update(body.email.toLowerCase()).digest('hex');
      const existing = await prisma.user.findUnique({ where: { emailLookupHash: lookupHash } });
      if (existing) {
        return reply.code(409).send({ success: false, error: { code: 'CONFLICT', message: 'Email already registered' } });
      }

      const user = await prisma.user.create({
        data: {
          emailLookupHash: lookupHash,
          passwordHash: await hashPassword(body.password),
          role: 'admin',
        },
      });

      await createAuditEvent({ actorType: 'system', eventType: 'user.registered', entityType: 'user', entityId: user.id, payload: { role: 'admin' } });

      const token = (app as any).jwt.sign({ userId: user.id, role: user.role, mfaVerified: false }, { expiresIn: JWT_EXPIRES_IN });
      return reply.code(201).send({ success: true, data: { id: user.id, role: user.role, token } });
    } catch (err) {
      logger.error(err, 'Registration failed');
      return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Registration failed' } });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const body = request.body as { email?: string; password?: string };
      if (!body.email || !body.password) {
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION', message: 'Email and password required' } });
      }

      const lookupHash = crypto.createHash('sha256').update(body.email.toLowerCase()).digest('hex');
      const user = await prisma.user.findUnique({ where: { emailLookupHash: lookupHash } });
      if (!user) {
        return reply.code(401).send({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });
      }

      if (user.role === 'pending') {
        return reply.code(403).send({ success: false, error: { code: 'PENDING_APPROVAL', message: 'Account pending admin approval' } });
      }

      const valid = await verifyPassword(body.password, user.passwordHash);
      if (!valid) {
        return reply.code(401).send({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });
      }

      if (user.mfaEnabled) {
        const token = (app as any).jwt.sign({ userId: user.id, role: user.role, mfaVerified: false }, { expiresIn: JWT_EXPIRES_IN });
        return reply.code(200).send({ success: true, data: { requiresMfa: true, token } });
      }

      const token = (app as any).jwt.sign({ userId: user.id, role: user.role, mfaVerified: true }, { expiresIn: JWT_EXPIRES_IN });
      await createAuditEvent({ actorType: 'user', eventType: 'user.login', entityType: 'user', entityId: user.id, payload: {} });
      return reply.code(200).send({ success: true, data: { id: user.id, role: user.role, mfaEnabled: false, token } });
    } catch (err) {
      logger.error(err, 'Login failed');
      return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Login failed' } });
    }
  });

  // POST /api/auth/2fa/setup
  app.post('/api/auth/2fa/setup', async (request, reply) => {
    try {
      const auth = (request as any).auth as JwtPayload | undefined;
      if (!auth) return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });

      const { secret, uri } = generateTotpSecret();
      const encrypted = encrypt(secret);

      await prisma.userMfaSecret.create({
        data: {
          userId: auth.userId,
          type: 'totp',
          secretCiphertext: encrypted.ciphertext,
          secretNonce: encrypted.nonce,
          secretTag: encrypted.tag,
        },
      });

      const QRCode = await import('qrcode');
      const qrDataUrl = await QRCode.toDataURL(uri);

      return reply.code(200).send({ success: true, data: { uri, qr: qrDataUrl, secret } });
    } catch (err) {
      logger.error(err, '2FA setup failed');
      return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: '2FA setup failed' } });
    }
  });

  // POST /api/auth/2fa/verify — enable 2FA
  app.post('/api/auth/2fa/verify', async (request, reply) => {
    try {
      const auth = (request as any).auth as JwtPayload | undefined;
      if (!auth) return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });

      const body = request.body as { code?: string };
      if (!body.code) return reply.code(400).send({ success: false, error: { code: 'VALIDATION', message: 'Code required' } });

      const mfaSecret = await prisma.userMfaSecret.findFirst({
        where: { userId: auth.userId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!mfaSecret) return reply.code(400).send({ success: false, error: { code: 'NO_MFA_SETUP', message: 'Setup 2FA first' } });

      const secret = decrypt(mfaSecret.secretCiphertext, mfaSecret.secretNonce, mfaSecret.secretTag);
      const totp = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 });
      const delta = totp.validate({ token: body.code, window: 1 });

      if (delta === null) {
        return reply.code(401).send({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid code' } });
      }

      await prisma.userMfaSecret.update({ where: { id: mfaSecret.id }, data: { confirmedAt: new Date() } });

      const codes = hashRecoveryCodes(8);
      await prisma.userRecoveryCode.createMany({
        data: codes.map((code) => ({
          userId: auth.userId,
          codeHash: crypto.createHash('sha256').update(code).digest('hex'),
        })),
      });

      await prisma.user.update({ where: { id: auth.userId }, data: { mfaEnabled: true } });

      const newToken = (app as any).jwt.sign({ userId: auth.userId, role: auth.role, mfaVerified: true }, { expiresIn: JWT_EXPIRES_IN });
      return reply.code(200).send({ success: true, data: { enabled: true, recoveryCodes: codes, token: newToken } });
    } catch (err) {
      logger.error(err, '2FA verify failed');
      return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: '2FA verification failed' } });
    }
  });

  // POST /api/auth/2fa/challenge — verify during login
  app.post('/api/auth/2fa/challenge', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    try {
      const auth = (request as any).auth as JwtPayload | undefined;
      if (!auth) return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });

      const body = request.body as { code?: string };
      if (!body.code) return reply.code(400).send({ success: false, error: { code: 'VALIDATION', message: 'Code required' } });

      const mfaSecret = await prisma.userMfaSecret.findFirst({
        where: { userId: auth.userId, confirmedAt: { not: null }, revokedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!mfaSecret) return reply.code(400).send({ success: false, error: { code: 'NO_MFA', message: 'No 2FA configured' } });

      const secret = decrypt(mfaSecret.secretCiphertext, mfaSecret.secretNonce, mfaSecret.secretTag);
      const totp = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 });

      let delta: number | null = totp.validate({ token: body.code, window: 1 });

      if (delta === null) {
        const codeHash = crypto.createHash('sha256').update(body.code).digest('hex');
        const recoveryCode = await prisma.userRecoveryCode.findFirst({ where: { userId: auth.userId, codeHash, usedAt: null } });
        if (recoveryCode) {
          await prisma.userRecoveryCode.update({ where: { id: recoveryCode.id }, data: { usedAt: new Date() } });
          delta = 0;
        }
      }

      if (delta === null) {
        return reply.code(401).send({ success: false, error: { code: 'INVALID_CODE', message: 'Invalid code' } });
      }

      const newToken = (app as any).jwt.sign({ userId: auth.userId, role: auth.role, mfaVerified: true }, { expiresIn: JWT_EXPIRES_IN });
      await createAuditEvent({ actorType: 'user', eventType: 'user.mfa_verified', entityType: 'user', entityId: auth.userId, payload: {} });
      return reply.code(200).send({ success: true, data: { verified: true, token: newToken } });
    } catch (err) {
      logger.error(err, '2FA challenge failed');
      return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: '2FA challenge failed' } });
    }
  });

  // GET /api/auth/me
  app.get('/api/auth/me', async (request, reply) => {
    try {
      const auth = (request as any).auth as JwtPayload | undefined;
      if (!auth) return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });

      const user = await prisma.user.findUnique({ where: { id: auth.userId } });
      if (!user) return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

      return reply.code(200).send({
        success: true,
        data: { id: user.id, role: user.role, mfaEnabled: user.mfaEnabled, mfaRequired: user.mfaRequired, createdAt: user.createdAt },
      });
    } catch {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }
  });

  // GET /api/auth/users — admin list
  app.get('/api/auth/users', async (request, reply) => {
    try {
      const auth = (request as any).auth as JwtPayload | undefined;
      if (!auth || auth.role !== 'admin') return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin required' } });

      const users = await prisma.user.findMany({
        select: { id: true, role: true, mfaEnabled: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      return reply.code(200).send({ success: true, data: users });
    } catch {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }
  });

  // POST /api/auth/users/:id/approve
  app.post('/api/auth/users/:id/approve', async (request, reply) => {
    try {
      const auth = (request as any).auth as JwtPayload | undefined;
      if (!auth || auth.role !== 'admin') return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin required' } });

      const { id } = request.params as { id: string };
      await prisma.user.update({ where: { id }, data: { role: 'user' } });
      await createAuditEvent({ actorType: 'user', eventType: 'user.approved', entityType: 'user', entityId: id, payload: { approvedBy: auth.userId } });
      return reply.code(200).send({ success: true, data: { id, role: 'user' } });
    } catch {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'Auth required' } });
    }
  });

  // GET /api/auth/needs-setup — check if initial setup is needed
  app.get('/api/auth/needs-setup', async (_request, reply) => {
    try {
      const userCount = await prisma.user.count();
      return reply.code(200).send({ success: true, data: { needsSetup: userCount === 0 } });
    } catch (err) {
      logger.error(err, 'Needs setup check failed');
      return reply.code(200).send({ success: true, data: { needsSetup: false } });
    }
  });

  // POST /api/auth/force-reset — requires admin auth (used for recovery)
  app.post('/api/auth/force-reset', async (request, reply) => {
    try {
      const auth = (request as any).auth as JwtPayload | undefined;
      if (!auth || auth.role !== 'admin') {
        return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Admin required' } });
      }

      await prisma.userRecoveryCode.deleteMany({});
      await prisma.userMfaSecret.deleteMany({});
      await prisma.userSession.deleteMany({});
      await prisma.user.deleteMany({});
      logger.info('Force reset: all users deleted by admin');
      return reply.code(200).send({ success: true, data: { message: 'All users deleted' } });
    } catch (err) {
      logger.error(err, 'Force reset failed');
      return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Force reset failed' } });
    }
  });
}
