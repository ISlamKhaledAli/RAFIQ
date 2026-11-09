// Single source of truth for "this card/row/banner does something when clicked".
// ClickableCard renders these classes; use them directly only when a card cannot be wrapped by the component.
//
// Rules baked into every class string:
// - cursor-pointer, a hover border (+ soft tint on cards) and shadow lift, a pressed shadow, and a keyboard focus ring.
// - Hover motion is colour/shadow only (150ms); nothing moves, so the card rect never changes.
// - Keyboard focus uses focus-visible:!ring (the ! is required: index.css removes box-shadow on [role=button]:focus-visible).
// - A card with no action must NOT use these classes: render it plain (ClickableCard does that when onClick is undefined).

export type ClickableTone = 'brand' | 'paid' | 'warn' | 'danger';
export type ClickableVariant = 'card' | 'banner' | 'row';

const MOTION = 'transition-[background-color,border-color,box-shadow] duration-150';

const FOCUS_RING =
  'focus-visible:!ring-2 focus-visible:!ring-brand dark:focus-visible:!ring-brand-bright focus-visible:!ring-offset-1 focus-visible:!ring-offset-canvas dark:focus-visible:!ring-offset-canvas-dark';

const FOCUS_RING_INSET =
  'focus-visible:!ring-2 focus-visible:!ring-inset focus-visible:!ring-brand dark:focus-visible:!ring-brand-bright';

const TONE_BORDER: Record<ClickableTone, string> = {
  brand: 'hover:border-brand dark:hover:border-brand-bright',
  paid: 'hover:border-paid dark:hover:border-paid-bright',
  warn: 'hover:border-warn dark:hover:border-warn-bright',
  danger: 'hover:border-danger dark:hover:border-danger-bright',
};

const TONE_TINT: Record<ClickableTone, string> = {
  brand: 'hover:bg-brand-soft/30 dark:hover:bg-brand-dark-soft/30',
  paid: 'hover:bg-paid-soft/40 dark:hover:bg-paid-dark-soft/30',
  warn: 'hover:bg-warn-soft/60 dark:hover:bg-warn-dark-soft/30',
  danger: 'hover:bg-danger-soft/60 dark:hover:bg-danger-dark-soft/30',
};

const BASE = 'group cursor-pointer';

export function clickableClass(variant: ClickableVariant = 'card', tone: ClickableTone = 'paid'): string {
  if (variant === 'row') {
    return `${BASE} rounded-lg hover:bg-surface-2 dark:hover:bg-surface-dark-2 active:bg-surface-3 dark:active:bg-surface-dark-3 transition-colors duration-150 ${FOCUS_RING_INSET}`;
  }
  const lift = `hover:shadow-md active:shadow-2xs ${MOTION} ${FOCUS_RING}`;
  if (variant === 'banner') {
    return `${BASE} ${TONE_BORDER[tone]} ${lift}`;
  }
  return `${BASE} ${TONE_BORDER[tone]} ${TONE_TINT[tone]} ${lift}`;
}

// The faint always-visible chevron at the inline end of a clickable card or row (RTL: it points left).
export const CLICKABLE_CHEVRON_CLASS =
  'shrink-0 text-ink-muted/60 dark:text-ink-dark-muted/60 group-hover:text-brand dark:group-hover:text-brand-bright group-focus-visible:text-brand dark:group-focus-visible:text-brand-bright transition-colors duration-150';

// The green "عرض التفاصيل"-style text hint (label + chevron) that sits in the card footer.
export const CLICKABLE_HINT_CLASS =
  'inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 font-bold text-xs text-paid dark:text-paid-bright group-hover:underline group-focus-visible:underline';
