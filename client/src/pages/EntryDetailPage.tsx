import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  getMyEntry,
  isSessionExpiredError,
  listQueues,
  queueNameFor,
  type QueueEntry,
  type QueueSummary,
} from '../api/queues';
import { EntryTimestamps } from '../components/customer/EntryTimestamps';
import { LEAVE_STATUS_CHANGED_TEXT, LeaveQueueControl } from '../components/customer/LeaveQueueControl';
import { STATUS_LABELS, StatusBadge } from '../components/customer/StatusBadge';
import { isFinalNoShow } from '../api/noShow';
import {
  ErrorNote,
  LiveAnnouncer,
  LoadingNote,
  REFRESH_FAILED_TEXT,
  RefreshButton,
  linkClass,
} from '../components/customer/ui';
import { REFRESH_INTERVAL_MS, usePolling } from '../hooks/usePolling';

export const ENTRY_NOT_FOUND_TEXT = "We couldn't find that queue entry.";

/** Issue #5 decision 5: queue-specific message for the detail page. */
export function entryMessage(entry: QueueEntry): string {
  switch (entry.status) {
    case 'WAITING': {
      const ahead = entry.aheadCount;
      if (ahead === 0) return 'You are next';
      if (typeof ahead !== 'number') return 'Currently waiting.';
      return `Currently waiting. ${ahead} ${ahead === 1 ? 'person' : 'people'} ahead of you.`;
    }
    case 'CALLED':
      return 'Please go to the service desk.';
    case 'SERVING':
      return 'Your service is in progress.';
    case 'COMPLETED':
      return 'Service completed.';
    case 'CANCELLED':
      return 'You left this queue.';
    case 'NO_SHOW':
      // F-08 (Sprint 2 ui-spec §7)
      return isFinalNoShow(entry)
        ? 'You missed your turn again, so this entry is closed. You can join the queue again.'
        : 'You missed your turn. If you are still here, please go to the counter. Staff can return you to the queue once.';
  }
}

/** Terminal statuses: the entry no longer changes, so polling stops (Issue #5 D-2, F-07, F-08). */
function isTerminal(entry: QueueEntry): boolean {
  return entry.status === 'COMPLETED' || entry.status === 'CANCELLED' || isFinalNoShow(entry);
}

function footerText(entry: QueueEntry): string {
  if (entry.status === 'COMPLETED') return 'This entry is complete and no longer updates.';
  if (entry.status === 'CANCELLED') return 'You left this queue. This entry no longer updates.';
  if (isFinalNoShow(entry)) return 'This entry no longer updates.';
  return `Status updates automatically every ${REFRESH_INTERVAL_MS / 1000} seconds.`;
}

type DetailState = { state: 'loading' } | { state: 'notFound' } | { state: 'error' } | { state: 'ready'; entry: QueueEntry };

