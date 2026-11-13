import { Link } from 'react-router-dom';
import type { QueueEntry } from '../../api/queues';
import { REFRESH_INTERVAL_MS } from '../../hooks/usePolling';
import { EntryTimestamps } from './EntryTimestamps';
import { StatusBadge } from './StatusBadge';
import { EmptyNote, ErrorNote, LoadingNote, REFRESH_FAILED_TEXT, RefreshButton, linkClass } from './ui';
import type { Loadable } from './loadable';

interface Props {
  entries: Loadable<QueueEntry[]>;
  refreshFailed: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  queueNameFor: (serviceQueueId: string) => string;
}

/**
 * The customer's entries exactly as `GET /api/me/queue-entries` returns them (newest first,
 * completed history included). `aheadCount` is not in the list payload, so it is not shown here.
 */
export function MyTicketsList({ entries, refreshFailed, refreshing, onRefresh, onRetry, queueNameFor }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">Status updates automatically every {REFRESH_INTERVAL_MS / 1000} seconds.</p>
        <RefreshButton pending={refreshing} onClick={onRefresh} />
      </div>

      {refreshFailed && entries.state === 'ready' && (
        <p role="status" className="text-sm text-amber-900">
          <span aria-hidden="true">⚠ </span>
          {REFRESH_FAILED_TEXT}
        </p>
      )}

      {entries.state === 'loading' && <LoadingNote>Loading your tickets...</LoadingNote>}
      {entries.state === 'error' && (
        <ErrorNote onRetry={onRetry}>We couldn't load your tickets. Please try again.</ErrorNote>
      )}
      {entries.state === 'ready' && entries.data.length === 0 && <EmptyNote>You are not in any queue yet.</EmptyNote>}
      {entries.state === 'ready' && entries.data.length > 0 && (
        <ul className="space-y-3" aria-label="My tickets">
          {entries.data.map((entry) => {
            const queueName = queueNameFor(entry.serviceQueueId);
            return (
              <li
                key={entry.id}
                data-testid="ticket"
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
              >
                <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-white sm:w-28">
                  <span className="text-xs uppercase tracking-wide">Queue number</span>
                  <span className="text-2xl font-bold">{entry.queueNumber}</span>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="break-words text-lg font-semibold text-slate-900">{queueName}</h3>
                  <StatusBadge status={entry.status} />
                  <EntryTimestamps entry={entry} />
                </div>
                <Link
                  to={`/customer/entries/${encodeURIComponent(entry.id)}`}
                  aria-label={`View details for queue number ${entry.queueNumber} in ${queueName}`}
                  className={linkClass}
                >
                  View details
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
