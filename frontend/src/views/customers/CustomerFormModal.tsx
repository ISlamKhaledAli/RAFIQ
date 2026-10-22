import React from 'react';
import { X, AlertTriangle, Lock } from 'lucide-react';
import type { Customer } from '../../types/models';
import { MoneyInput } from '../../components/MoneyInput';
import { normalizeArabicNumerals } from '../../utils/money';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { useAuth } from '../../context/useAuth';

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
  const { isRoot, isAdmin, hasPermission } = useAuth();
  const canSetCreditLimit = isRoot || isAdmin || hasPermission('customers.credit_limit');
  const canSetOpeningBalance = isRoot || isAdmin || hasPermission('customers.opening_balance');

  const isDirty = Boolean(name.trim() || phone.trim() || initialBalancePiasters !== 0);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل بيانات الزبون؟',
    confirmMessage: 'هناك بيانات زبون غير محفوظة، هل أنت متأكد من الخروج وتجاهل التعديلات؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة التسجيل',
  });

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="h-12 bg-surface-2 dark:bg-surface-dark-2 hairline-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
          <span className="text-sm font-bold text-ink dark:text-ink-dark">
            {editingCustomer ? 'تعديل بيانات الزبون' : 'تسجيل زبون جديد في النوتة'}
          </span>
          <button 
            type="button"
            onClick={() => void requestClose()} 
            className="text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSave} className="p-4 space-y-3.5 text-xs flex-1 min-h-0 overflow-y-auto">
          <div>
            <label className="block text-ink dark:text-ink-dark font-semibold mb-1">اسم الزبون *</label>
            <input 
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: الحاج أحمد محمود"
              className="w-full h-8 px-3 bg-canvas dark:bg-canvas-dark border border-line dark:border-line-dark rounded focus:outline-none focus:border-brand dark:focus:border-brand-bright text-ink dark:text-ink-dark"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-ink dark:text-ink-dark font-semibold">رقم الموبايل</label>
              {isCheckingPhone && <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted">بنتأكد من الرقم...</span>}
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
              className={`w-full h-8 px-3 bg-canvas dark:bg-canvas-dark border rounded focus:outline-none text-ink dark:text-ink-dark font-mono ${
                duplicateCustomer ? 'border-warn bg-warn-soft/20 dark:bg-warn-dark-soft/40' : 'border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright'
              }`}
            />

            {duplicateCustomer && (
              <div className="mt-1.5 p-2.5 rounded bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright text-[11px] flex flex-col gap-1.5">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">تنبيه: الرقم ده متسجل قبل كده!</span> رقم الموبايل ده متسجل للزبون{' '}
                    <strong className="underline font-bold">{duplicateCustomer.name}</strong> (حسابه في المحل:{' '}
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
                    className="text-[11px] text-brand dark:text-brand-bright font-bold hover:underline cursor-pointer"
                  >
                    افتح كشف حساب الزبون ده ←
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-ink dark:text-ink-dark font-semibold">سقف الشكك المسموح (أقصى مبلغ شكك)</label>
              {!canSetCreditLimit && (
                <span className="text-[10px] text-ink-muted dark:text-ink-muted-dark flex items-center gap-1">
                  <Lock className="w-3 h-3" /> يتطلب صلاحية المشرف
                </span>
              )}
            </div>
            {canSetCreditLimit ? (
              <MoneyInput 
                valuePiasters={creditLimitPiasters}
                onChangePiasters={setCreditLimitPiasters}
              />
            ) : (
              <div className="h-8 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded flex items-center text-ink-muted dark:text-ink-muted-dark font-mono text-xs">
                {(creditLimitPiasters / 100).toFixed(2)} ج.م (للقراءة فقط)
              </div>
            )}
          </div>

          {!editingCustomer && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-ink dark:text-ink-dark font-semibold">حساب قديم عليه قبل ما تسجله (إن وجد)</label>
                {!canSetOpeningBalance && (
                  <span className="text-[10px] text-ink-muted dark:text-ink-muted-dark flex items-center gap-1">
                    <Lock className="w-3 h-3" /> يتطلب صلاحية المشرف
                  </span>
                )}
              </div>
              {canSetOpeningBalance ? (
                <>
                  <MoneyInput 
                    valuePiasters={initialBalancePiasters}
                    onChangePiasters={setInitialBalancePiasters}
                  />
                  <p className="text-[10px] text-ink-muted dark:text-ink-dark-muted mt-1">سيبه صفر لو زبون جديد ومفيش عليه أي حساب قديم.</p>
                </>
              ) : (
                <div className="h-8 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded flex items-center text-ink-muted dark:text-ink-muted-dark text-xs">
                  0.00 ج.م (بدون رصيد افتتاحي - غير مصرح)
                </div>
              )}
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2 hairline-t border-line dark:border-line-dark">
            <button
              type="button"
              onClick={() => void requestClose()}
              className="px-4 py-1.5 rounded bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark font-medium cursor-pointer"
            >
              رجوع
            </button>
            <button
              type="submit"
              className="px-5 py-1.5 rounded bg-brand text-white hover:bg-brand-hover font-bold cursor-pointer"
            >
              حفظ الزبون
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
