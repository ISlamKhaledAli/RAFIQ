import type { KeyboardEvent, ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import {
  CLICKABLE_CHEVRON_CLASS,
  CLICKABLE_HINT_CLASS,
  clickableClass,
  type ClickableTone,
  type ClickableVariant,
} from '../utils/clickableStyles';

interface ClickableCardProps {
  /** Undefined = the user cannot (or need not) act on it: the card renders plain, with no affordance at all. */
  onClick?: () => void;
  tone?: ClickableTone;
  variant?: ClickableVariant;
  className?: string;
  title?: string;
  /** Only when the visible text does not describe the action. */
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * A card, banner or list row that opens something. Keeps the caller's own surface classes (bg, border, padding, size)
 * and only adds the shared affordance: pointer, hover border/shadow, focus ring, role="button" and Enter/Space support.
 */
export function ClickableCard({
  onClick,
  tone = 'paid',
  variant = 'card',
  className = '',
  title,
  ariaLabel,
  children,
}: ClickableCardProps) {
  if (!onClick) {
    return (
      <div className={className} title={title}>
        {children}
      </div>
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={`${className} ${clickableClass(variant, tone)}`}
    >
      {children}
    </div>
  );
}

export function ClickableChevron({ className = 'w-4 h-4' }: { className?: string }) {
  return <ChevronLeft aria-hidden="true" className={`${className} ${CLICKABLE_CHEVRON_CLASS}`} />;
}

export function ClickableHint({ label }: { label: string }) {
  return (
    <span className={CLICKABLE_HINT_CLASS}>
      {label}
      <ChevronLeft aria-hidden="true" className="w-3.5 h-3.5" />
    </span>
  );
}
