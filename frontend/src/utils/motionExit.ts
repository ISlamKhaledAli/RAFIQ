import { parseMotionDurationMs } from './motionHeight.ts';

/**
 * How long a removed element stays mounted so its exit animation can play (hooks/useExitTransition.ts).
 * Motion off, reduced motion or a hidden tab: 0, i.e. the element unmounts in the same render, exactly like before.
 * With motion on it is the shared --rq-motion-duration (the parser already caps it at 400ms).
 */
export function exitDurationMs(rawDuration: string, motionOn: boolean, reduced: boolean, hidden: boolean): number {
  if (!motionOn || reduced || hidden) return 0;
  return parseMotionDurationMs(rawDuration);
}
