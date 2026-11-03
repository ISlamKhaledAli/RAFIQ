import { newIdempotencyKey } from './idempotency.ts';

export const FINANCIAL_ATTEMPT_STORAGE_KEY = 'rafiq_pos_pending_financial_v1';
export const FINANCIAL_ATTEMPT_CHANGED = 'rafiq-financial-attempt-changed';
const CHECKOUT_STORAGE_KEY = 'rafiq_pos_pending_checkout_v1';
const fields = {
  'wallets:processTransaction': ['accountId', 'txType', 'amountPiasters', 'profitPiasters', 'paymentDestination', 'customerPhone', 'customerName', 'referenceNumber', 'notes'],
  'wallets:fundAccount': ['accountId', 'amountPiasters', 'fundingSource', 'notes'],
  'epay:createTransaction': ['terminalId', 'serviceType', 'serviceName', 'referenceNumber', 'customerPhone', 'customerName', 'billAmountPiasters', 'customerFeePiasters', 'providerCommissionPiasters', 'paymentChannel', 'notes'],
  'epay:fundTerminal': ['terminalId', 'amountPiasters', 'fundingSource', 'notes'],
} as const;
export type FinancialAction = keyof typeof fields;
export type FinancialPayload = Readonly<Record<string, string | number | null>>;
export interface FinancialStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function assertNoPendingFinancialAttempt(storage: Pick<FinancialStorage, 'getItem'>): void {
  if (storage.getItem(FINANCIAL_ATTEMPT_STORAGE_KEY) !== null) {
    throw new Error('توجد محاولة مالية لم تُحسم. افتح شاشة المحافظ أو خدمات الدفع وتحقق منها أو أوقفها بأمان قبل إرسال بيع جديد.');
  }
}
export interface FinancialAttempt {
  readonly schemaVersion: 1;
  readonly actorId: string;
  readonly action: FinancialAction;
  readonly payload: FinancialPayload;
  readonly createdAt: string;
}
export type FinancialSend = (action: string, payload: unknown) => Promise<unknown>;
export interface FinancialResolution {
  status: 'pending' | 'committed' | 'abandoned';
  operation: FinancialAction;
  idempotencyKey: string;
  actorId: string;
  requestFingerprint: string;
  data: unknown;
}
const activeStores = new WeakSet<object>();

