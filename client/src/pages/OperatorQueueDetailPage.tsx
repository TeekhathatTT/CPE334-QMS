import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, CSRF_COOKIE, readCookie } from '../api/client';
import {
  callNextQueueEntry,
  completeQueueEntry,
  listAssignedQueues,
  listOperatorQueueEntries,
  startQueueEntry,
} from '../api/operator';
import {
  UNKNOWN_QUEUE_NAME,
  isSessionExpiredError,
  type QueueEntry,
  type QueueSummary,
} from '../api/queues';
import { EntryTimestamps } from '../components/customer/EntryTimestamps';
import { STATUS_LABELS, StatusBadge } from '../components/customer/StatusBadge';
import {
  EmptyNote,
  ErrorNote,
  LiveAnnouncer,
  LoadingNote,
  REFRESH_FAILED_TEXT,
  RefreshButton,
  focusRing,
  linkClass,
  primaryButtonClass,
} from '../components/customer/ui';
import { Spinner } from '../components/Spinner';
import { usePolling } from '../hooks/usePolling';

export const OPERATOR_QUEUE_FORBIDDEN_TEXT = 'You do not have permission to manage this queue.';
export const OPERATOR_QUEUE_NOT_FOUND_TEXT = "We couldn't find that service queue.";
export const OPERATOR_EMPTY_CALL_NEXT_TEXT = 'No waiting entries to call right now.';

export const OPERATOR_ACTION_ERROR_TEXT = {
  CONFLICT: "This queue entry's status has changed. The queue has been refreshed.",
  FORBIDDEN: 'You do not have permission to perform this action.',
  QUEUE_NOT_FOUND: OPERATOR_QUEUE_NOT_FOUND_TEXT,
  NOT_FOUND: "We couldn't find that queue entry.",
  CSRF: "We couldn't verify this request. Please refresh the page or sign in again.",
  GENERIC: 'Something went wrong. Please try again.',
} as const;

interface ActionFailure {
  text: string;
  refetchEntries: boolean;
}

function isCsrfForbidden(err: ApiError): boolean {
  if (err.code.toUpperCase().includes('CSRF')) return true;
  if (err.serverMessage && /csrf|verified/i.test(err.serverMessage)) return true;
  if (!readCookie(CSRF_COOKIE)) return true;
  return false;
}

function describeActionFailure(err: unknown, target: 'queue' | 'entry'): ActionFailure {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      return { text: OPERATOR_ACTION_ERROR_TEXT.CONFLICT, refetchEntries: true };
    }
    if (err.status === 404) {
      if (target === 'queue') {
        return { text: OPERATOR_ACTION_ERROR_TEXT.QUEUE_NOT_FOUND, refetchEntries: false };
      }
      return { text: OPERATOR_ACTION_ERROR_TEXT.NOT_FOUND, refetchEntries: true };
    }
    if (err.status === 403) {
      if (isCsrfForbidden(err)) {
        return { text: OPERATOR_ACTION_ERROR_TEXT.CSRF, refetchEntries: false };
      }
      return { text: OPERATOR_ACTION_ERROR_TEXT.FORBIDDEN, refetchEntries: false };
    }
  }
  return { text: OPERATOR_ACTION_ERROR_TEXT.GENERIC, refetchEntries: false };
}

type ViewState =
  | { state: 'loading' }
  | { state: 'forbidden' }
  | { state: 'notFound' }
  | { state: 'error' }
  | { state: 'ready'; entries: QueueEntry[] };

interface FeedbackBanner {
  kind: 'success' | 'info' | 'error';
  text: string;
}

