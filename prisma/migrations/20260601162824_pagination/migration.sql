-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "total" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "Customer_orgId_idx" ON "Customer"("orgId");

-- CreateIndex
CREATE INDEX "Estimate_orgId_idx" ON "Estimate"("orgId");

-- CreateIndex
CREATE INDEX "SiteMeasure_orgId_idx" ON "SiteMeasure"("orgId");
