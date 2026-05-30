-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "quoteNumber" INTEGER;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "address" TEXT,
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "logo" TEXT,
ADD COLUMN     "nextQuoteNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "phone" TEXT;
