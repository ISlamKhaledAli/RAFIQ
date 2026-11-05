import { MoneyInput } from '../MoneyInput';
import { formatArabicCurrency } from '../../utils/money';

interface PaymentSummaryProps {
  invoiceNumber?: number | null;
  itemCount: number;
  totalItemCount: number;
  subtotalPiasters: number;
  discountPiasters: number;
  onDiscountChange?: (val: number) => void;
  netTotalPiasters: number;
}

export const PaymentSummary = ({
  invoiceNumber,
  itemCount,
  totalItemCount,
  subtotalPiasters,
  discountPiasters,
  onDiscountChange,
  netTotalPiasters,
}: PaymentSummaryProps) => {
  return (
    <section
      aria-label="ملخص الفاتورة"
      className="rounded-xl border border-brand/20 dark:border-line-dark bg-brand-soft dark:bg-brand-dark-soft p-4 flex flex-col gap-3 shrink-0"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="t-label text-ink-muted dark:text-ink-dark-muted">فاتورة</span>
        <span className="t-label tabular-nums px-2.5 py-1 rounded-md bg-surface dark:bg-surface-dark border border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright">
          #{invoiceNumber || '1'}
        </span>
        <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {itemCount} صنف ({totalItemCount} قطعة)
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="t-label text-ink-muted dark:text-ink-dark-muted">المطلوب دفعه</span>
        <span className="text-4xl font-black tabular-nums leading-tight text-brand dark:text-brand-bright">
          {formatArabicCurrency(netTotalPiasters)}
        </span>
        <span className="h-4 text-xs leading-4 text-ink-muted dark:text-ink-dark-muted">
          {discountPiasters > 0 ? (
            <>إجمالي السلة قبل الخصم: <span className="font-bold tabular-nums text-ink dark:text-ink-dark">{formatArabicCurrency(subtotalPiasters)}</span></>
          ) : (
            'مفيش خصم على الفاتورة'
          )}
        </span>
      </div>

      <div
        className="flex items-center justify-between gap-3 pt-3 border-t border-brand/15 dark:border-line-dark"
        title={onDiscountChange ? undefined : 'خصم الفاتورة يحتاج صلاحية أو اعتماد المشرف من زر الخصم'}
      >
        <span className="t-label text-danger dark:text-danger-bright shrink-0">خصم الفاتورة</span>
        <div className="w-36">
          <MoneyInput
            valuePiasters={discountPiasters}
            disabled={!onDiscountChange}
            onChangePiasters={(val) => {
              if (onDiscountChange) onDiscountChange(val);
            }}
            className="h-11 text-sm text-danger dark:text-danger-bright font-bold border-danger/30 dark:border-danger-bright/40 focus:border-danger dark:focus:border-danger-bright bg-surface dark:bg-surface-dark text-right pr-2.5 pl-8 rounded-lg placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted"
          />
        </div>
      </div>
    </section>
  );
};
