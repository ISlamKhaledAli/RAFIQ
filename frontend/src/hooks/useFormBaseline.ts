import { useState } from 'react';

/**
 * Snapshot of a form's values at the moment it was opened (and again whenever `key` changes, e.g. another record is edited).
 * The values must already be filled in the render that flips `isOpen` to true; `isFormDirty(baseline, current)` is the diff.
 */
export function useFormBaseline<T>(isOpen: boolean, values: T, key: string | number | null = null): T {
  const [state, setState] = useState({ isOpen, key, baseline: values });
  if (state.isOpen !== isOpen || state.key !== key) {
    setState({ isOpen, key, baseline: values });
  }
  return state.baseline;
}
