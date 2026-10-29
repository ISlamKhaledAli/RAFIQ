import React from 'react';
import { Building2, X, Calendar, Percent } from 'lucide-react';
import { normalizeArabicNumerals } from '../../utils/money';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { useFeatures } from '../../context/useFeatures';

export interface SupplierFormData {
  id?: string;
  name: string;
  companyName: string;
  phone: string;
  address: string;
  balanceEGP: string;
  notes: string;
  expiryReturnWindowDays?: string;
  expiryReturnCreditPercent?: string;
}

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  form: SupplierFormData;
  setForm: React.Dispatch<React.SetStateAction<SupplierFormData>>;
  onSave: (e: React.FormEvent) => void;
}

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
  isOpen,
  onClose,
  form,
  setForm,
  onSave,
}) => {
  const { isEnabled } = useFeatures();
  const isDirty = Boolean(
    form.name.trim() ||
    form.companyName.trim() ||
    form.phone.trim() ||
    form.address.trim() ||
    form.notes.trim() ||
    (form.balanceEGP && form.balanceEGP !== '0')
  );

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onClose,
    isDirty,
    confirmTitle: 'تجاهل بيانات المورد؟',
    confirmMessage: 'هناك بيانات مورد غير محفوظة، هل أنت متأكد من الخروج وتجاهل التعديلات؟',
    discardText: 'تجاهل والخروج',
    stayText: 'البقاء ومتابعة التسجيل',
  });

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="h-14 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center shadow-2xs">
              <Building2 className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-ink dark:text-ink-dark">
              {form.id ? 'تعديل بيانات المورد والشركة' : 'تسجيل مورد أو شركة جديدة'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSave} className="p-5 space-y-3.5">
          <div>
            <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
              اسم المورد أو المندوب <span className="text-danger dark:text-danger-bright">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="مثلاً: شركة النيل للتوزيع / أ. محمد"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:bg-surface dark:focus:bg-surface-dark transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">اسم الشركة أو التوكيل</label>
            <input
              type="text"
              placeholder="مثلاً: توكيل شيبسي وأغذية"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="w-full h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:bg-surface dark:focus:bg-surface-dark transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">رقم الموبايل / التليفون</label>
              <input
                type="text"
                placeholder="010XXXXXXXX"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:bg-surface dark:focus:bg-surface-dark transition-colors"
              />
            </div>

            {!form.id && (
              <div>
                <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
                  <span>حساب أول المدة (ج.م)</span>
                  <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted font-normal block">
                    (موجب = فلوس ليه عندنا، سالب (-) = دافعينله مقدم)
                  </span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.balanceEGP}
                  onChange={(e) => {
                    const norm = normalizeArabicNumerals(e.target.value);
                    if (/^-?[0-9]*\.?[0-9]{0,2}$/.test(norm)) {
                      setForm({ ...form, balanceEGP: norm });
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  placeholder="0.00"
                  className="w-full h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs font-mono font-bold text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:bg-surface dark:focus:bg-surface-dark transition-colors text-right"
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">العنوان أو مكان المخزن</label>
            <input
              type="text"
              placeholder="مثلاً: المنيا - ملوى"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:bg-surface dark:focus:bg-surface-dark transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">ملاحظات إضافية</label>
            <textarea
              rows={2}
              placeholder="مواعيد التوريد، أيام زيارة المندوب، إلخ..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full p-2.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:bg-surface dark:focus:bg-surface-dark resize-none transition-colors"
            />
          </div>

          {isEnabled('feature_expiry_returns') && (
            <div className="p-3 bg-brand-soft/30 dark:bg-brand-soft/10 border border-brand/20 rounded-xl space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-brand dark:text-brand-bright">
                <Calendar className="w-3.5 h-3.5" />
                <span>سياسة مرتجع الصلاحية للمورد (صيدلية)</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-ink-muted dark:text-ink-dark-muted block mb-1">
                    نافذة القبول (أيام قبل الانتهاء)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="30"
                    value={form.expiryReturnWindowDays || ''}
                    onChange={(e) => setForm({ ...form, expiryReturnWindowDays: normalizeArabicNumerals(e.target.value).replace(/[^\d]/g, '') })}
                    className="w-full h-9 px-2.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-xs font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-ink-muted dark:text-ink-dark-muted block mb-1">
                    نسبة التعويض المالي (%)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="100"
                      value={form.expiryReturnCreditPercent || ''}
                      onChange={(e) => setForm({ ...form, expiryReturnCreditPercent: normalizeArabicNumerals(e.target.value).replace(/[^\d]/g, '') })}
                      className="w-full h-9 pl-7 pr-2.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-xs font-mono text-ink dark:text-ink-dark focus:outline-none focus:border-brand"
                    />
                    <Percent className="w-3.5 h-3.5 text-ink-muted absolute left-2 top-2.5 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-3 border-t border-line dark:border-line-dark">
            <button
              type="submit"
              className="flex-1 h-10 bg-brand dark:bg-brand-bright dark:text-surface-dark hover:bg-brand-dark dark:hover:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
            >
              حفظ بيانات المورد في المحل
            </button>
            <button
              type="button"
              onClick={() => void requestClose()}
              className="px-4 h-10 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
