-- Add email encryption fields to users table
-- These store the nonce and tag needed to decrypt emailCiphertext

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'emailNonce') THEN
    ALTER TABLE "users" ADD COLUMN "emailNonce" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'emailTag') THEN
    ALTER TABLE "users" ADD COLUMN "emailTag" TEXT;
  END IF;
END $$;
