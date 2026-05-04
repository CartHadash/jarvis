/**
 * useDebouncedSave — schedules a save N ms after the last call, with an
 * imperative `flush()` to commit immediately (used by NodePanel's
 * `onBlur` so leaving the field saves right away).
 *
 * Intentionally generic over the payload — the same hook handles title
 * edits and Tiptap content edits.
 */

import { useCallback, useEffect, useRef } from 'react';

export interface DebouncedSave<P> {
  /** Stage a payload to save after `delay` ms. */
  schedule: (payload: P) => void;
  /** Save the most recent staged payload immediately. */
  flush: () => void;
  /** Discard any pending save (e.g. on unmount or selection change). */
  cancel: () => void;
}

export function useDebouncedSave<P>(
  saveFn: (payload: P) => Promise<void> | void,
  delay = 500,
): DebouncedSave<P> {
  const timer = useRef<number | null>(null);
  const pending = useRef<{ payload: P } | null>(null);
  const saveRef = useRef(saveFn);
  saveRef.current = saveFn;

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = null;
  }, []);

  const flush = useCallback(() => {
    if (pending.current) {
      const { payload } = pending.current;
      pending.current = null;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      void saveRef.current(payload);
    }
  }, []);

  const schedule = useCallback(
    (payload: P) => {
      pending.current = { payload };
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        const next = pending.current;
        pending.current = null;
        if (next) void saveRef.current(next.payload);
      }, delay);
    },
    [delay],
  );

  // Flush on unmount so navigating away never loses an edit.
  useEffect(() => () => flush(), [flush]);

  return { schedule, flush, cancel };
}
