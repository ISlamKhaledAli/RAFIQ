import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { renderFormattedContent } from '../utils/tooltipUtils';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface RafiqTooltipProps {
  /** Text or rich JSX content to display inside the tooltip */
  content: ReactNode;
  /** Element(s) that trigger the tooltip on hover/focus */
  children: ReactNode;
  /** Preferred placement of the tooltip (flips automatically if screen boundary reached) */
  placement?: TooltipPlacement;
  /** Hover delay in milliseconds before appearing (prevents flickering on rapid mouse movement) */
  delay?: number;
  /** If true, pointer can enter the tooltip content without it closing immediately */
  interactive?: boolean;
  /** Allows completely disabling the tooltip (e.g., when content is empty or condition not met) */
  disabled?: boolean;
  /** Whether to render an arrow pointing to the target */
  showArrow?: boolean;
  /** Additional custom classes for the tooltip floating card */
  className?: string;
  /** Wrapper class around the trigger */
  wrapperClassName?: string;
  /** Display style for the trigger wrapper. Defaults to 'inline-flex' */
  wrapperDisplay?: 'inline-flex' | 'inline-block' | 'block' | 'contents';
}

interface Coords {
  x: number;
  y: number;
  actualPlacement: TooltipPlacement;
  arrowOffset: number;
}

/**
 * Senior RafiqTooltip:
 * - Rendered in a React Portal (`document.body`) to prevent clipping inside table cells or `overflow: hidden` wrappers.
 * - Auto-detects screen boundaries and flips placement (top <-> bottom, right <-> left) smoothly.
 * - Automatically respects Light and Dark Mode with Rafiq design tokens.
 * - Font scales seamlessly with the app-wide text scale (`rem` units).
 * - Honors `prefers-reduced-motion`.
 * - Zero emojis (strict policy).
 */
