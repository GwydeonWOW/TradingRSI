FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml prisma.config.ts ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/indicators/package.json ./packages/indicators/
COPY packages/binance-client/package.json ./packages/binance-client/
COPY prisma/ ./prisma/
RUN pnpm install --frozen-lockfile

COPY . .
RUN npx prisma generate
RUN pnpm --filter @cryptorsi/shared build
RUN pnpm --filter @cryptorsi/indicators build
RUN pnpm --filter worker build

ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/runner.js"]
