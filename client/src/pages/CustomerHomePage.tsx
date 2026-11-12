import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  isSessionExpiredError,
  listMyEntries,
  listQueues,
  queueNameFor,
  type QueueEntry,
  type QueueSummary,
} from '../api/queues';
import { AvailableQueues } from '../components/customer/AvailableQueues';
import { MyTicketsList } from '../components/customer/MyTicketsList';
import { STATUS_LABELS } from '../components/customer/StatusBadge';
import { LiveAnnouncer, focusRing } from '../components/customer/ui';
import type { Loadable } from '../components/customer/loadable';
import { usePolling } from '../hooks/usePolling';

type TabId = 'queues' | 'tickets';
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'queues', label: 'Available Queues' },
  { id: 'tickets', label: 'My Active Tickets' },
];

/** Describes entries whose status changed between two API responses, for the live region. */
export function describeStatusChanges(
  previous: QueueEntry[],
  next: QueueEntry[],
  nameFor: (serviceQueueId: string) => string
): string {
  const before = new Map(previous.map((entry) => [entry.id, entry.status]));
  return next
    .filter((entry) => before.has(entry.id) && before.get(entry.id) !== entry.status)
    .map(
      (entry) =>
        `Queue number ${entry.queueNumber} in ${nameFor(entry.serviceQueueId)} is now ${STATUS_LABELS[entry.status]}.`
    )
    .join(' ');
}

/** `/customer`: Available Queues and My Active Tickets (ui-spec §3). */
export function CustomerHomePage() {
  const [activeTab, setActiveTab] = useState<TabId>('queues');
  const [queues, setQueues] = useState<Loadable<QueueSummary[]>>({ state: 'loading' });
  const [entries, setEntries] = useState<Loadable<QueueEntry[]>>({ state: 'loading' });
  const [entriesRefreshFailed, setEntriesRefreshFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ queues: null, tickets: null });

  // Latest values for callbacks that outlive a render (polling, in-flight requests).
  const queuesRef = useRef<QueueSummary[] | undefined>(undefined);
  queuesRef.current = queues.state === 'ready' ? queues.data : undefined;
  const entriesRef = useRef<QueueEntry[] | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const nameFor = useCallback((serviceQueueId: string) => queueNameFor(queuesRef.current, serviceQueueId), []);

  const loadQueues = useCallback(async () => {
    try {
      const data = await listQueues();
      if (mounted.current) setQueues({ state: 'ready', data });
    } catch (err) {
      if (!mounted.current || isSessionExpiredError(err)) return;
      // Keep the last good list on a failed re-fetch; show the error state only if nothing loaded yet.
      setQueues((current) => (current.state === 'ready' ? current : { state: 'error' }));
    }
  }, []);

  const loadEntries = useCallback(async () => {
    try {
      const data = await listMyEntries();
      if (!mounted.current) return;
      if (entriesRef.current) {
        const changes = describeStatusChanges(entriesRef.current, data, nameFor);
        if (changes) setAnnouncement(changes);
      }
      entriesRef.current = data;
      setEntries({ state: 'ready', data });
      setEntriesRefreshFailed(false);
    } catch (err) {
      if (!mounted.current || isSessionExpiredError(err)) return;
      if (entriesRef.current) {
        setEntriesRefreshFailed(true);
      } else {
        setEntries({ state: 'error' });
      }
    }
  }, [nameFor]);

  useEffect(() => {
    void loadQueues();
    void loadEntries();
  }, [loadQueues, loadEntries]);

  // Decision 2: poll My Active Tickets every 10 s while that section is shown and the page is visible.
  usePolling(loadEntries, activeTab === 'tickets');

  const refreshAll = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await Promise.all([loadQueues(), loadEntries()]);
    if (mounted.current) setRefreshing(false);
  };

  const retryQueues = () => {
    setQueues({ state: 'loading' });
    void loadQueues();
  };

  const retryEntries = () => {
    setEntries({ state: 'loading' });
    void loadEntries();
  };

  // Re-fetch from the API after a successful join; never infer queue state locally (ui-spec §2, §9).
  const handleJoined = () => {
    void loadQueues();
    void loadEntries();
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((tab) => tab.id === activeTab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = TABS[nextIndex].id;
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Your queues</h1>
      <LiveAnnouncer message={announcement} />

      <div role="tablist" aria-label="Customer queue sections" className="flex border-b border-slate-300">
        {TABS.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={handleTabKeyDown}
              className={
                `-mb-px min-h-[44px] flex-1 border-b-2 px-3 py-2 text-center font-medium sm:flex-none sm:px-5 ${focusRing} ` +
                (selected
                  ? 'border-blue-700 text-blue-800'
                  : 'border-transparent text-slate-600 hover:text-slate-900')
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <section
        role="tabpanel"
        id="panel-queues"
        aria-labelledby="tab-queues"
        hidden={activeTab !== 'queues'}
        tabIndex={0}
        className={`rounded ${focusRing}`}
      >
        <h2 className="sr-only">Available Queues</h2>
        <AvailableQueues
          queues={queues}
          onRetry={retryQueues}
          onQueuesStale={() => void loadQueues()}
          onJoined={handleJoined}
          queueNameFor={nameFor}
        />
      </section>

      <section
        role="tabpanel"
        id="panel-tickets"
        aria-labelledby="tab-tickets"
        hidden={activeTab !== 'tickets'}
        tabIndex={0}
        className={`rounded ${focusRing}`}
      >
        <h2 className="sr-only">My Active Tickets</h2>
        <MyTicketsList
          entries={entries}
          refreshFailed={entriesRefreshFailed}
          refreshing={refreshing}
          onRefresh={() => void refreshAll()}
          onRetry={retryEntries}
          queueNameFor={nameFor}
        />
      </section>
    </div>
  );
}
