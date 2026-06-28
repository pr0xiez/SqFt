-- Drop the retired convenience fee. Existing test/throwaway estimate totals are
-- recomputed to exclude the embedded fee so they stay consistent with the new
-- math (total = subtotal + markup); no invoice amounts/snapshots are rewritten.
UPDATE "Estimate"
SET "total" = "total" / (1 + "convenienceFeeRate")
WHERE "total" IS NOT NULL AND "convenienceFeeRate" <> 0;

ALTER TABLE "Estimate" DROP COLUMN "convenienceFeeRate";
