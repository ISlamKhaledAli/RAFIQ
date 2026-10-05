import React from 'react';
import { Building2, X } from 'lucide-react';

export interface SupplierFormData {
  id?: string;
  name: string;
  companyName: string;
  phone: string;
  address: string;
  balanceEGP: string;
  notes: string;
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
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="h-14 bg-surface border-b border-line px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center shadow-2xs">
              <Building2 className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-ink">
              {form.id ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSave} className="p-5 space-y-3.5">
          <div>
            <label className="text-xs font-bold text-ink block mb-1">
              اسم المورد <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="مثال: شركة النيل للمواد الغذائية"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-ink block mb-1">اسم الشركة أو التوكيل</label>
            <input
              type="text"
              placeholder="مثال: توكيل شيبسي وأغذية"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-ink block mb-1">رقم الهاتف</label>
              <input
                type="text"
                placeholder="010XXXXXXXX"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs font-mono text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
              />
            </div>

            {!form.id && (
              <div>
                <label className="text-xs font-bold text-ink block mb-1">الرصيد الافتتاحي (ج.م)</label>
                <input
                  type="number"
                  step="1"
                  value={form.balanceEGP}
                  onChange={(e) => setForm({ ...form, balanceEGP: e.target.value })}
                  className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs font-mono font-bold text-danger focus:outline-none focus:border-brand focus:bg-surface transition-colors"
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-bold text-ink block mb-1">العنوان أو بيانات الفرع</label>
            <input
              type="text"
              placeholder="مثال: المنيا - ملوى"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-ink block mb-1">ملاحظات إضافية</label>
            <textarea
              rows={2}
              placeholder="مواعيد التوريد، أيام الزيارة، إلخ..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full p-2.5 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface resize-none transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-line">
            <button
              type="submit"
              className="flex-1 h-10 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
            >
              حفظ بيانات المورد
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 h-10 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
