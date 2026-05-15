-- Ensure liquidity_snapshots table exists with all required columns
-- This is idempotent: uses IF NOT EXISTS / adds columns only if missing

CREATE TABLE IF NOT EXISTS "liquidity_snapshots" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'unknown',
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "liquidity_snapshots_pkey" PRIMARY KEY ("id")
);

-- Add columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'liquidity_snapshots' AND column_name = 'execution_score') THEN
    ALTER TABLE "liquidity_snapshots" ADD COLUMN "execution_score" DECIMAL(5,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'liquidity_snapshots' AND column_name = 'activity_score') THEN
    ALTER TABLE "liquidity_snapshots" ADD COLUMN "activity_score" DECIMAL(5,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'liquidity_snapshots' AND column_name = 'fragility_score') THEN
    ALTER TABLE "liquidity_snapshots" ADD COLUMN "fragility_score" DECIMAL(5,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'liquidity_snapshots' AND column_name = 'spread_bps') THEN
    ALTER TABLE "liquidity_snapshots" ADD COLUMN "spread_bps" DECIMAL(12,6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'liquidity_snapshots' AND column_name = 'slippage_bps') THEN
    ALTER TABLE "liquidity_snapshots" ADD COLUMN "slippage_bps" DECIMAL(12,6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'liquidity_snapshots' AND column_name = 'depth_25bps_quote') THEN
    ALTER TABLE "liquidity_snapshots" ADD COLUMN "depth_25bps_quote" DECIMAL(24,8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'liquidity_snapshots' AND column_name = 'quote_volume_24h') THEN
    ALTER TABLE "liquidity_snapshots" ADD COLUMN "quote_volume_24h" DECIMAL(24,8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'liquidity_snapshots' AND column_name = 'relative_volume') THEN
    ALTER TABLE "liquidity_snapshots" ADD COLUMN "relative_volume" DECIMAL(12,6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'liquidity_snapshots' AND column_name = 'volatility_1h') THEN
    ALTER TABLE "liquidity_snapshots" ADD COLUMN "volatility_1h" DECIMAL(12,6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'liquidity_snapshots' AND column_name = 'api_latency_ms') THEN
    ALTER TABLE "liquidity_snapshots" ADD COLUMN "api_latency_ms" INTEGER;
  END IF;
END $$;

-- Create index if not exists
CREATE INDEX IF NOT EXISTS "liquidity_snapshots_symbol_created_at_idx" ON "liquidity_snapshots"("symbol", "created_at");