/** `/operator/queues/:id` — manage queue lifecycle actions: call next, start, complete (ui-spec §3, §5.2). */
export function OperatorQueueDetailPage() {
  const { id = '' } = useParams();
  const [view, setView] = useState<ViewState>({ state: 'loading' });
  const [queues, setQueues] = useState<QueueSummary[] | undefined>(undefined);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [callingNext, setCallingNext] = useState(false);
  const [startingIds, setStartingIds] = useState<ReadonlySet<string>>(new Set());
  const [completingIds, setCompletingIds] = useState<ReadonlySet<string>>(new Set());
  const [feedback, setFeedback] = useState<FeedbackBanner | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const callingNextRef = useRef(false);
  const entryActionInFlightRef = useRef(new Set<string>());
  const entriesRef = useRef<QueueEntry[] | null>(null);
  const activeQueueIdRef = useRef(id);
  activeQueueIdRef.current = id;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadAssignedQueueMeta = useCallback(async () => {
    try {
      const data = await listAssignedQueues();
      if (mounted.current) setQueues(data);
    } catch {
      // Queue metadata falls back gracefully; 401 is handled globally.
    }
  }, []);

  const loadEntries = useCallback(async () => {
    const requestedQueueId = id;
    try {
      const entries = await listOperatorQueueEntries(requestedQueueId);
      if (!mounted.current || activeQueueIdRef.current !== requestedQueueId) return;

      const previous = entriesRef.current;
      if (previous) {
        const before = new Map(previous.map((e) => [e.id, e.status]));
        const changed = entries
          .filter((e) => before.has(e.id) && before.get(e.id) !== e.status)
          .map((e) => `Queue number ${e.queueNumber} is now ${STATUS_LABELS[e.status]}.`)
          .join(' ');
        if (changed) setAnnouncement(changed);
      }

      entriesRef.current = entries;
      setView({ state: 'ready', entries });
      setRefreshFailed(false);
    } catch (err) {
      if (!mounted.current || activeQueueIdRef.current !== requestedQueueId || isSessionExpiredError(err)) {
        return;
      }
      if (err instanceof ApiError) {
        if (err.status === 403) {
          entriesRef.current = null;
          setView({ state: 'forbidden' });
          return;
        }
        if (err.status === 404 || err.status === 400) {
          entriesRef.current = null;
          setView({ state: 'notFound' });
          return;
        }
      }
      if (entriesRef.current) {
        setRefreshFailed(true);
      } else {
        setView({ state: 'error' });
      }
    }
  }, [id]);

  useEffect(() => {
    entriesRef.current = null;
    setView({ state: 'loading' });
    setRefreshFailed(false);
    setFeedback(null);
    setAnnouncement('');
    void loadEntries();
    void loadAssignedQueueMeta();
  }, [loadEntries, loadAssignedQueueMeta]);

  usePolling(loadEntries, view.state === 'ready');

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([loadEntries(), loadAssignedQueueMeta()]);
    if (mounted.current) {
      setRefreshing(false);
    }
  };

  const handleRetry = () => {
    setView({ state: 'loading' });
    void loadEntries();
  };

  const handleCallNext = async () => {
    if (callingNextRef.current) return;
    callingNextRef.current = true;
    setCallingNext(true);
    setFeedback(null);

    try {
      const calledEntry = await callNextQueueEntry(id);
      if (!mounted.current) return;

      if (calledEntry === null) {
        setFeedback({ kind: 'info', text: OPERATOR_EMPTY_CALL_NEXT_TEXT });
        setAnnouncement(OPERATOR_EMPTY_CALL_NEXT_TEXT);
      } else {
        const msg = `Called queue number ${calledEntry.queueNumber}.`;
        setFeedback({ kind: 'success', text: msg });
        setAnnouncement(msg);
      }
      await loadEntries();
    } catch (err) {
      if (!mounted.current || isSessionExpiredError(err)) return;
      const { text, refetchEntries } = describeActionFailure(err, 'queue');
      setFeedback({ kind: 'error', text });
      setAnnouncement(text);
      if (refetchEntries) void loadEntries();
    } finally {
      callingNextRef.current = false;
      if (mounted.current) setCallingNext(false);
    }
  };

  const setEntryStarting = (entryId: string, pending: boolean) => {
    setStartingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(entryId);
      else next.delete(entryId);
      return next;
    });
  };

  const setEntryCompleting = (entryId: string, pending: boolean) => {
    setCompletingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(entryId);
      else next.delete(entryId);
      return next;
    });
  };

  const handleStartService = async (entry: QueueEntry) => {
    if (entry.status !== 'CALLED') return;
    if (entryActionInFlightRef.current.has(entry.id)) return;
    entryActionInFlightRef.current.add(entry.id);
    setEntryStarting(entry.id, true);
    setFeedback(null);

    try {
      const updated = await startQueueEntry(entry.id);
      if (!mounted.current) return;
      const msg = `Started service for queue number ${updated.queueNumber}.`;
      setFeedback({ kind: 'success', text: msg });
      setAnnouncement(msg);
      await loadEntries();
    } catch (err) {
      if (!mounted.current || isSessionExpiredError(err)) return;
      const { text, refetchEntries } = describeActionFailure(err, 'entry');
      setFeedback({ kind: 'error', text });
      setAnnouncement(text);
      if (refetchEntries) void loadEntries();
    } finally {
      entryActionInFlightRef.current.delete(entry.id);
      if (mounted.current) setEntryStarting(entry.id, false);
    }
  };

  const handleCompleteService = async (entry: QueueEntry) => {
    if (entry.status !== 'SERVING') return;
    if (entryActionInFlightRef.current.has(entry.id)) return;
    entryActionInFlightRef.current.add(entry.id);
    setEntryCompleting(entry.id, true);
    setFeedback(null);

    try {
      const updated = await completeQueueEntry(entry.id);
      if (!mounted.current) return;
      const msg = `Completed service for queue number ${updated.queueNumber}.`;
      setFeedback({ kind: 'success', text: msg });
      setAnnouncement(msg);
      await loadEntries();
    } catch (err) {
      if (!mounted.current || isSessionExpiredError(err)) return;
      const { text, refetchEntries } = describeActionFailure(err, 'entry');
      setFeedback({ kind: 'error', text });
      setAnnouncement(text);
      if (refetchEntries) void loadEntries();
    } finally {
      entryActionInFlightRef.current.delete(entry.id);
      if (mounted.current) setEntryCompleting(entry.id, false);
    }
  };

  const queueMeta = queues?.find((q) => q.id === id);
  const queueTitle = queueMeta?.name ?? UNKNOWN_QUEUE_NAME;

  const activeEntries =
    view.state === 'ready'
      ? view.entries.filter((e) => e.status === 'CALLED' || e.status === 'SERVING')
      : [];
  const waitingEntries =
    view.state === 'ready' ? view.entries.filter((e) => e.status === 'WAITING') : [];
  const completedEntries =
    view.state === 'ready' ? view.entries.filter((e) => e.status === 'COMPLETED') : [];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/operator" className={linkClass}>
          <span aria-hidden="true">←&nbsp;</span>Back to assigned queues
        </Link>
      </div>

      <LiveAnnouncer message={announcement} />

      {view.state === 'loading' && <LoadingNote>Loading queue entries...</LoadingNote>}

      {view.state === 'forbidden' && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
          <p className="font-semibold">
            <span aria-hidden="true">⚠ </span>
            {OPERATOR_QUEUE_FORBIDDEN_TEXT}
          </p>
        </div>
      )}

      {view.state === 'notFound' && (
        <div role="alert" className="rounded-lg border border-slate-300 bg-white p-4 text-slate-800">
          <p className="font-semibold">
            <span aria-hidden="true">ⓘ </span>
            {OPERATOR_QUEUE_NOT_FOUND_TEXT}
          </p>
        </div>
      )}

      {view.state === 'error' && (
        <ErrorNote onRetry={handleRetry}>We couldn&apos;t load this queue. Please try again.</ErrorNote>
      )}

      {view.state === 'ready' && (
        <>
          {/* Queue Header & Primary Controls */}
          <section
            aria-label="Queue management header"
            className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-2xl font-bold text-slate-900">{queueTitle}</h1>
                {queueMeta && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      queueMeta.availability === 'OPEN'
                        ? 'border-green-300 bg-green-50 text-green-900'
                        : 'border-slate-300 bg-slate-100 text-slate-800'
                    }`}
                  >
                    {queueMeta.availability === 'OPEN' ? 'Open' : 'Closed'}
                  </span>
                )}
              </div>
              {queueMeta?.description && (
                <p className="break-words text-sm text-slate-600">{queueMeta.description}</p>
              )}
              <p className="text-sm font-medium text-slate-700">
                Waiting: <span data-testid="waiting-count">{waitingEntries.length}</span> · Active:{' '}
                <span data-testid="active-count">{activeEntries.length}</span> · Completed:{' '}
                <span data-testid="completed-count">{completedEntries.length}</span>
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleCallNext}
                disabled={callingNext}
                className={primaryButtonClass}
              >
                {callingNext ? (
                  <>
                    <Spinner />
                    Calling next...
                  </>
                ) : (
                  'Call Next'
                )}
              </button>
              <RefreshButton pending={refreshing} onClick={handleRefresh} />
            </div>
          </section>

          {refreshFailed && (
            <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <span aria-hidden="true">⚠ </span>
              {REFRESH_FAILED_TEXT}
            </p>
          )}

          {feedback && (
            <div
              role={feedback.kind === 'error' ? 'alert' : 'status'}
              className={`rounded-lg border p-3 text-sm font-medium ${
                feedback.kind === 'error'
                  ? 'border-red-300 bg-red-50 text-red-900'
                  : feedback.kind === 'success'
                  ? 'border-green-300 bg-green-50 text-green-950'
                  : 'border-slate-300 bg-white text-slate-800'
              }`}
            >
              <span aria-hidden="true">
                {feedback.kind === 'error' ? '⚠ ' : feedback.kind === 'success' ? '✓ ' : 'ⓘ '}
              </span>
              {feedback.text}
            </div>
          )}

          {/* Section 1: Active Entries (CALLED / SERVING) */}
          <section aria-labelledby="active-entries-heading" className="space-y-3">
            <h2 id="active-entries-heading" className="text-lg font-bold text-slate-900">
              Active Service ({activeEntries.length})
            </h2>
            {activeEntries.length === 0 ? (
              <EmptyNote>No entries are currently called or in service.</EmptyNote>
            ) : (
              <ul className="space-y-3" aria-label="Active queue entries">
                {activeEntries.map((entry) => {
                  const isStarting = startingIds.has(entry.id);
                  const isCompleting = completingIds.has(entry.id);
                  const canStart = entry.status === 'CALLED' && !isStarting && !isCompleting;
                  const canComplete = entry.status === 'SERVING' && !isCompleting && !isStarting;

                  return (
                    <li
                      key={entry.id}
                      data-testid={`active-entry-${entry.queueNumber}`}
                      className="flex min-w-0 flex-col gap-4 rounded-xl border-2 border-blue-200 bg-white p-4 shadow-sm sm:p-5"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                          <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-white">
                            <span className="text-xs uppercase tracking-wide">Queue number</span>
                            <span
                              className="text-3xl font-bold"
                              data-testid={`entry-number-${entry.queueNumber}`}
                            >
                              {entry.queueNumber}
                            </span>
                          </div>
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge status={entry.status} />
                            </div>
                            <p className="break-all text-xs text-slate-600">
                              <span className="font-medium text-slate-700">Customer ID: </span>
                              {entry.customerId}
                            </p>
                            <EntryTimestamps entry={entry} />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            onClick={() => handleStartService(entry)}
                            disabled={!canStart}
                            aria-label={`Start Service for queue number ${entry.queueNumber}`}
                            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2 font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                          >
                            {isStarting ? (
                              <>
                                <Spinner />
                                Starting service...
                              </>
                            ) : (
                              'Start Service'
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCompleteService(entry)}
                            disabled={!canComplete}
                            aria-label={`Complete Service for queue number ${entry.queueNumber}`}
                            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                          >
                            {isCompleting ? (
                              <>
                                <Spinner />
                                Completing service...
                              </>
                            ) : (
                              'Complete Service'
                            )}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Section 2: Waiting Queue (FIFO order) */}
          <section aria-labelledby="waiting-entries-heading" className="space-y-3">
            <h2 id="waiting-entries-heading" className="text-lg font-bold text-slate-900">
              Waiting Queue — FIFO ({waitingEntries.length})
            </h2>
            {waitingEntries.length === 0 ? (
              <EmptyNote>No customers are currently waiting in this queue.</EmptyNote>
            ) : (
              <ol className="space-y-2.5" aria-label="Waiting queue entries">
                {waitingEntries.map((entry, index) => (
                  <li
                    key={entry.id}
                    data-testid={`waiting-entry-${entry.queueNumber}`}
                    className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-label={`Position ${index + 1}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-900"
                      >
                        #{index + 1}
                      </span>
                      <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-slate-800 px-4 py-1.5 text-white">
                        <span className="text-[10px] uppercase tracking-wide">Queue #</span>
                        <span className="text-xl font-bold">{entry.queueNumber}</span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <StatusBadge status={entry.status} />
                        <p className="break-all text-xs text-slate-600">
                          <span className="font-medium text-slate-700">Customer ID: </span>
                          {entry.customerId}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <EntryTimestamps entry={entry} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Section 3: Completed Entries */}
          <section aria-labelledby="completed-entries-heading" className="space-y-3">
            <h2 id="completed-entries-heading" className="text-lg font-bold text-slate-900">
              Completed ({completedEntries.length})
            </h2>
            {completedEntries.length === 0 ? (
              <EmptyNote>No completed entries yet.</EmptyNote>
            ) : (
              <ul className="space-y-2" aria-label="Completed queue entries">
                {completedEntries.map((entry) => (
                  <li
                    key={entry.id}
                    data-testid={`completed-entry-${entry.queueNumber}`}
                    className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-slate-200 px-3.5 py-1 text-slate-800">
                        <span className="text-[10px] uppercase tracking-wide">Queue #</span>
                        <span className="text-lg font-bold">{entry.queueNumber}</span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <StatusBadge status={entry.status} />
                        <p className="break-all text-xs text-slate-600">
                          <span className="font-medium text-slate-700">Customer ID: </span>
                          {entry.customerId}
                        </p>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <EntryTimestamps entry={entry} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
