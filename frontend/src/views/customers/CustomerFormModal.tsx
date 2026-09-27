import React from 'react';
import { X, AlertTriangle } from 'lucide-react';
import type { Customer } from '../../types/models';
import { MoneyInput } from '../../components/MoneyInput';
import { normalizeArabicNumerals } from '../../utils/money';

export interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingCustomer: Customer | null;
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  isCheckingPhone: boolean;
  duplicateCustomer: Customer | null;
  checkPhoneDuplicate: (phone: string, excludeId?: string) => Promise<void>;
  creditLimitPiasters: number;
  setCreditLimitPiasters: (v: number) => void;
  initialBalancePiasters: number;
  setInitialBalancePiasters: (v: number) => void;
  onSave: (e: React.FormEvent) => void;
  onOpenStatementForDuplicate: (cust: Customer) => void;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  editingCustomer,
  name,
  setName,
  phone,
  setPhone,
  isCheckingPhone,
  duplicateCustomer,
  checkPhoneDuplicate,
  creditLimitPiasters,
  setCreditLimitPiasters,
  initialBalancePiasters,
  setInitialBalancePiasters,
  onSave,
  onOpenStatementForDuplicate,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-xl shadow-2xl border border-line w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="h-12 bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
          <span className="text-sm font-bold text-ink">
            {editingCustomer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد بالدفتر'}
          </span>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSave} className="p-4 space-y-3.5 text-xs flex-1 min-h-0 overflow-y-auto">
          <div>
            <label className="block text-ink font-semibold mb-1">اسم العميل *</label>
            <input 
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: أحمد محمود"
              className="w-full h-8 px-3 bg-canvas border border-line rounded focus:outline-none focus:border-brand text-ink"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-ink font-semibold">رقم الهاتف</label>
              {isCheckingPhone && <span className="text-[10px] text-ink-muted">جاري فحص الرقم...</span>}
            </div>
            <input 
              type="text"
              value={phone}
              onChange={(e) => {
                const val = normalizeArabicNumerals(e.target.value);
                setPhone(val);
                void checkPhoneDuplicate(val, editingCustomer?.id);
              }}
              placeholder="مثال: 01012345678"
              className={`w-full h-8 px-3 bg-canvas border rounded focus:outline-none text-ink font-mono ${
                duplicateCustomer ? 'border-amber-500 bg-amber-50/20' : 'border-line focus:border-brand'
              }`}
            />

            {duplicateCustomer && (
              <div className="mt-1.5 p-2.5 rounded bg-amber-500/10 border border-amber-400/40 text-amber-900 dark:text-amber-200 text-[11px] flex flex-col gap-1.5">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">تنبيه تكرار رقم الهاتف:</span> هذا الرقم مسجل بالفعل باسم{' '}
                    <strong className="underline font-bold">{duplicateCustomer.name}</strong> (الرصيد الحقيقي:{' '}
                    <span className="font-mono font-bold">{(duplicateCustomer.balancePiasters / 100).toFixed(2)} ج.م</span>).
                  </div>
                </div>
                <div className="flex items-center gap-2 mr-5">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenStatementForDuplicate(duplicateCustomer);
                    }}
                    className="text-[11px] text-brand font-bold hover:underline"
                  >
                    عرض كشف حساب العميل المسجل ←
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-ink font-semibold mb-1">الحد الائتماني (أقصى مديونية مسموحة)</label>
            <MoneyInput 
              valuePiasters={creditLimitPiasters}
              onChangePiasters={setCreditLimitPiasters}
            />
          </div>

          {!editingCustomer && (
            <div>
              <label className="block text-ink font-semibold mb-1">الرصيد الافتتاحي (مديونية سابقة إن وجدت)</label>
              <MoneyInput 
                valuePiasters={initialBalancePiasters}
                onChangePiasters={setInitialBalancePiasters}
              />
              <p className="text-[10px] text-ink-muted mt-1">اتركه صفر إذا كان العميل جديداً بدون ديون قديمة.</p>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2 hairline-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-surface border border-line hover:bg-surface-2 text-ink font-medium"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-1.5 rounded bg-brand text-white hover:bg-brand-container font-bold"
            >
              حفظ البيانات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
