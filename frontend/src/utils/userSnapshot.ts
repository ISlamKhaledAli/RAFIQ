// Key-order independent JSON so identical server payloads compare equal.
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

export function isSameUserSnapshot<T>(a: T | null | undefined, b: T | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return stableStringify(a) === stableStringify(b);
}

/**
 * Returns `previous` when the refreshed user carries identical data, so React state
 * (and every effect keyed on it) is not churned by a no-op refresh.
 */
export function reconcileUser<T>(previous: T | null, next: T | null): T | null {
  return isSameUserSnapshot(previous, next) ? previous : next;
}
