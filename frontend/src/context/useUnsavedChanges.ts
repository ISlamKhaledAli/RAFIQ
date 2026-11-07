import { useContext, useEffect, useRef, type RefObject } from 'react';
import { UnsavedChangesContext, type UnsavedChangesContextType } from './unsavedChangesContextDef';

const PULSE_CLASS = 'unsaved-pulse';
const PULSE_MS = 2600;
const pulseTimers = new WeakMap<HTMLElement, number>();

function useUnsavedChangesContext(): UnsavedChangesContextType {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('Unsaved-changes hooks must be used within an UnsavedChangesProvider');
  }
  return context;
}

/** For the app shell: every user-initiated move away from the open page goes through `requestLeave`. */
export function useLeaveGuard(): Pick<UnsavedChangesContextType, 'requestLeave'> {
  const { requestLeave } = useUnsavedChangesContext();
  return { requestLeave };
}

/** Brings the save bar into view and rings it briefly (the CSS turns the ring into a static outline for reduced motion). */
function drawAttention(bar: HTMLElement | null): void {
  if (!bar) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  bar.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  window.clearTimeout(pulseTimers.get(bar));
  bar.classList.remove(PULSE_CLASS);
  // Reading a layout property restarts the CSS animation when the class is added again
  void bar.offsetWidth;
  bar.classList.add(PULSE_CLASS);
  pulseTimers.set(bar, window.setTimeout(() => bar.classList.remove(PULSE_CLASS), PULSE_MS));
}

export interface UnsavedChangesGuardOptions {
  /** Unique per form, e.g. 'settings-profile' */
  id: string;
  /** Name shown in the dialog, e.g. 'بيانات المحل' */
  label: string;
  /** Real difference from the saved values (not "touched"): typing then reverting is clean */
  isDirty: boolean;
  /** Pass the page's `isActive` for keep-alive pages so a hidden page never blocks other pages. Default true */
  isActive?: boolean;
  /** Set when the draft survives a sub-tab switch inside the same page */
  keepsStateWithinPage?: boolean;
  /** Enables "حفظ ثم المتابعة". Resolve true only when the data was really saved; show the error yourself on false */
  save?: () => Promise<boolean>;
  /** Reset the draft to the saved values (used when the user leaves without saving a page that stays mounted) */
  discard?: () => void;
  /** Extra reaction when the user chose to stay (e.g. switch to the sub-tab that holds the form) */
  onAttention?: () => void;
}

export interface UnsavedChangesGuard {
  /** Put on the element that holds the save button: it is scrolled to and highlighted when the user stays */
  saveBarRef: RefObject<HTMLDivElement | null>;
}

/** Registers a form with the unsaved-changes guard for as long as the calling component is mounted. */
export function useUnsavedChangesGuard({
  id,
  label,
  isDirty,
  isActive = true,
  keepsStateWithinPage = false,
  save,
  discard,
  onAttention,
}: UnsavedChangesGuardOptions): UnsavedChangesGuard {
  const { registry } = useUnsavedChangesContext();
  const saveBarRef = useRef<HTMLDivElement>(null);
  // Handlers are read at call time so the registry always runs the latest closure
  const latest = useRef({ save, discard, onAttention });
  useEffect(() => {
    latest.current = { save, discard, onAttention };
  });
  const hasSave = save !== undefined;
  const hasDiscard = discard !== undefined;

  useEffect(() => {
    registry.upsert({
      id,
      label,
      dirty: isDirty,
      active: isActive,
      keepsStateWithinPage,
      save: hasSave ? () => latest.current.save!() : undefined,
      discard: hasDiscard ? () => latest.current.discard!() : undefined,
      onAttention: () => {
        latest.current.onAttention?.();
        // After the render the handler above may trigger (a sub-tab switch mounts the save bar)
        requestAnimationFrame(() => drawAttention(saveBarRef.current));
      },
    });
  }, [registry, id, label, isDirty, isActive, keepsStateWithinPage, hasSave, hasDiscard]);

  useEffect(() => () => registry.remove(id), [registry, id]);

  return { saveBarRef };
}
