import type React from 'react';
import { Spinner } from '../Spinner';

/** Shared customer-screen building blocks and class names. */

export const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

export const primaryButtonClass =
  `flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white ` +
  `hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70 ${focusRing}`;

export const secondaryButtonClass =
  `flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 ` +
  `font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 ${focusRing}`;

export const linkClass =
  `inline-flex min-h-[44px] items-center rounded font-medium text-blue-700 underline underline-offset-2 ` +
  `hover:text-blue-900 ${focusRing}`;

/** Renders an API timestamp in the user's locale inside a machine-readable `<time>` element. */
export function Timestamp({ value }: { value: string }) {
  const date = new Date(value);
  const text = Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  return <time dateTime={value}>{text}</time>;
}

export function LoadingNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="flex items-center gap-2 py-6 text-slate-600">
      <Spinner />
      {children}
    </p>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-slate-700">
      <span aria-hidden="true">ⓘ </span>
      {children}
    </p>
  );
}

export function ErrorNote({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 sm:flex-row sm:items-center sm:justify-between">
      <p role="alert">
        <span aria-hidden="true">⚠ </span>
        {children}
      </p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={secondaryButtonClass}>
          Try again
        </button>
      )}
    </div>
  );
}

/** Non-blocking note shown when a background refresh failed and the last data is still on screen. */
export const REFRESH_FAILED_TEXT = 'Could not refresh. Retrying...';

export function RefreshButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={pending} className={secondaryButtonClass}>
      {pending ? (
        <>
          <Spinner />
          Refreshing...
        </>
      ) : (
        <>
          <span aria-hidden="true">↻</span>
          Refresh
        </>
      )}
    </button>
  );
}

/** Polite screen-reader live region for queue status changes (ui-spec §8.1). Always rendered. */
export function LiveAnnouncer({ message }: { message: string }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="status-announcer">
      {message}
    </div>
  );
}
