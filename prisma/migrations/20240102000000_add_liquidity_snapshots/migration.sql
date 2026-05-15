-- CreateTable
CREATE TABLE "liquidity_snapshots" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "state" TEXT NOT NULL,
    "execution_score" DECIMAL(5,2),
    "activity_score" DECIMAL(5,2),
    "fragility_score" DECIMAL(5,2),
    "spread_bps" DECIMAL(12,6),
    "slippage_bps" DECIMAL(12,6),
    "depth_25bps_quote" DECIMAL(24,8),
    "quote_volume_24h" DECIMAL(24,8),
    "relative_volume" DECIMAL(12,6),
    "volatility_1h" DECIMAL(12,6),
    "api_latency_ms" INTEGER,
    "reasons" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "liquidity_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "liquidity_snapshots_symbol_created_at_idx" ON "liquidity_snapshots"("symbol", "created_at");
