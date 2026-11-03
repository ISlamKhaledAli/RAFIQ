import type { Sale } from '../../types/models.ts';
import type { CartItem } from './types.ts';
import { assertNoPendingFinancialAttempt } from '../../utils/financialAttempt.ts';

export const CHECKOUT_ATTEMPT_STORAGE_KEY = 'rafiq_pos_pending_checkout_v1';

export interface CheckoutPayload extends Partial<Sale>, Record<string, unknown> {
  idempotencyKey: string;
  items: CartItem[];
  subtotalPiasters: number;
  discountPiasters: number;
  taxPiasters: number;
  totalPiasters: number;
  paidPiasters: number;
  paymentMethod: string;
  status: string;
}

export interface CheckoutAttempt {
  schemaVersion: 1;
  actorId: string;
  createdAt: string;
  payload: CheckoutPayload;
}

export interface SavedCheckout extends Sale {
  id: string;
  idempotencyKey: string;
}

type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const secretFields = new Set(['pin', 'supervisorpin', 'password', 'token', 'secret', 'apikey', 'recoverycode']);
const moneyFields = ['subtotalPiasters', 'discountPiasters', 'taxPiasters', 'totalPiasters', 'paidPiasters'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCartLine(value: unknown): value is CartItem {
  if (!isRecord(value) || typeof value.productId !== 'string' || !value.productId ||
      typeof value.productName !== 'string' || !value.productName ||
      !isMoney(value.quantityMilli) || value.quantityMilli === 0) return false;
  if (!['unitPricePiasters', 'unitCostPiasters', 'discountPiasters', 'totalPiasters', 'taxPiasters']
    .every((field) => isMoney(value[field]))) return false;
  if (value.conversionFactor !== undefined &&
      (typeof value.conversionFactor !== 'number' || !Number.isFinite(value.conversionFactor) || value.conversionFactor <= 0)) return false;
  if (value.productUnits !== undefined && !Array.isArray(value.productUnits)) return false;
  if (value.modifiers !== undefined && !Array.isArray(value.modifiers)) return false;
  return true;
}

function isCheckoutPayload(value: unknown): value is CheckoutPayload {
  return isRecord(value) &&
    typeof value.idempotencyKey === 'string' && value.idempotencyKey.trim().length > 0 &&
    Array.isArray(value.items) && value.items.length > 0 && value.items.every(isCartLine) &&
    moneyFields.every((field) => isMoney(value[field])) &&
    typeof value.paymentMethod === 'string' && value.paymentMethod.length > 0 &&
    typeof value.status === 'string' && value.status.length > 0 &&
    ['customerId', 'shiftId', 'tableId', 'tableName', 'waiterName', 'notes']
      .every((field) => value[field] == null || typeof value[field] === 'string') &&
    ['changePiasters', 'serviceChargePiasters', 'deliveryFeePiasters']
      .every((field) => value[field] === undefined || isMoney(value[field])) &&
    (value.payments === undefined || (Array.isArray(value.payments) && value.payments.every((payment) =>
      isRecord(payment) && isMoney(payment.amountPiasters) &&
      typeof payment.method === 'string' && ['cash', 'credit', 'card', 'instapay', 'vodafone_cash'].includes(payment.method)))) &&
    (value.insuranceClaim == null || (isRecord(value.insuranceClaim) &&
      ['id', 'saleId', 'contractId', 'companyId', 'memberNo', 'patientName', 'status']
        .every((field) => typeof value.insuranceClaim === 'object' && value.insuranceClaim !== null &&
          field in value.insuranceClaim && typeof Reflect.get(value.insuranceClaim, field) === 'string') &&
      ['totalInvoicePiasters', 'coveredPiasters', 'patientPiasters', 'companyPiasters']
        .every((field) => isRecord(value.insuranceClaim) && isMoney(value.insuranceClaim[field])))) &&
    (value.deliveryInfo == null || (isRecord(value.deliveryInfo) &&
      ['customerName', 'customerPhone', 'deliveryAddress']
        .every((field) => isRecord(value.deliveryInfo) && typeof value.deliveryInfo[field] === 'string') &&
      isMoney(value.deliveryInfo.deliveryFeePiasters)));
}

function freezeTree(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freezeTree(child);
  Object.freeze(value);
}

export function captureCheckoutAttempt(payload: Record<string, unknown>, actorId: string): CheckoutAttempt {
  if (!actorId.trim()) throw new Error('هوية الكاشير مطلوبة قبل محاولة حفظ الفاتورة.');
  const copy: unknown = JSON.parse(JSON.stringify(payload, (key, value: unknown) =>
    secretFields.has(key.toLowerCase()) ? undefined : value));
  if (!isCheckoutPayload(copy)) {
    throw new Error('بيانات محاولة الحفظ غير صالحة أو تتجاوز حدود الحساب الآمن؛ لم يتم إرسال الفاتورة.');
  }
  const attempt: CheckoutAttempt = {
    schemaVersion: 1,
    actorId,
    createdAt: new Date().toISOString(),
    payload: copy,
  };
  freezeTree(attempt);
  return attempt;
}

export function readCheckoutAttempt(storage: AttemptStorage): CheckoutAttempt | null {
  const raw = storage.getItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.schemaVersion !== 1 ||
      typeof value.actorId !== 'string' || !value.actorId.trim() ||
      typeof value.createdAt !== 'string' || !value.createdAt.endsWith('Z') || !Number.isFinite(Date.parse(value.createdAt)) ||
      !isCheckoutPayload(value.payload)) {
    throw new Error('سجل محاولة حفظ الفاتورة غير صالح. لم يتم حذفه؛ راجع المبيعات مع المسؤول قبل أي بيع جديد.');
  }
  const attempt: CheckoutAttempt = {
    schemaVersion: 1, actorId: value.actorId, createdAt: value.createdAt, payload: value.payload,
  };
  freezeTree(attempt);
  return attempt;
}

