-- F-08 No-show handling and recovery (issue #41; SRS v3.0 FR-15, FR-16, BR-15 - BR-17).
-- Additive only. 'NO_SHOW' is not used anywhere in this migration, so ALTER TYPE ... ADD VALUE is
-- safe inside the migration transaction (PostgreSQL 12+). The partial unique index
-- "QueueEntry_active_customer_queue_uidx" (active = WAITING, CALLED, SERVING) is unchanged:
-- NO_SHOW is not an active state.
ALTER TYPE "QueueStatus" ADD VALUE 'NO_SHOW';

-- Time of the latest no-show, time of the return to the queue, and the number of no-shows.
ALTER TABLE "QueueEntry" ADD COLUMN "noShowAt" TIMESTAMPTZ;
ALTER TABLE "QueueEntry" ADD COLUMN "recoveredAt" TIMESTAMPTZ;
ALTER TABLE "QueueEntry" ADD COLUMN "noShowCount" INTEGER NOT NULL DEFAULT 0;

-- BR-16 / BR-17: an entry can be returned once, so at most two no-shows. Kept in the database,
-- not only in code.
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_noShowCount_range_check"
  CHECK ("noShowCount" >= 0 AND "noShowCount" <= 2);
