import { CreditCard } from 'lucide-react';
import { formatArabicCurrency } from '../../utils/money';

interface CardPaymentSectionProps {
  netTotalPiasters: number;
}

export const CardPaymentSection = ({ netTotalPiasters }: CardPaymentSectionProps) => {
  return (
    <div className="bg-surface p-5 rounded-lg border border-line flex flex-col items-center justify-center text-center gap-3">
      <div className="w-12 h-12 rounded-full bg-brand-soft text-brand flex items-center justify-center shadow-xs">
        <CreditCard className="w-6 h-6" />
      </div>
      <p className="text-sm font-bold text-ink m-0">الدفع عبر ماكينة نقاط البيع / الفيزا (POS Card Terminal)</p>
      <p className="text-xs text-ink-muted max-w-md m-0">
        مرر كارت العميل في ماكينة البنك بقيمة <strong className="text-brand font-mono">{formatArabicCurrency(netTotalPiasters)}</strong> ثم اضغط على زر تأكيد الدفع بالأسفل لحفظ المعاملة.
      </p>
    </div>
  );
};
