// PosView mirrors its cart under this key on every change and removes it when the cart is empty,
// so a stored draft with items means a sale is still in progress on this PC.
export const POS_CART_DRAFT_KEY = 'rafiq_pos_cart_draft';

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
