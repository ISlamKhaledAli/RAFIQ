import { useState } from 'react';

export interface MotionPanelAttrs {
  'data-motion-phase': 'a' | 'b';
}

/**
 * Spread on the container whose children swap when `key` changes (tab, sub-view, section):
 * `<div {...useMotionPanel(tab)}>`. The phase flips a/b on every change so the CSS entrance animation
 * restarts without remounting anything. With motion off the attribute matches no rule, so nothing changes.
 */
export function useMotionPanel(key: string): MotionPanelAttrs {
  const [state, setState] = useState<{ key: string; phase: 'a' | 'b' }>({ key, phase: 'a' });
  if (state.key !== key) {
    setState({ key, phase: state.phase === 'a' ? 'b' : 'a' });
  }
  return { 'data-motion-phase': state.phase };
}