export function saveCheckoutAttempt(storage: AttemptStorage, attempt: CheckoutAttempt): void {
  assertNoPendingFinancialAttempt(storage);
  const existing = readCheckoutAttempt(storage);
  if (existing && (existing.payload.idempotencyKey !== attempt.payload.idempotencyKey ||
      existing.actorId !== attempt.actorId || JSON.stringify(existing.payload) !== JSON.stringify(attempt.payload))) {
    throw new Error('توجد محاولة حفظ سابقة لم تُحسم؛ لا يمكن استبدالها بفاتورة أو بيانات مختلفة.');
  }
  storage.setItem(CHECKOUT_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
}

export function clearCheckoutAttempt(storage: AttemptStorage, expectedKey: string): void {
  const existing = readCheckoutAttempt(storage);
  if (existing && existing.payload.idempotencyKey !== expectedKey) {
    throw new Error('سجل محاولة الحفظ يخص عملية أخرى؛ لم يتم حذفه.');
  }
  storage.removeItem(CHECKOUT_ATTEMPT_STORAGE_KEY);
}

export function editableCheckoutCart(attempt: CheckoutAttempt): CartItem[] {
  const items: unknown = JSON.parse(JSON.stringify(attempt.payload.items));
  if (!Array.isArray(items) || !items.every(isCartLine)) {
    throw new Error('تعذر استعادة أصناف محاولة الحفظ؛ السجل الأصلي لم يتم حذفه.');
  }
  return items;
}

export function readSavedCheckout(value: unknown, expectedKey: string): SavedCheckout {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id ||
      value.idempotencyKey !== expectedKey ||
      !Array.isArray(value.items) || value.items.length === 0 || !value.items.every(isCartLine) ||
      !moneyFields.every((field) => isMoney(value[field])) ||
      typeof value.paymentMethod !== 'string' || typeof value.status !== 'string') {
    throw new Error('لم ترجع فاتورة محفوظة تطابق محاولة الحفظ الأصلية؛ لم تُفرغ السلة.');
  }
  return {
    ...value,
    id: value.id,
    idempotencyKey: expectedKey,
    items: value.items,
    subtotalPiasters: Number(value.subtotalPiasters),
    discountPiasters: Number(value.discountPiasters),
    taxPiasters: Number(value.taxPiasters),
    totalPiasters: Number(value.totalPiasters),
    paidPiasters: Number(value.paidPiasters),
    paymentMethod: value.paymentMethod,
    status: value.status,
  };
}

export function readAbandonCheckout(value: unknown, expectedKey: string): { abandoned: boolean; sale: SavedCheckout | null } {
  if (!isRecord(value) || typeof value.abandoned !== 'boolean') {
    throw new Error('لم يصل تأكيد إيقاف محاولة الحفظ؛ السلة ما زالت محمية.');
  }
  if (value.abandoned && value.sale == null) return { abandoned: true, sale: null };
  if (!value.abandoned) return { abandoned: false, sale: readSavedCheckout(value.sale, expectedKey) };
  throw new Error('استجابة حسم محاولة الحفظ غير متسقة؛ السلة ما زالت محمية.');
}
