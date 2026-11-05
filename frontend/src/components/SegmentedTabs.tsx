import type { ComponentType } from 'react';

export type SegmentedTabTone = 'brand' | 'paid' | 'warn' | 'danger';

export interface SegmentedTabOption<T extends string> {
  value: T;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: SegmentedTabTone;
  /** Small pulsing alert dot after the label (e.g. expired items waiting). */
  showDot?: boolean;
}

interface SegmentedTabsProps<T extends string> {
  options: SegmentedTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** Stretch the tabs to share the whole row equally. */
  fullWidth?: boolean;
}

const ACTIVE_TONE: Record<SegmentedTabTone, string> = {
  brand: 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright dark:ring-1 dark:ring-inset dark:ring-brand-bright/40 shadow-xs',
  paid: 'bg-paid dark:bg-paid-dark-soft text-white dark:text-paid-bright dark:ring-1 dark:ring-inset dark:ring-paid-bright/40 shadow-xs',
  warn: 'bg-warn dark:bg-warn-dark-soft text-white dark:text-warn-bright dark:ring-1 dark:ring-inset dark:ring-warn-bright/40 shadow-xs',
  danger: 'bg-danger dark:bg-danger-dark-soft text-white dark:text-danger-bright dark:ring-1 dark:ring-inset dark:ring-danger-bright/40 shadow-xs',
};

const NEUTRAL_IDLE = 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark';

const IDLE_TONE: Record<SegmentedTabTone, string> = {
  brand: NEUTRAL_IDLE,
  paid: NEUTRAL_IDLE,
  warn: 'text-warn dark:text-warn-bright hover:bg-warn-soft dark:hover:bg-warn-dark-soft',
  danger: 'text-danger dark:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft',
};

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  fullWidth = false,
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex flex-wrap items-stretch gap-1.5 p-1.5 rounded-2xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark ${
        fullWidth ? 'w-full' : 'w-fit max-w-full'
      }`}
    >
      {options.map((opt) => {
        const tone = opt.tone ?? 'brand';
        const Icon = opt.icon;
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.value)}
            className={`min-h-[44px] px-4 rounded-xl text-sm font-bold whitespace-nowrap flex items-center justify-center gap-2 transition-all cursor-pointer ${
              fullWidth ? 'flex-1 min-w-[8rem]' : ''
            } ${isActive ? ACTIVE_TONE[tone] : IDLE_TONE[tone]}`}
          >
            {Icon && <Icon className="w-4 h-4 shrink-0" />}
            <span>{opt.label}</span>
            {opt.showDot && (
              <span className="w-2 h-2 rounded-full bg-danger dark:bg-danger-bright animate-pulse shrink-0" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}
