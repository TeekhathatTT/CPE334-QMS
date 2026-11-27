/**
 * F-09 Multi-counter support: Operator Counters panel (Sprint 2 ui-spec §10–§13).
 *
 * - Lists counters in deterministic order with text + icon Open/Closed badges.
 * - Disables both toggle and Call Next buttons with label "Assigned to another operator" when
 *   `assignedOperatorId !== null && assignedOperatorId !== currentUserId` (Nit #1).
 * - Disables per-counter Call Next when counter is CLOSED or while a counter action is in flight.
 */
import type { Counter } from '../../api/operator';
import { EmptyNote, focusRing, primaryButtonClass } from '../customer/ui';
import { Spinner } from '../Spinner';

export const OTHER_OPERATOR_LABEL = 'Assigned to another operator';
export const NO_COUNTERS_TEXT = 'No counters configured for this queue.';

interface CounterPanelProps {
  counters: Counter[];
  currentUserId: string | null;
  togglingIds: ReadonlySet<string>;
  callingIds: ReadonlySet<string>;
  onToggleStatus: (counter: Counter) => void;
  onCallNext: (counter: Counter) => void;
}

export function isCounterOwnedByOther(counter: Counter, currentUserId: string | null): boolean {
  return counter.assignedOperatorId !== null && counter.assignedOperatorId !== currentUserId;
}

export function CounterPanel({
  counters,
  currentUserId,
  togglingIds,
  callingIds,
  onToggleStatus,
  onCallNext,
}: CounterPanelProps) {
  return (
    <section aria-labelledby="counters-heading" className="space-y-3">
      <h2 id="counters-heading" className="text-lg font-bold text-slate-900">
        Counters ({counters.length})
      </h2>

      {counters.length === 0 ? (
        <EmptyNote>{NO_COUNTERS_TEXT}</EmptyNote>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Queue counters">
          {counters.map((counter) => {
            const isOpen = counter.status === 'OPEN';
            const ownedByOther = isCounterOwnedByOther(counter, currentUserId);
            const isToggling = togglingIds.has(counter.id);
            const isCalling = callingIds.has(counter.id);
            const busy = isToggling || isCalling;
            const toggleDisabled = busy || ownedByOther;
            const callNextDisabled = busy || ownedByOther || !isOpen;

            return (
              <li
                key={counter.id}
                data-testid={`counter-card-${counter.id}`}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="break-words text-base font-semibold text-slate-900">{counter.name}</h3>
                  <span
                    data-counter-status={counter.status}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      isOpen
                        ? 'border-green-300 bg-green-50 text-green-900'
                        : 'border-slate-300 bg-slate-100 text-slate-800'
                    }`}
                  >
                    <svg
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      {isOpen ? (
                        <circle cx="8" cy="8" r="5" fill="currentColor" />
                      ) : (
                        <>
                          <circle cx="8" cy="8" r="5" />
                          <line x1="5" y1="8" x2="11" y2="8" />
                        </>
                      )}
                    </svg>
                    {isOpen ? 'Open' : 'Closed'}
                  </span>
                </div>

                {ownedByOther && (
                  <p className="text-xs font-medium text-slate-600">{OTHER_OPERATOR_LABEL}</p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => onToggleStatus(counter)}
                    disabled={toggleDisabled}
                    aria-label={isOpen ? `Close ${counter.name}` : `Open ${counter.name}`}
                    className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                  >
                    {isToggling ? (
                      <>
                        <Spinner />
                        Updating counter...
                      </>
                    ) : isOpen ? (
                      'Close counter'
                    ) : (
                      'Open counter'
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onCallNext(counter)}
                    disabled={callNextDisabled}
                    aria-label={`Call next customer to ${counter.name}`}
                    className={`${primaryButtonClass} text-sm`}
                  >
                    {isCalling ? (
                      <>
                        <Spinner />
                        Calling next...
                      </>
                    ) : (
                      'Call Next'
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
