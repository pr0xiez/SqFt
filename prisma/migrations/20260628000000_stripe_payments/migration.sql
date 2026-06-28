-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "stripeConnectStatus" TEXT;
ALTER TABLE "Organization" ADD COLUMN "stripeConnectOnboardedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "stripeFeeAmount" DOUBLE PRECISION;
ALTER TABLE "Payment" ADD COLUMN "stripeNetAmount" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ProcessedStripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);
