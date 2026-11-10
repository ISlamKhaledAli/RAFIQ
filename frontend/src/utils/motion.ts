// App-wide animation switch. Enabled by default with fade style, and automatically adapts to device hardware tier.
// Root can change or disable it from the developer console (settings `ui_motion_enabled`, `ui_motion_level`, `ui_motion_style`).
// It only sets `html[data-motion]`; every animation rule in index.css is scoped under html[data-motion="on"],
// so with the switch off the UI is exactly what it was before. Root also picks the strength (`ui_motion_level`) and the
// look (`ui_motion_style`); they set html[data-motion-level] / html[data-motion-style], which index.css turns into variables.
// Pure helpers: storage and root are injected.

export const MOTION_SETTING_KEY = 'ui_motion_enabled';
export const MOTION_STORAGE_KEY = 'rafiq_ui_motion';
export const DEFAULT_MOTION_ENABLED = true;

export const MOTION_LEVEL_SETTING_KEY = 'ui_motion_level';
export const MOTION_LEVEL_STORAGE_KEY = 'rafiq_ui_motion_level';
export const MOTION_LEVELS = ['soft', 'medium', 'strong'] as const;
export type MotionLevel = (typeof MOTION_LEVELS)[number];
export const DEFAULT_MOTION_LEVEL: MotionLevel = 'medium';

export const MOTION_STYLE_SETTING_KEY = 'ui_motion_style';
export const MOTION_STYLE_STORAGE_KEY = 'rafiq_ui_motion_style';
export const MOTION_STYLES = ['slide', 'fade', 'zoom'] as const;
export type MotionStyle = (typeof MOTION_STYLES)[number];
export const DEFAULT_MOTION_STYLE: MotionStyle = 'fade';

export interface DeviceHardwareTierInfo {
  tier: 'weak' | 'medium' | 'strong';
  tierArabic: 'ضعيف' | 'متوسط' | 'قوي';
  level: MotionLevel;
  summary: string;
}

/** Detects hardware specs and classifies device tier into weak ('soft'), medium ('medium'), or strong ('strong'). */
export function detectDeviceHardwareTier(): DeviceHardwareTierInfo {
  let memGb: number | undefined;
  let cores: number | undefined;

  if (typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & { deviceMemory?: number };
    memGb = nav.deviceMemory;
    cores = nav.hardwareConcurrency;
  }

  const effectiveCores = typeof cores === 'number' && cores > 0 ? cores : 4;
  const effectiveMemGb = typeof memGb === 'number' && memGb > 0 ? memGb : 4;

  if (effectiveMemGb < 3.5 || (effectiveMemGb <= 4 && effectiveCores <= 2) || effectiveCores <= 1) {
    return {
      tier: 'weak',
      tierArabic: 'ضعيف',
      level: 'soft',
      summary: `ذاكرة تقريبية ${effectiveMemGb}GB • ${effectiveCores} معالجات`,
    };
  }

  if (effectiveMemGb >= 7.5 && effectiveCores >= 4) {
    return {
      tier: 'strong',
      tierArabic: 'قوي',
      level: 'strong',
      summary: `ذاكرة تقريبية ${effectiveMemGb}GB • ${effectiveCores} معالجات`,
    };
  }

  return {
    tier: 'medium',
    tierArabic: 'متوسط',
    level: 'medium',
    summary: `ذاكرة تقريبية ${effectiveMemGb}GB • ${effectiveCores} معالجات`,
  };
}

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

/** Unknown, blank or garbage values fall back to the default (fade). */
export function parseMotionStyle(raw: unknown): MotionStyle {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (MOTION_STYLES as readonly string[]).includes(v) ? (v as MotionStyle) : DEFAULT_MOTION_STYLE;
}

/** Missing, undefined, null or blank values fall back to DEFAULT_MOTION_ENABLED (true). Explicit '0'/'false'/'off' turns it off. */
export function parseMotionSetting(raw: unknown): boolean {
  if (raw === true) return true;
  if (raw === false) return false;
  if (typeof raw !== 'string') return DEFAULT_MOTION_ENABLED;
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'on' || v === 'yes') return true;
  return DEFAULT_MOTION_ENABLED;
}

export function loadCachedMotion(storage: Pick<MotionStorage, 'getItem'>): boolean {
  try {
    const raw = storage.getItem(MOTION_STORAGE_KEY);
    if (raw === null || raw === undefined) return DEFAULT_MOTION_ENABLED;
    return parseMotionSetting(raw);
  } catch {
    // Storage can be blocked; stay at the default (on).
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
    const raw = storage.getItem(MOTION_LEVEL_STORAGE_KEY);
    if (raw === null || raw === undefined) return detectDeviceHardwareTier().level;
    return parseMotionLevel(raw);
  } catch {
    return detectDeviceHardwareTier().level;
  }
}

export function loadCachedMotionStyle(storage: Pick<MotionStorage, 'getItem'>): MotionStyle {
  try {
    const raw = storage.getItem(MOTION_STYLE_STORAGE_KEY);
    if (raw === null || raw === undefined) return DEFAULT_MOTION_STYLE;
    return parseMotionStyle(raw);
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
