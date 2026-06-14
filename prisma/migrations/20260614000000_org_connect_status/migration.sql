-- AlterTable: Organization — Stripe Connect onboarding-status mirror.
-- Additive + defaulted/nullable, so existing rows on the populated Neon PR
-- branch backfill in place (no 23502). Mirrored from the account.updated webhook.
ALTER TABLE "Organization" ADD COLUMN "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "stripeOnboardingStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Organization" ADD COLUMN "stripeRequirementsDue" JSONB;
ALTER TABLE "Organization" ADD COLUMN "stripeDisabledReason" TEXT;
