-- F-10 Priority queue policy (SRS v5.1 FR-20..FR-22, BR-01 rev. 5.0, BR-21..BR-23, AC-53).
-- Additive migration: introduces QueuePriority enum, QueueEntry.priority (NOT NULL DEFAULT 'NORMAL'),
-- and partial expression index for priority-aware FIFO Call Next & aheadCount queries.

CREATE TYPE "QueuePriority" AS ENUM ('NORMAL', 'PRIORITY');

ALTER TABLE "QueueEntry"
  ADD COLUMN "priority" "QueuePriority" NOT NULL DEFAULT 'NORMAL';

CREATE INDEX "QueueEntry_waiting_priority_fifo_idx"
ON "QueueEntry" (
  "serviceQueueId",
  (CASE WHEN "priority" = 'PRIORITY'::"QueuePriority" THEN 0 ELSE 1 END) ASC,
  "joinedAt" ASC,
  "id" ASC
)
WHERE "status" = 'WAITING'::"QueueStatus";
