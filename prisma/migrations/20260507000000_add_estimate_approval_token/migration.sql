-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "approvalToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_approvalToken_key" ON "Estimate"("approvalToken");
