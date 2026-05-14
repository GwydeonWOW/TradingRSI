import { prisma } from '../../infrastructure/db/prisma.js';

export async function createAuditEvent(params: {
  actorType: string;
  actorId?: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
}): Promise<{ id: string }> {
  return prisma.auditEvent.create({
    data: { ...params, payload: params.payload as any },
    select: { id: true },
  });
}
