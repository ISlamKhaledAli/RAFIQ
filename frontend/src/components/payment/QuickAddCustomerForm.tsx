import type { FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
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
  compact = false,
}: QuickAddCustomerFormProps) => {
  return (
    <form 
      onSubmit={onSubmit} 
      className={`${compact ? 'p-2.5 bg-surface border border-line' : 'p-3 bg-brand-soft/20 border border-brand/30'} rounded-lg flex flex-col gap-2.5 animate-in fade-in`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-ink">إضافة عميل سريع (في أقل من 10 ثوانٍ):</span>
        <span className="text-[10px] text-ink-muted">سيتم تسجيله واختياره مباشرة</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-ink mb-1">اسم العميل *</label>
          <input
            type="text"
            required
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            placeholder="اسم العميل"
            className="w-full h-8 px-2.5 bg-canvas border border-line rounded text-xs text-ink focus:outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-ink mb-1">رقم الهاتف</label>
          <input
            type="text"
            value={quickPhone}
            onChange={(e) => setQuickPhone(e.target.value)}
            placeholder="010..."
            className="w-full h-8 px-2.5 bg-canvas border border-line rounded text-xs text-ink font-mono focus:outline-none focus:border-brand"
          />
        </div>
      </div>

      {duplicateQuickCustomer && (
        <div className="p-2 rounded bg-amber-500/15 border border-amber-400/40 text-amber-900 dark:text-amber-200 text-[11px] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>هذا الرقم مسجل بالفعل للعميل: <strong>{duplicateQuickCustomer.name}</strong></span>
          </div>
          <button
            type="button"
            onClick={() => onSelectDuplicateCustomer(duplicateQuickCustomer)}
            className="px-2 py-0.5 rounded bg-brand text-white font-bold text-[10px] hover:bg-brand-hover cursor-pointer"
          >
            اختيار هذا العميل
          </button>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 rounded bg-surface border border-line text-xs font-semibold hover:bg-surface-2 text-ink cursor-pointer"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={!quickName.trim() || quickSaving}
          className="px-4 py-1 rounded bg-brand text-white text-xs font-bold hover:bg-brand-hover disabled:opacity-50 cursor-pointer"
        >
          {quickSaving ? 'جاري الحفظ...' : 'حفظ واختيار العميل'}
        </button>
      </div>
    </form>
  );
};
