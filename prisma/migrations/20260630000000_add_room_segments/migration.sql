-- Add a nullable JSON column holding a room's box decomposition
-- ([{ w, l }, ...]); NULL means a legacy single box described by w/l.
-- Nullable + no backfill so it is safe on the populated Neon PR branch.
ALTER TABLE "SiteMeasureItem" ADD COLUMN "segments" JSONB;
