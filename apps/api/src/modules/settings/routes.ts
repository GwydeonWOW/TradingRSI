import type { FastifyInstance } from 'fastify';
import { prisma } from '../../infrastructure/db/prisma.js';
import { saveBinanceCredentials, getBinanceCredentialsInfo } from '../../infrastructure/credentials/index.js';
import { createAuditEvent } from '../audit/helpers.js';
import { logger } from '../../infrastructure/logger/index.js';

export async function settingsRoutes(app: FastifyInstance) {
  // GET /api/settings/binance-credentials
  app.get('/api/settings/binance-credentials', async () => {
    const credentials = await getBinanceCredentialsInfo();
    return { success: true, data: credentials };
  });

  // POST /api/settings/binance-credentials
  app.post('/api/settings/binance-credentials', async (request) => {
    const body = request.body as {
      apiKey?: string;
      apiSecret?: string;
      environment?: string;
      label?: string;
    };

    if (!body.apiKey || !body.apiSecret || !body.environment) {
      return {
        success: false,
        error: { code: 'VALIDATION', message: 'apiKey, apiSecret y environment son obligatorios' },
      };
    }

    const validEnvs = ['demo', 'testnet', 'production'];
    if (!validEnvs.includes(body.environment)) {
      return {
        success: false,
        error: { code: 'VALIDATION', message: `environment debe ser: ${validEnvs.join(', ')}` },
      };
    }

    try {
      const id = await saveBinanceCredentials({
        apiKey: body.apiKey,
        apiSecret: body.apiSecret,
        environment: body.environment,
        label: body.label,
      });

      await createAuditEvent({
        actorType: 'user',
        eventType: 'binance_credentials_saved',
        entityType: 'exchange_credential',
        entityId: id,
        payload: { environment: body.environment, label: body.label },
      });

      return { success: true, data: { id, message: 'Credenciales guardadas correctamente' } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar credenciales';
      logger.error({ err }, 'Failed to save Binance credentials');
      return { success: false, error: { code: 'SAVE_FAILED', message: msg } };
    }
  });

  // POST /api/settings/binance-credentials/:id/revoke
  app.post('/api/settings/binance-credentials/:id/revoke', async (request) => {
    const { id } = request.params as { id: string };

    try {
      await prisma.exchangeCredential.update({
        where: { id },
        data: { revokedAt: new Date(), enabled: false },
      });

      await createAuditEvent({
        actorType: 'user',
        eventType: 'binance_credentials_revoked',
        entityType: 'exchange_credential',
        entityId: id,
        payload: {},
      });

      return { success: true, data: { message: 'Credenciales revocadas' } };
    } catch {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Credenciales no encontradas' } };
    }
  });
}
