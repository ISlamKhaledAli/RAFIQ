import React, { useEffect, useState, useRef } from 'react';
import { RotateCcw, X, Info } from 'lucide-react';

import { AppButton } from './AppButton';
export interface UndoToastProps {
  message: string;
  durationMs?: number;
  /** The parent already removed the item: the toast stays mounted only to play its exit, so the countdown and Ctrl+Z are off */
  exiting?: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  message,
  durationMs = 6000,
  exiting = false,
  onUndo,
  onDismiss,
}) => {
  const [progress, setProgress] = useState(100);

  // Keep callback references stable across renders to prevent infinite loop / timer resets
  const onDismissRef = useRef(onDismiss);
  const onUndoRef = useRef(onUndo);
  const isFinishedRef = useRef(false);

  useEffect(() => {
    onDismissRef.current = onDismiss;
    onUndoRef.current = onUndo;
  });

  const handleDismiss = () => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    onDismissRef.current();
  };

  const handleUndo = () => {
    if (isFinishedRef.current) return;
    isFinishedRef.current = true;
    onUndoRef.current();
  };

  useEffect(() => {
    if (exiting) return undefined;
    isFinishedRef.current = false;
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingPct = Math.max(0, 100 - (elapsed / durationMs) * 100);
      setProgress(remainingPct);

      if (elapsed >= durationMs) {
        clearInterval(interval);
        if (!isFinishedRef.current) {
          isFinishedRef.current = true;
          onDismissRef.current();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z only: F9 belongs to the cash checkout and must never undo a deletion at the same time
      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        clearInterval(interval);
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
    };
    // Reset countdown when message changes (a new item is removed) or duration changes
  }, [durationMs, message, exiting]);

  return (
    <div
      data-undo-toast="true"
      className="motion-exit-toast-bottom fixed bottom-6 left-6 z-50 max-w-sm w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark shadow-2xl dark:shadow-black/60 rounded-xl overflow-hidden animate-in slide-in-from-bottom-3 duration-200 select-none"
      data-exiting={exiting || undefined}
      inert={exiting || undefined}
    >
      <div className="p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 flex items-center justify-center shrink-0">
            <Info className="w-4 h-4" />
          </div>
          <span className="text-sm font-semibold text-ink dark:text-ink-dark truncate" title={message}>{message}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <AppButton variant="primary" size="sm" icon={RotateCcw} onClick={handleUndo} title="تراجع عن الحذف (Ctrl+Z)">
            تراجع
          </AppButton>

          <AppButton variant="subtle" size="xs" icon={X} onClick={handleDismiss} title="إغلاق التنبيه" aria-label="إغلاق التنبيه" />
        </div>
      </div>

      {/* Progress countdown strip */}
      <div className="h-1 w-full bg-surface-2 dark:bg-surface-dark">
        <div
          className="h-full bg-brand-dark dark:bg-paid-bright transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
