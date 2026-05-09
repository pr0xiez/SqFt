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
CREATE INDEX "CrewMember_orgId_archived_idx" ON "CrewMember"("orgId", "archived");

-- CreateIndex
CREATE INDEX "_CrewMemberToEvent_B_index" ON "_CrewMemberToEvent"("B");

-- AddForeignKey
ALTER TABLE "CrewMember" ADD CONSTRAINT "CrewMember_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CrewMemberToEvent" ADD CONSTRAINT "_CrewMemberToEvent_A_fkey" FOREIGN KEY ("A") REFERENCES "CrewMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CrewMemberToEvent" ADD CONSTRAINT "_CrewMemberToEvent_B_fkey" FOREIGN KEY ("B") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one CrewMember row per distinct non-empty Event.crew per org.
INSERT INTO "CrewMember" ("orgId", "name")
SELECT DISTINCT "orgId", "crew"
FROM "Event"
WHERE "crew" IS NOT NULL AND "crew" <> '';

-- Backfill: connect each event with a non-empty crew string to its matching CrewMember.
INSERT INTO "_CrewMemberToEvent" ("A", "B")
SELECT cm."id", e."id"
FROM "Event" e
JOIN "CrewMember" cm
  ON cm."orgId" = e."orgId"
 AND cm."name" = e."crew"
WHERE e."crew" IS NOT NULL AND e."crew" <> '';

-- Sanity: every event with a crew string must now have exactly one join row.
DO $$
DECLARE
  expected INT;
  actual INT;
BEGIN
  SELECT COUNT(*) INTO expected FROM "Event" WHERE "crew" IS NOT NULL AND "crew" <> '';
  SELECT COUNT(*) INTO actual FROM "_CrewMemberToEvent";
  IF expected <> actual THEN
    RAISE EXCEPTION 'Crew backfill mismatch: expected % join rows, got %', expected, actual;
  END IF;
END $$;

-- DropColumn (after backfill verified)
ALTER TABLE "Event" DROP COLUMN "crew";
