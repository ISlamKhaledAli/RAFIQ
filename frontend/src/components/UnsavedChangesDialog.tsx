import { useEffect, useRef, type KeyboardEvent } from 'react';
import { AlertTriangle, Pencil, RotateCcw, Save } from 'lucide-react';
import { unsavedChangesMessage } from '../utils/unsavedChangesGuard';

export interface UnsavedChangesDialogProps {
  /** Names of the pages/forms that hold unsaved changes */
  labels: string[];
  /** false when at least one dirty form has no save action: only discard or stay are offered */
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}

const FOCUSABLE = 'button:not([disabled])';

const baseButton =
  'h-10 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface dark:focus:ring-offset-surface-dark';

const SAVE_BUTTON = `${baseButton} bg-brand dark:bg-paid-bright hover:bg-brand-dark dark:hover:bg-paid-bright-hover disabled:bg-surface-2 dark:disabled:bg-surface-dark-3 disabled:text-ink-muted dark:disabled:text-ink-muted-dark text-white dark:text-surface-dark focus:ring-brand dark:focus:ring-brand-bright`;
const DISCARD_BUTTON = `${baseButton} bg-danger-soft dark:bg-danger-dark-soft hover:bg-danger/10 dark:hover:bg-danger-dark-soft/70 disabled:opacity-60 border border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright focus:ring-danger dark:focus:ring-danger-bright`;
const STAY_BUTTON = `${baseButton} bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 disabled:opacity-60 border border-line dark:border-line-dark text-ink dark:text-ink-dark focus:ring-brand dark:focus:ring-brand-bright`;

/** Asks what to do with unsaved changes. Opens focused on "stay", so Enter never throws work away by accident. */
export const UnsavedChangesDialog = ({ labels, canSave, saving, onSave, onDiscard, onStay }: UnsavedChangesDialogProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stayRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!saving) onStay();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 dark:bg-black/75 animate-in fade-in duration-150 select-none"
      dir="rtl"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) onStay();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-message"
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl bg-surface dark:bg-surface-dark rounded-2xl shadow-xl border border-line dark:border-line-dark overflow-hidden flex flex-col transform-gpu will-change-[transform,opacity] animate-in zoom-in-95 duration-150"
      >
        <div className="h-1.5 w-full bg-warn dark:bg-warn-bright" />
        <div className="px-5 py-4 flex items-center gap-3 border-b border-line dark:border-line-dark">
          <div className="w-9 h-9 rounded-xl border border-warn/30 dark:border-warn-bright/30 bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 id="unsaved-changes-title" className="t-card-title text-ink dark:text-ink-dark m-0">
            تغييرات غير محفوظة
          </h3>
        </div>

        <p id="unsaved-changes-message" className="m-0 px-5 py-5 text-sm font-semibold leading-relaxed text-ink dark:text-ink-dark bg-surface-2 dark:bg-surface-dark-2">
          {unsavedChangesMessage(labels)}
        </p>

        <div className="px-5 py-4 flex flex-wrap items-center justify-end gap-2.5 border-t border-line dark:border-line-dark">
          {canSave && (
            <button type="button" onClick={onSave} disabled={saving} className={SAVE_BUTTON}>
              <Save className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : 'حفظ ثم المتابعة'}</span>
            </button>
          )}
          <button type="button" onClick={onDiscard} disabled={saving} className={DISCARD_BUTTON}>
            <RotateCcw className="w-4 h-4" />
            <span>تجاهل التغييرات والمتابعة</span>
          </button>
          <button ref={stayRef} type="button" onClick={onStay} disabled={saving} className={STAY_BUTTON}>
            <Pencil className="w-4 h-4" />
            <span>البقاء في الصفحة</span>
          </button>
        </div>
      </div>
    </div>
  );
};