export const RafiqTooltip: React.FC<RafiqTooltipProps> = ({
  content,
  children,
  placement = 'top',
  delay = 120,
  interactive = false,
  disabled = false,
  showArrow = true,
  className = '',
  wrapperClassName = '',
  wrapperDisplay = 'inline-flex',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);

  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const enterTimeoutRef = useRef<number | null>(null);
  const leaveTimeoutRef = useRef<number | null>(null);

  const hasValidContent = Boolean(content) && !disabled;

  const calculatePosition = useCallback((): Coords | null => {
    if (!triggerRef.current || !tooltipRef.current) return null;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    const VIEWPORT_PADDING = 8;
    const ARROW_SIZE = showArrow ? 6 : 0;
    const GAP = 6 + ARROW_SIZE;

    const spaceAbove = triggerRect.top;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceLeft = triggerRect.left;
    const spaceRight = window.innerWidth - triggerRect.right;

    let actualPlacement = placement;

    // Smart vertical flipping
    if (placement === 'top') {
      if (spaceAbove < tooltipRect.height + GAP && spaceBelow > spaceAbove) {
        actualPlacement = 'bottom';
      }
    } else if (placement === 'bottom') {
      if (spaceBelow < tooltipRect.height + GAP && spaceAbove > spaceBelow) {
        actualPlacement = 'top';
      }
    } else if (placement === 'left') {
      if (spaceLeft < tooltipRect.width + GAP && spaceRight > spaceLeft) {
        actualPlacement = 'right';
      }
    } else if (placement === 'right') {
      if (spaceRight < tooltipRect.width + GAP && spaceLeft > spaceRight) {
        actualPlacement = 'left';
      }
    }

    let x = 0;
    let y = 0;
    let arrowOffset = 0;

    if (actualPlacement === 'top' || actualPlacement === 'bottom') {
      // Centered horizontally over the trigger
      const triggerCenter = triggerRect.left + triggerRect.width / 2;
      x = triggerCenter - tooltipRect.width / 2;

      // Clamp horizontally within viewport
      const minX = VIEWPORT_PADDING;
      const maxX = window.innerWidth - tooltipRect.width - VIEWPORT_PADDING;
      const clampedX = Math.max(minX, Math.min(x, maxX));

      // Arrow position relative to tooltip box
      arrowOffset = triggerCenter - clampedX;
      // Clamp arrow so it doesn't poke outside rounded corners
      const arrowMargin = 12;
      arrowOffset = Math.max(arrowMargin, Math.min(arrowOffset, tooltipRect.width - arrowMargin));

      x = clampedX;
      y = actualPlacement === 'top'
        ? triggerRect.top - tooltipRect.height - GAP
        : triggerRect.bottom + GAP;
    } else {
      // Horizontal placement (left / right)
      const triggerMiddle = triggerRect.top + triggerRect.height / 2;
      y = triggerMiddle - tooltipRect.height / 2;

      // Clamp vertically within viewport
      const minY = VIEWPORT_PADDING;
      const maxY = window.innerHeight - tooltipRect.height - VIEWPORT_PADDING;
      const clampedY = Math.max(minY, Math.min(y, maxY));

      arrowOffset = triggerMiddle - clampedY;
      const arrowMargin = 12;
      arrowOffset = Math.max(arrowMargin, Math.min(arrowOffset, tooltipRect.height - arrowMargin));

      y = clampedY;
      x = actualPlacement === 'left'
        ? triggerRect.left - tooltipRect.width - GAP
        : triggerRect.right + GAP;
    }

    return { x, y, actualPlacement, arrowOffset };
  }, [placement, showArrow]);

  const show = useCallback(() => {
    if (!hasValidContent) return;
    if (leaveTimeoutRef.current) {
      window.clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    if (delay > 0) {
      enterTimeoutRef.current = window.setTimeout(() => {
        setIsOpen(true);
      }, delay);
    } else {
      setIsOpen(true);
    }
  }, [hasValidContent, delay]);

  const hide = useCallback((immediate = false) => {
    if (enterTimeoutRef.current) {
      window.clearTimeout(enterTimeoutRef.current);
      enterTimeoutRef.current = null;
    }
    if (immediate || !interactive) {
      setIsOpen(false);
    } else {
      leaveTimeoutRef.current = window.setTimeout(() => {
        setIsOpen(false);
      }, 80);
    }
  }, [interactive]);

  // Update position whenever tooltip becomes open or window scrolls/resizes
  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }

    const update = () => {
      const nextCoords = calculatePosition();
      if (nextCoords) setCoords(nextCoords);
    };

    // Calculate once on open
    update();

    // Listen to resize and scroll (capture mode to catch table scrolls)
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('scroll', update, { capture: true, passive: true });

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, { capture: true });
    };
  }, [isOpen, calculatePosition]);

  // Clean timeouts on unmount
  useEffect(() => {
    return () => {
      if (enterTimeoutRef.current) window.clearTimeout(enterTimeoutRef.current);
      if (leaveTimeoutRef.current) window.clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  // Keyboard accessibility: dismiss on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hide]);

  if (!hasValidContent) {
    return <>{children}</>;
  }

  const isReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tooltipPortal = isOpen
    ? createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          aria-hidden={!isOpen}
          onMouseEnter={interactive ? () => show() : undefined}
          onMouseLeave={interactive ? () => hide() : undefined}
          className={`fixed z-[9999] pointer-events-auto select-none transition-opacity ${
            isReducedMotion ? 'duration-0' : 'duration-150 ease-out'
          } ${coords ? 'opacity-100' : 'opacity-0'} ${className}`}
          style={{
            top: coords ? `${coords.y}px` : '-9999px',
            left: coords ? `${coords.x}px` : '-9999px',
          }}
        >
          {/* Tooltip Content Card */}
          <div
            className="relative px-3 py-2 rounded-xl text-xs font-sans text-right max-w-xs shadow-card border
                       bg-slate-900/95 text-white border-slate-700/80
                       dark:bg-surface-dark-2/95 dark:text-ink-dark dark:border-line-dark-strong
                       backdrop-blur-xs"
          >
            {renderFormattedContent(content)}

            {/* Arrow pointer */}
            {showArrow && coords && (
              <div
                className={`absolute w-2.5 h-2.5 rotate-45 border
                           bg-slate-900 border-slate-700/80
                           dark:bg-surface-dark-2 dark:border-line-dark-strong ${
                             coords.actualPlacement === 'top'
                               ? '-bottom-1.5 border-t-0 border-l-0'
                               : coords.actualPlacement === 'bottom'
                               ? '-top-1.5 border-b-0 border-r-0'
                               : coords.actualPlacement === 'left'
                               ? '-right-1.5 border-b-0 border-l-0'
                               : '-left-1.5 border-t-0 border-r-0'
                           }`}
                style={
                  coords.actualPlacement === 'top' || coords.actualPlacement === 'bottom'
                    ? { left: `${coords.arrowOffset}px`, transform: 'translateX(-50%) rotate(45deg)' }
                    : { top: `${coords.arrowOffset}px`, transform: 'translateY(-50%) rotate(45deg)' }
                }
              />
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  const displayClass =
    wrapperDisplay === 'block'
      ? 'block'
      : wrapperDisplay === 'inline-block'
      ? 'inline-block'
      : wrapperDisplay === 'contents'
      ? 'contents'
      : 'inline-flex items-center';

  return (
    <span
      ref={(el) => {
        triggerRef.current = el;
      }}
      data-has-custom-tooltip="true"
      className={`${displayClass} ${wrapperClassName}`}
      onMouseEnter={() => show()}
      onMouseLeave={() => hide()}
      onFocus={() => show()}
      onBlur={() => hide(true)}
    >
      {children}
      {tooltipPortal}
    </span>
  );
};
