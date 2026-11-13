import { useEffect, useRef } from 'react';

/** Customer status refresh interval (Issue #5 decision 2). The spec does not define one. */
export const REFRESH_INTERVAL_MS = 10_000;

/**
 * Calls `callback` every `REFRESH_INTERVAL_MS` while `enabled` is true. Ticks are skipped while the
 * page is hidden or while the previous call is still running. The timer is cleared on unmount and
 * whenever `enabled` becomes false.
 */
export function usePolling(callback: () => Promise<unknown>, enabled: boolean): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return undefined;
    let running = false;
    const timer = setInterval(() => {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      callbackRef.current().finally(() => {
        running = false;
      });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled]);
}
