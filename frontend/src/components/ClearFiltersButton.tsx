import { RotateCcw } from 'lucide-react';

type ClearFiltersButtonSize = 'sm' | 'md';

export interface ClearFiltersButtonProps {
  onClick: () => void;
  /** true when at least one filter is applied; the button stays mounted either way so the toolbar never reflows */
  active: boolean;
  label?: string;
  title?: string;
  size?: ClearFiltersButtonSize;
  /** 'pill' matches pill-shaped chips and tab strips next to the button */
  shape?: 'default' | 'pill';
}

const SIZE_CLASSES: Record<ClearFiltersButtonSize, string> = {
  sm: 'h-8 px-2.5 rounded-lg',
  md: 'h-10 px-3 rounded-xl',
};

const PILL_SIZE_CLASSES: Record<ClearFiltersButtonSize, string> = {
  sm: 'h-8 px-3 rounded-full',
  md: 'h-10 px-4 rounded-full',
};

const BASE_CLASSES = 'shrink-0 inline-flex items-center justify-center gap-1.5 border text-xs font-bold whitespace-nowrap transition-colors';

const ACTIVE_CLASSES =
  'border-danger-border dark:border-danger-bright/40 bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright hover:bg-danger hover:text-white dark:hover:bg-danger-bright dark:hover:text-surface-dark cursor-pointer';

const INACTIVE_CLASSES =
  'border-line/60 dark:border-line-dark/60 bg-surface-2/50 dark:bg-surface-dark-2/50 text-ink-muted/60 dark:text-ink-dark-muted/60 cursor-not-allowed';

/** Reset-filters button that is always mounted at a fixed size: it is only disabled and muted while no filter is applied. */
export const ClearFiltersButton = ({
  onClick,
  active,
  label = 'مسح التصفية',
  title,
  size = 'sm',
  shape = 'default',
}: ClearFiltersButtonProps) => (
  <button
    type="button"
    onClick={active ? onClick : undefined}
    disabled={!active}
    aria-disabled={!active}
    tabIndex={active ? 0 : -1}
    title={active ? title : 'لا توجد فلاتر مفعّلة'}
    className={`${BASE_CLASSES} ${(shape === 'pill' ? PILL_SIZE_CLASSES : SIZE_CLASSES)[size]} ${active ? ACTIVE_CLASSES : INACTIVE_CLASSES}`}
  >
    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
    <span>{label}</span>
  </button>
);
