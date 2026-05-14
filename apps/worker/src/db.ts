import { PrismaClient } from '@cryptorsi/shared/generated/prisma';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma = new (PrismaClient as any)() as InstanceType<typeof PrismaClient>;
