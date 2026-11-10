import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { renderFormattedContent } from '../utils/tooltipUtils';

interface Coords {
  x: number;
  y: number;
  actualPlacement: 'top' | 'bottom';
  arrowOffset: number;
}

/**
 * Strips native `title` from elements and transfers the value to `data-rafiq-tooltip`.
 * This permanently prevents Chromium / Windows from spawning the native black OS tooltip.
 */
function sanitizeTitles(root: Element | Document = document) {
  try {
    const elements = root.querySelectorAll('[title]');
    elements.forEach((el) => {
      const val = el.getAttribute('title');
      if (val && val.trim()) {
        el.setAttribute('data-rafiq-tooltip', val);
        el.removeAttribute('title');
      }
    });
  } catch {
    // Graceful fallback in non-standard DOM environments
  }
}

/**
 * RafiqGlobalTooltip:
 * - App-wide global tooltip manager mounted once in App.tsx.
 * - Intercepts every native `title="..."` attribute across the entire project (over 300+ elements).
 * - Strips `title` so the native OS black box NEVER appears anywhere in the system.
 * - Eliminates double tooltips ("بيظهر مرتين") by targeting the deepest element and neutralizing parent titles.
 * - Seamlessly respects Light Mode and Dark Mode with official Rafiq tokens.
 * - Automatically scales with the system font size (`rem` units).
 * - Honors `prefers-reduced-motion`.
 */
