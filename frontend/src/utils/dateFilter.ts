import { useState, useCallback, useEffect } from 'react';

export type DatePresetKey = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';

export interface DateFilterValue {
  preset: DatePresetKey;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export const DEFAULT_DATE_FILTER: DateFilterValue = {
  preset: 'all',
  startDate: '',
  endDate: '',
};

export const DATE_PRESET_OPTIONS: { value: DatePresetKey; label: string }[] = [
  { value: 'all', label: 'كل الفترات والتواريخ' },
  { value: 'today', label: 'اليوم (النهاردة)' },
  { value: 'yesterday', label: 'أمس (إمبارح)' },
  { value: 'week', label: 'آخر 7 أيام' },
  { value: 'month', label: 'هذا الشهر' },
  { value: 'custom', label: 'فترة مخصصة...' },
];

export function getDatePresetLabel(preset: DatePresetKey): string {
  switch (preset) {
    case 'today': return 'اليوم';
    case 'yesterday': return 'أمس';
    case 'week': return 'آخر 7 أيام';
    case 'month': return 'هذا الشهر';
    case 'custom': return 'الفترة المحددة';
    case 'all': return 'كافة الأوقات';
    default: return 'الفترة المحددة';
  }
}

/**
 * Format a Date object to YYYY-MM-DD in local time
 */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Safely parse date representations (ISO, SQLite string, Date object) to YYYY-MM-DD local string
 */
export function parseDateToLocalDateStr(val: string | Date | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : toLocalDateString(val);
  }
  const s = String(val).trim();
  if (!s) return null;

  // If already standard ISO / datetime containing T or space:
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    if (s.includes('T') || s.includes(' ') || s.includes('Z')) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return toLocalDateString(d);
      }
    }
    return s.slice(0, 10);
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : toLocalDateString(d);
}

function referenceDate(today?: string): Date {
  if (today && /^\d{4}-\d{2}-\d{2}$/.test(today)) {
    const [y, m, d] = today.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cleans a custom range: invalid values become '' and a swapped range (start after end) is reordered
 */
export function normalizeDateRange(startDate: string, endDate: string): { startDate: string; endDate: string } {
  let start = DATE_ONLY_RE.test(startDate || '') ? startDate : '';
  let end = DATE_ONLY_RE.test(endDate || '') ? endDate : '';
  if (start && end && start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  return { startDate: start, endDate: end };
}

/**
 * Check if a record's date falls within the filter range
 */
export function matchesDateFilter(
  dateValue: string | Date | null | undefined,
  filter: DateFilterValue
): boolean {
  if (filter.preset === 'all') return true;
  const itemDateStr = parseDateToLocalDateStr(dateValue);
  if (!itemDateStr) return false;

  const now = new Date();
  const todayStr = toLocalDateString(now);

  if (filter.preset === 'today') {
    return itemDateStr === todayStr;
  }

  if (filter.preset === 'yesterday') {
    const yest = new Date(now);
    yest.setDate(yest.getDate() - 1);
    return itemDateStr === toLocalDateString(yest);
  }

  if (filter.preset === 'week') {
    // last 7 days including today
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekAgoStr = toLocalDateString(weekAgo);
    return itemDateStr >= weekAgoStr && itemDateStr <= todayStr;
  }

  if (filter.preset === 'month') {
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return itemDateStr >= monthStartStr && itemDateStr <= todayStr;
  }

  if (filter.preset === 'custom') {
    const { startDate, endDate } = normalizeDateRange(filter.startDate, filter.endDate);
    if (startDate && endDate) {
      return itemDateStr >= startDate && itemDateStr <= endDate;
    }
    if (startDate) {
      return itemDateStr >= startDate;
    }
    if (endDate) {
      return itemDateStr <= endDate;
    }
    return true;
  }

  return true;
}

/**
 * Calculates concrete YYYY-MM-DD bounds for a DateFilterValue.
 * `today` (YYYY-MM-DD, e.g. from useToday) pins the reference day so memoised callers recompute after midnight.
 */
export function getDateFilterRange(filter: DateFilterValue, today?: string): { startDate: string; endDate: string } {
  const now = referenceDate(today);
  const todayStr = toLocalDateString(now);

  switch (filter.preset) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr };
    case 'yesterday': {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = toLocalDateString(yest);
      return { startDate: yestStr, endDate: yestStr };
    }
    case 'week': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 6);
      return { startDate: toLocalDateString(weekAgo), endDate: todayStr };
    }
    case 'month': {
      const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return { startDate: monthStartStr, endDate: todayStr };
    }
    case 'custom':
      return normalizeDateRange(filter.startDate, filter.endDate);
    case 'all':
    default:
      return { startDate: '', endDate: '' };
  }
}

