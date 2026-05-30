-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "declineReason" TEXT,
ADD COLUMN     "declinedAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentByEmail" TEXT,
ADD COLUMN     "sentByName" TEXT,
ADD COLUMN     "sentToEmail" TEXT,
ADD COLUMN     "viewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "QuoteSignature" (
    "id" SERIAL NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "signedByName" TEXT NOT NULL,
    "signedByEmail" TEXT NOT NULL,
    "signatureData" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedIp" TEXT NOT NULL,
    "signedUserAgent" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "quoteSnapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,

    CONSTRAINT "QuoteSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteEvent" (
    "id" SERIAL NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actorEmail" TEXT,
    "actorName" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteSignature_quoteId_key" ON "QuoteSignature"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteEvent_quoteId_createdAt_idx" ON "QuoteEvent"("quoteId", "createdAt");

-- AddForeignKey
ALTER TABLE "QuoteSignature" ADD CONSTRAINT "QuoteSignature_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEvent" ADD CONSTRAINT "QuoteEvent_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
