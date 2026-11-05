import type { FormEvent } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import type { Customer } from '../../types/models';
import { RequiredMark } from '../RequiredMark';

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
}

const FIELD_CLASS =
  'w-full h-10 px-3 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 text-sm font-semibold text-ink dark:text-ink-dark placeholder:font-normal placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted focus:border-brand dark:focus:border-brand-bright focus:outline-none focus:ring-2 focus:ring-brand/20 dark:focus:ring-brand-bright/25';

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
    <form onSubmit={onSubmit} className="flex-1 min-h-0 flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <label htmlFor="quick-customer-name" className="t-label text-ink dark:text-ink-dark">
          اسم الزبون <RequiredMark />
        </label>
        <input
          id="quick-customer-name"
          type="text"
          required
          autoFocus
          value={quickName}
          onChange={(e) => setQuickName(e.target.value)}
          placeholder="اكتب اسم الزبون"
          className={FIELD_CLASS}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="quick-customer-phone" className="t-label text-ink dark:text-ink-dark">
          رقم الموبايل
        </label>
        <input
          id="quick-customer-phone"
          type="text"
          inputMode="tel"
          value={quickPhone}
          onChange={(e) => setQuickPhone(e.target.value)}
          placeholder="مثال: 01012345678"
          className={`${FIELD_CLASS} font-mono`}
        />
      </div>

      {duplicateQuickCustomer && (
        <div className="p-2 rounded-lg bg-warn-soft dark:bg-warn-dark-soft border border-warn-border dark:border-warn-bright/30 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
          <span className="flex-1 min-w-0 text-xs leading-snug text-ink dark:text-ink-dark line-clamp-2">
            الرقم ده متسجل باسم «<strong>{duplicateQuickCustomer.name}</strong>»
          </span>
          <button
            type="button"
            onClick={() => onSelectDuplicateCustomer(duplicateQuickCustomer)}
            className="h-8 px-3 shrink-0 rounded-lg border border-warn dark:border-warn-bright text-xs font-bold text-ink dark:text-ink-dark bg-surface dark:bg-surface-dark hover:bg-warn-soft dark:hover:bg-warn-dark-soft transition-colors cursor-pointer"
          >
            اختيار
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-auto">
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-lg border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-2 text-sm font-bold text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
        >
          <X className="w-4 h-4" />
          <span>إلغاء</span>
        </button>
        <button
          type="submit"
          disabled={!quickName.trim() || quickSaving}
          className="h-10 rounded-lg bg-brand hover:bg-brand-hover dark:bg-brand-container dark:hover:bg-brand text-white text-sm font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check className="w-4 h-4" />
          <span>{quickSaving ? 'جاري الحفظ...' : 'حفظ'}</span>
        </button>
      </div>
    </form>
  );
};
