-- User: job title + deactivation flag
ALTER TABLE "User" ADD COLUMN "title" TEXT;
ALTER TABLE "User" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;

-- Index for listing active people per org
CREATE INDEX "User_orgId_archived_idx" ON "User"("orgId", "archived");

-- New implicit M2M join: Event.assignees <-> User.events
-- (Event sorts before User, so A = Event.id [INTEGER], B = User.id [TEXT].)
CREATE TABLE "_EventToUser" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EventToUser_AB_pkey" PRIMARY KEY ("A","B")
);
CREATE INDEX "_EventToUser_B_index" ON "_EventToUser"("B");
ALTER TABLE "_EventToUser" ADD CONSTRAINT "_EventToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_EventToUser" ADD CONSTRAINT "_EventToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop the old crew tables. All current rows are demo data; nothing is migrated.
DROP TABLE "_CrewMemberToEvent";
DROP TABLE "CrewMember";
