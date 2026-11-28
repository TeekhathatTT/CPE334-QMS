import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, CSRF_COOKIE, readCookie } from '../api/client';
import {
  callNextAtCounter,
  callNextQueueEntry,
  completeQueueEntry,
  listAssignedQueues,
  listOperatorQueueEntries,
  listQueueCounters,
  markNoShowQueueEntry,
  recoverQueueEntry,
  startQueueEntry,
  updateCounterStatus,
  updateEntryPriority,
  type Counter,
} from '../api/operator';
import {
  UNKNOWN_QUEUE_NAME,
  isSessionExpiredError,
  type QueueEntry,
  type QueueSummary,
} from '../api/queues';
import { useAuth } from '../auth/AuthContext';
import { EntryTimestamps } from '../components/customer/EntryTimestamps';
import { PriorityBadge } from '../components/customer/PriorityBadge';
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
import { CounterPanel, isCounterOwnedByOther } from '../components/operator/CounterPanel';
import { Spinner } from '../components/Spinner';
import { canReturnToQueue } from '../api/noShow';
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
  /** F-08 (Sprint 2 ui-spec §8.3). */
  RECOVERY_LIMIT: 'This entry was already returned to the queue once and cannot be returned again.',
  /** F-08: the customer rejoined while the entry was NO_SHOW. */
  REJOINED: 'This customer has already joined the queue again, so this entry cannot be returned.',
  /** F-08 v1.1 (ui-spec §8.3 rev. 3.3): the return would exceed the BR-06 active-entry cap. */
  MAX_ACTIVE: 'This customer already has 2 active queue entries, so this entry cannot be returned right now.',
  /** F-09 (Sprint 2 ui-spec §12.3). */
  COUNTER_CLOSED: 'This counter is closed. Open the counter before calling the next customer.',
  NO_WAITING_ENTRIES: 'There are no waiting customers in this queue right now.',
  COUNTER_INVALID: 'Invalid counter request. Please refresh and try again.',
  COUNTER_NOT_FOUND: "We couldn't find that counter.",
  /** F-10 (Sprint 2 ui-spec §16.3). */
  PRIORITY_NOT_WAITING: 'This entry is no longer waiting, so its priority cannot be changed.',
  PRIORITY_INVALID: 'Invalid priority request. Please refresh and try again.',
} as const;

/** F-08 (Sprint 2 ui-spec §8.4). */
export const OPERATOR_NO_SHOW_LIMIT_TEXT = 'Already returned once. This entry cannot be returned again.';

interface ActionFailure {
  text: string;
  refetchEntries: boolean;
  refetchCounters?: boolean;
}

function isCsrfForbidden(err: ApiError): boolean {
  if (err.code.toUpperCase().includes('CSRF')) return true;
  if (err.serverMessage && /csrf|verified/i.test(err.serverMessage)) return true;
  if (!readCookie(CSRF_COOKIE)) return true;
  return false;
}

