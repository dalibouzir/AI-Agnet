import { useCallback, useEffect, useState } from 'react';

export function usePersistentState<T>(key: string, defaultValue: T): [T, (value: T | ((value: T) => T)) => void] {
  const [state, setState] = useState<T>(defaultValue);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        setState(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, [key]);

  const update = useCallback(
    (value: T | ((current: T) => T)) => {
      setState((current) => {
        const next = typeof value === 'function' ? (value as (v: T) => T)(current) : value;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(key, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
        return next;
      });
    },
    [key]
  );

  return [state, update];
}
