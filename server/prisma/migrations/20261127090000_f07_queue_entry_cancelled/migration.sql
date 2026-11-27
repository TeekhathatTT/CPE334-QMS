-- F-07 Customer cancellation and queue withdrawal (Sprint 2, issue #40).
-- Additive only. The new enum value is NOT used in this migration, so ADD VALUE is safe inside
-- the migration transaction (PostgreSQL 12+). The partial unique index
-- "QueueEntry_active_customer_queue_uidx" (WAITING, CALLED, SERVING) is intentionally unchanged:
-- CANCELLED is not an active state, so a customer may rejoin after cancelling (BR-05 rev. 2.0).

-- AlterEnum
ALTER TYPE "QueueStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "QueueEntry" ADD COLUMN "cancelledAt" TIMESTAMPTZ;
