-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN "title" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "endDate" TIMESTAMP(3);
