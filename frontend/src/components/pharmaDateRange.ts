import { type DateFilterValue, getDateFilterPayload, getDateFilterRange, toLocalDateString } from '../utils/dateFilter.ts';

/** Earliest day sent to the profitability report when the filter has no start (the backend needs both ends) */
export const PROFITABILITY_FLOOR_DATE = '2000-01-01';

/** Custom filter that starts exactly one calendar month before `now` (clamped to the shorter month) and ends today */
export function lastMonthFilter(now: Date = new Date()): DateFilterValue {
  const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), daysInPrevMonth));
  return { preset: 'custom', startDate: toLocalDateString(start), endDate: toLocalDateString(now) };
}

/** Custom filter covering the last `days` calendar days before today, up to and including today */
export function lastDaysFilter(days: number, now: Date = new Date()): DateFilterValue {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return { preset: 'custom', startDate: toLocalDateString(start), endDate: toLocalDateString(now) };
}

export interface InspectionRegisterPayload {
  productId: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Payload of pharma:getControlledInspectionRegister; the backend reads dateFrom/dateTo (local days, inclusive) */
export function buildInspectionRegisterPayload(productId: string, filter: DateFilterValue): InspectionRegisterPayload {
  return { productId, ...getDateFilterPayload(filter) };
}

export interface ProfitabilityPayload {
  period: 'custom';
  fromDate: string;
  toDate: string;
}

/**
 * Payload of reports:getPharmaProfitability. The backend's custom period needs both ends, so an open end
 * is filled (start: fixed floor, end: today) and the range is always evaluated at call time.
 */
export function buildProfitabilityPayload(filter: DateFilterValue, now: Date = new Date()): ProfitabilityPayload {
  const { startDate, endDate } = getDateFilterRange(filter);
  const today = toLocalDateString(now);
  const fromDate = startDate || PROFITABILITY_FLOOR_DATE;
  let toDate = endDate || today;
  if (toDate < fromDate) toDate = fromDate;
  return { period: 'custom', fromDate, toDate };
}
