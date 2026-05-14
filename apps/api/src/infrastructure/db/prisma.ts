import { PrismaClient } from '@cryptorsi/shared/generated/prisma';

// Prisma 7.x (prisma-client generator) requires a driver adapter.
// The adapter is configured at runtime via DATABASE_URL.
// TODO: Once @prisma/adapter-pg is installed, replace this with:
//   import { PrismaPg } from '@prisma/adapter-pg';
//   import pg from 'pg';
//   const adapter = new PrismaPg(new pg.Pool({ connectionString: process.env.DATABASE_URL }));
//   export const prisma = new PrismaClient({ adapter });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma = new (PrismaClient as any)() as InstanceType<typeof PrismaClient>;
