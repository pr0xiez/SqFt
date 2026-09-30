CREATE UNIQUE INDEX "QboLink_orgId_entityType_qboId_key" ON "QboLink"("orgId", "entityType", "qboId");
ALTER TABLE "QboConnection" ADD COLUMN "runnerLeaseUntil" TIMESTAMP(3);
