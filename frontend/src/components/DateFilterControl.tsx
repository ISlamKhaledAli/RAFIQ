import React from 'react';
import { Calendar, X } from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { CustomDateRangePicker } from './CustomDatePicker';
import { 
  type DateFilterValue, 
  type DatePresetKey, 
  DATE_PRESET_OPTIONS 
} from '../utils/dateFilter';

export interface DateFilterControlProps {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
  variant?: 'select' | 'pills';
  size?: 'sm' | 'md';
  className?: string;
  selectWidthClass?: string;
}

export const DateFilterControl: React.FC<DateFilterControlProps> = ({
  value,
  onChange,
  variant = 'select',
  size = 'sm',
  className = '',
  selectWidthClass = 'w-48 sm:w-52',
}) => {
  const handlePresetChange = (preset: DatePresetKey) => {
    if (preset === 'custom') {
      onChange({
        ...value,
        preset: 'custom',
      });
    } else {
      onChange({
        preset,
        startDate: '',
        endDate: '',
      });
    }
  };

  const handleClearCustom = () => {
    onChange({
      preset: 'all',
      startDate: '',
      endDate: '',
    });
  };

  if (variant === 'pills') {
    return (
      <div className={`flex items-center gap-1.5 flex-wrap ${className}`} dir="rtl">
        <div className="flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark text-xs">
          <button
            type="button"
            onClick={() => handlePresetChange('all')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              value.preset === 'all'
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            الكل
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('today')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              value.preset === 'today'
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            النهاردة
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('yesterday')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              value.preset === 'yesterday'
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            إمبارح
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('week')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              value.preset === 'week'
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            آخر 7 أيام
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('month')}
            className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              value.preset === 'month'
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
          >
            هذا الشهر
          </button>
          <button
            type="button"
            onClick={() => handlePresetChange('custom')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
              value.preset === 'custom'
                ? 'bg-brand-dark dark:bg-brand text-white shadow-xs'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-brand-dark dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60'
            }`}
            title="تحديد فترة مخصصة بالتقويم"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>فترة مخصصة</span>
          </button>
        </div>

        {value.preset === 'custom' && (
          <div className="flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150">
            <CustomDateRangePicker
              startDate={value.startDate}
              endDate={value.endDate}
              onChange={(start, end) => onChange({ ...value, startDate: start, endDate: end })}
              size={size}
            />
            {(value.startDate || value.endDate) && (
              <button
                type="button"
                onClick={handleClearCustom}
                className="p-1 rounded-lg text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-surface-2 dark:hover:bg-surface-dark-2 cursor-pointer transition-colors"
                title="إلغاء تحديد التاريخ"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Default 'select' variant
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`} dir="rtl">
      <div className={selectWidthClass}>
        <CustomSelect
          value={value.preset}
          onChange={(val) => handlePresetChange(val as DatePresetKey)}
          options={DATE_PRESET_OPTIONS}
          size={size}
        />
      </div>

      {value.preset === 'custom' && (
        <div className="flex items-center gap-1 animate-in fade-in zoom-in-95 duration-150">
          <CustomDateRangePicker
            startDate={value.startDate}
            endDate={value.endDate}
            onChange={(start, end) => onChange({ ...value, startDate: start, endDate: end })}
            size={size}
          />
          {(value.startDate || value.endDate) && (
            <button
              type="button"
              onClick={handleClearCustom}
              className="p-1 rounded-lg text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-surface-2 dark:hover:bg-surface-dark-2 cursor-pointer transition-colors"
              title="إلغاء تحديد التاريخ والعودة للكل"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

