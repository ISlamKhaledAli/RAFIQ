import { captureCheckoutAttempt, readSavedCheckout, type SavedCheckout } from '../views/pos/checkoutAttempt.ts';
import { BridgeResponseError } from './errors.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class DevelopmentCheckoutStore {
  private readonly rows = new Map<string, { fingerprint: string; sale: SavedCheckout }>();
  private readonly abandoned = new Map<string, string>();
  private invoiceNumber = 1043;

  get nextInvoiceNumber(): number { return this.invoiceNumber; }

  handle(action: string, payload: unknown, actorId: string): SavedCheckout | SavedCheckout[] | null | { abandoned: boolean; sale: SavedCheckout | null } {
    if (action === 'sales:getRecent') {
      return [...this.rows.values()].map((row) => row.sale).sort((a, b) => (b.invoiceNumber || 0) - (a.invoiceNumber || 0));
    }
    if (action === 'sales:getById') {
      const id = isRecord(payload) ? payload.id : payload;
      return [...this.rows.values()].find((row) => row.sale.id === id)?.sale || null;
    }
    if (action === 'sales:getByIdempotencyKey') {
      const key = isRecord(payload) ? payload.idempotencyKey : payload;
      return typeof key === 'string' ? this.rows.get(key)?.sale || null : null;
    }
    if (!isRecord(payload)) throw new BridgeResponseError('INVALID_PAYLOAD', 'بيانات محاولة الحفظ التجريبية غير صالحة.');
    const attempt = captureCheckoutAttempt(payload, actorId);
    const key = attempt.payload.idempotencyKey;
    const fingerprint = JSON.stringify({ actorId, payload: attempt.payload });
    const existing = this.rows.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new BridgeResponseError('SALE_IDEMPOTENCY_CONFLICT', 'معرّف محاولة الحفظ يخص بيانات مختلفة؛ لم يتم إنشاء بيع جديد.');
      }
      return action === 'sales:abandonCheckout' ? { abandoned: false, sale: existing.sale } : existing.sale;
    }
    const cancelled = this.abandoned.get(key);
    if (cancelled !== undefined && cancelled !== fingerprint) {
      throw new BridgeResponseError('SALE_IDEMPOTENCY_CONFLICT', 'بيانات المحاولة الموقوفة مختلفة.');
    }
    if (action === 'sales:abandonCheckout') {
      this.abandoned.set(key, fingerprint);
      return { abandoned: true, sale: null };
    }
    if (cancelled !== undefined) {
      throw new BridgeResponseError('SALE_CHECKOUT_ABANDONED', 'تم إيقاف محاولة الحفظ نهائياً؛ لا يمكن إرسالها مرة أخرى.');
    }
    if (action === 'sales:reconcileCheckout') return null;
    if (action !== 'sales:create') throw new Error(`DEV_CHECKOUT_ACTION_UNSUPPORTED: ${action}`);
    const invoiceNumber = this.invoiceNumber++;
    const id = `dev-sale-${invoiceNumber}`;
    const sale = readSavedCheckout({
      ...attempt.payload,
      id,
      invoiceNumber,
      cashierId: actorId,
      cashierName: 'كاشير تجريبي',
      createdAt: new Date().toISOString(),
      items: attempt.payload.items.map((item, index) => ({ ...item, id: `${id}-item-${index}`, saleId: id })),
    }, key);
    this.rows.set(key, { fingerprint, sale });
    return sale;
  }
}
