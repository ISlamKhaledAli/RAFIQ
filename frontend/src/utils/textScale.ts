// App-wide text size preference: scales the root font-size (rem-based Tailwind tokens follow it).
// Pure helpers: storage and root element are injected so the module has no DOM/global dependency at load time.

export const TEXT_SCALE_STORAGE_KEY = 'rafiq_text_scale';
export const TEXT_SCALE_CSS_VAR = '--rafiq-text-scale';
export const DEFAULT_TEXT_SCALE = 1;

export interface TextScaleLevel {
  value: number;
  label: string;
}

// Capped at 1.1: at 1.2 the POS cart panel (min-w-[360px]) no longer fits at 1024x768.
export const TEXT_SCALE_LEVELS: readonly TextScaleLevel[] = [
  { value: 0.9, label: 'صغير' },
  { value: 1, label: 'عادي' },
  { value: 1.1, label: 'كبير' },
];

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

export function applyTextScale(root: ScaleRoot, scale: number): number {
  const safe = parseTextScale(String(scale));
  root.style.setProperty(TEXT_SCALE_CSS_VAR, String(safe));
  return safe;
}

/** Validates, applies to the root and persists. Returns the scale actually applied. */
export function setTextScale(root: ScaleRoot, storage: ScaleStorage, scale: number): number {
  const safe = applyTextScale(root, scale);
  try {
    storage.setItem(TEXT_SCALE_STORAGE_KEY, String(safe));
  } catch {
    // Persisting is best effort; the size still applies for this session.
  }
  return safe;
}
