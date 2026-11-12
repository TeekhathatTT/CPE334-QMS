import type { QueueEntry } from '../../api/queues';
import { Timestamp } from './ui';

/** Joined time plus any lifecycle timestamps that are set (ui-spec §5.1). */
export function EntryTimestamps({ entry, className = '' }: { entry: QueueEntry; className?: string }) {
  const rows: Array<[string, string | null]> = [
    ['Joined', entry.joinedAt],
    ['Called', entry.calledAt],
    ['Service started', entry.serviceStartedAt],
    ['Completed', entry.completedAt],
  ];
  return (
    <dl className={`space-y-1 text-sm text-slate-700 ${className}`}>
      {rows
        .filter((row): row is [string, string] => Boolean(row[1]))
        .map(([label, value]) => (
          <div key={label} className="flex flex-wrap gap-x-2">
            <dt className="font-medium">{label}:</dt>
            <dd>
              <Timestamp value={value} />
            </dd>
          </div>
        ))}
    </dl>
  );
}
