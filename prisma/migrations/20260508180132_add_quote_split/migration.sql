-- Destructive reset: drop priced/quote-tied rows so NOT NULL columns can be
-- added cleanly. Per spec 2026-05-08-quotes-split-design.md (decision: full
-- reset).
DELETE FROM "LineItem";
DELETE FROM "Event";
DELETE FROM "EstimateItem";
DELETE FROM "Estimate";
UPDATE "Organization" SET "nextQuoteNumber" = 1;

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_estimateId_fkey";

-- DropForeignKey
ALTER TABLE "LineItem" DROP CONSTRAINT "LineItem_estimateId_fkey";

-- DropIndex
DROP INDEX "Estimate_approvalToken_key";

-- AlterTable
ALTER TABLE "Estimate" DROP COLUMN "approvalToken",
DROP COLUMN "depositPct",
DROP COLUMN "markupPct",
DROP COLUMN "quoteNumber",
DROP COLUMN "status",
DROP COLUMN "taxRate",
ADD COLUMN     "estimateNumber" INTEGER;

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "estimateId",
ADD COLUMN     "quoteId" INTEGER;

-- AlterTable
ALTER TABLE "LineItem" DROP COLUMN "estimateId",
ADD COLUMN     "quoteId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "nextEstimateNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Quote" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "estimateId" INTEGER NOT NULL,
    "quoteNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
    "markupPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depositPct" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    "approvalToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_approvalToken_key" ON "Quote"("approvalToken");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
