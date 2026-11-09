// Single source of truth for button styling. AppButton renders these classes; raw <button>/<a>/menu rows
// that cannot use the component (table cells, floating menus, legacy call sites) reuse the same builders.
//
// Rules baked into every class string:
// - Heights come only from the size scale (h-7 / h-8 / h-10 / h-11); radius follows the size; text is text-xs (text-sm on lg).
// - Every colour utility has a dark: pair. Solid fills use a bright fill + surface-dark text in the dark theme.
// - Hover is gated behind :not(:disabled) so disabled buttons never react. Disabled = opacity-50 + not-allowed.
// - No transition/active:scale classes: index.css already animates every button/a (colour, border, shadow, press).
// - Keyboard focus uses focus-visible:!ring (the ! is required: index.css removes box-shadow on button:focus-visible).

export const BUTTON_VARIANTS = [
  'primary',
  'success',
  'warning',
  'danger',
  'secondary',
  'soft',
  'successSoft',
  'warningSoft',
  'dangerSoft',
  'subtle',
  'dangerSubtle',
] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ['xs', 'sm', 'md', 'lg'] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

const BASE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap select-none font-bold focus-visible:!ring-2 focus-visible:!ring-brand dark:focus-visible:!ring-brand-bright focus-visible:!ring-offset-1 focus-visible:!ring-offset-surface dark:focus-visible:!ring-offset-surface-dark disabled:cursor-not-allowed disabled:shadow-none aria-disabled:cursor-not-allowed aria-disabled:pointer-events-none';

const DISABLED_FADE = 'disabled:opacity-50 aria-disabled:opacity-50';
// While loading the button is disabled (no double submit) but stays readable: the spinner is the feedback.
const LOADING = 'relative disabled:opacity-80';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // Dark: primary and success intentionally share the paid-bright fill (matches the sidebar's active item); the light fills differ.
  primary:
    'bg-brand text-white shadow-xs dark:bg-paid-bright dark:text-surface-dark [&:not(:disabled)]:hover:bg-brand-dark dark:[&:not(:disabled)]:hover:bg-paid-bright-hover',
  success:
    'bg-paid text-white shadow-xs dark:bg-paid-bright dark:text-surface-dark [&:not(:disabled)]:hover:bg-paid-hover dark:[&:not(:disabled)]:hover:bg-paid-bright-hover',
  // The bright amber is shared by both themes: ink on it is about 10:1 (ink on the darker bg-warn was only 4.5:1 and looked muddy).
  warning:
    'bg-warn-bright text-ink shadow-xs dark:bg-warn-bright dark:text-surface-dark [&:not(:disabled)]:hover:bg-warn-bright/90 dark:[&:not(:disabled)]:hover:bg-warn-bright/90',
  danger:
    'bg-danger text-white shadow-xs dark:bg-danger-bright dark:text-surface-dark [&:not(:disabled)]:hover:bg-danger-ink dark:[&:not(:disabled)]:hover:bg-danger-bright/90',
  secondary:
    'border bg-surface text-ink border-line dark:bg-surface-dark dark:text-ink-dark dark:border-line-dark [&:not(:disabled)]:hover:bg-surface-2 [&:not(:disabled)]:hover:border-line-hover dark:[&:not(:disabled)]:hover:bg-surface-dark-2 dark:[&:not(:disabled)]:hover:border-line-dark-hover',
  soft:
    'border bg-brand-soft text-brand border-brand/20 dark:bg-brand-dark-soft dark:text-brand-bright dark:border-brand-bright/30 [&:not(:disabled)]:hover:bg-brand/10 dark:[&:not(:disabled)]:hover:bg-brand-bright/20',
  successSoft:
    'border bg-paid-soft text-paid border-paid-border dark:bg-paid-dark-soft dark:text-paid-bright dark:border-paid-dark-border [&:not(:disabled)]:hover:bg-paid/10 dark:[&:not(:disabled)]:hover:bg-paid-bright/20',
  warningSoft:
    'border bg-warn-soft text-ink border-warn-border dark:bg-warn-dark-soft dark:text-warn-bright dark:border-warn-bright/30 [&:not(:disabled)]:hover:bg-warn/10 dark:[&:not(:disabled)]:hover:bg-warn-bright/20',
  dangerSoft:
    'border bg-danger-soft text-danger border-danger-border dark:bg-danger-dark-soft dark:text-danger-bright dark:border-danger-bright/30 [&:not(:disabled)]:hover:bg-danger/10 dark:[&:not(:disabled)]:hover:bg-danger-bright/20',
  subtle:
    'text-ink-muted dark:text-ink-dark-muted [&:not(:disabled)]:hover:bg-surface-2 [&:not(:disabled)]:hover:text-ink dark:[&:not(:disabled)]:hover:bg-surface-dark-2 dark:[&:not(:disabled)]:hover:text-ink-dark',
  dangerSubtle:
    'text-ink-muted dark:text-ink-dark-muted [&:not(:disabled)]:hover:bg-danger-soft [&:not(:disabled)]:hover:text-danger dark:[&:not(:disabled)]:hover:bg-danger-dark-soft dark:[&:not(:disabled)]:hover:text-danger-bright',
};

