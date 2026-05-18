-- Rename Quote.taxRate -> Quote.convenienceFeeRate and change the default
-- from 8% sales tax to a 3% convenience fee. Existing rows keep their value.
ALTER TABLE "Quote" RENAME COLUMN "taxRate" TO "convenienceFeeRate";
ALTER TABLE "Quote" ALTER COLUMN "convenienceFeeRate" SET DEFAULT 0.03;
