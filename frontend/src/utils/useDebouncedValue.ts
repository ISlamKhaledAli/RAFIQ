import { useEffect, useState } from 'react';

/** Delay before a search box that queries the host applies what was typed; Enter applies immediately. */
export const SEARCH_DEBOUNCE_MS = 280;

/** Returns `value` after it stayed unchanged for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
