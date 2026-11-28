/**
 * F-11 Operational analytics service (SRS v6.0 FR-23, BR-24 – BR-26; Sprint 3 api-spec §2.1).
 * One indexed read of the cohort (`QueueEntry_fifo_idx` on serviceQueueId, joinedAt, id); no locks, no writes.
 */
import { prisma } from '../db';
import { AppError } from '../errors/AppError';
import { ANALYTICS_TIMEZONE, parseAnalyticsRange, summarizeCohort, type CohortSummary } from './analyticsPolicy';

export interface QueueAnalytics extends CohortSummary {
  queueId: string;
  queueName: string;
  from: string;
  to: string;
  timezone: string;
}

export async function getQueueAnalytics(queueId: string, from: unknown, to: unknown): Promise<QueueAnalytics> {
  const range = parseAnalyticsRange(from, to);

  const queue = await prisma.serviceQueue.findUnique({ where: { id: queueId }, select: { id: true, name: true } });
  if (!queue) {
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Queue not found.');
  }

  const rows = await prisma.queueEntry.findMany({
    where: {
      serviceQueueId: queueId,
      joinedAt: { gte: range.fromUtc, lt: range.toUtcExclusive },
    },
    select: {
      status: true,
      priority: true,
      joinedAt: true,
      calledAt: true,
      serviceStartedAt: true,
      completedAt: true,
      recoveredAt: true,
    },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
  });

  return {
    queueId: queue.id,
    queueName: queue.name,
    from: range.days[0],
    to: range.days[range.days.length - 1],
    timezone: ANALYTICS_TIMEZONE,
    ...summarizeCohort(rows, range.days),
  };
}
