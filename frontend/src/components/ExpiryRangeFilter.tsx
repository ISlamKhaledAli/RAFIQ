import React from 'react';
import { X } from 'lucide-react';
import { CustomDateRangePicker } from './CustomDatePicker';
import { EMPTY_EXPIRY_RANGE, isExpiryRangeActive, type ExpiryRange } from '../utils/expiryRange';

interface ExpiryRangeFilterProps {
  value: ExpiryRange;
  onChange: (value: ExpiryRange) => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Expiry-date range (from/to, inclusive) built on the shared range picker. The relative presets of the
 * shared date filter (this month = 1st..today) point at the past, so they do not fit expiry dates.
 */
export const ExpiryRangeFilter: React.FC<ExpiryRangeFilterProps> = ({ value, onChange, size = 'md', className = '' }) => (
  <div className={`flex items-center gap-2 flex-wrap ${className}`} dir="rtl">
    <span className="text-sm text-ink-muted dark:text-ink-dark-muted font-bold whitespace-nowrap">ينتهي خلال الفترة:</span>
    <CustomDateRangePicker
      startDate={value.startDate}
      endDate={value.endDate}
      onChange={(start, end) => onChange({ startDate: start, endDate: end })}
      size={size}
    />
    {isExpiryRangeActive(value) && (
      <button
        type="button"
        onClick={() => onChange({ ...EMPTY_EXPIRY_RANGE })}
        className="p-1 rounded-lg text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-surface-2 dark:hover:bg-surface-dark-2 cursor-pointer transition-colors"
        title="إلغاء فلتر تاريخ الانتهاء"
      >
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);
