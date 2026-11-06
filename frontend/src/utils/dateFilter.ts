import { useState, useCallback } from 'react';

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
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = toLocalDateString(weekAgo);
    return itemDateStr >= weekAgoStr && itemDateStr <= todayStr;
  }

  if (filter.preset === 'month') {
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return itemDateStr >= monthStartStr && itemDateStr <= todayStr;
  }

  if (filter.preset === 'custom') {
    if (filter.startDate && filter.endDate) {
      return itemDateStr >= filter.startDate && itemDateStr <= filter.endDate;
    }
    if (filter.startDate) {
      return itemDateStr >= filter.startDate;
    }
    if (filter.endDate) {
      return itemDateStr <= filter.endDate;
    }
    return true;
  }

  return true;
}

/**
 * Calculates concrete YYYY-MM-DD bounds for a DateFilterValue
 */
export function getDateFilterRange(filter: DateFilterValue): { startDate: string; endDate: string } {
  const now = new Date();
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
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { startDate: toLocalDateString(weekAgo), endDate: todayStr };
    }
    case 'month': {
      const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return { startDate: monthStartStr, endDate: todayStr };
    }
    case 'custom':
      return { startDate: filter.startDate, endDate: filter.endDate };
    case 'all':
    default:
      return { startDate: '', endDate: '' };
  }
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

