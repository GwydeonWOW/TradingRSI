FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install all dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml prisma.config.ts ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/indicators/package.json ./packages/indicators/
COPY packages/binance-client/package.json ./packages/binance-client/
COPY prisma/ ./prisma/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/indicators/node_modules ./packages/indicators/node_modules
COPY --from=deps /app/packages/binance-client/node_modules ./packages/binance-client/node_modules
COPY . .
RUN npx prisma generate
RUN pnpm --filter @cryptorsi/shared build
RUN pnpm --filter api build

# Production — install only prod deps, preserving pnpm structure
FROM base AS prod-install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml prisma.config.ts ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/indicators/package.json ./packages/indicators/
COPY packages/binance-client/package.json ./packages/binance-client/
COPY prisma/ ./prisma/
RUN pnpm install --frozen-lockfile --prod
RUN npx prisma generate

# Final production image
FROM base AS prod
RUN apk add --no-cache curl
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/apps/api/entrypoint.sh ./entrypoint.sh
COPY --from=prod-install /app/node_modules ./node_modules
COPY --from=prod-install /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-install /app/packages/shared/src/generated ./packages/shared/src/generated
COPY --from=prod-install /app/packages/shared/package.json ./packages/shared/
COPY --from=prod-install /app/packages/indicators/package.json ./packages/indicators/
COPY --from=prod-install /app/packages/binance-client/package.json ./packages/binance-client/
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./

RUN chmod +x ./entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1
ENTRYPOINT ["./entrypoint.sh"]
