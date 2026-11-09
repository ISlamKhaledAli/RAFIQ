// App-wide text size preference: scales the root font-size (rem-based Tailwind tokens follow it).
// Pure helpers: storage and root element are injected so the module has no DOM/global dependency at load time.

export const TEXT_SCALE_STORAGE_KEY = 'rafiq_text_scale';
export const TEXT_SCALE_CSS_VAR = '--rafiq-text-scale';
export const DEFAULT_TEXT_SCALE = 1;

export interface TextScaleLevel {
  value: number;
  label: string;
}

// 0.9 / 1 / 1.1 are stored values from earlier versions: they must keep parsing to themselves.
export const TEXT_SCALE_LEVELS: readonly TextScaleLevel[] = [
  { value: 0.9, label: 'صغير' },
  { value: 1, label: 'عادي' },
  { value: 1.1, label: 'كبير' },
  { value: 1.2, label: 'كبير جداً' },
];

// Narrow shop screens (1024x768) cannot hold the POS panes at 1.2, so below this width the applied scale stops at 1.1.
export const TEXT_SCALE_CLAMP_BELOW_WIDTH = 1200;
export const TEXT_SCALE_CLAMPED_MAX = 1.1;

/** Returns the matching level value, or the default for null/garbage/out-of-range input. */
export function parseTextScale(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAULT_TEXT_SCALE;
  const n = Number(raw);
  const level = TEXT_SCALE_LEVELS.find((l) => l.value === n);
  return level ? level.value : DEFAULT_TEXT_SCALE;
}

export interface ScaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ScaleRoot {
  style: { setProperty(name: string, value: string): void };
}

export function loadTextScale(storage: Pick<ScaleStorage, 'getItem'>): number {
  try {
    return parseTextScale(storage.getItem(TEXT_SCALE_STORAGE_KEY));
  } catch {
    // Storage can be blocked (privacy mode); fall back to the default size.
    return DEFAULT_TEXT_SCALE;
  }
}

/** The scale actually applied for a viewport: the selected level, capped at 1.1 on screens narrower than 1200px. */
export function effectiveTextScale(scale: number, viewportWidth: number): number {
  const safe = parseTextScale(String(scale));
  return viewportWidth < TEXT_SCALE_CLAMP_BELOW_WIDTH && safe > TEXT_SCALE_CLAMPED_MAX ? TEXT_SCALE_CLAMPED_MAX : safe;
}

export function isTextScaleClamped(scale: number, viewportWidth: number): boolean {
  return effectiveTextScale(scale, viewportWidth) !== parseTextScale(String(scale));
}

/** Sets the root scale (clamped when a viewport width is given). Returns the validated selected level, not the clamped one. */
export function applyTextScale(root: ScaleRoot, scale: number, viewportWidth?: number): number {
  const safe = parseTextScale(String(scale));
  const applied = viewportWidth === undefined ? safe : effectiveTextScale(safe, viewportWidth);
  root.style.setProperty(TEXT_SCALE_CSS_VAR, String(applied));
  return safe;
}

/** Validates, applies to the root and persists the selected level. Returns the selected level. */
export function setTextScale(root: ScaleRoot, storage: ScaleStorage, scale: number, viewportWidth?: number): number {
  const safe = applyTextScale(root, scale, viewportWidth);
  try {
    storage.setItem(TEXT_SCALE_STORAGE_KEY, String(safe));
  } catch {
    // Persisting is best effort; the size still applies for this session.
  }
  return safe;
}

export interface ScaleWindow {
  innerWidth: number;
  addEventListener(type: 'resize', listener: () => void): void;
  removeEventListener(type: 'resize', listener: () => void): void;
}

/** Applies the stored selection for the current width now and again on every resize. Returns a function that stops watching. */
export function watchTextScaleViewport(win: ScaleWindow, root: ScaleRoot, storage: Pick<ScaleStorage, 'getItem'>): () => void {
  const sync = () => {
    applyTextScale(root, loadTextScale(storage), win.innerWidth);
  };
  sync();
  win.addEventListener('resize', sync);
  return () => win.removeEventListener('resize', sync);
}

/** Pixels of a rem length at the current text size, for positioning math that must match rem-sized panels. */
export function remToPx(rem: number): number {
  return rem * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
}
