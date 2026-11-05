import type { ComponentType, FC, ReactNode } from 'react';
import { X } from 'lucide-react';

type IconComponent = ComponentType<{ className?: string }>;

interface ToolsMenuGroupProps {
  title: string;
  children: ReactNode;
}

/** A titled, divider-separated block of items inside the catalog tools dropdown. */
export const ToolsMenuGroup: FC<ToolsMenuGroupProps> = ({ title, children }) => (
  <div className="py-1.5 border-t border-line dark:border-line-dark first:border-t-0 first:pt-0">
    <div className="px-4 pb-1 text-micro font-bold text-ink-muted dark:text-ink-dark-muted">{title}</div>
    <div className="flex flex-col px-1.5 gap-0.5">{children}</div>
  </div>
);

type ToolsMenuTone = 'default' | 'warn' | 'danger';

const ITEM_TONE: Record<ToolsMenuTone, string> = {
  default: 'text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2',
  warn: 'text-warn dark:text-warn-bright hover:bg-warn-soft dark:hover:bg-warn-dark-soft',
  danger: 'text-danger dark:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft',
};

const ICON_TONE: Record<ToolsMenuTone, string> = {
  default: 'text-brand dark:text-brand-bright',
  warn: 'text-warn dark:text-warn-bright',
  danger: 'text-danger dark:text-danger-bright',
};

interface ToolsMenuItemProps {
  icon: IconComponent;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: ToolsMenuTone;
  /** Keyboard shortcut shown as a small badge, e.g. "F8". */
  shortcut?: string;
}

export const ToolsMenuItem: FC<ToolsMenuItemProps> = ({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  tone = 'default',
  shortcut,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`w-full min-h-10 px-2.5 py-1.5 rounded-lg text-right text-xs font-bold leading-snug flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${ITEM_TONE[tone]}`}
  >
    <Icon className={`w-4 h-4 shrink-0 ${ICON_TONE[tone]}`} />
    <span className="min-w-0 flex-1">{label}</span>
    {shortcut && (
      <span className="shrink-0 px-1.5 h-5 inline-flex items-center rounded border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 text-micro font-mono text-ink-muted dark:text-ink-dark-muted">
        {shortcut}
      </span>
    )}
  </button>
);

type ChipTone = 'brand' | 'warn' | 'danger';

const CHIP_TONE: Record<ChipTone, string> = {
  brand: 'bg-brand-soft dark:bg-brand-dark-soft border-brand/20 dark:border-brand-bright/40 text-brand dark:text-brand-bright',
  warn: 'bg-warn-soft dark:bg-warn-dark-soft border-warn/30 dark:border-warn-bright/40 text-warn dark:text-warn-bright',
  danger: 'bg-danger-soft dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/40 text-danger dark:text-danger-bright',
};

interface ActiveFilterChipProps {
  label: string;
  value: string;
  tone?: ChipTone;
  onRemove: () => void;
}

/** Removable chip describing one active catalog filter. */
export const ActiveFilterChip: FC<ActiveFilterChipProps> = ({ label, value, tone = 'brand', onRemove }) => (
  <span className={`inline-flex items-center gap-2 h-8 pr-3 pl-1.5 rounded-full border text-xs font-bold max-w-full ${CHIP_TONE[tone]}`}>
    <span className="opacity-80 shrink-0">{label}:</span>
    <span className="truncate">{value}</span>
    <button
      type="button"
      onClick={onRemove}
      aria-label={`إزالة فلتر ${label}`}
      title={`إزالة فلتر ${label}`}
      className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center hover:bg-ink/10 dark:hover:bg-ink-dark/15 transition-colors cursor-pointer"
    >
      <X className="w-3.5 h-3.5" />
    </button>
  </span>
);
