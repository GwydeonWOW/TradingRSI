FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml prisma.config.ts ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/indicators/package.json ./packages/indicators/
COPY packages/binance-client/package.json ./packages/binance-client/
COPY prisma/ ./prisma/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/indicators/node_modules ./packages/indicators/node_modules
COPY --from=deps /app/packages/binance-client/node_modules ./packages/binance-client/node_modules
COPY . .
RUN pnpm --filter worker build
RUN npx prisma generate

# Production
FROM base AS prod
COPY --from=build /app/apps/worker/dist ./dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/indicators ./packages/indicators
COPY --from=build /app/packages/binance-client ./packages/binance-client
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/packages/shared/src/generated ./packages/shared/src/generated
COPY --from=build /app/apps/worker/node_modules ./apps/worker/node_modules

ENV NODE_ENV=production
CMD ["node", "dist/runner.js"]
