import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAssignedQueues } from '../api/operator';
import { isSessionExpiredError, type QueueSummary } from '../api/queues';
import type { Loadable } from '../components/customer/loadable';
import {
  EmptyNote,
  ErrorNote,
  LiveAnnouncer,
  LoadingNote,
  REFRESH_FAILED_TEXT,
  RefreshButton,
  primaryButtonClass,
} from '../components/customer/ui';
import { usePolling } from '../hooks/usePolling';

/** `/operator` — lists service queues assigned to the signed-in operator (ui-spec §3, §5.2). */
export function OperatorHomePage() {
  const [queues, setQueues] = useState<Loadable<QueueSummary[]>>({ state: 'loading' });
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const queuesRef = useRef<QueueSummary[] | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadQueues = useCallback(async () => {
    try {
      const data = await listAssignedQueues();
      if (!mounted.current) return;
      queuesRef.current = data;
      setQueues({ state: 'ready', data });
      setRefreshFailed(false);
    } catch (err) {
      if (!mounted.current || isSessionExpiredError(err)) return;
      if (queuesRef.current) {
        setRefreshFailed(true);
      } else {
        setQueues({ state: 'error' });
      }
    }
  }, []);

  useEffect(() => {
    void loadQueues();
  }, [loadQueues]);

  usePolling(loadQueues, true);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await loadQueues();
    if (mounted.current) {
      setRefreshing(false);
      setAnnouncement('Assigned queues refreshed.');
    }
  };

  const handleRetry = () => {
    setQueues({ state: 'loading' });
    void loadQueues();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assigned queues</h1>
          <p className="mt-1 text-sm text-slate-600">
            Select an assigned service queue to call next, start service, or complete service.
          </p>
        </div>
        <RefreshButton pending={refreshing} onClick={handleRefresh} />
      </div>

      <LiveAnnouncer message={announcement} />

      {refreshFailed && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span aria-hidden="true">⚠ </span>
          {REFRESH_FAILED_TEXT}
        </p>
      )}

      {queues.state === 'loading' && <LoadingNote>Loading assigned queues...</LoadingNote>}
      {queues.state === 'error' && (
        <ErrorNote onRetry={handleRetry}>We couldn&apos;t load your assigned queues. Please try again.</ErrorNote>
      )}
      {queues.state === 'ready' && queues.data.length === 0 && (
        <EmptyNote>You have no assigned service queues.</EmptyNote>
      )}
      {queues.state === 'ready' && queues.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Assigned queues">
          {queues.data.map((queue) => {
            const isOpen = queue.availability === 'OPEN';
            return (
              <li
                key={queue.id}
                className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="break-words text-lg font-semibold text-slate-900">{queue.name}</h2>
                    <span
                      data-availability={queue.availability}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        isOpen
                          ? 'border-green-300 bg-green-50 text-green-900'
                          : 'border-slate-300 bg-slate-100 text-slate-800'
                      }`}
                    >
                      <span className="sr-only">Availability: </span>
                      <svg
                        aria-hidden="true"
                        focusable="false"
                        viewBox="0 0 20 20"
                        className="h-3.5 w-3.5"
                        fill="currentColor"
                      >
                        {isOpen ? (
                          <circle cx="10" cy="10" r="5" />
                        ) : (
                          <rect x="5" y="5" width="10" height="10" rx="2" />
                        )}
                      </svg>
                      {isOpen ? 'Open' : 'Closed'}
                    </span>
                  </div>
                  {queue.description && <p className="break-words text-sm text-slate-700">{queue.description}</p>}
                </div>
                <Link
                  to={`/operator/queues/${encodeURIComponent(queue.id)}`}
                  aria-label={`Manage queue: ${queue.name}`}
                  className={primaryButtonClass}
                >
                  Manage queue
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

