FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install all dependencies (includes prisma CLI for generate)
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml prisma.config.ts ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/indicators/package.json ./packages/indicators/
COPY packages/binance-client/package.json ./packages/binance-client/
COPY prisma/ ./prisma/
RUN pnpm install --frozen-lockfile

# Build — generate Prisma client, compile TypeScript
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/indicators/node_modules ./packages/indicators/node_modules
COPY --from=deps /app/packages/binance-client/node_modules ./packages/binance-client/node_modules
COPY . .
RUN npx prisma generate
RUN pnpm --filter @cryptorsi/shared build
RUN pnpm --filter @cryptorsi/indicators build
RUN pnpm --filter worker build

# Production — install only prod deps
FROM base AS prod-install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml prisma.config.ts ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/indicators/package.json ./packages/indicators/
COPY packages/binance-client/package.json ./packages/binance-client/
RUN pnpm install --frozen-lockfile --prod

# Final production image
FROM base AS prod
COPY --from=build /app/apps/worker/dist ./dist
COPY --from=build /app/packages/shared/src/generated ./packages/shared/src/generated
COPY --from=prod-install /app/node_modules ./node_modules
COPY --from=prod-install /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=prod-install /app/packages/shared/package.json ./packages/shared/
COPY --from=prod-install /app/packages/indicators/package.json ./packages/indicators/
COPY --from=prod-install /app/packages/binance-client/package.json ./packages/binance-client/

ENV NODE_ENV=production
CMD ["node", "dist/runner.js"]
