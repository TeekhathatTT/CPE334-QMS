-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "QueueAvailability" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'CALLED', 'SERVING', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "Role" NOT NULL,
    "accountStatus" "AccountStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceQueue" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "availability" "QueueAvailability" NOT NULL DEFAULT 'OPEN',
    "lastQueueNumber" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ServiceQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorAssignment" (
    "operatorId" UUID NOT NULL,
    "serviceQueueId" UUID NOT NULL,
    "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorAssignment_pkey" PRIMARY KEY ("operatorId","serviceQueueId")
);

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "serviceQueueId" UUID NOT NULL,
    "queueNumber" BIGINT NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
    "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMPTZ,
    "serviceStartedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "OperatorAssignment" ADD CONSTRAINT "OperatorAssignment_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorAssignment" ADD CONSTRAINT "OperatorAssignment_serviceQueueId_fkey" FOREIGN KEY ("serviceQueueId") REFERENCES "ServiceQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_serviceQueueId_fkey" FOREIGN KEY ("serviceQueueId") REFERENCES "ServiceQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SDS Required Database Constraints and Indexes
ALTER TABLE "ServiceQueue"
  ADD CONSTRAINT "ServiceQueue_lastQueueNumber_nonnegative_chk"
  CHECK ("lastQueueNumber" >= 0);

ALTER TABLE "QueueEntry"
  ADD CONSTRAINT "QueueEntry_queueNumber_positive_chk"
  CHECK ("queueNumber" > 0),
  ADD CONSTRAINT "QueueEntry_serviceQueueId_queueNumber_key"
  UNIQUE ("serviceQueueId", "queueNumber");

CREATE INDEX "QueueEntry_fifo_idx"
  ON "QueueEntry" ("serviceQueueId", "joinedAt" ASC, "id" ASC);

CREATE UNIQUE INDEX "QueueEntry_active_customer_queue_uidx"
  ON "QueueEntry" ("customerId", "serviceQueueId")
  WHERE "status" IN ('WAITING', 'CALLED', 'SERVING');

CREATE INDEX "QueueEntry_customer_joinedAt_idx"
  ON "QueueEntry" ("customerId", "joinedAt" DESC);

