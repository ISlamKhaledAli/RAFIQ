import { normalizeDateRange, toLocalDateString } from './dateFilter.ts';

export interface ReportPeriodPayload {
  period: string;
  fromDate?: string;
  toDate?: string;
}

// أقدم تاريخ يُستخدم عند ترك بداية النطاق المخصص فارغة
export const REPORT_OPEN_START_DATE = '2000-01-01';

/**
 * Default custom range of the analytics screens: the last 30 days up to today, in LOCAL days
 * (the old toISOString() version returned the previous day between midnight and 02:00 in Egypt)
 */
export function defaultCustomReportRange(now: Date = new Date()): { from: string; to: string } {
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  return { from: toLocalDateString(start), to: toLocalDateString(now) };
}

/**
 * Backend payload of a report period selector. For 'custom' the range is cleaned (invalid values dropped,
 * a swapped range reordered) and an open end is filled, because the report queries need both ends of a custom range
 * (otherwise they silently fall back to today).
 */
export function buildReportPeriodPayload(
  period: string,
  customFrom: string,
  customTo: string,
  now: Date = new Date()
): ReportPeriodPayload {
  if (period !== 'custom') return { period };
  const { startDate, endDate } = normalizeDateRange(customFrom, customTo);
  const today = toLocalDateString(now);
  return {
    period,
    fromDate: startDate || REPORT_OPEN_START_DATE,
    // a start date in the future must not be swapped with an open end
    toDate: endDate || (startDate > today ? startDate : today),
  };
}
