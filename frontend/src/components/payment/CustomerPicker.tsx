import type { ReactNode } from 'react';
import { AppButton } from '../AppButton';
import { UserCheck, UserPlus } from 'lucide-react';
import type { Customer } from '../../types/models';
import { CustomSelect } from '../CustomSelect';
import { RequiredMark } from '../RequiredMark';
import { useMotionPanel } from '../../hooks/useMotionPanel';

interface CustomerPickerProps {
  customerId: string | null;
  customers: Customer[];
  onChange: (id: string) => void;
  /** Credit or short payment: a registered customer is mandatory. */
  customerRequired: boolean;
  /** The quick-add form replaces the picker in place so the card never changes size. */
  quickAddOpen: boolean;
  onOpenQuickAdd: () => void;
  /** Hint under the picker; omit for the cash wording, null to hide it. */
  hint?: string | null;
  /** Extra block pinned to the bottom of the picker card (not shown while quick-add is open). */
  status?: ReactNode;
  /** Quick-add form, shown instead of the picker while quickAddOpen. */
  children: ReactNode;
}

const DEFAULT_HINT = 'اختار الزبون لو هتسجل الفاتورة على الحساب أو هتدفع جزء منها.';

export const CustomerPicker = ({
  customerId,
  customers,
  onChange,
  customerRequired,
  quickAddOpen,
  onOpenQuickAdd,
  hint = DEFAULT_HINT,
  status,
  children,
}: CustomerPickerProps) => {
  const motionPanel = useMotionPanel(quickAddOpen ? 'quick-add' : 'picker');

  return (
    <section
      {...motionPanel}
      aria-label="الزبون"
      className="flex-1 min-h-0 rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark p-4 flex flex-col gap-3"
    >
      <h3 className="t-card-title text-ink dark:text-ink-dark m-0 flex items-center gap-2 shrink-0">
        {quickAddOpen ? (
          <>
            <UserPlus className="w-4 h-4 text-paid dark:text-paid-bright shrink-0" />
            <span>زبون جديد</span>
          </>
        ) : (
          <>
            <UserCheck className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
            <span>الزبون{customerRequired && <> <RequiredMark /></>}</span>
          </>
        )}
      </h3>

      {quickAddOpen ? (
        children
      ) : (
        <>
          <CustomSelect
            value={customerId || ''}
            onChange={onChange}
            options={[
              { value: '', label: 'زبون عادي كاش (بدون حساب)' },
              ...customers
                .filter((c) => c.id !== 'cust_general_cash')
                .map((c) => ({ value: c.id, label: c.name })),
            ]}
            className="w-full [&>button]:min-h-11"
            size="lg"
            searchable
          />

          <AppButton variant="successSoft" size="lg" icon={UserPlus} onClick={onOpenQuickAdd} title="تسجيل زبون جديد في النوتة فوراً">
            تسجيل زبون جديد
          </AppButton>

          {hint && (
            <p className="m-0 text-xs leading-relaxed text-ink-muted dark:text-ink-dark-muted">{hint}</p>
          )}

          {status && <div className="mt-auto">{status}</div>}
        </>
      )}
    </section>
  );
};
