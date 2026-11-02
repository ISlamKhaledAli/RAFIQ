// One key per user attempt: a retry after a timeout reuses it so the server returns the first result instead of repeating money moves.
export function newIdempotencyKey(prefix: string): string {
  const unique = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  return `${prefix}_${unique}`;
}

// Keeps the key of the attempt in progress until it succeeds; the next attempt then gets a fresh key.
export function createAttemptKey(prefix: string): { current: () => string; complete: () => void } {
  let key: string | null = null;
  return {
    current: () => {
      if (!key) key = newIdempotencyKey(prefix);
      return key;
    },
    complete: () => {
      key = null;
    },
  };
}
