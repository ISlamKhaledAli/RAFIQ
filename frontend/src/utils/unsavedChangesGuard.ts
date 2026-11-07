/** One page (or one form of a page) that may hold changes the user has not saved yet. */
export interface GuardEntry {
  id: string;
  /** Page or form name shown in the confirmation message */
  label: string;
  dirty: boolean;
  /** false while a keep-alive page is hidden: its leftovers must not block moves made from other pages */
  active: boolean;
  /** true when the draft survives a move between sub-tabs of the same page (the page keeps its state) */
  keepsStateWithinPage: boolean;
  /** Saves the draft; resolves false (and shows its own error) when the save failed */
  save?: () => Promise<boolean>;
  /** Resets the draft to the saved values once the user chose to leave without saving */
  discard?: () => void;
  /** Called when the user chose to stay: the page points him to its save button */
  onAttention?: () => void;
}

export interface LeaveOptions {
  /** true for a move inside the page that is currently open (sub-tab change), false for leaving the page */
  withinPage?: boolean;
}

export type LeaveDecision = { kind: 'proceed' } | { kind: 'confirm'; entries: GuardEntry[] };

/** Entries whose unsaved changes would really be lost by this move. */
export function blockingEntries(entries: readonly GuardEntry[], options: LeaveOptions = {}): GuardEntry[] {
  return entries.filter((entry) => entry.dirty && entry.active && !(options.withinPage && entry.keepsStateWithinPage));
}

export function decideLeave(entries: readonly GuardEntry[], options: LeaveOptions = {}): LeaveDecision {
  const blocking = blockingEntries(entries, options);
  return blocking.length === 0 ? { kind: 'proceed' } : { kind: 'confirm', entries: blocking };
}

/** The dialog offers "save then continue" only when every dirty form can really be saved. */
export function canSaveAll(entries: readonly GuardEntry[]): boolean {
  return entries.length > 0 && entries.every((entry) => typeof entry.save === 'function');
}

/** Distinct names of the dirty forms, in registration order. */
export function describeEntries(entries: readonly GuardEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.label))];
}

export function unsavedChangesMessage(labels: readonly string[]): string {
  if (labels.length === 1) return `في «${labels[0]}» تغييرات لم تُحفظ بعد. لو غادرت الصفحة الآن ستضيع.`;
  return `في هذه الشاشات تغييرات لم تُحفظ بعد: ${labels.join('، ')}. لو غادرت الصفحة الآن ستضيع.`;
}

/** Saves one form after another and stops at the first failure; a rejected save counts as failed. */
export async function saveAll(entries: readonly GuardEntry[]): Promise<boolean> {
  for (const entry of entries) {
    if (!entry.save) return false;
    try {
      if (!(await entry.save())) return false;
    } catch (error) {
      console.error(`Unsaved-changes guard: saving "${entry.id}" failed`, error);
      return false;
    }
  }
  return true;
}

/** One failing reset must not trap the user on the page, so each is isolated and logged. */
export function discardAll(entries: readonly GuardEntry[]): void {
  for (const entry of entries) {
    try {
      entry.discard?.();
    } catch (error) {
      console.error(`Unsaved-changes guard: discarding "${entry.id}" failed`, error);
    }
  }
}

export function attendAll(entries: readonly GuardEntry[]): void {
  for (const entry of entries) {
    try {
      entry.onAttention?.();
    } catch (error) {
      console.error(`Unsaved-changes guard: attention for "${entry.id}" failed`, error);
    }
  }
}

export interface GuardRegistry {
  upsert: (entry: GuardEntry) => void;
  remove: (id: string) => void;
  /** Live entries in registration order */
  snapshot: () => GuardEntry[];
  subscribe: (listener: () => void) => () => void;
}

export function createGuardRegistry(): GuardRegistry {
  const entries = new Map<string, GuardEntry>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  return {
    upsert(entry) {
      entries.set(entry.id, entry);
      notify();
    },
    remove(id) {
      if (entries.delete(id)) notify();
    },
    snapshot: () => [...entries.values()],
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The open question: which forms hold unsaved changes and what happens after the answer. */
export interface LeaveState {
  entries: GuardEntry[];
  options: LeaveOptions;
  proceed: () => void;
  saving: boolean;
}

export interface LeaveController {
  /** Runs `proceed` now when nothing would be lost, otherwise opens the question. Ignored while one is open. */
  request: (proceed: () => void, options?: LeaveOptions) => void;
  /** "Save then continue": proceeds only when every dirty form saved, otherwise stays and points at the save bar */
  save: () => Promise<void>;
  /** "Discard and continue" */
  discard: () => void;
  /** "Stay on the page" */
  stay: () => void;
  getState: () => LeaveState | null;
  subscribe: (listener: () => void) => () => void;
  /** Starts closing the question by itself once nothing is left to lose; returns the stop function */
  start: () => () => void;
}

export function createLeaveController(registry: GuardRegistry): LeaveController {
  let state: LeaveState | null = null;
  const listeners = new Set<() => void>();
  const setState = (next: LeaveState | null) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  return {
    request(proceed, options = {}) {
      if (state) return;
      const decision = decideLeave(registry.snapshot(), options);
      if (decision.kind === 'proceed') {
        proceed();
        return;
      }
      setState({ entries: decision.entries, options, proceed, saving: false });
    },
    async save() {
      const current = state;
      if (!current || current.saving) return;
      setState({ ...current, saving: true });
      const saved = await saveAll(current.entries);
      setState(null);
      if (saved) current.proceed();
      else attendAll(current.entries);
    },
    discard() {
      const current = state;
      if (!current || current.saving) return;
      setState(null);
      discardAll(current.entries);
      current.proceed();
    },
    stay() {
      const current = state;
      if (!current || current.saving) return;
      setState(null);
      attendAll(current.entries);
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () =>
      registry.subscribe(() => {
        if (state && decideLeave(registry.snapshot(), state.options).kind === 'proceed') setState(null);
      }),
  };
}