// Radius follows the height: rounded-lg up to h-10, rounded-xl for the h-11 dialog/checkout size.
const SIZE_CLASS: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 rounded-lg text-xs',
  sm: 'h-8 px-3 rounded-lg text-xs',
  md: 'h-10 px-4 rounded-lg text-xs',
  lg: 'h-11 px-5 rounded-xl text-sm',
};

const ICON_ONLY_SIZE_CLASS: Record<ButtonSize, string> = {
  xs: 'w-7 h-7 shrink-0 rounded-lg',
  sm: 'w-8 h-8 shrink-0 rounded-lg',
  md: 'w-10 h-10 shrink-0 rounded-lg',
  lg: 'w-11 h-11 shrink-0 rounded-xl',
};

const ICON_CLASS: Record<ButtonSize, string> = {
  xs: 'w-3.5 h-3.5 shrink-0',
  sm: 'w-3.5 h-3.5 shrink-0',
  md: 'w-4 h-4 shrink-0',
  lg: 'w-4 h-4 shrink-0',
};

const ICON_ONLY_ICON_CLASS: Record<ButtonSize, string> = {
  xs: 'w-3.5 h-3.5 shrink-0',
  sm: 'w-4 h-4 shrink-0',
  md: 'w-4 h-4 shrink-0',
  lg: 'w-4 h-4 shrink-0',
};

interface ButtonClassBase {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
}

/** Icon-only buttons have no visible text, so the builder refuses to run without an accessible name. */
export type ButtonClassOptions = ButtonClassBase & ({ iconOnly?: false } | { iconOnly: true; ariaLabel: string });

export function buttonClass(options: ButtonClassOptions = {}): string {
  const { variant = 'secondary', size = 'md', fullWidth = false, loading = false } = options;
  const iconOnly = options.iconOnly === true;
  if (options.iconOnly === true && !(options.ariaLabel ?? '').trim()) {
    throw new Error('buttonClass: an icon-only button requires a non-empty ariaLabel');
  }
  return [
    BASE,
    loading ? LOADING : DISABLED_FADE,
    iconOnly ? ICON_ONLY_SIZE_CLASS[size] : SIZE_CLASS[size],
    VARIANT_CLASS[variant],
    fullWidth && !iconOnly ? 'w-full' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Size class for the lucide icon inside a button (AppButton applies it automatically). */
export function buttonIconClass(size: ButtonSize = 'md', iconOnly = false): string {
  return iconOnly ? ICON_ONLY_ICON_CLASS[size] : ICON_CLASS[size];
}

// Compact row trigger ("خيارات" / "إجراءات"); aria-expanded (set by the menu owner) paints the open state.
export const TABLE_ACTION_TRIGGER = `${buttonClass({ variant: 'secondary', size: 'xs' })} aria-expanded:bg-brand-soft aria-expanded:text-brand aria-expanded:border-brand/40 dark:aria-expanded:bg-brand-dark-soft dark:aria-expanded:text-brand-bright dark:aria-expanded:border-brand-bright/40`;

/** Square h-7 icon button for table rows (edit / view / delete). */
export function tableActionIconClass(ariaLabel: string, danger = false): string {
  return buttonClass({ variant: danger ? 'dangerSubtle' : 'subtle', size: 'xs', iconOnly: true, ariaLabel });
}

// Floating "خيارات / إجراءات" dropdown: panel, rows, icon tiles and divider.
export const MENU_PANEL =
  'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-xl overflow-hidden p-1.5 flex flex-col gap-0.5 text-right select-none animate-fade-in';

const MENU_ITEM_BASE =
  'group w-full min-h-9 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-bold text-right focus-visible:!ring-2 focus-visible:!ring-inset focus-visible:!ring-brand dark:focus-visible:!ring-brand-bright disabled:opacity-50 disabled:cursor-not-allowed';

export const MENU_ITEM = `${MENU_ITEM_BASE} text-ink dark:text-ink-dark [&:not(:disabled)]:hover:bg-brand-soft [&:not(:disabled)]:hover:text-brand dark:[&:not(:disabled)]:hover:bg-brand-dark-soft dark:[&:not(:disabled)]:hover:text-brand-bright`;

export const MENU_ITEM_DANGER = `${MENU_ITEM_BASE} text-danger dark:text-danger-bright [&:not(:disabled)]:hover:bg-danger-soft dark:[&:not(:disabled)]:hover:bg-danger-dark-soft`;

// Icon tile at the start of a row; fills on row hover.
export const MENU_ITEM_ICON =
  'w-6 h-6 rounded-md shrink-0 flex items-center justify-center bg-brand-soft text-brand dark:bg-brand-dark-soft dark:text-brand-bright group-hover:bg-brand group-hover:text-white dark:group-hover:bg-brand-bright dark:group-hover:text-surface-dark';

export const MENU_ITEM_ICON_DANGER =
  'w-6 h-6 rounded-md shrink-0 flex items-center justify-center bg-danger-soft text-danger dark:bg-danger-dark-soft dark:text-danger-bright group-hover:bg-danger group-hover:text-white dark:group-hover:bg-danger-bright dark:group-hover:text-surface-dark';

export const MENU_DIVIDER = 'my-0.5 border-t border-line dark:border-line-dark';
