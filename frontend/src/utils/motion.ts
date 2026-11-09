// App-wide animation switch. Root turns it on from the root console (setting `ui_motion_enabled`, off by default).
// It only sets `html[data-motion]`; every animation rule in index.css is scoped under html[data-motion="on"],
// so with the switch off the UI is exactly what it was before. Root also picks the strength (`ui_motion_level`) and the
// look (`ui_motion_style`); they only set html[data-motion-level] / html[data-motion-style], which index.css turns into variables.
// Pure helpers: storage and root are injected.

export const MOTION_SETTING_KEY = 'ui_motion_enabled';
export const MOTION_STORAGE_KEY = 'rafiq_ui_motion';
export const DEFAULT_MOTION_ENABLED = false;

export const MOTION_LEVEL_SETTING_KEY = 'ui_motion_level';
export const MOTION_LEVEL_STORAGE_KEY = 'rafiq_ui_motion_level';
export const MOTION_LEVELS = ['soft', 'medium', 'strong'] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];
export const DEFAULT_MOTION_LEVEL: MotionLevel = 'medium';

export const MOTION_STYLE_SETTING_KEY = 'ui_motion_style';
export const MOTION_STYLE_STORAGE_KEY = 'rafiq_ui_motion_style';
export const MOTION_STYLES = ['slide', 'fade', 'zoom'] as const;
export type MotionStyle = (typeof MOTION_STYLES)[number];
export const DEFAULT_MOTION_STYLE: MotionStyle = 'slide';

export interface MotionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MotionRoot {
  dataset: { motion?: string; motionLevel?: string; motionStyle?: string };
}

/** Unknown, blank or garbage values fall back to the default (medium). */
export function parseMotionLevel(raw: unknown): MotionLevel {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (MOTION_LEVELS as readonly string[]).includes(v) ? (v as MotionLevel) : DEFAULT_MOTION_LEVEL;
}

/** Unknown, blank or garbage values fall back to the default (slide). */
export function parseMotionStyle(raw: unknown): MotionStyle {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (MOTION_STYLES as readonly string[]).includes(v) ? (v as MotionStyle) : DEFAULT_MOTION_STYLE;
}

/** Only an explicit on value enables motion; missing, blank or garbage values stay off. */
export function parseMotionSetting(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw !== 'string') return DEFAULT_MOTION_ENABLED;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on';
}

export function loadCachedMotion(storage: Pick<MotionStorage, 'getItem'>): boolean {
  try {
    return parseMotionSetting(storage.getItem(MOTION_STORAGE_KEY));
  } catch {
    // Storage can be blocked; stay at the default (off).
    return DEFAULT_MOTION_ENABLED;
  }
}

const motionListeners = new Set<() => void>();

/** Lets components that only exist while motion is on (MotionHeight) react when the root flips the switch live. */
export function subscribeMotion(listener: () => void): () => void {
  motionListeners.add(listener);
  return () => {
    motionListeners.delete(listener);
  };
}

export function getMotionSnapshot(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'on';
}

export function applyMotion(root: MotionRoot, enabled: boolean): boolean {
  root.dataset.motion = enabled ? 'on' : 'off';
  motionListeners.forEach((listener) => listener());
  return enabled;
}

/** Applies to the root and caches the value so the next start paints correctly before the host answers. */
export function setMotionEnabled(root: MotionRoot, storage: MotionStorage, enabled: boolean): boolean {
  applyMotion(root, enabled);
  try {
    storage.setItem(MOTION_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Caching is best effort; the value still applies for this session.
  }
  return enabled;
}

export function loadCachedMotionLevel(storage: Pick<MotionStorage, 'getItem'>): MotionLevel {
  try {
    return parseMotionLevel(storage.getItem(MOTION_LEVEL_STORAGE_KEY));
  } catch {
    return DEFAULT_MOTION_LEVEL;
  }
}

export function loadCachedMotionStyle(storage: Pick<MotionStorage, 'getItem'>): MotionStyle {
  try {
    return parseMotionStyle(storage.getItem(MOTION_STYLE_STORAGE_KEY));
  } catch {
    return DEFAULT_MOTION_STYLE;
  }
}

export function applyMotionLevel(root: MotionRoot, level: MotionLevel): MotionLevel {
  root.dataset.motionLevel = level;
  return level;
}

export function applyMotionStyle(root: MotionRoot, style: MotionStyle): MotionStyle {
  root.dataset.motionStyle = style;
  return style;
}

/** Applies the strength and caches it (best effort) for the next first paint. */
export function setMotionLevel(root: MotionRoot, storage: MotionStorage, level: MotionLevel): MotionLevel {
  applyMotionLevel(root, level);
  try {
    storage.setItem(MOTION_LEVEL_STORAGE_KEY, level);
  } catch {
    // Caching is best effort; the value still applies for this session.
  }
  return level;
}

/** Applies the look and caches it (best effort) for the next first paint. */
export function setMotionStyle(root: MotionRoot, storage: MotionStorage, style: MotionStyle): MotionStyle {
  applyMotionStyle(root, style);
  try {
    storage.setItem(MOTION_STYLE_STORAGE_KEY, style);
  } catch {
    // Caching is best effort; the value still applies for this session.
  }
  return style;
}

interface StoreProfileLike {
  uiMotionEnabled?: unknown;
  uiMotionLevel?: unknown;
  uiMotionStyle?: unknown;
}

/** Reads the host value (readable by every user) and applies it. Returns false when the host could not be reached. */
export async function syncMotionFromHost(
  fetchProfile: () => Promise<StoreProfileLike | null | undefined>,
  root: MotionRoot,
  storage: MotionStorage,
): Promise<boolean> {
  try {
    const profile = await fetchProfile();
    if (!profile || typeof profile !== 'object' || !('uiMotionEnabled' in profile)) return false;
    setMotionEnabled(root, storage, parseMotionSetting(profile.uiMotionEnabled));
    // A host older than the level/style settings omits them: keep the cached values then
    if ('uiMotionLevel' in profile) setMotionLevel(root, storage, parseMotionLevel(profile.uiMotionLevel));
    if ('uiMotionStyle' in profile) setMotionStyle(root, storage, parseMotionStyle(profile.uiMotionStyle));
    return true;
  } catch {
    // Host not ready yet: keep the cached value.
    return false;
  }
}

const SYNC_ATTEMPTS = 3;
const SYNC_RETRY_MS = 1500;

/** First paint uses the cached value; the host value then wins (retried a few times while the bridge starts up). */
export async function startMotion(
  fetchProfile: () => Promise<StoreProfileLike | null | undefined>,
  root: MotionRoot,
  storage: MotionStorage,
): Promise<void> {
  applyMotion(root, loadCachedMotion(storage));
  applyMotionLevel(root, loadCachedMotionLevel(storage));
  applyMotionStyle(root, loadCachedMotionStyle(storage));
  for (let attempt = 0; attempt < SYNC_ATTEMPTS; attempt += 1) {
    if (await syncMotionFromHost(fetchProfile, root, storage)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, SYNC_RETRY_MS));
  }
}