/**
 * True when the filter actually restricts records (a custom preset with no dates restricts nothing)
 */
export function isDateFilterActive(filter: DateFilterValue): boolean {
  if (filter.preset === 'all') return false;
  if (filter.preset === 'custom') {
    const { startDate, endDate } = normalizeDateRange(filter.startDate, filter.endDate);
    return Boolean(startDate || endDate);
  }
  return true;
}

/**
 * Optional dateFrom/dateTo (YYYY-MM-DD, local days, both inclusive) for backend payloads; empty object when unfiltered
 */
export function getDateFilterPayload(filter: DateFilterValue, today?: string): { dateFrom?: string; dateTo?: string } {
  if (!isDateFilterActive(filter)) return {};
  const { startDate, endDate } = getDateFilterRange(filter, today);
  const payload: { dateFrom?: string; dateTo?: string } = {};
  if (startDate) payload.dateFrom = startDate;
  if (endDate) payload.dateTo = endDate;
  return payload;
}

/**
 * Stable key of the concrete range (changes when a relative preset rolls over to a new day); use it for pagination resets
 */
export function getDateFilterKey(filter: DateFilterValue): string {
  const { startDate, endDate } = getDateFilterRange(filter);
  return `${filter.preset}_${startDate}_${endDate}`;
}

/**
 * Human readable Arabic description of the active period, '' when the filter is not active
 */
export function describeDateFilter(filter: DateFilterValue): string {
  if (!isDateFilterActive(filter)) return '';
  if (filter.preset !== 'custom') return getDatePresetLabel(filter.preset);
  const { startDate, endDate } = normalizeDateRange(filter.startDate, filter.endDate);
  if (startDate && endDate) return startDate === endDate ? startDate : `من ${startDate} إلى ${endDate}`;
  if (startDate) return `من ${startDate}`;
  return `حتى ${endDate}`;
}

/**
 * Today's local date (YYYY-MM-DD); re-renders the caller when the day rolls over (midnight) or the window regains focus
 */
export function useToday(): string {
  const [today, setToday] = useState(() => toLocalDateString(new Date()));
  useEffect(() => {
    const refresh = () => setToday(toLocalDateString(new Date()));
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime());
    window.addEventListener('focus', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [today]);
  return today;
}

/**
 * Local "YYYY-MM-DD HH:MM" for a stored timestamp (UTC ISO, SQLite or Date); '' when missing or invalid
 */
export function formatLocalDateTime(val: string | Date | null | undefined): string {
  if (!val) return '';
  const d = val instanceof Date ? val : new Date(String(val));
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${toLocalDateString(d)} ${hh}:${mm}`;
}

/**
 * Reusable hook for date filtering
 */
export function useDateFilter(initialPreset: DatePresetKey = 'all') {
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({
    preset: initialPreset,
    startDate: '',
    endDate: '',
  });

  const filterDate = useCallback(
    (dateValue: string | Date | null | undefined) => {
      return matchesDateFilter(dateValue, dateFilter);
    },
    [dateFilter]
  );

  const resetDateFilter = useCallback(() => {
    setDateFilter({ preset: 'all', startDate: '', endDate: '' });
  }, []);

  return {
    dateFilter,
    setDateFilter,
    filterDate,
    resetDateFilter,
  };
}

