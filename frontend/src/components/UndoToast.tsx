import React, { useEffect, useState, useRef } from 'react';
import { RotateCcw, X, Info } from 'lucide-react';

export interface UndoToastProps {
  message: string;
  durationMs?: number;
  onUndo: () => void;
  onDismiss: () => void;
}

export const UndoToast: React.FC<UndoToastProps> = ({
  message,
  durationMs = 6000,
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
      // Support F9 or Ctrl+Z to undo
      if (e.key === 'F9' || (e.ctrlKey && e.key.toLowerCase() === 'z')) {
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
  }, [durationMs, message]);

  return (
    <div className="fixed bottom-6 left-6 z-50 max-w-sm w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark shadow-2xl dark:shadow-black/60 rounded-xl overflow-hidden animate-in slide-in-from-bottom-3 duration-200 select-none">
      <div className="p-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 flex items-center justify-center shrink-0">
            <Info className="w-4 h-4" />
          </div>
          <span className="text-[13px] font-semibold text-ink dark:text-ink-dark truncate" title={message}>{message}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            title="تراجع عن الحذف (Ctrl+Z أو F9)"
            className="h-[32px] px-3 bg-brand-dark hover:bg-brand dark:bg-paid dark:hover:bg-paid-hover text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>تراجع</span>
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            title="إغلاق التنبيه"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-white hover:bg-surface-2 dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
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
