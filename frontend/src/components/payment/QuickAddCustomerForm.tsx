import type { FormEvent } from 'react';
import { AlertTriangle, Check, UserPlus, X } from 'lucide-react';
import type { Customer } from '../../types/models';

interface QuickAddCustomerFormProps {
  quickName: string;
  setQuickName: (val: string) => void;
  quickPhone: string;
  setQuickPhone: (val: string) => void;
  quickSaving: boolean;
  duplicateQuickCustomer: Customer | null;
  onSelectDuplicateCustomer: (c: Customer) => void;
  onCancel: () => void;
  onSubmit: (e: FormEvent) => void;
  compact?: boolean;
}

export const QuickAddCustomerForm = ({
  quickName,
  setQuickName,
  quickPhone,
  setQuickPhone,
  quickSaving,
  duplicateQuickCustomer,
  onSelectDuplicateCustomer,
  onCancel,
  onSubmit,
}: QuickAddCustomerFormProps) => {
  return (
    <form 
      onSubmit={onSubmit} 
      className="p-3.5 bg-emerald-50/80 border-2 border-emerald-500/40 rounded-xl flex flex-col gap-3 shadow-xs animate-in fade-in"
    >
      <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <UserPlus className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-emerald-950">إضافة عميل جديد سريع (خلال ثوانٍ):</span>
        </div>
        <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300/60">
          سيتم حفظه واختياره فوراً
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1">
            اسم العميل <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            required
            autoFocus
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            placeholder="أدخل اسم العميل بالكامل"
            className="w-full h-9 px-3 bg-white border-2 border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 rounded-lg text-xs font-bold text-slate-900 placeholder:text-slate-400 placeholder:font-normal shadow-2xs transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1">
            رقم الهاتف <span className="text-slate-500 font-normal">(اختياري)</span>
          </label>
          <input
            type="text"
            value={quickPhone}
            onChange={(e) => setQuickPhone(e.target.value)}
            placeholder="مثال: 01012345678"
            className="w-full h-9 px-3 bg-white border-2 border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 rounded-lg text-xs font-bold text-slate-900 font-mono placeholder:text-slate-400 placeholder:font-normal shadow-2xs transition-colors dir-ltr text-right"
          />
        </div>
      </div>

      {duplicateQuickCustomer && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="truncate">هذا الرقم مسجل بالفعل للعميل: <strong>{duplicateQuickCustomer.name}</strong></span>
          </div>
          <button
            type="button"
            onClick={() => onSelectDuplicateCustomer(duplicateQuickCustomer)}
            className="px-3 py-1 rounded-md bg-[#006D41] hover:bg-[#005a36] text-white font-bold text-xs shrink-0 cursor-pointer shadow-2xs"
          >
            اختيار هذا العميل
          </button>
        </div>
      )}

      <div className="flex items-center justify-end gap-2.5 pt-1 border-t border-emerald-200/60">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-4 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
        >
          <X className="w-3.5 h-3.5" />
          <span>إلغاء</span>
        </button>
        <button
          type="submit"
          disabled={!quickName.trim() || quickSaving}
          className="h-8 px-5 rounded-lg bg-[#006D41] hover:bg-[#005a36] text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{quickSaving ? 'جاري الحفظ...' : 'حفظ واختيار العميل'}</span>
        </button>
      </div>
    </form>
  );
};
