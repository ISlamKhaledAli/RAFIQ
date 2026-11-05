import React from 'react';
import { Banknote, Percent } from 'lucide-react';
import { normalizeArabicNumerals } from '../../utils/money';
import { RequiredMark } from '../RequiredMark';

export type DiscountType = 'amount' | 'percent';

interface DiscountEntryProps {
  type: DiscountType;
  onTypeChange: (type: DiscountType) => void;
  value: string;
  onValueChange: (value: string) => void;
  amountPresets: readonly number[];
  percentPresets: readonly number[];
  amountToggleLabel: string;
  percentToggleLabel: string;
  amountFieldLabel: string;
  percentFieldLabel: string;
  resetLabel: string;
  inputId: string;
}

// Selected segment: dark tint + bright text + bright border in dark mode (a plain brand fill vanishes on dark surfaces).
const SEGMENT_BASE =
  'h-11 flex-1 px-3 rounded-lg border text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer focus-visible:border-brand dark:focus-visible:border-brand-bright';
const SEGMENT_ON =
  'bg-brand text-white border-brand dark:bg-brand-dark-soft dark:text-brand-bright dark:border-brand-bright shadow-xs';
const SEGMENT_OFF =
  'bg-transparent border-transparent text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-3';

const PRESET_BASE =
  'h-11 rounded-lg border bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark text-ink dark:text-ink-dark text-sm font-bold tabular-nums shadow-2xs transition-colors cursor-pointer';
const PRESET_HOVER =
  'hover:border-brand dark:hover:border-brand-bright hover:text-brand dark:hover:text-brand-bright hover:bg-brand-soft dark:hover:bg-brand-dark-soft focus-visible:border-brand dark:focus-visible:border-brand-bright';
const RESET_HOVER =
  'hover:border-danger dark:hover:border-danger-bright hover:text-danger dark:hover:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft focus-visible:border-danger dark:focus-visible:border-danger-bright';

// Amount/percent toggle + value field + quick presets, shared by the line and invoice discount dialogs.
export const DiscountEntry: React.FC<DiscountEntryProps> = ({
  type,
  onTypeChange,
  value,
  onValueChange,
  amountPresets,
  percentPresets,
  amountToggleLabel,
  percentToggleLabel,
  amountFieldLabel,
  percentFieldLabel,
  resetLabel,
  inputId,
}) => {
  const presets = type === 'amount' ? amountPresets : percentPresets;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark" role="group" aria-label="نوع الخصم">
        <button
          type="button"
          aria-pressed={type === 'amount'}
          onClick={() => onTypeChange('amount')}
          className={`${SEGMENT_BASE} ${type === 'amount' ? SEGMENT_ON : SEGMENT_OFF}`}
        >
          <Banknote className="w-4 h-4 shrink-0" />
          <span className="truncate">{amountToggleLabel}</span>
        </button>
        <button
          type="button"
          aria-pressed={type === 'percent'}
          onClick={() => onTypeChange('percent')}
          className={`${SEGMENT_BASE} ${type === 'percent' ? SEGMENT_ON : SEGMENT_OFF}`}
        >
          <Percent className="w-4 h-4 shrink-0" />
          <span className="truncate">{percentToggleLabel}</span>
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={inputId} className="t-label text-ink-muted dark:text-ink-dark-muted">
          {type === 'amount' ? amountFieldLabel : percentFieldLabel} <RequiredMark />
        </label>
        <div className="relative">
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            value={value}
            onChange={(e) => {
              const norm = normalizeArabicNumerals(e.target.value);
              if (/^[0-9]*\.?[0-9]{0,2}$/.test(norm)) onValueChange(norm);
            }}
            className="w-full h-14 px-14 text-center text-3xl font-mono font-bold tabular-nums text-brand dark:text-brand-bright bg-surface-2 dark:bg-surface-dark-2 border-2 border-ink-muted/70 dark:border-ink-dark-muted/70 focus:border-brand dark:focus:border-brand-bright rounded-xl placeholder:text-ink-muted/60 dark:placeholder:text-ink-dark-muted focus:outline-none"
          />
          <span className="absolute start-4 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-muted dark:text-ink-dark-muted pointer-events-none">
            {type === 'amount' ? 'ج.م' : '%'}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="t-label text-ink-muted dark:text-ink-dark-muted">اختصارات سريعة</span>
        <div className="grid grid-cols-4 gap-2">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onValueChange(String(preset))}
              className={`${PRESET_BASE} ${PRESET_HOVER}`}
            >
              {type === 'amount' ? `${preset} ج.م` : `${preset}%`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onValueChange('0')}
            className={`col-span-4 ${PRESET_BASE} ${RESET_HOVER}`}
          >
            {resetLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
