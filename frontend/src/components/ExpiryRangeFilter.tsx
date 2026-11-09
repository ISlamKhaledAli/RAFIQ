import React from 'react';
import { X } from 'lucide-react';
import { CustomDateRangePicker } from './CustomDatePicker';
import { AppButton } from './AppButton';
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
      <AppButton
        variant="subtle"
        size="xs"
        icon={X}
        onClick={() => onChange({ ...EMPTY_EXPIRY_RANGE })}
        aria-label="إلغاء فلتر تاريخ الانتهاء"
        title="إلغاء فلتر تاريخ الانتهاء"
      />
    )}
  </div>
);
