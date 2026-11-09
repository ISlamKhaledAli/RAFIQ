import type { FormEvent } from 'react';
import { AppButton } from '../AppButton';
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
          <AppButton variant="secondary" size="sm" className="shrink-0" onClick={() => onSelectDuplicateCustomer(duplicateQuickCustomer)}>
            اختيار
          </AppButton>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-auto">
        <AppButton variant="secondary" size="md" icon={X} onClick={onCancel}>
          إلغاء
        </AppButton>
        <AppButton type="submit" variant="primary" size="md" icon={Check} disabled={!quickName.trim() || quickSaving}>
          {quickSaving ? 'جاري الحفظ...' : 'حفظ'}
        </AppButton>
      </div>
    </form>
  );
};
