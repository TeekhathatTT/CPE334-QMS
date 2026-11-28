import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/client';
import { cancelMyEntry, isSessionExpiredError, type QueueEntry } from '../../api/queues';
import { Spinner } from '../Spinner';
import { focusRing, secondaryButtonClass } from './ui';

/** Sprint 2 ui-spec §3.3 messages. Server messages are never shown. */
export const LEAVE_STATUS_CHANGED_TEXT = 'You can no longer leave this queue because your status has changed.';
export const LEAVE_NOT_VERIFIED_TEXT = "We couldn't verify this request. Please refresh the page or sign in again.";
export const LEAVE_GENERIC_ERROR_TEXT = 'Something went wrong. Please try again.';

const destructiveButtonClass =
  `flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-rose-700 px-4 py-2 font-semibold text-white ` +
  `hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-70 ${focusRing}`;

interface Props {
  entry: QueueEntry;
  queueName: string;
  /** Called with the server's CANCELLED entry after a `200`. */
  onCancelled: (entry: QueueEntry) => void;
  /** `409`: the entry changed (e.g. it was called). The page shows the message and re-reads. */
  onConflict: () => void;
  /** `404` / `400`: the page re-reads and shows its not-found state. */
  onNotFound: () => void;
  /** Called when the customer opens the confirmation (clears page-level notices). */
  onOpen?: () => void;
}

/**
 * F-07 "Leave queue" control (Sprint 2 ui-spec §3). Render it only for a `WAITING` entry; the server
 * remains the authority (BR-13). Inline confirmation, no modal: focus goes to "Keep my place",
 * Escape closes it, and a per-entry in-flight guard means two fast activations send one request.
 */
export function LeaveQueueControl({ entry, queueName, onCancelled, onConflict, onNotFound, onOpen }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (confirming) {
      keepRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      leaveRef.current?.focus();
    }
  }, [confirming]);

  const open = () => {
    setError(null);
    onOpen?.();
    setConfirming(true);
  };

  const close = () => {
    if (busy) return;
    setError(null);
    returnFocus.current = true;
    setConfirming(false);
  };

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const updated = await cancelMyEntry(entry.id);
      onCancelled(updated);
    } catch (err) {
      if (isSessionExpiredError(err)) {
        // The global session-expired handler takes over.
      } else if (err instanceof ApiError && err.status === 409) {
        setConfirming(false);
        onConflict();
      } else if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
        setConfirming(false);
        onNotFound();
      } else if (err instanceof ApiError && err.status === 403) {
        setError(LEAVE_NOT_VERIFIED_TEXT);
      } else {
        setError(LEAVE_GENERIC_ERROR_TEXT);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <button ref={leaveRef} type="button" onClick={open} className={secondaryButtonClass}>
        Leave queue
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Confirm leaving the queue"
      className="w-full space-y-3 rounded-lg border border-rose-300 bg-rose-50 p-4 text-rose-950"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
    >
      <p className="break-words font-medium">
        {`Leave ${queueName}? Queue number ${entry.queueNumber} will not be called, and if you join again you will get a new number.`}
      </p>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-900">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={() => void confirm()} disabled={busy} className={destructiveButtonClass}>
          {busy ? (
            <>
              <Spinner />
              Leaving queue...
            </>
          ) : (
            'Yes, leave queue'
          )}
        </button>
        <button ref={keepRef} type="button" onClick={close} disabled={busy} className={secondaryButtonClass}>
          Keep my place
        </button>
      </div>
    </div>
  );
}
