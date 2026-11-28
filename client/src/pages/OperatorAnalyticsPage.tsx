/**
 * F-11 Operator analytics page (Sprint 3 ui-spec §2; SRS FR-24, AC-62).
 * Route: /operator/queues/:id/analytics
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  bangkokDateOffset,
  formatDuration,
  getQueueAnalytics,
  inclusiveDays,
  type QueueAnalytics,
} from '../api/analytics';
import { isSessionExpiredError } from '../api/queues';
import { LiveAnnouncer, focusRing, linkClass, primaryButtonClass, secondaryButtonClass } from '../components/customer/ui';
import { Spinner } from '../components/Spinner';

const MAX_DAYS = 31;

export const ANALYTICS_TEXT = {
  rangeOrder: 'Start date must be on or before the end date.',
  rangeLength: 'Choose a range of 31 days or fewer.',
  rangeRequired: 'Choose both a start date and an end date.',
  badRequest: 'Choose a valid date range of 31 days or fewer.',
  forbidden: 'You are not assigned to this queue.',
  notFound: "We couldn't find that queue.",
  failed: "We couldn't load the report. Please try again.",
  empty: 'No customers joined this queue in the selected dates.',
  footnote: 'Counts include customers who joined in the selected dates. Times use Asia/Bangkok.',
} as const;

type LoadError = { kind: 'badRequest' | 'forbidden' | 'notFound' | 'failed' };

function describeError(err: unknown): LoadError {
  if (err instanceof ApiError) {
    if (err.status === 400) return { kind: 'badRequest' };
    if (err.status === 403) return { kind: 'forbidden' };
    if (err.status === 404) return { kind: 'notFound' };
  }
  return { kind: 'failed' };
}

function validateRange(from: string, to: string): string | null {
  if (!from || !to) return ANALYTICS_TEXT.rangeRequired;
  if (from > to) return ANALYTICS_TEXT.rangeOrder;
  if (inclusiveDays(from, to) > MAX_DAYS) return ANALYTICS_TEXT.rangeLength;
  return null;
}

function Figure({ label, value, testId }: { label: string; value: string | number; testId: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className="mt-1 text-xl font-bold text-slate-900" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

export function OperatorAnalyticsPage() {
  const { id = '' } = useParams();
  const [from, setFrom] = useState(() => bangkokDateOffset(-6));
  const [to, setTo] = useState(() => bangkokDateOffset(0));
  const [validation, setValidation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<QueueAnalytics | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const mounted = useRef(true);
  const requestSeq = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (rangeFrom: string, rangeTo: string) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);
      try {
        const data = await getQueueAnalytics(id, rangeFrom, rangeTo);
        if (!mounted.current || seq !== requestSeq.current) return;
        setReport(data);
        setAnnouncement(`Report updated for ${data.from} to ${data.to}.`);
      } catch (err) {
        if (!mounted.current || seq !== requestSeq.current || isSessionExpiredError(err)) return;
        setReport(null);
        setError(describeError(err));
      } finally {
        if (mounted.current && seq === requestSeq.current) setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    void load(from, to);
    // Load once on entry with the default range; later loads come from the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateRange(from, to);
    setValidation(problem);
    if (problem) return;
    void load(from, to);
  };

  const title = report ? `${report.queueName} — Analytics` : 'Queue analytics';

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/operator/queues/${encodeURIComponent(id)}`} className={linkClass}>
          <span aria-hidden="true">←&nbsp;</span>Back to queue
        </Link>
      </div>

      <LiveAnnouncer message={announcement} />

      <h1 className="break-words text-2xl font-bold text-slate-900">{title}</h1>

      <form
        onSubmit={onSubmit}
        noValidate
        aria-label="Report date range"
        className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="analytics-from" className="text-sm font-medium text-slate-800">
            From
          </label>
          <input
            id="analytics-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-describedby={validation ? 'analytics-range-error' : undefined}
            aria-invalid={validation ? true : undefined}
            className={`min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 ${focusRing}`}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="analytics-to" className="text-sm font-medium text-slate-800">
            To
          </label>
          <input
            id="analytics-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-describedby={validation ? 'analytics-range-error' : undefined}
            aria-invalid={validation ? true : undefined}
            className={`min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 ${focusRing}`}
          />
        </div>
        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? (
            <>
              <Spinner />
              Loading report…
            </>
          ) : (
            'Show report'
          )}
        </button>
      </form>

      {validation && (
        <p id="analytics-range-error" role="alert" className="font-medium text-red-800">
          <span aria-hidden="true">⚠ </span>
          {validation}
        </p>
      )}

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span aria-hidden="true">⚠ </span>
            {ANALYTICS_TEXT[error.kind]}
          </p>
          {error.kind === 'failed' && (
            <button type="button" onClick={() => void load(from, to)} className={secondaryButtonClass}>
              Retry
            </button>
          )}
          {error.kind === 'notFound' && (
            <Link to="/operator" className={linkClass}>
              Back to your queues
            </Link>
          )}
        </div>
      )}

      {report && (
        <section aria-labelledby="analytics-summary-heading" aria-busy={loading} className="space-y-4">
          <h2 id="analytics-summary-heading" className="text-lg font-bold text-slate-900">
            Summary, {report.from} to {report.to}
          </h2>
          {report.volumes.joined === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-slate-700">
              <span aria-hidden="true">ⓘ </span>
              {ANALYTICS_TEXT.empty}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Joined" value={report.volumes.joined} testId="summary-joined" />
            <Figure label="Completed" value={report.volumes.completed} testId="summary-completed" />
            <Figure label="Cancelled" value={report.volumes.cancelled} testId="summary-cancelled" />
            <Figure label="No-show" value={report.volumes.noShow} testId="summary-noShow" />
          </dl>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <h3 className="font-semibold text-slate-900">Waiting time</h3>
              <dl className="grid grid-cols-3 gap-3">
                <Figure label="Average" value={formatDuration(report.waitTime.averageSeconds)} testId="wait-average" />
                <Figure label="Median" value={formatDuration(report.waitTime.medianSeconds)} testId="wait-median" />
                <Figure label="90th pct" value={formatDuration(report.waitTime.p90Seconds)} testId="wait-p90" />
              </dl>
            </div>
            <div className="min-w-0 space-y-2">
              <h3 className="font-semibold text-slate-900">Service time</h3>
              <dl className="grid grid-cols-3 gap-3">
                <Figure label="Average" value={formatDuration(report.serviceTime.averageSeconds)} testId="service-average" />
                <Figure label="Median" value={formatDuration(report.serviceTime.medianSeconds)} testId="service-median" />
                <Figure label="90th pct" value={formatDuration(report.serviceTime.p90Seconds)} testId="service-p90" />
              </dl>
            </div>
          </div>

          <div
            className="overflow-x-auto rounded-xl border border-slate-200 bg-white"
            tabIndex={0}
            role="region"
            aria-label="Daily breakdown table"
          >
            <table className="min-w-full text-left text-sm">
              <caption className="p-3 text-left font-semibold text-slate-900">
                Daily breakdown, {report.from} to {report.to} ({report.timezone})
              </caption>
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  {['Date', 'Joined', 'Completed', 'Cancelled', 'No-show', 'Avg wait', 'Avg service'].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.daily.map((d) => (
                  <tr key={d.date} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2">{d.date}</td>
                    <td className="px-3 py-2">{d.joined}</td>
                    <td className="px-3 py-2">{d.completed}</td>
                    <td className="px-3 py-2">{d.cancelled}</td>
                    <td className="px-3 py-2">{d.noShow}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDuration(d.averageWaitSeconds)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDuration(d.averageServiceSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-600">{ANALYTICS_TEXT.footnote}</p>
        </section>
      )}
    </div>
  );
}
