import type { QueueEntryStatus } from '../../api/queues';

/** ui-spec §6 labels. */
export const STATUS_LABELS: Record<QueueEntryStatus, string> = {
  WAITING: 'Waiting',
  CALLED: 'Called',
  SERVING: 'In service',
  COMPLETED: 'Completed',
};

const STATUS_STYLES: Record<QueueEntryStatus, string> = {
  WAITING: 'border-amber-300 bg-amber-50 text-amber-900',
  CALLED: 'border-blue-300 bg-blue-50 text-blue-900',
  SERVING: 'border-violet-300 bg-violet-50 text-violet-900',
  COMPLETED: 'border-slate-300 bg-slate-100 text-slate-800',
};

function StatusIcon({ status }: { status: QueueEntryStatus }) {
  const common = {
    'aria-hidden': true,
    focusable: false,
    viewBox: '0 0 20 20',
    className: 'h-4 w-4 shrink-0',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (status) {
    case 'WAITING': // clock
      return (
        <svg {...common} data-icon="waiting">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 5.5V10l3 2" />
        </svg>
      );
    case 'CALLED': // bell
      return (
        <svg {...common} data-icon="called">
          <path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 1.5h-13Z" />
          <path d="M8.5 17.5a1.5 1.5 0 0 0 3 0" />
        </svg>
      );
    case 'SERVING': // play
      return (
        <svg {...common} data-icon="serving">
          <path d="M6.5 4.5v11l9-5.5Z" />
        </svg>
      );
    case 'COMPLETED': // check
      return (
        <svg {...common} data-icon="completed">
          <path d="m4.5 10.5 3.5 3.5 7.5-8" />
        </svg>
      );
  }
}

/** Status shown as an icon plus text, never colour alone (ui-spec §6, §8.1). */
export function StatusBadge({ status }: { status: QueueEntryStatus }) {
  return (
    <span
      data-status={status}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium ${STATUS_STYLES[status]}`}
    >
      <StatusIcon status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}