function describeActionFailure(err: unknown, target: 'queue' | 'entry' | 'counter' | 'priority'): ActionFailure {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      if (target === 'priority') {
        return { text: OPERATOR_ACTION_ERROR_TEXT.PRIORITY_NOT_WAITING, refetchEntries: true };
      }
      if (err.code === 'COUNTER_CLOSED') {
        return { text: OPERATOR_ACTION_ERROR_TEXT.COUNTER_CLOSED, refetchEntries: true, refetchCounters: true };
      }
      if (err.code === 'NO_WAITING_ENTRIES') {
        return { text: OPERATOR_ACTION_ERROR_TEXT.NO_WAITING_ENTRIES, refetchEntries: true, refetchCounters: true };
      }
      if (err.code === 'RECOVERY_LIMIT_REACHED') {
        return { text: OPERATOR_ACTION_ERROR_TEXT.RECOVERY_LIMIT, refetchEntries: true };
      }
      if (err.code === 'DUPLICATE_ACTIVE_ENTRY') {
        return { text: OPERATOR_ACTION_ERROR_TEXT.REJOINED, refetchEntries: true };
      }
      if (err.code === 'MAX_ACTIVE_ENTRIES_REACHED') {
        return { text: OPERATOR_ACTION_ERROR_TEXT.MAX_ACTIVE, refetchEntries: true };
      }
      return { text: OPERATOR_ACTION_ERROR_TEXT.CONFLICT, refetchEntries: true };
    }
    if (err.status === 400) {
      if (target === 'priority') {
        return { text: OPERATOR_ACTION_ERROR_TEXT.PRIORITY_INVALID, refetchEntries: false };
      }
      if (target === 'counter') {
        return { text: OPERATOR_ACTION_ERROR_TEXT.COUNTER_INVALID, refetchEntries: false };
      }
    }
    if (err.status === 404) {
      if (target === 'counter') {
        return { text: OPERATOR_ACTION_ERROR_TEXT.COUNTER_NOT_FOUND, refetchEntries: false, refetchCounters: true };
      }
      if (target === 'queue') {
        return { text: OPERATOR_ACTION_ERROR_TEXT.QUEUE_NOT_FOUND, refetchEntries: false };
      }
      return { text: OPERATOR_ACTION_ERROR_TEXT.NOT_FOUND, refetchEntries: true };
    }
    if (err.status === 403) {
      if (isCsrfForbidden(err)) {
        return { text: OPERATOR_ACTION_ERROR_TEXT.CSRF, refetchEntries: false };
      }
      return {
        text: OPERATOR_ACTION_ERROR_TEXT.FORBIDDEN,
        refetchEntries: false,
        refetchCounters: target === 'counter',
      };
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

type CountersStatus = 'loading' | 'loaded' | 'error';

export const OPERATOR_COUNTERS_LOAD_ERROR_TEXT = "We couldn't load counters for this queue. Please try again.";
export const OPERATOR_COUNTERS_POLL_ERROR_TEXT =
  'Could not refresh counters. Counter actions are paused until counters are reloaded.';

/** `/operator/queues/:id` — manage queue lifecycle actions: call next, start, complete (ui-spec §3, §5.2). */
export function OperatorQueueDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [view, setView] = useState<ViewState>({ state: 'loading' });
  const [queues, setQueues] = useState<QueueSummary[] | undefined>(undefined);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [countersStatus, setCountersStatus] = useState<CountersStatus>('loading');
  const [countersPollError, setCountersPollError] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [callingNext, setCallingNext] = useState(false);
  const [togglingCounterIds, setTogglingCounterIds] = useState<ReadonlySet<string>>(new Set());
  const [callingCounterIds, setCallingCounterIds] = useState<ReadonlySet<string>>(new Set());
  const [startingIds, setStartingIds] = useState<ReadonlySet<string>>(new Set());
  const [completingIds, setCompletingIds] = useState<ReadonlySet<string>>(new Set());
  const [noShowingIds, setNoShowingIds] = useState<ReadonlySet<string>>(new Set());
  const [recoveringIds, setRecoveringIds] = useState<ReadonlySet<string>>(new Set());
  const [updatingPriorityIds, setUpdatingPriorityIds] = useState<ReadonlySet<string>>(new Set());
  const [feedback, setFeedback] = useState<FeedbackBanner | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const callingNextRef = useRef(false);
  const entryActionInFlightRef = useRef(new Set<string>());
  const counterActionInFlightRef = useRef(new Set<string>());
  const countersLoadedRef = useRef(false);
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

  const loadCounters = useCallback(async () => {
    const requestedQueueId = id;
    try {
      const data = await listQueueCounters(requestedQueueId);
      if (!mounted.current || activeQueueIdRef.current !== requestedQueueId) return;
      countersLoadedRef.current = true;
      setCounters(data);
      setCountersStatus('loaded');
      setCountersPollError(false);
    } catch (err) {
      if (!mounted.current || activeQueueIdRef.current !== requestedQueueId || isSessionExpiredError(err)) {
        return;
      }
      if (countersLoadedRef.current) {
        // Subsequent poll/refresh failed: keep visible counters disabled and surface a Retry banner.
        setCountersPollError(true);
      } else {
        // Initial load failed: never fall back to legacy Call Next; show explicit error with Retry.
        setCountersStatus('error');
      }
    }
  }, [id]);

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
    countersLoadedRef.current = false;
    setView({ state: 'loading' });
    setCounters([]);
    setCountersStatus('loading');
    setCountersPollError(false);
    setRefreshFailed(false);
    setFeedback(null);
    setAnnouncement('');
    void loadEntries();
    void loadAssignedQueueMeta();
    void loadCounters();
  }, [loadEntries, loadAssignedQueueMeta, loadCounters]);

  const pollQueue = useCallback(
    () => Promise.all([loadEntries(), loadCounters()]),
    [loadEntries, loadCounters]
  );

  usePolling(pollQueue, view.state === 'ready');

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([loadEntries(), loadAssignedQueueMeta(), loadCounters()]);
    if (mounted.current) {
      setRefreshing(false);
    }
  };

  const handleRetry = () => {
    setView({ state: 'loading' });
    void loadEntries();
    void loadCounters();
  };

  const handleRetryCounters = () => {
    if (!countersLoadedRef.current) {
      setCountersStatus('loading');
    }
    void loadCounters();
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

  const toggleIn = (setter: typeof setNoShowingIds, entryId: string, pending: boolean) => {
    setter((current) => {
      const next = new Set(current);
      if (pending) next.add(entryId);
      else next.delete(entryId);
      return next;
    });
  };

  /**
   * F-08: Mark no-show (CALLED -> NO_SHOW) and Return to queue (NO_SHOW -> WAITING). Same flow as
   * Start/Complete: per-entry in-flight guard, busy state, success message, then reload the list;
   * on 409/404 the list is reloaded as well (Sprint 2 ui-spec §8.2).
   */
  const runNoShowAction = async (
    entry: QueueEntry,
    action: (entryId: string) => Promise<QueueEntry>,
    setter: typeof setNoShowingIds,
    success: (updated: QueueEntry) => string
  ) => {
    if (entryActionInFlightRef.current.has(entry.id)) return;
    entryActionInFlightRef.current.add(entry.id);
    toggleIn(setter, entry.id, true);
    setFeedback(null);

    try {
      const updated = await action(entry.id);
      if (!mounted.current) return;
      const msg = success(updated);
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
      if (mounted.current) toggleIn(setter, entry.id, false);
    }
  };

  const handleMarkNoShow = (entry: QueueEntry) => {
    if (entry.status !== 'CALLED') return;
    void runNoShowAction(entry, markNoShowQueueEntry, setNoShowingIds, (u) => `Marked queue number ${u.queueNumber} as no-show.`);
  };

  const handleReturnToQueue = (entry: QueueEntry) => {
    if (!canReturnToQueue(entry)) return;
    void runNoShowAction(entry, recoverQueueEntry, setRecoveringIds, (u) => `Returned queue number ${u.queueNumber} to the queue.`);
  };

  const handleTogglePriority = async (entry: QueueEntry) => {
    if (entry.status !== 'WAITING') return;
    if (entryActionInFlightRef.current.has(entry.id)) return;
    entryActionInFlightRef.current.add(entry.id);
    toggleIn(setUpdatingPriorityIds, entry.id, true);
    setFeedback(null);

    const nextPriority = entry.priority === 'PRIORITY' ? 'NORMAL' : 'PRIORITY';
    try {
      const updated = await updateEntryPriority(entry.id, nextPriority);
      if (!mounted.current) return;
      const label = updated.priority === 'PRIORITY' ? 'Priority' : 'Normal';
      const msg = `Queue number ${updated.queueNumber} priority set to ${label}.`;
      setFeedback({ kind: 'success', text: msg });
      setAnnouncement(msg);
      await loadEntries();
    } catch (err) {
      if (!mounted.current || isSessionExpiredError(err)) return;
      const { text, refetchEntries } = describeActionFailure(err, 'priority');
      setFeedback({ kind: 'error', text });
      setAnnouncement(text);
      if (refetchEntries) void loadEntries();
    } finally {
      entryActionInFlightRef.current.delete(entry.id);
      if (mounted.current) toggleIn(setUpdatingPriorityIds, entry.id, false);
    }
  };

  const handleToggleCounterStatus = async (counter: Counter) => {
    if (isCounterOwnedByOther(counter, user?.id ?? null)) return;
    if (counterActionInFlightRef.current.has(counter.id)) return;
    counterActionInFlightRef.current.add(counter.id);
    toggleIn(setTogglingCounterIds, counter.id, true);
    setFeedback(null);

    const nextStatus = counter.status === 'OPEN' ? 'CLOSED' : 'OPEN';
    try {
      const updated = await updateCounterStatus(counter.id, nextStatus);
      if (!mounted.current) return;
      const statusLabel = updated.status === 'OPEN' ? 'Open' : 'Closed';
      const msg = `${updated.name} is now ${statusLabel}.`;
      setFeedback({ kind: 'success', text: msg });
      setAnnouncement(msg);
      await loadCounters();
    } catch (err) {
      if (!mounted.current || isSessionExpiredError(err)) return;
      const { text, refetchEntries, refetchCounters } = describeActionFailure(err, 'counter');
      setFeedback({ kind: 'error', text });
      setAnnouncement(text);
      if (refetchCounters) void loadCounters();
      if (refetchEntries) void loadEntries();
    } finally {
      counterActionInFlightRef.current.delete(counter.id);
      if (mounted.current) toggleIn(setTogglingCounterIds, counter.id, false);
    }
  };

  const handleCounterCallNext = async (counter: Counter) => {
    if (counter.status !== 'OPEN' || isCounterOwnedByOther(counter, user?.id ?? null)) return;
    if (counterActionInFlightRef.current.has(counter.id)) return;
    counterActionInFlightRef.current.add(counter.id);
    toggleIn(setCallingCounterIds, counter.id, true);
    setFeedback(null);

    try {
      const calledEntry = await callNextAtCounter(counter.id);
      if (!mounted.current) return;
      const counterLabel = calledEntry.counterName ?? counter.name;
      const msg = `Called queue number ${calledEntry.queueNumber} to ${counterLabel}.`;
      setFeedback({ kind: 'success', text: msg });
      setAnnouncement(msg);
      await Promise.all([loadEntries(), loadCounters()]);
    } catch (err) {
      if (!mounted.current || isSessionExpiredError(err)) return;
      const { text, refetchEntries, refetchCounters } = describeActionFailure(err, 'counter');
      setFeedback({ kind: 'error', text });
      setAnnouncement(text);
      if (refetchCounters) void loadCounters();
      if (refetchEntries) void loadEntries();
    } finally {
      counterActionInFlightRef.current.delete(counter.id);
      if (mounted.current) toggleIn(setCallingCounterIds, counter.id, false);
    }
  };

  const currentUserId = user?.id ?? null;
  const hasUsableCounter = counters.some((c) => !isCounterOwnedByOther(c, currentUserId));
  // Blocking #2: only render legacy queue-level Call Next once `/counters` has succeeded with zero usable counters.
  const showLegacyCallNext = countersStatus === 'loaded' && !countersPollError && !hasUsableCounter;

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
  const noShowEntries =
    view.state === 'ready' ? view.entries.filter((e) => e.status === 'NO_SHOW') : [];

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
                {/* F-11 (Sprint 3 ui-spec §2.1). */}
                <Link
                  to={`/operator/queues/${encodeURIComponent(id ?? '')}/analytics`}
                  aria-label={`View analytics for ${queueTitle}`}
                  className={linkClass}
                >
                  Analytics
                </Link>
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
                <span data-testid="active-count">{activeEntries.length}</span> · No-show:{' '}
                <span data-testid="no-show-count">{noShowEntries.length}</span> · Completed:{' '}
                <span data-testid="completed-count">{completedEntries.length}</span>
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {showLegacyCallNext && (
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
              )}
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

          {countersStatus === 'loading' && <LoadingNote>Loading counters...</LoadingNote>}

          {countersStatus === 'error' && (
            <ErrorNote onRetry={handleRetryCounters}>{OPERATOR_COUNTERS_LOAD_ERROR_TEXT}</ErrorNote>
          )}

          {countersStatus === 'loaded' && (
            <>
              {countersPollError && (
                <ErrorNote onRetry={handleRetryCounters}>{OPERATOR_COUNTERS_POLL_ERROR_TEXT}</ErrorNote>
              )}
              <CounterPanel
                counters={counters}
                currentUserId={currentUserId}
                disabled={countersPollError}
                togglingIds={togglingCounterIds}
                callingIds={callingCounterIds}
                onToggleStatus={(counter) => void handleToggleCounterStatus(counter)}
                onCallNext={(counter) => void handleCounterCallNext(counter)}
              />
            </>
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
                  const isNoShowing = noShowingIds.has(entry.id);
                  const canStart = entry.status === 'CALLED' && !isStarting && !isCompleting && !isNoShowing;
                  const canMarkNoShow = entry.status === 'CALLED' && !isStarting && !isNoShowing;
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
                              <PriorityBadge priority={entry.priority} />
                              {(entry.status === 'CALLED' || entry.status === 'SERVING') && entry.counterName && (
                                <span
                                  data-testid={`active-entry-counter-${entry.queueNumber}`}
                                  className="inline-flex items-center rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-900"
                                >
                                  {entry.counterName}
                                </span>
                              )}
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

                          {entry.status === 'CALLED' && (
                            <button
                              type="button"
                              onClick={() => handleMarkNoShow(entry)}
                              disabled={!canMarkNoShow}
                              aria-label={`Mark queue number ${entry.queueNumber} as no-show`}
                              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-orange-400 bg-white px-4 py-2 font-semibold text-orange-900 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                            >
                              {isNoShowing ? (
                                <>
                                  <Spinner />
                                  Marking no-show...
                                </>
                              ) : (
                                'Mark no-show'
                              )}
                            </button>
                          )}
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
                {waitingEntries.map((entry, index) => {
                  const isPriority = entry.priority === 'PRIORITY';
                  const isUpdatingPriority = updatingPriorityIds.has(entry.id);
                  return (
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
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={entry.status} />
                            <PriorityBadge priority={entry.priority} />
                          </div>
                          <p className="break-all text-xs text-slate-600">
                            <span className="font-medium text-slate-700">Customer ID: </span>
                            {entry.customerId}
                          </p>
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col gap-2 sm:items-end">
                        <button
                          type="button"
                          onClick={() => void handleTogglePriority(entry)}
                          disabled={isUpdatingPriority}
                          aria-label={
                            isPriority
                              ? `Set queue number ${entry.queueNumber} to normal priority`
                              : `Set queue number ${entry.queueNumber} as priority`
                          }
                          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                            isPriority
                              ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                              : 'border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100'
                          } ${focusRing}`}
                        >
                          {isUpdatingPriority ? (
                            <>
                              <Spinner />
                              Updating priority...
                            </>
                          ) : isPriority ? (
                            'Set Normal'
                          ) : (
                            'Set Priority'
                          )}
                        </button>
                        <EntryTimestamps entry={entry} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* F-08: No-show entries (Sprint 2 ui-spec §8.4) */}
          <section aria-labelledby="no-show-entries-heading" className="space-y-3">
            <h2 id="no-show-entries-heading" className="text-lg font-bold text-slate-900">
              No-show ({noShowEntries.length})
            </h2>
            {noShowEntries.length === 0 ? (
              <EmptyNote>No missed entries.</EmptyNote>
            ) : (
              <ul className="space-y-2.5" aria-label="No-show queue entries">
                {noShowEntries.map((entry) => {
                  const isRecovering = recoveringIds.has(entry.id);
                  return (
                    <li
                      key={entry.id}
                      data-testid={`no-show-entry-${entry.queueNumber}`}
                      className="flex min-w-0 flex-col gap-3 rounded-xl border border-orange-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-slate-800 px-4 py-1.5 text-white">
                          <span className="text-[10px] uppercase tracking-wide">Queue #</span>
                          <span className="text-xl font-bold">{entry.queueNumber}</span>
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={entry.status} />
                            <PriorityBadge priority={entry.priority} />
                          </div>
                          <p className="break-all text-xs text-slate-600">
                            <span className="font-medium text-slate-700">Customer ID: </span>
                            {entry.customerId}
                          </p>
                          <EntryTimestamps entry={entry} />
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col gap-2 sm:items-end">
                        {canReturnToQueue(entry) ? (
                          <button
                            type="button"
                            onClick={() => handleReturnToQueue(entry)}
                            disabled={isRecovering}
                            aria-label={`Return queue number ${entry.queueNumber} to the queue`}
                            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-700 px-4 py-2 font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                          >
                            {isRecovering ? (
                              <>
                                <Spinner />
                                Returning to queue...
                              </>
                            ) : (
                              'Return to queue'
                            )}
                          </button>
                        ) : (
                          <p className="text-sm font-medium text-slate-700">{OPERATOR_NO_SHOW_LIMIT_TEXT}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
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
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={entry.status} />
                          <PriorityBadge priority={entry.priority} />
                        </div>
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
