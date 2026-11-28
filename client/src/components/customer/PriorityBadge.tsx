import type { QueuePriority } from '../../api/queues';

interface Props {
  priority?: QueuePriority;
}

/**
 * F-10 (Sprint 2 ui-spec §15.1): communicates PRIORITY with both visible text and an icon,
 * never color alone. Omitted for NORMAL entries so priority entries stand out clearly.
 */
export function PriorityBadge({ priority }: Props) {
  if (priority !== 'PRIORITY') return null;

  return (
    <span
      data-testid="priority-badge"
      className="inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-950"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-3.5 w-3.5 shrink-0"
      >
        <path
          fillRule="evenodd"
          d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z"
          clipRule="evenodd"
        />
      </svg>
      Priority
    </span>
  );
}
