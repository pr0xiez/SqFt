-- Brute-force / credential-stuffing protection: track consecutive failed
-- login attempts and a lockout expiry on the User row.
-- Both columns are defaulted/nullable so this is safe on the populated
-- Neon PR branch (no backfill required).
ALTER TABLE "User" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
