-- Organization additions (all NOT NULL columns carry defaults → safe on populated DB)
ALTER TABLE "Organization"
  ADD COLUMN "nextInvoiceNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "defaultPaymentInstructions" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "stripeConnectAccountId" TEXT;

-- Invoice
CREATE TABLE "Invoice" (
  "id" SERIAL NOT NULL,
  "orgId" TEXT NOT NULL,
  "estimateId" INTEGER NOT NULL,
  "invoiceNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "amount" DOUBLE PRECISION NOT NULL,
  "pct" DOUBLE PRECISION,
  "memo" TEXT,
  "coverNote" TEXT NOT NULL DEFAULT '',
  "terms" TEXT NOT NULL DEFAULT '',
  "paymentInstructions" TEXT NOT NULL DEFAULT '',
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP(3),
  "publicToken" TEXT,
  "sentAt" TIMESTAMP(3),
  "sentToEmail" TEXT,
  "sentByEmail" TEXT,
  "sentByName" TEXT,
  "viewedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "stripePaymentLinkUrl" TEXT,
  "stripePaymentIntentId" TEXT,
  "snapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_publicToken_key" ON "Invoice"("publicToken");
CREATE UNIQUE INDEX "Invoice_stripePaymentIntentId_key" ON "Invoice"("stripePaymentIntentId");
CREATE UNIQUE INDEX "Invoice_orgId_invoiceNumber_key" ON "Invoice"("orgId", "invoiceNumber");
CREATE INDEX "Invoice_orgId_idx" ON "Invoice"("orgId");
CREATE INDEX "Invoice_estimateId_idx" ON "Invoice"("estimateId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_estimateId_fkey"
  FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Payment
CREATE TABLE "Payment" (
  "id" SERIAL NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "method" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reference" TEXT,
  "note" TEXT,
  "recordedByEmail" TEXT,
  "recordedByName" TEXT,
  "stripeChargeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_stripeChargeId_key" ON "Payment"("stripeChargeId");
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- InvoiceEvent
CREATE TABLE "InvoiceEvent" (
  "id" SERIAL NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "actorEmail" TEXT,
  "actorName" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceEvent_invoiceId_createdAt_idx" ON "InvoiceEvent"("invoiceId", "createdAt");
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
