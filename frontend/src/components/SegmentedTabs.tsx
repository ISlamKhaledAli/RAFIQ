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
  /** compact = one h-10 toolbar row (same height as SearchInput md and CustomSelect lg); default is the tall page-level strip. */
  size?: 'default' | 'compact';
}

const SIZE_CLASSES = {
  default: {
    strip: 'gap-1.5 p-1.5 rounded-2xl',
    tab: 'min-h-[2.75rem] px-4 rounded-xl text-sm gap-2',
  },
  compact: {
    strip: 'h-10 gap-1 p-1 rounded-lg flex-nowrap',
    tab: 'px-3 rounded-md text-xs gap-1.5',
  },
} as const;

const ACTIVE_TONE: Record<SegmentedTabTone, string> = {
  brand: 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright dark:ring-1 dark:ring-inset dark:ring-brand-bright/40 shadow-xs',
  paid: 'bg-paid dark:bg-paid-dark-soft text-white dark:text-paid-bright dark:ring-1 dark:ring-inset dark:ring-paid-bright/40 shadow-xs',
  warn: 'bg-warn-bright dark:bg-warn-dark-soft text-ink dark:text-warn-bright dark:ring-1 dark:ring-inset dark:ring-warn-bright/40 shadow-xs',
  danger: 'bg-danger dark:bg-danger-dark-soft text-white dark:text-danger-bright dark:ring-1 dark:ring-inset dark:ring-danger-bright/40 shadow-xs',
};

const NEUTRAL_IDLE = 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark';

// Idle tabs wear a visible outline so they read as tabs (not as plain labels); hover darkens it and the active tab drops it.
const IDLE_FRAME = 'bg-surface/70 dark:bg-surface-dark/60 ring-1 ring-inset ring-line dark:ring-line-dark hover:ring-line-hover dark:hover:ring-line-dark-hover';

const TAB_FOCUS = 'focus-visible:!ring-2 focus-visible:!ring-brand dark:focus-visible:!ring-brand-bright focus-visible:!ring-offset-1 focus-visible:!ring-offset-surface-2 dark:focus-visible:!ring-offset-surface-dark-2';

const IDLE_TONE: Record<SegmentedTabTone, string> = {
  brand: NEUTRAL_IDLE,
  paid: NEUTRAL_IDLE,
  warn: 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-warn-bright hover:bg-warn-soft dark:hover:bg-warn-dark-soft',
  danger: 'text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft',
};

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  fullWidth = false,
  size = 'default',
}: SegmentedTabsProps<T>) {
  const sizeClasses = SIZE_CLASSES[size];
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex flex-wrap items-stretch ${sizeClasses.strip} bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark ${
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
            className={`${sizeClasses.tab} font-bold whitespace-nowrap flex items-center justify-center transition-all cursor-pointer ${TAB_FOCUS} ${
              fullWidth ? 'flex-1 min-w-[8rem]' : ''
            } ${isActive ? ACTIVE_TONE[tone] : `${IDLE_FRAME} ${IDLE_TONE[tone]}`}`}
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
