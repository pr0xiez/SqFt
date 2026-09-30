-- QuickBooks Online sync: connection (encrypted tokens), record links,
-- durable task outbox, and the test-only mock-realm store. All-new tables,
-- so safe on the populated Neon PR branch (no NOT NULL added to existing rows).

-- CreateTable
CREATE TABLE "QboConnection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "companyName" TEXT,
    "qboItemId" TEXT,
    "qboItemName" TEXT NOT NULL DEFAULT 'Flooring services',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "QboConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboLink" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "qboId" TEXT NOT NULL,
    "syncToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboSyncTask" (
    "id" SERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboSyncTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QboMockRealm" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboMockRealm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QboConnection_orgId_key" ON "QboConnection"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "QboConnection_realmId_key" ON "QboConnection"("realmId");

-- CreateIndex
CREATE UNIQUE INDEX "QboLink_orgId_entityType_entityId_key" ON "QboLink"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "QboLink_orgId_idx" ON "QboLink"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "QboSyncTask_orgId_kind_entityId_key" ON "QboSyncTask"("orgId", "kind", "entityId");

-- CreateIndex
CREATE INDEX "QboSyncTask_status_nextAttemptAt_idx" ON "QboSyncTask"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "QboConnection" ADD CONSTRAINT "QboConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboLink" ADD CONSTRAINT "QboLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QboSyncTask" ADD CONSTRAINT "QboSyncTask_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
