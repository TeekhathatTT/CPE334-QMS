import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client';
import { isSessionExpiredError, joinQueue, type QueueEntry, type QueueSummary } from '../../api/queues';
import { Spinner } from '../Spinner';
import { StatusBadge } from './StatusBadge';
import { EmptyNote, ErrorNote, LoadingNote, linkClass, primaryButtonClass } from './ui';
import type { Loadable } from './loadable';

/** Issue #5 decision 7: join error codes mapped to safe text. Server messages are never shown. */
export const JOIN_ERROR_TEXT = {
  DUPLICATE_ACTIVE_ENTRY: 'You already have an active entry in this queue.',
  QUEUE_NOT_AVAILABLE: 'This queue is not available right now.',
  RESOURCE_NOT_FOUND: 'This queue is no longer available.',
  FORBIDDEN: "We couldn't verify this request. Please refresh the page or sign in again.",
  GENERIC: 'Something went wrong. Please try again.',
} as const;

interface JoinFailure {
  text: string;
  /** The queue list may be out of date; re-fetch it from the API. */
  refetchQueues: boolean;
}

function describeJoinFailure(err: unknown): JoinFailure {
  if (err instanceof ApiError) {
    if (err.status === 409 && err.code === 'DUPLICATE_ACTIVE_ENTRY') {
      return { text: JOIN_ERROR_TEXT.DUPLICATE_ACTIVE_ENTRY, refetchQueues: false };
    }
    if (err.status === 409 && err.code === 'QUEUE_NOT_AVAILABLE') {
      return { text: JOIN_ERROR_TEXT.QUEUE_NOT_AVAILABLE, refetchQueues: true };
    }
    if (err.status === 404) {
      return { text: JOIN_ERROR_TEXT.RESOURCE_NOT_FOUND, refetchQueues: true };
    }
    if (err.status === 403) {
      return { text: JOIN_ERROR_TEXT.FORBIDDEN, refetchQueues: false };
    }
  }
  return { text: JOIN_ERROR_TEXT.GENERIC, refetchQueues: false };
}

interface Props {
  queues: Loadable<QueueSummary[]>;
  onRetry: () => void;
  /** Re-fetch the queue list (after a closed or missing queue). */
  onQueuesStale: () => void;
  /** Called after a successful join so the parent can re-fetch both lists. */
  onJoined: (entry: QueueEntry) => void;
  queueNameFor: (serviceQueueId: string) => string;
}

export function AvailableQueues({ queues, onRetry, onQueuesStale, onJoined, queueNameFor }: Props) {
  // Per-queue in-flight guard: a second click on the same queue sends nothing, even before React
  // re-renders the disabled button (ui-spec §4, decision 8). Other queues stay usable.
  const inFlight = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [joined, setJoined] = useState<QueueEntry | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const setPending = (queueId: string, pending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(queueId);
      else next.delete(queueId);
      return next;
    });
  };

  const handleJoin = async (queue: QueueSummary) => {
    if (inFlight.current.has(queue.id)) return;
    inFlight.current.add(queue.id);
    setPending(queue.id, true);
    setFailure(null);
    setJoined(null);
    try {
      const entry = await joinQueue(queue.id);
      setJoined(entry);
      onJoined(entry);
    } catch (err) {
      // 401: the global handler already redirected to /login with the session-expired banner.
      if (!isSessionExpiredError(err)) {
        const { text, refetchQueues } = describeJoinFailure(err);
        setFailure(text);
        if (refetchQueues) onQueuesStale();
      }
    } finally {
      inFlight.current.delete(queue.id);
      setPending(queue.id, false);
    }
  };

  return (
    <div className="space-y-4">
      {joined && (
        <div role="status" className="rounded-lg border border-green-300 bg-green-50 p-4 text-green-950">
          <p className="font-semibold">
            <span aria-hidden="true">✓ </span>
            You joined {queueNameFor(joined.serviceQueueId)}.
          </p>
          <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-medium">Queue</dt>
              <dd className="break-words">{queueNameFor(joined.serviceQueueId)}</dd>
            </div>
            <div>
              <dt className="font-medium">Queue number</dt>
              <dd className="text-2xl font-bold" data-testid="joined-queue-number">
                {joined.queueNumber}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Status</dt>
              <dd>
                <StatusBadge status={joined.status} />
              </dd>
            </div>
          </dl>
          <Link to={`/customer/entries/${encodeURIComponent(joined.id)}`} className={linkClass}>
            View details
          </Link>
        </div>
      )}

      {failure && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">
          <span aria-hidden="true">⚠ </span>
          {failure}
        </p>
      )}

      {queues.state === 'loading' && <LoadingNote>Loading queues...</LoadingNote>}
      {queues.state === 'error' && (
        <ErrorNote onRetry={onRetry}>We couldn't load the queues. Please try again.</ErrorNote>
      )}
      {queues.state === 'ready' && queues.data.length === 0 && <EmptyNote>No queues are open right now.</EmptyNote>}
      {queues.state === 'ready' && queues.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Open queues">
          {queues.data.map((queue) => {
            const pending = pendingIds.has(queue.id);
            const headingId = `queue-${queue.id}-name`;
            return (
              <li
                key={queue.id}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <h3 id={headingId} className="break-words text-lg font-semibold text-slate-900">
                    {queue.name}
                  </h3>
                  {queue.description && <p className="mt-1 break-words text-slate-700">{queue.description}</p>}
                </div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-green-800">
                  <span className="sr-only">Availability: </span>
                  <svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                    <circle cx="10" cy="10" r="5" />
                  </svg>
                  {queue.availability === 'OPEN' ? 'Open' : 'Closed'}
                </p>
                <button
                  type="button"
                  onClick={() => handleJoin(queue)}
                  disabled={pending}
                  aria-label={pending ? undefined : `Join queue: ${queue.name}`}
                  className={`${primaryButtonClass} mt-auto w-full sm:w-auto sm:self-start`}
                >
                  {pending ? (
                    <>
                      <Spinner />
                      Joining queue...
                    </>
                  ) : (
                    'Join Queue'
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
