#!/bin/sh
set -e

echo "CryptoRSI v2 API - Starting..."

# Run pending migrations
echo "Running database migrations..."
npx prisma migrate deploy --config ./prisma.config.ts

echo "Starting API server..."
exec node dist/server.js
