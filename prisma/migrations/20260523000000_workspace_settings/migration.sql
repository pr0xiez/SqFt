-- AlterTable: Organization — workspace-settings fields
ALTER TABLE "Organization" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/New_York';
ALTER TABLE "Organization" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE "Organization" ADD COLUMN "brandColor" TEXT NOT NULL DEFAULT '#c0341a';
ALTER TABLE "Organization" ADD COLUMN "tagline" TEXT;
ALTER TABLE "Organization" ADD COLUMN "showLicenseOnQuotes" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "defaultDepositPct" DOUBLE PRECISION NOT NULL DEFAULT 0.30;
ALTER TABLE "Organization" ADD COLUMN "defaultValidityDays" INTEGER NOT NULL DEFAULT 21;
ALTER TABLE "Organization" ADD COLUMN "defaultUnitLabel" TEXT NOT NULL DEFAULT 'ft²';
ALTER TABLE "Organization" ADD COLUMN "defaultTerms" TEXT NOT NULL DEFAULT '';

-- AlterTable: Quote — per-quote captured defaults
ALTER TABLE "Quote" ADD COLUMN "terms" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Quote" ADD COLUMN "validityDays" INTEGER NOT NULL DEFAULT 21;

-- AlterTable: User.role default change
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'crew';

-- DataMigration: role value rename
UPDATE "User" SET "role" = 'admin' WHERE "role" = 'owner';
UPDATE "User" SET "role" = 'crew' WHERE "role" = 'member';