function isAction(value: unknown): value is FinancialAction {
  return typeof value === 'string' && Object.hasOwn(fields, value);
}
function actorNamespace(actorId: string) {
  const encoded = encodeURIComponent(actorId).replace(/[!'()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `financial_v1:${encoded}:`;
}
function checkedPayload(action: FinancialAction, value: unknown): FinancialPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('بيانات المحاولة المالية غير صالحة');
  const record = value as Record<string, unknown>;
  const allowed: readonly string[] = fields[action];
  for (const [key, item] of Object.entries(record)) {
    if (key !== 'idempotencyKey' && !allowed.includes(key)) throw new Error('تحتوي المحاولة على حقل غير مسموح بحفظه');
    if (item !== null && typeof item !== 'string' && !(typeof item === 'number' && Number.isSafeInteger(item)))
      throw new Error('المحاولة تحتوي قيمة مالية أو نصية غير صالحة');
    if (key.endsWith('Piasters') && !(typeof item === 'number' && Number.isSafeInteger(item) && item >= 0))
      throw new Error('المبالغ المالية يجب أن تكون أعداداً صحيحة غير سالبة');
  }
  if (typeof record.idempotencyKey !== 'string' || !record.idempotencyKey.trim()) throw new Error('رقم المحاولة الأصلي مفقود');
  const identity = action.startsWith('wallets:') ? record.accountId : record.terminalId;
  const amount = action === 'epay:createTransaction' ? record.billAmountPiasters : record.amountPiasters;
  if (typeof identity !== 'string' || !identity.trim() || typeof amount !== 'number' || amount <= 0)
    throw new Error('الحساب ومبلغ العملية الأصلي مطلوبان');
  return Object.freeze({ ...record }) as FinancialPayload;
}
export function readFinancialAttempt(storage: FinancialStorage): FinancialAttempt | null {
  const raw = storage.getItem(FINANCIAL_ATTEMPT_STORAGE_KEY);
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (!value || value.schemaVersion !== 1 || !isAction(value.action) ||
      typeof value.actorId !== 'string' || !value.actorId.trim() ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
      Object.keys(value).some(key => !['schemaVersion', 'actorId', 'action', 'payload', 'createdAt'].includes(key)))
    throw new Error('سجل المحاولة المعلقة غير صالح؛ لا يمكن بدء عملية أخرى');
  if (typeof value.payload?.idempotencyKey === 'string' && value.payload.idempotencyKey.startsWith('financial_v1:') &&
      !value.payload.idempotencyKey.startsWith(actorNamespace(value.actorId)))
    throw new Error('رقم المحاولة لا يثبت المستخدم الأصلي؛ لا يمكن استبداله');
  return Object.freeze({ ...value, payload: checkedPayload(value.action, value.payload) });
}
function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FINANCIAL_ATTEMPT_CHANGED));
}
function sameAttempt(a: FinancialAttempt, b: FinancialAttempt) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function committedDto(value: unknown, attempt: FinancialAttempt) {
  const dto = value as Record<string, unknown> | null;
  if (!dto || typeof dto.id !== 'string' || !dto.id.trim() ||
      dto.idempotencyKey !== attempt.payload.idempotencyKey ||
      typeof dto.idempotencyFingerprint !== 'string' || !dto.idempotencyFingerprint.trim())
    throw new Error('لم تصل نتيجة مالية مثبتة؛ ستبقى المحاولة الأصلية محفوظة');
  const source = attempt.payload;
  const funding = attempt.action === 'wallets:fundAccount' || attempt.action === 'epay:fundTerminal';
  const normalized = (item: unknown) => typeof item === 'string' ? item.trim().toLowerCase().replace(/^external_cash$/, 'external') : item;
  const identity = attempt.action.startsWith('wallets:') ? 'accountId' : 'terminalId';
  const monetary = attempt.action === 'epay:createTransaction'
    ? ['billAmountPiasters', 'customerFeePiasters', 'providerCommissionPiasters']
    : attempt.action === 'wallets:processTransaction' ? ['amountPiasters', 'profitPiasters'] : ['amountPiasters'];
  const routing = funding ? 'fundingSource' : attempt.action.startsWith('wallets:') ? 'paymentDestination' : 'paymentChannel';
  if (dto[identity] !== source[identity] ||
      monetary.some(key => dto[key] !== (source[key] ?? 0)) ||
      normalized(dto[routing]) !== normalized(source[routing] ?? 'cash_drawer') ||
      (!funding && normalized(dto[attempt.action.startsWith('wallets:') ? 'txType' : 'serviceType']) !==
        normalized(source[attempt.action.startsWith('wallets:') ? 'txType' : 'serviceType'])))
    throw new Error('النتيجة لا تطابق بيانات الطلب المالي الأصلي');
  if (funding && (dto.createdBy !== attempt.actorId ||
      !Number.isSafeInteger(dto.previousBalancePiasters) || !Number.isSafeInteger(dto.newBalancePiasters) ||
      (dto.newBalancePiasters as number) - (dto.previousBalancePiasters as number) !== source.amountPiasters))
    throw new Error('هوية أو أرصدة نتيجة التغذية لا تطابق المحاولة الأصلية');
  return dto;
}
export function createFinancialAttempt(storage: FinancialStorage, actorId: string, action: FinancialAction, send: FinancialSend) {
  function original() {
    const attempt = readFinancialAttempt(storage);
    if (!attempt || attempt.actorId !== actorId || attempt.action !== action)
      throw new Error('يجب استعادة نفس المحاولة بالمستخدم الأصلي؛ لا يمكن استبدالها');
    return attempt;
  }
  function begin(draft: Record<string, unknown>) {
    if (!actorId?.trim() || !isAction(action)) throw new Error('المستخدم الأصلي ونوع العملية مطلوبان');
    if (readFinancialAttempt(storage)) return original();
    if (storage.getItem(CHECKOUT_STORAGE_KEY) !== null) throw new Error('توجد محاولة بيع معلقة؛ يجب حسمها قبل بدء عملية مالية أخرى');
    const clean = Object.fromEntries(Object.entries(draft).filter(([, value]) => value !== undefined));
    const attempt: FinancialAttempt = Object.freeze({
      schemaVersion: 1, actorId, action, createdAt: new Date().toISOString(),
      payload: checkedPayload(action, { ...clean, idempotencyKey: actorNamespace(actorId) + newIdempotencyKey('attempt') }),
    });
    storage.setItem(FINANCIAL_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
    if (!sameAttempt(attempt, original())) throw new Error('تعذر إثبات حفظ المحاولة الأصلية');
    notify();
    return attempt;
  }
  function release(attempt: FinancialAttempt) {
    if (!sameAttempt(attempt, original())) throw new Error('تغير سجل المحاولة؛ لن يتم حذفه');
    storage.removeItem(FINANCIAL_ATTEMPT_STORAGE_KEY);
    if (storage.getItem(FINANCIAL_ATTEMPT_STORAGE_KEY) !== null) throw new Error('تعذر تحرير سجل المحاولة المثبتة');
    notify();
  }
  async function exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (activeStores.has(storage)) throw new Error('توجد عملية مالية قيد التنفيذ');
    activeStores.add(storage);
    try { return await run(); } finally { activeStores.delete(storage); }
  }
  async function resolve(abandon: boolean): Promise<FinancialResolution> {
    return exclusive(async () => {
      const attempt = original();
      const family = action.startsWith('wallets:') ? 'wallets' : 'epay';
      const result = await send(`${family}:${abandon ? 'abandonAttempt' : 'reconcileAttempt'}`, {
        operation: action, actorId, payload: attempt.payload,
      }) as FinancialResolution | null;
      if (!result || result.operation !== action || result.actorId !== actorId ||
          result.idempotencyKey !== attempt.payload.idempotencyKey ||
          typeof result.requestFingerprint !== 'string' || !result.requestFingerprint.trim() ||
          !['pending', 'committed', 'abandoned'].includes(result.status))
        throw new Error('نتيجة الاستعلام غير مثبتة؛ ستبقى المحاولة محفوظة');
      if (result.status === 'committed') {
        const dto = committedDto(result.data, attempt);
        if (dto.idempotencyFingerprint !== result.requestFingerprint) throw new Error('بصمة النتيجة لا تطابق الطلب المثبت');
        release(attempt);
      } else if (result.status === 'abandoned') {
        if (result.data !== null) throw new Error('إقرار الإلغاء غير صالح');
        release(attempt);
      }
      return result;
    });
  }
  return {
    execute: (draft: Record<string, unknown>) => exclusive(async () => {
      const attempt = begin(draft);
      if (!String(attempt.payload.idempotencyKey).startsWith(actorNamespace(actorId)))
        throw new Error('يجب الاستعلام عن المحاولة القديمة؛ لا يمكن إعادة إرسال طلب غير مثبت الملكية');
      const dto = committedDto(await send(action, attempt.payload), attempt);
      release(attempt);
      return dto;
    }),
    reconcile: () => resolve(false),
    abandon: () => resolve(true),
  };
}
