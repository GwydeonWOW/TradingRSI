#!/bin/sh
set -e

echo "CryptoRSI v2 API - Starting..."

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Run pending migrations
echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting API server..."
exec node dist/server.js
