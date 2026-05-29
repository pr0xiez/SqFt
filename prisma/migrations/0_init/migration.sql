-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "phone" TEXT,
    "address" TEXT,
    "licenseNumber" TEXT,
    "logo" TEXT,
    "nextSiteMeasureNumber" INTEGER NOT NULL DEFAULT 1,
    "nextEstimateNumber" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "brandColor" TEXT NOT NULL DEFAULT '#c0341a',
    "tagline" TEXT,
    "showLicenseOnEstimates" BOOLEAN NOT NULL DEFAULT true,
    "defaultDepositPct" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "defaultValidityDays" INTEGER NOT NULL DEFAULT 21,
    "defaultUnitLabel" TEXT NOT NULL DEFAULT 'ft²',
    "defaultTerms" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'manual',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEndsAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'crew',
    "orgId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "source" TEXT NOT NULL DEFAULT 'phone',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "Estimate" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "siteMeasureId" INTEGER NOT NULL,
    "estimateNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convenienceFeeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "markupPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depositPct" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    "terms" TEXT NOT NULL DEFAULT '',
    "validityDays" INTEGER NOT NULL DEFAULT 21,
    "approvalToken" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentToEmail" TEXT,
    "sentByEmail" TEXT,
    "sentByName" TEXT,
    "viewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revisedFromId" INTEGER,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItem" (
    "id" SERIAL NOT NULL,
    "estimateId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qtyMode" TEXT NOT NULL DEFAULT 'manual',
    "qty" DOUBLE PRECISION,
    "wastePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitLabel" TEXT NOT NULL DEFAULT 'ft²',
    "linkedRoomIds" INTEGER[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItemTemplate" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitLabel" TEXT NOT NULL DEFAULT 'ft²',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineItemTemplate_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "customerId" INTEGER,
    "estimateId" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewMember" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CrewMemberToEvent" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CrewMemberToEvent_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeCustomerId_key" ON "Organization"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeSubscriptionId_key" ON "Organization"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Location_orgId_idx" ON "Location"("orgId");

-- CreateIndex
CREATE INDEX "Location_customerId_idx" ON "Location"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_approvalToken_key" ON "Estimate"("approvalToken");

-- CreateIndex
CREATE INDEX "LineItemTemplate_orgId_archived_idx" ON "LineItemTemplate"("orgId", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateApproval_estimateId_key" ON "EstimateApproval"("estimateId");

-- CreateIndex
CREATE INDEX "EstimateEvent_estimateId_createdAt_idx" ON "EstimateEvent"("estimateId", "createdAt");

-- CreateIndex
CREATE INDEX "CrewMember_orgId_archived_idx" ON "CrewMember"("orgId", "archived");

-- CreateIndex
CREATE INDEX "_CrewMemberToEvent_B_index" ON "_CrewMemberToEvent"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_siteMeasureId_fkey" FOREIGN KEY ("siteMeasureId") REFERENCES "SiteMeasure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_revisedFromId_fkey" FOREIGN KEY ("revisedFromId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItem" ADD CONSTRAINT "LineItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItemTemplate" ADD CONSTRAINT "LineItemTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateApproval" ADD CONSTRAINT "EstimateApproval_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateEvent" ADD CONSTRAINT "EstimateEvent_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CrewMemberToEvent" ADD CONSTRAINT "_CrewMemberToEvent_A_fkey" FOREIGN KEY ("A") REFERENCES "CrewMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CrewMemberToEvent" ADD CONSTRAINT "_CrewMemberToEvent_B_fkey" FOREIGN KEY ("B") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