/** `/customer/entries/:id` — one of the customer's own entries (ui-spec §3, api-spec §7.4). */
export function EntryDetailPage() {
  const { id = '' } = useParams();
  const [detail, setDetail] = useState<DetailState>({ state: 'loading' });
  const [queues, setQueues] = useState<QueueSummary[] | undefined>(undefined);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const entryRef = useRef<QueueEntry | null>(null);
  const queuesRef = useRef<QueueSummary[] | undefined>(undefined);
  queuesRef.current = queues;
  const activeId = useRef(id);
  activeId.current = id;
  const [leaveNotice, setLeaveNotice] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Bumped by the cancel mutation so a poll that started before it cannot overwrite its result. */
  const mutationSeq = useRef(0);

  const loadEntry = useCallback(async () => {
    const requestedId = id;
    const seq = mutationSeq.current;
    try {
      const entry = await getMyEntry(requestedId);
      if (activeId.current !== requestedId || mutationSeq.current !== seq) return;
      const previous = entryRef.current;
      if (previous && previous.id === entry.id && previous.status !== entry.status) {
        setAnnouncement(
          `Queue number ${entry.queueNumber} in ${queueNameFor(queuesRef.current, entry.serviceQueueId)} is now ${
            STATUS_LABELS[entry.status]
          }. ${entryMessage(entry)}`
        );
      }
      entryRef.current = entry;
      setDetail({ state: 'ready', entry });
      setRefreshFailed(false);
    } catch (err) {
      if (activeId.current !== requestedId || mutationSeq.current !== seq || isSessionExpiredError(err)) return;
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
        // Decision 9: missing, cross-owner, and malformed ids look the same. No entry data is kept.
        entryRef.current = null;
        setDetail({ state: 'notFound' });
      } else if (entryRef.current) {
        setRefreshFailed(true);
      } else {
        setDetail({ state: 'error' });
      }
    }
  }, [id]);

  const loadQueueNames = useCallback(async () => {
    try {
      setQueues(await listQueues());
    } catch {
      // Names fall back to "Service queue"; a 401 is already handled globally.
    }
  }, []);

  useEffect(() => {
    entryRef.current = null;
    setDetail({ state: 'loading' });
    setRefreshFailed(false);
    setAnnouncement('');
    setLeaveNotice(null);
    void loadEntry();
    void loadQueueNames();
  }, [loadEntry, loadQueueNames]);

  // Decision 2: poll every 10 s while visible, and stop once the entry is COMPLETED, CANCELLED or a final NO_SHOW.
  usePolling(loadEntry, detail.state === 'ready' && !isTerminal(detail.entry));

  // F-07: the cancel mutation succeeded; show the server's CANCELLED entry without a reload.
  const handleCancelled = (entry: QueueEntry) => {
    mutationSeq.current += 1;
    entryRef.current = entry;
    setDetail({ state: 'ready', entry });
    setRefreshFailed(false);
    setLeaveNotice(null);
    setAnnouncement(`You left the queue. Queue number ${entry.queueNumber} is now ${STATUS_LABELS[entry.status]}.`);
    headingRef.current?.focus();
  };

  // F-07: 409 (status changed) or 404 — re-read so the page shows the real state.
  const handleLeaveConflict = () => {
    mutationSeq.current += 1;
    setLeaveNotice(LEAVE_STATUS_CHANGED_TEXT);
    void loadEntry();
  };
  const handleLeaveNotFound = () => {
    mutationSeq.current += 1;
    setLeaveNotice(null);
    void loadEntry();
  };

  const refresh = async () => {
    if (refreshing) return;
    setLeaveNotice(null);
    setRefreshing(true);
    await Promise.all([loadEntry(), loadQueueNames()]);
    setRefreshing(false);
  };

  const retry = () => {
    setDetail({ state: 'loading' });
    void loadEntry();
  };

  const backLink = (
    <Link to="/customer" className={linkClass}>
      <span aria-hidden="true">←&nbsp;</span>Back to my queues
    </Link>
  );

  return (
    <div className="space-y-4">
      {backLink}
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-slate-900 focus:outline-none">
        Queue entry
      </h1>
      <LiveAnnouncer message={announcement} />

      {detail.state === 'loading' && <LoadingNote>Loading queue entry...</LoadingNote>}
      {detail.state === 'notFound' && (
        <p role="alert" className="rounded-lg border border-slate-300 bg-white p-4 text-slate-800">
          <span aria-hidden="true">ⓘ </span>
          {ENTRY_NOT_FOUND_TEXT}
        </p>
      )}
      {detail.state === 'error' && (
        <ErrorNote onRetry={retry}>We couldn't load this queue entry. Please try again.</ErrorNote>
      )}
      {detail.state === 'ready' && (
        <article className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-slate-900 px-6 py-3 text-white">
              <span className="text-xs uppercase tracking-wide">Queue number</span>
              <span className="text-4xl font-bold" data-testid="entry-queue-number">
                {detail.entry.queueNumber}
              </span>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="break-words text-xl font-semibold text-slate-900">
                {queueNameFor(queues, detail.entry.serviceQueueId)}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-700">Status:</span>
                <StatusBadge status={detail.entry.status} />
              </div>
              <p className="text-lg font-medium text-slate-900" data-testid="entry-message">
                {entryMessage(detail.entry)}
              </p>
            </div>
          </div>

          <EntryTimestamps entry={detail.entry} />

          <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">{footerText(detail.entry)}</p>
            <RefreshButton pending={refreshing} onClick={() => void refresh()} />
          </div>
          {detail.entry.status === 'WAITING' && (
            <LeaveQueueControl
              key={detail.entry.id}
              entry={detail.entry}
              queueName={queueNameFor(queues, detail.entry.serviceQueueId)}
              onCancelled={handleCancelled}
              onConflict={handleLeaveConflict}
              onNotFound={handleLeaveNotFound}
              onOpen={() => setLeaveNotice(null)}
            />
          )}
          {leaveNotice && (
            <p role="alert" className="text-sm font-medium text-red-900">
              <span aria-hidden="true">⚠ </span>
              {leaveNotice}
            </p>
          )}
          {refreshFailed && (
            <p role="status" className="text-sm text-amber-900">
              <span aria-hidden="true">⚠ </span>
              {REFRESH_FAILED_TEXT}
            </p>
          )}
        </article>
      )}
    </div>
  );
}
