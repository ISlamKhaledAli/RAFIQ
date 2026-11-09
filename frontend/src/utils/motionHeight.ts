// Pure rules of the MotionHeight component (components/MotionHeight.tsx), kept apart so they can be unit tested.

const MIN_DELTA_PX = 2;
const MAX_DURATION_MS = 400;
const DEFAULT_DURATION_MS = 240;
export const END_SLACK_MS = 60;
const JITTER_PX = 40;
const MIN_RETARGET_MS = 60;

/** Only animate a real change (not the first mount, not sub-2px noise) and only when motion is on and the OS allows it. */
export function shouldAnimateHeight(prev: number | null, next: number, motionOn: boolean, reduced: boolean): boolean {
  if (!motionOn || reduced) return false;
  if (prev === null || !(prev > 0) || !(next > 0)) return false;
  return Math.abs(next - prev) >= MIN_DELTA_PX;
}

/** Reads a CSS time ("240ms" / "0.24s") and clamps it to 0..400ms; anything unreadable gives the medium default. */
export function parseMotionDurationMs(raw: string): number {
  const m = /^\s*(\d*\.?\d+)\s*(ms|s)\s*$/.exec(raw);
  if (!m) return DEFAULT_DURATION_MS;
  const ms = m[2] === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
  return Math.min(MAX_DURATION_MS, Math.max(0, ms));
}

/**
 * Length of the glide when the target moves while one is still running. A small shift (a scrollbar appearing makes the
 * text wrap differently) keeps the original end time so the glide does not drag on; a real new change gets the full duration.
 */
export function retargetDurationMs(fullMs: number, remainingMs: number, targetShiftPx: number): number {
  if (!(remainingMs > 0) || Math.abs(targetShiftPx) > JITTER_PX) return fullMs;
  return Math.min(fullMs, Math.max(MIN_RETARGET_MS, remainingMs));
}
