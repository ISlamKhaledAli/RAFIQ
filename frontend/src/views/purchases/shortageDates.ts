// Shortage entries are stored as "yyyy-MM-dd HH:mm:ss" in UTC (space separated, no zone marker).
// Parsed as plain text a JS Date treats that as LOCAL time, which shifts the day for entries logged
// shortly after local midnight; these helpers read it as UTC so filter and display agree with the wall clock.

import { parseDateToLocalDateStr } from '../../utils/dateFilter.ts';

const SQL_UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/;

/** ISO instant for a stored shortage timestamp; other formats (already ISO) pass through unchanged. */
export function shortageInstant(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  const match = SQL_UTC_TIMESTAMP.exec(text);
  return match ? `${match[1]}T${match[2]}${match[3] ?? ''}Z` : text;
}

/** Both bounds are local YYYY-MM-DD and inclusive; '' means unbounded. */
export function matchesShortageDay(value: string | null | undefined, startDate: string, endDate: string): boolean {
  if (!startDate && !endDate) return true;
  const day = parseDateToLocalDateStr(shortageInstant(value));
  if (!day) return false;
  if (startDate && day < startDate) return false;
  if (endDate && day > endDate) return false;
  return true;
}

/** Local calendar date shown in the request-date column, '-' when missing or unreadable. */
export function formatShortageDate(value: string | null | undefined): string {
  const instant = shortageInstant(value);
  if (!instant) return '-';
  const date = new Date(instant);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('ar-EG');
}
