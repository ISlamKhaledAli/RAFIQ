import { useState, useEffect } from 'react';

/**
 * Custom hook to handle fluid opening AND closing exit animations in React
 * Keeps the component mounted in the DOM while the exit animation plays.
 */
export function useModalAnimation(isOpen: boolean, durationMs = 300) {
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // Double rAF ensures the initial un-animated state is painted before animating in
      const frame1 = requestAnimationFrame(() => {
        const frame2 = requestAnimationFrame(() => {
          setVisible(true);
        });
        return () => cancelAnimationFrame(frame2);
      });
      return () => cancelAnimationFrame(frame1);
    } else {
      setVisible(false);
      const timer = setTimeout(() => {
        setMounted(false);
      }, durationMs);
      return () => clearTimeout(timer);
    }
  }, [isOpen, durationMs]);

  return { mounted, visible };
}
