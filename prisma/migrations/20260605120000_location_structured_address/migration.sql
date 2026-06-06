-- Structured address columns on Location. Required parts get DEFAULT '' so the
-- migration is non-destructive on the populated Neon DB (no 23502 on existing
-- rows). New/updated rows always write real values (enforced by Zod). lat/lon
-- are nullable. The derived `address` column is unchanged.
ALTER TABLE "Location" ADD COLUMN "street" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Location" ADD COLUMN "unit" TEXT;
ALTER TABLE "Location" ADD COLUMN "city" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Location" ADD COLUMN "state" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Location" ADD COLUMN "postalCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Location" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Location" ADD COLUMN "lon" DOUBLE PRECISION;
