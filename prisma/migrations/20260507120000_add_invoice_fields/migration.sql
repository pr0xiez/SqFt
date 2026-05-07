-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "invoiceNumber" INTEGER,
ADD COLUMN     "invoicedAt" TIMESTAMP(3),
ADD COLUMN     "dueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "nextInvoiceNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "invoicePrefix" TEXT;
