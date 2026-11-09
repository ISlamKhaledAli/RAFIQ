import { useEffect, useState } from 'react';
import { isFormDirty } from '../../utils/dirtyForm.ts';

export interface DirtyTracker<T extends object> {
  /** Called after every render with the current form values; `openKey` is null while the form is closed. */
  sync: (openKey: string | null, values: T) => void;
  /** The user did something that can change a value (typing, a button, a choice in a list). */
  touch: () => void;
  isDirty: () => boolean;
}

/**
 * Dirty = the values differ from what the form showed before the user first touched it.
 * Until the first touch every change (units loaded from the database, pharmacy data, batch data, store defaults)
 * is part of the opening state, so the baseline follows it; after the first touch the baseline is frozen.
 * A new `openKey` (another product, or reopening) starts over.
 */
export function createDirtyTracker<T extends object>(): DirtyTracker<T> {
  let key: string | null = null;
  let baseline: T | null = null;
  let latest: T | null = null;
  let touched = false;

  return {
    sync(openKey, values) {
      if (openKey !== key) {
        key = openKey;
        baseline = null;
        touched = false;
      }
      latest = values;
      if (openKey !== null && (!touched || baseline === null)) baseline = values;
    },
    touch() {
      touched = true;
    },
    isDirty() {
      return touched && baseline !== null && latest !== null && isFormDirty(baseline, latest);
    },
  };
}

export function useDirtyTracker<T extends object>(openKey: string | null, values: T): DirtyTracker<T> {
  const [tracker] = useState(() => createDirtyTracker<T>());
  useEffect(() => {
    tracker.sync(openKey, values);
  });
  return tracker;
}
