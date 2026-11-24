import { useState, useRef, useCallback } from 'react';

interface SwipeDownOptions {
  onClose: () => void;
  threshold?: number;
  enabled?: boolean;
}

/**
 * Mobile-First Native Drag-to-Dismiss Hook
 * Tracks vertical finger dragging on modal drag handles / headers and applies real-time translation physics.
 * Smoothly snaps back if released before threshold, or calls onClose if pulled down beyond threshold.
 */
export function useSwipeDownDismiss({ onClose, threshold = 75, enabled = true }: SwipeDownOptions) {
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isTrackingRef = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled) return;
      const touch = e.touches[0];
      startYRef.current = touch.clientY;
      currentYRef.current = touch.clientY;
      isTrackingRef.current = true;
      setIsDragging(true);
    },
    [enabled]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isTrackingRef.current || !enabled) return;
      const touch = e.touches[0];
      currentYRef.current = touch.clientY;
      const deltaY = currentYRef.current - startYRef.current;

      // Only allow downward dragging (dismissing down)
      if (deltaY > 0) {
        // Apply slight resistance curve after 140px
        const dampened = deltaY > 140 ? 140 + (deltaY - 140) * 0.45 : deltaY;
        setOffsetY(dampened);
      } else {
        setOffsetY(0);
      }
    },
    [enabled]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isTrackingRef.current || !enabled) return;
    isTrackingRef.current = false;
    setIsDragging(false);

    const deltaY = currentYRef.current - startYRef.current;
    if (deltaY >= threshold) {
      // Trigger dismiss
      onClose();
    }
    // Snap back
    setOffsetY(0);
  }, [enabled, threshold, onClose]);

  const dragHandleProps = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchEnd,
  };

  const sheetStyle: React.CSSProperties = {
    transform: offsetY > 0 ? `translate3d(0, ${offsetY}px, 0)` : undefined,
    transition: isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
    touchAction: 'pan-x',
  };

  return {
    dragHandleProps,
    sheetStyle,
    isDragging,
    offsetY,
  };
}
