import React from 'react';
import { Calendar, X } from 'lucide-react';
import { CustomSelect } from './CustomSelect';
import { CustomDateRangePicker } from './CustomDatePicker';
import { AppButton } from './AppButton';
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

const PILL_PRESETS: { key: Exclude<DatePresetKey, 'custom'>; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'today', label: 'النهاردة' },
  { key: 'yesterday', label: 'إمبارح' },
  { key: 'week', label: 'آخر 7 أيام' },
  { key: 'month', label: 'هذا الشهر' },
];

const PILL_BASE = 'px-2.5 sm:px-3 py-1 rounded-lg text-xs font-bold cursor-pointer';
const PILL_ACTIVE =
  'bg-brand text-white dark:bg-brand-dark-soft dark:text-brand-bright dark:ring-1 dark:ring-inset dark:ring-brand-bright/40 shadow-xs';
const PILL_IDLE =
  'text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright hover:bg-surface/60 dark:hover:bg-surface-dark/60';

// The preset picker and the custom range share ONE grid cell, so the control keeps the same footprint
// (width and height) whichever of the two is shown and the surrounding toolbar never jumps.
const LAYER = 'col-start-1 row-start-1 flex items-center gap-1';
const HIDDEN_LAYER = 'invisible pointer-events-none';

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

  const isCustom = value.preset === 'custom';

  const rangeLayer = (
    <div className={`${LAYER} justify-self-start ${isCustom ? '' : HIDDEN_LAYER}`} aria-hidden={!isCustom} inert={!isCustom}>
      <CustomDateRangePicker
        startDate={value.startDate}
        endDate={value.endDate}
        onChange={(start, end) => onChange({ ...value, startDate: start, endDate: end })}
        size={size}
      />
      <AppButton
        variant="dangerSubtle"
        size="xs"
        icon={X}
        onClick={handleClearCustom}
        title="إلغاء تحديد التاريخ والعودة للكل"
        aria-label="إلغاء تحديد التاريخ والعودة للكل"
      />
    </div>
  );

  if (variant === 'pills') {
    return (
      <div className={`grid items-center ${className}`} dir="rtl">
        <div
          className={`${LAYER} justify-self-start bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark text-xs ${isCustom ? HIDDEN_LAYER : ''}`}
          aria-hidden={isCustom}
          inert={isCustom}
        >
          {PILL_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => handlePresetChange(preset.key)}
              aria-pressed={value.preset === preset.key}
              className={`${PILL_BASE} ${value.preset === preset.key ? PILL_ACTIVE : PILL_IDLE}`}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handlePresetChange('custom')}
            aria-pressed={isCustom}
            className={`${PILL_BASE} flex items-center gap-1 ${isCustom ? PILL_ACTIVE : PILL_IDLE}`}
            title="تحديد فترة مخصصة بالتقويم"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>فترة مخصصة</span>
          </button>
        </div>
        {rangeLayer}
      </div>
    );
  }

  // Default 'select' variant
  return (
    <div className={`grid items-center ${className}`} dir="rtl">
      <div className={`${LAYER} justify-self-start ${isCustom ? HIDDEN_LAYER : ''}`} aria-hidden={isCustom} inert={isCustom}>
        <div className={selectWidthClass}>
          <CustomSelect
            value={value.preset}
            onChange={(val) => handlePresetChange(val as DatePresetKey)}
            options={DATE_PRESET_OPTIONS}
            size={size}
          />
        </div>
      </div>
      {rangeLayer}
    </div>
  );
};
