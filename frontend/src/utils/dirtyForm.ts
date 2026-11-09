/**
 * "Dirty" means the form differs from what it was opened with, never "has some value".
 * Both sides go through the same normalisation so a re-rendered or re-formatted value is not a change.
 */

const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;
// No leading zeros: "007" and "0123" are codes, not numbers, so they must keep their exact text
const NUMERIC_TEXT = /^-?(0|[1-9]\d*)(\.\d+)?$/;

function latinDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO))
    .replace(/\u066B/g, '.');
}

/** Canonical form: empty-ish values become '', numeric text becomes the number, objects keep sorted keys. */
export function normalizeFormValue(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return 'true';
  if (typeof value === 'string') {
    const text = latinDigits(value).trim();
    return NUMERIC_TEXT.test(text) ? String(Number(text)) : text;
  }
  if (value instanceof Date) return String(value.getTime());
  if (Array.isArray(value)) {
    const items = value.map(normalizeFormValue);
    const flat = value.every((item) => item === null || typeof item !== 'object');
    return JSON.stringify(flat ? items.sort() : items);
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(record).sort()) {
      const normalized = normalizeFormValue(record[key]);
      // A missing key equals an unchecked flag, so { a: false } and {} are the same form
      if (normalized !== '') parts.push(`${JSON.stringify(key)}:${JSON.stringify(normalized)}`);
    }
    return `{${parts.join(',')}}`;
  }
  return String(value);
}

export function isSameFormValue(initial: unknown, current: unknown): boolean {
  return normalizeFormValue(initial) === normalizeFormValue(current);
}

/** True when any of `keys` (default: every key of both forms) differs between the snapshot and the current values. */
export function isFormDirty<T extends object>(
  initial: T,
  current: T,
  keys?: readonly (keyof T)[],
): boolean {
  const names = keys ?? ([...new Set([...Object.keys(initial), ...Object.keys(current)])] as (keyof T)[]);
  return names.some((key) => !isSameFormValue(initial[key], current[key]));
}