export const RafiqGlobalTooltip: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<string>('');
  const [coords, setCoords] = useState<Coords | null>(null);

  const activeTargetRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const enterTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const warmTimerRef = useRef<number | null>(null);
  const isWarmRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (enterTimerRef.current) {
      window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const hide = useCallback((immediate = false) => {
    clearTimers();
    if (immediate) {
      setIsOpen(false);
      activeTargetRef.current = null;
      setCoords(null);
    } else {
      leaveTimerRef.current = window.setTimeout(() => {
        setIsOpen(false);
        activeTargetRef.current = null;
        setCoords(null);
        // Keep warm state for 350ms so moving across sibling items is snappy and instant
        if (warmTimerRef.current) window.clearTimeout(warmTimerRef.current);
        warmTimerRef.current = window.setTimeout(() => {
          isWarmRef.current = false;
        }, 350);
      }, 70);
    }
  }, [clearTimers]);

  const calculatePosition = useCallback((): Coords | null => {
    if (!activeTargetRef.current || !tooltipRef.current) return null;

    const triggerRect = activeTargetRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    // If trigger element has been detached or hidden
    if (triggerRect.width === 0 && triggerRect.height === 0) return null;

    const VIEWPORT_PADDING = 8;
    const ARROW_SIZE = 6;
    const GAP = 6 + ARROW_SIZE;

    const spaceAbove = triggerRect.top;
    const spaceBelow = window.innerHeight - triggerRect.bottom;

    let actualPlacement: 'top' | 'bottom' = 'top';
    if (spaceAbove < tooltipRect.height + GAP && spaceBelow > spaceAbove) {
      actualPlacement = 'bottom';
    }

    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    let x = triggerCenter - tooltipRect.width / 2;

    const minX = VIEWPORT_PADDING;
    const maxX = window.innerWidth - tooltipRect.width - VIEWPORT_PADDING;
    const clampedX = Math.max(minX, Math.min(x, maxX));

    let arrowOffset = triggerCenter - clampedX;
    const arrowMargin = 12;
    arrowOffset = Math.max(arrowMargin, Math.min(arrowOffset, tooltipRect.width - arrowMargin));

    const y = actualPlacement === 'top'
      ? triggerRect.top - tooltipRect.height - GAP
      : triggerRect.bottom + GAP;

    return { x: clampedX, y, actualPlacement, arrowOffset };
  }, []);

  // Update position on render or window resize/scroll
  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }

    const update = () => {
      const nextCoords = calculatePosition();
      if (nextCoords) setCoords(nextCoords);
    };

    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, [isOpen, calculatePosition, content]);

  // Global MutationObserver to intercept any `title` added dynamically by React or third parties
  useEffect(() => {
    if (typeof document === 'undefined') return;

    // Sanitize existing DOM nodes on mount
    sanitizeTitles(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'title') {
          const el = m.target as HTMLElement;
          const val = el.getAttribute('title');
          if (val && val.trim()) {
            el.setAttribute('data-rafiq-tooltip', val);
            el.removeAttribute('title');
          }
        } else if (m.type === 'childList') {
          m.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              if (el.hasAttribute('title')) {
                const val = el.getAttribute('title');
                if (val && val.trim()) {
                  el.setAttribute('data-rafiq-tooltip', val);
                  el.removeAttribute('title');
                }
              }
              sanitizeTitles(el);
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['title'],
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  // Global pointer event listeners
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handlePointerOver = (e: MouseEvent) => {
      const rawTarget = e.target as HTMLElement | null;
      if (!rawTarget) return;

      // Find nearest element with tooltip info
      const target = rawTarget.closest<HTMLElement>('[data-rafiq-tooltip], [title]');
      if (!target) {
        if (isOpen) hide();
        return;
      }

      // 1. Sanitize target and all ancestors so no native title can ever trigger
      if (target.hasAttribute('title')) {
        const val = target.getAttribute('title');
        if (val && val.trim()) target.setAttribute('data-rafiq-tooltip', val);
        target.removeAttribute('title');
      }
      let ancestor = target.parentElement;
      while (ancestor && ancestor !== document.body) {
        if (ancestor.hasAttribute('title')) {
          const aVal = ancestor.getAttribute('title');
          if (aVal && aVal.trim()) ancestor.setAttribute('data-rafiq-tooltip', aVal);
          ancestor.removeAttribute('title');
        }
        ancestor = ancestor.parentElement;
      }

      // 2. If this element or any parent is explicitly handled by declarative <RafiqTooltip>, back off
      if (target.closest('[data-has-custom-tooltip="true"]')) {
        hide(true);
        return;
      }

      const tooltipText = target.getAttribute('data-rafiq-tooltip');
      if (!tooltipText || !tooltipText.trim()) {
        if (isOpen) hide();
        return;
      }

      // If already focused on this element, do nothing
      if (activeTargetRef.current === target && isOpen) {
        return;
      }

      clearTimers();
      activeTargetRef.current = target;

      const delay = isWarmRef.current ? 0 : 120;
      enterTimerRef.current = window.setTimeout(() => {
        setContent(tooltipText);
        setIsOpen(true);
        isWarmRef.current = true;
      }, delay);
    };

    const handlePointerOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (activeTargetRef.current && related && activeTargetRef.current.contains(related)) {
        return;
      }
      hide();
    };

    const handleDismissImmediate = () => {
      hide(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide(true);
    };

    // Capture phase for fast interception before browser native timers
    document.addEventListener('mouseover', handlePointerOver, { capture: true, passive: true });
    document.addEventListener('mouseout', handlePointerOut, { capture: true, passive: true });
    document.addEventListener('scroll', handleDismissImmediate, { capture: true, passive: true });
    document.addEventListener('pointerdown', handleDismissImmediate, { capture: true, passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mouseover', handlePointerOver, { capture: true });
      document.removeEventListener('mouseout', handlePointerOut, { capture: true });
      document.removeEventListener('scroll', handleDismissImmediate, { capture: true });
      document.removeEventListener('pointerdown', handleDismissImmediate, { capture: true });
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, hide, clearTimers]);

  // Clean timers on unmount
  useEffect(() => {
    return () => {
      clearTimers();
      if (warmTimerRef.current) window.clearTimeout(warmTimerRef.current);
    };
  }, [clearTimers]);

  if (!isOpen || !content) return null;

  const isReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return createPortal(
    <div
      ref={tooltipRef}
      role="tooltip"
      aria-hidden={!isOpen}
      className={`fixed z-[9999] pointer-events-none select-none transition-opacity ${
        isReducedMotion ? 'duration-0' : 'duration-150 ease-out'
      } ${coords ? 'opacity-100' : 'opacity-0'}`}
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
                   backdrop-blur-xs leading-relaxed"
      >
        {renderFormattedContent(content)}

        {/* Arrow pointer */}
        {coords && (
          <div
            className={`absolute w-2.5 h-2.5 rotate-45 border
                       bg-slate-900 border-slate-700/80
                       dark:bg-surface-dark-2 dark:border-line-dark-strong ${
                         coords.actualPlacement === 'top'
                           ? '-bottom-1.5 border-t-0 border-l-0'
                           : '-top-1.5 border-b-0 border-r-0'
                       }`}
            style={{
              left: `${coords.arrowOffset}px`,
              transform: 'translateX(-50%) rotate(45deg)',
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
};
