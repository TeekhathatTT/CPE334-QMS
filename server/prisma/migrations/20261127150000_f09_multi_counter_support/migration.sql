-- F-09 Multi-counter support (issue #42; SRS v4.1 FR-17 - FR-19, BR-18 - BR-20).
-- Additive schema migration: introduces CounterStatus, Counter table, and nullable QueueEntry.counterId
-- guarded by a composite foreign key (MATCH SIMPLE, default) so NULL is permitted for WAITING/CANCELLED/legacy
-- entries while any non-null counterId belonging to a different serviceQueueId is rejected by PostgreSQL.

-- CreateEnum
CREATE TYPE "CounterStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "Counter" (
    "id" UUID NOT NULL,
    "serviceQueueId" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "status" "CounterStatus" NOT NULL DEFAULT 'OPEN',
    "assignedOperatorId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "QueueEntry" ADD COLUMN "counterId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Counter_serviceQueueId_name_key" ON "Counter"("serviceQueueId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_id_serviceQueueId_key" ON "Counter"("id", "serviceQueueId");

-- CreateIndex
CREATE INDEX "Counter_serviceQueueId_idx" ON "Counter"("serviceQueueId", "name" ASC, "id" ASC);

-- CreateIndex
CREATE INDEX "Counter_assignedOperatorId_idx" ON "Counter"("assignedOperatorId");

-- CreateIndex
CREATE INDEX "QueueEntry_counterId_idx" ON "QueueEntry"("counterId");

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_serviceQueueId_fkey"
    FOREIGN KEY ("serviceQueueId") REFERENCES "ServiceQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_assignedOperatorId_fkey"
    FOREIGN KEY ("assignedOperatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (composite FK, PostgreSQL MATCH SIMPLE default, enforcing BR-20 at DB layer per BR-12)
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_counterId_serviceQueueId_fkey"
    FOREIGN KEY ("counterId", "serviceQueueId") REFERENCES "Counter"("id", "serviceQueueId") ON DELETE RESTRICT ON UPDATE RESTRICT;
