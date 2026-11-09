import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { getMotionSnapshot, subscribeMotion } from '../utils/motion';
import { END_SLACK_MS, parseMotionDurationMs, retargetDurationMs, shouldAnimateHeight } from '../utils/motionHeight';

function readDurationMs(): number {
  return parseMotionDurationMs(getComputedStyle(document.documentElement).getPropertyValue('--rq-motion-duration'));
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface MotionHeightProps {
  className?: string;
  children: ReactNode;
}

/**
 * Glides the height of a region whose content changes size (tab or mode swap, expanding section, validation message)
 * instead of letting the layout jump: `<MotionHeight className="..."> ...swapped content... </MotionHeight>`.
 * Motion off (or reduced motion): two plain divs, no observer, no inline style.
 * While a glide runs the outer div gets an explicit px height, overflow hidden and flex none (so a flex-1 / min-h-0 /
 * overflow-y-auto className cannot override it); everything is cleared afterwards, so the layout is natural again.
 * Put the className of the content-sized region here, not a fixed-height or grid-stretched one.
 */
export default function MotionHeight({ className, children }: MotionHeightProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const motionOn = useSyncExternalStore(subscribeMotion, getMotionSnapshot);

  useEffect(() => {
    if (!motionOn) return undefined;
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || typeof ResizeObserver === 'undefined') return undefined;

    // offsetHeight, not the bounding rect: the rect is scaled by a running dialog entrance and would start the glide from a wrong height
    let lastHeight = outer.offsetHeight;
    let animating = false;
    let target = 0;
    let endsAt = 0;
    let timer: number | null = null;

    const clearInline = () => {
      outer.style.transition = '';
      outer.style.height = '';
      outer.style.overflow = '';
      outer.style.flex = '';
    };

    const finish = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      outer.removeEventListener('transitionend', onTransitionEnd);
      animating = false;
      clearInline();
      lastHeight = outer.offsetHeight;
    };

    function onTransitionEnd(ev: TransitionEvent) {
      if (ev.target === outer && ev.propertyName === 'height') finish();
    }

    const observer = new ResizeObserver(() => {
      const wasAnimating = animating;
      const from = animating ? outer.offsetHeight : lastHeight;
      if (animating) {
        outer.removeEventListener('transitionend', onTransitionEnd);
        if (timer !== null) {
          window.clearTimeout(timer);
          timer = null;
        }
      }
      clearInline();
      const to = outer.offsetHeight;
      const full = readDurationMs();
      const duration = wasAnimating ? retargetDurationMs(full, endsAt - performance.now(), to - target) : full;
      animating = false;
      lastHeight = to;
      if (document.hidden || duration <= 0 || !shouldAnimateHeight(from, to, true, prefersReducedMotion())) return;

      animating = true;
      target = to;
      endsAt = performance.now() + duration;
      outer.style.flex = 'none';
      outer.style.overflow = 'hidden';
      outer.style.height = from + 'px';
      void outer.offsetHeight;
      outer.style.transition = 'height ' + duration + 'ms ease-out';
      outer.style.height = to + 'px';
      outer.addEventListener('transitionend', onTransitionEnd);
      timer = window.setTimeout(finish, duration + END_SLACK_MS);
    });
    observer.observe(inner);

    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
      outer.removeEventListener('transitionend', onTransitionEnd);
      clearInline();
    };
  }, [motionOn]);

  return (
    <div className={className} ref={outerRef}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
