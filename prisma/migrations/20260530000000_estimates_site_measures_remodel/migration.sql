-- DropForeignKey
ALTER TABLE "Estimate" DROP CONSTRAINT "Estimate_customerId_fkey";

-- DropForeignKey
ALTER TABLE "EstimateItem" DROP CONSTRAINT "EstimateItem_estimateId_fkey";

-- DropForeignKey
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_estimateId_fkey";

-- DropForeignKey
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_revisedFromId_fkey";

-- DropForeignKey
ALTER TABLE "LineItem" DROP CONSTRAINT "LineItem_quoteId_fkey";

-- DropForeignKey
ALTER TABLE "QuoteSignature" DROP CONSTRAINT "QuoteSignature_quoteId_fkey";

-- DropForeignKey
ALTER TABLE "QuoteEvent" DROP CONSTRAINT "QuoteEvent_quoteId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_quoteId_fkey";

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "nextQuoteNumber",
DROP COLUMN "showLicenseOnQuotes",
ADD COLUMN     "nextSiteMeasureNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "showLicenseOnEstimates" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "address";

-- AlterTable
ALTER TABLE "Estimate" DROP COLUMN "customerId",
DROP COLUMN "title",
ADD COLUMN     "approvalToken" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "convenienceFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "declinedAt" TIMESTAMP(3),
ADD COLUMN     "depositPct" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
ADD COLUMN     "markupPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "revisedFromId" INTEGER,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentByEmail" TEXT,
ADD COLUMN     "sentByName" TEXT,
ADD COLUMN     "sentToEmail" TEXT,
ADD COLUMN     "siteMeasureId" INTEGER NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN     "terms" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "validityDays" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "viewedAt" TIMESTAMP(3),
ALTER COLUMN "estimateNumber" SET NOT NULL;

-- AlterTable
ALTER TABLE "LineItem" DROP COLUMN "quoteId",
ADD COLUMN     "estimateId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Event" DROP COLUMN "quoteId",
ADD COLUMN     "estimateId" INTEGER;

-- DropTable
DROP TABLE "EstimateItem";

-- DropTable
DROP TABLE "Quote";

-- DropTable
DROP TABLE "QuoteSignature";

-- DropTable
DROP TABLE "QuoteEvent";

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteMeasure" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "locationId" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "siteMeasureNumber" INTEGER,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteMeasureItem" (
    "id" SERIAL NOT NULL,
    "siteMeasureId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT,
    "shape" TEXT,
    "w" DOUBLE PRECISION,
    "l" DOUBLE PRECISION,
    "note" TEXT,
    "text" TEXT,

    CONSTRAINT "SiteMeasureItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateApproval" (
    "id" SERIAL NOT NULL,
    "estimateId" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "EstimateApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateEvent" (
    "id" SERIAL NOT NULL,
    "estimateId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actorEmail" TEXT,
    "actorName" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_orgId_idx" ON "Location"("orgId");

-- CreateIndex
CREATE INDEX "Location_customerId_idx" ON "Location"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateApproval_estimateId_key" ON "EstimateApproval"("estimateId");

-- CreateIndex
CREATE INDEX "EstimateEvent_estimateId_createdAt_idx" ON "EstimateEvent"("estimateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_approvalToken_key" ON "Estimate"("approvalToken");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMeasure" ADD CONSTRAINT "SiteMeasure_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMeasure" ADD CONSTRAINT "SiteMeasure_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMeasureItem" ADD CONSTRAINT "SiteMeasureItem_siteMeasureId_fkey" FOREIGN KEY ("siteMeasureId") REFERENCES "SiteMeasure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_siteMeasureId_fkey" FOREIGN KEY ("siteMeasureId") REFERENCES "SiteMeasure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_revisedFromId_fkey" FOREIGN KEY ("revisedFromId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateApproval" ADD CONSTRAINT "EstimateApproval_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateEvent" ADD CONSTRAINT "EstimateEvent_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

