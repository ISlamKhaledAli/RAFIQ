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

// Sale key bound to the exact request content: the same fingerprint (a pure retry after a timeout) keeps the key,
// any change to the cart or payments rotates it, because the server rejects one key used for two different requests.
export function createFingerprintedAttemptKey(prefix: string): {
  keyFor: (fingerprint: string) => string;
  reset: () => void;
} {
  let key: string | null = null;
  let keyFingerprint: string | null = null;
  return {
    keyFor: (fingerprint: string) => {
      if (!key || keyFingerprint !== fingerprint) {
        key = newIdempotencyKey(prefix);
        keyFingerprint = fingerprint;
      }
      return key;
    },
    reset: () => {
      key = null;
      keyFingerprint = null;
    },
  };
}

// Server rejection when the same key is reused for different data (see Common/IdempotencyGuard.cs); the key must then be rotated.
const IDEMPOTENCY_MISMATCH_MARKER = 'نفس رقم العملية لطلب مختلف';

export function isIdempotencyMismatchError(err: unknown): boolean {
  return err instanceof Error && err.message.includes(IDEMPOTENCY_MISMATCH_MARKER);
}
