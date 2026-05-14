import { PrismaClient, type Prisma } from '@cryptorsi/shared/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
export const prisma: PrismaClient = new PrismaClient({ adapter }) as unknown as PrismaClient;
