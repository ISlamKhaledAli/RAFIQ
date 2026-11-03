import type { PrintReceiptRequest, PrintResult } from '../types/printing.ts';

const drawerStates: readonly string[] = ['notRequested', 'blocked', 'submitted', 'failed', 'unknown'];

function isPrintResult(value: unknown): value is PrintResult {
  if (typeof value !== 'object' || value === null) return false;
  return 'success' in value && typeof value.success === 'boolean' &&
    'message' in value && typeof value.message === 'string' &&
    'printerUsed' in value && typeof value.printerUsed === 'string' &&
    'drawerStatus' in value && typeof value.drawerStatus === 'string' &&
    drawerStates.includes(value.drawerStatus) &&
    (!('warningCode' in value) || value.warningCode == null || typeof value.warningCode === 'string') &&
    (!('warningMessage' in value) || value.warningMessage == null || typeof value.warningMessage === 'string');
}

export function readPrintResult(value: unknown): PrintResult {
  if (!isPrintResult(value)) {
    throw new Error('استجابة الطباعة غير صالحة؛ لا يمكن تأكيد إرسال الإيصال.');
  }
  return value;
}

export function receiptPrintRequest(saleId: string | undefined, isCopy = true): PrintReceiptRequest {
  const id = typeof saleId === 'string' ? saleId.trim() : '';
  if (!id) throw new Error('معرّف الفاتورة المحفوظة مطلوب للطباعة.');
  return isCopy ? { saleId: id, isCopy: true, openDrawer: false } : { saleId: id, isCopy: false };
}
