import type { CartItem } from '../views/pos/types';

// PosView mirrors its cart under this key on every change and removes it when the cart is empty,
// so a stored draft with items means a sale is still in progress on this PC.
export const POS_CART_DRAFT_KEY = 'rafiq_pos_cart_draft';

// The save is debounced so a burst of scans costs one write, not one write per scan.
export const POS_CART_DRAFT_SAVE_DEBOUNCE_MS = 300;

// A draft younger than this is the cart of a reload/crash a moment ago: it is restored silently with a notice.
// An older draft (closed overnight, power cut) is only offered to the cashier, never applied by itself.
export const POS_CART_DRAFT_AUTO_RESTORE_MS = 15 * 60 * 1000;

// The idempotency key is never stored: a restored cart always gets a fresh key, so an old attempt can never be replayed.
export interface PosCartDraft {
  items: CartItem[];
  discountPiasters: number;
  customerId: string | null;
  savedAt: number;
  /** Cashier who owned the cart; another cashier never gets it restored silently. */
  userId?: string | null;
}

export type PosCartDraftRestore =
  | { mode: 'none'; draft: null }
  | { mode: 'auto'; draft: PosCartDraft }
  | { mode: 'prompt'; draft: PosCartDraft };

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isCartItemShape = (value: unknown): value is CartItem => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.productId === 'string'
    && typeof item.productName === 'string'
    && isFiniteNumber(item.quantityMilli)
    && isFiniteNumber(item.unitPricePiasters)
    && isFiniteNumber(item.totalPiasters);
};

// Returns null for anything that is not a complete, well-formed draft with at least one line.
export const parsePosCartDraft = (raw: string | null): PosCartDraft | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const draft = parsed as Record<string, unknown>;
    if (!Array.isArray(draft.items) || draft.items.length === 0) return null;
    if (!draft.items.every(isCartItemShape)) return null;
    return {
      items: draft.items as CartItem[],
      discountPiasters: isFiniteNumber(draft.discountPiasters) && draft.discountPiasters > 0 ? draft.discountPiasters : 0,
      customerId: typeof draft.customerId === 'string' && draft.customerId ? draft.customerId : null,
      savedAt: isFiniteNumber(draft.savedAt) ? draft.savedAt : 0,
      userId: typeof draft.userId === 'string' && draft.userId ? draft.userId : null,
    };
  } catch {
    return null;
  }
};

export const decidePosCartDraftRestore = (draft: PosCartDraft | null, now: number, currentUserId: string | null = null): PosCartDraftRestore => {
  if (!draft) return { mode: 'none', draft: null };
  const age = now - draft.savedAt;
  const sameCashier = Boolean(currentUserId) && draft.userId === currentUserId;
  if (sameCashier && draft.savedAt > 0 && age >= 0 && age <= POS_CART_DRAFT_AUTO_RESTORE_MS) return { mode: 'auto', draft };
  return { mode: 'prompt', draft };
};

export const readPosCartDraftRestore = (currentUserId: string | null = null, now: number = Date.now()): PosCartDraftRestore => {
  try {
    return decidePosCartDraftRestore(parsePosCartDraft(localStorage.getItem(POS_CART_DRAFT_KEY)), now, currentUserId);
  } catch {
    // Storage unavailable: nothing to restore
    return { mode: 'none', draft: null };
  }
};

export const savePosCartDraft = (items: CartItem[], discountPiasters: number, customerId: string | null, userId: string | null = null): void => {
  try {
    if (items.length === 0) {
      localStorage.removeItem(POS_CART_DRAFT_KEY);
      return;
    }
    const draft: PosCartDraft = { items, discountPiasters, customerId, savedAt: Date.now(), userId };
    localStorage.setItem(POS_CART_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // A full or blocked storage must never break selling
  }
};

export const clearPosCartDraft = (): void => {
  try {
    localStorage.removeItem(POS_CART_DRAFT_KEY);
  } catch {
    // ignore
  }
};

export const hasUnpaidPosCart = (): boolean => {
  try {
    const raw = localStorage.getItem(POS_CART_DRAFT_KEY);
    if (!raw) return false;
    const draft: unknown = JSON.parse(raw);
    const items = (draft as { items?: unknown } | null)?.items;
    return Array.isArray(items) && items.length > 0;
  } catch {
    // An unreadable draft cannot be a live cart
    return false;
  }
};
