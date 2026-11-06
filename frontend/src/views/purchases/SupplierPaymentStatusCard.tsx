import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle, Sparkles, UserCheck } from 'lucide-react';
import { describeSupplierBalance, type SupplierPaymentState } from './supplierPaymentState';

type Tone = 'paid' | 'warn' | 'danger';

const CARD_TONE: Record<Tone, string> = {
  paid: 'border-paid-border dark:border-paid-dark-border bg-paid-soft dark:bg-paid-dark-soft',
  warn: 'border-warn-border dark:border-warn-bright/30 bg-warn-soft dark:bg-warn-dark-soft',
  danger: 'border-danger-border dark:border-danger-bright/30 bg-danger-soft dark:bg-danger-dark-soft',
};

const ACCENT_TONE: Record<Tone | 'neutral', string> = {
  paid: 'text-paid dark:text-paid-bright',
  warn: 'text-warn dark:text-warn-bright',
  danger: 'text-danger dark:text-danger-bright',
  neutral: 'text-ink dark:text-ink-dark',
};

const Shell = ({ tone, icon, title, children }: { tone: Tone; icon: ReactNode; title: string; children: ReactNode }) => (
  <div role="status" className={`p-4 rounded-xl border flex flex-col gap-3 ${CARD_TONE[tone]}`}>
    <div className="flex items-center gap-2">
      <span className={`shrink-0 ${ACCENT_TONE[tone]}`}>{icon}</span>
      <h4 className="t-card-title text-ink dark:text-ink-dark m-0">{title}</h4>
    </div>
    {children}
  </div>
);

const Figure = ({ label, value, tone = 'neutral', large = false }: { label: string; value: string; tone?: Tone | 'neutral'; large?: boolean }) => (
  <div className="rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark p-3 flex flex-col gap-1 min-w-0">
    <span className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</span>
    <span className={`${large ? 'text-xl' : 'text-lg'} font-black tabular-nums ${ACCENT_TONE[tone]}`}>{value}</span>
  </div>
);

const Sentence = ({ children }: { children: ReactNode }) => (
  <p className="m-0 text-xs leading-relaxed text-ink dark:text-ink-dark">{children}</p>
);

interface SupplierPaymentStatusCardProps {
  state: SupplierPaymentState;
  paidAmountPiasters: number;
  remainingAmountPiasters: number;
  excessPaidPiasters: number;
  supplierName: string | null;
  currentBalancePiasters: number;
  projectedBalancePiasters: number;
  advanceCreditPiasters: number;
  supplierDebtPiasters: number;
  paymentSourceLabel: string | null;
  formatMoney: (piasters: number) => string;
}

export const SupplierPaymentStatusCard = ({
  state,
  paidAmountPiasters,
  remainingAmountPiasters,
  excessPaidPiasters,
  supplierName,
  currentBalancePiasters,
  projectedBalancePiasters,
  advanceCreditPiasters,
  supplierDebtPiasters,
  paymentSourceLabel,
  formatMoney,
}: SupplierPaymentStatusCardProps) => {
  if (state === 'none') return null;

  const name = supplierName ? `«${supplierName}»` : 'المورد';
  const balanceAfter = supplierName ? (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Figure label="حساب المورد قبل الفاتورة" value={describeSupplierBalance(currentBalancePiasters, formatMoney)} />
      <Figure
        label="حساب المورد بعد الفاتورة"
        value={describeSupplierBalance(projectedBalancePiasters, formatMoney)}
        tone={projectedBalancePiasters > 0 ? 'warn' : projectedBalancePiasters < 0 ? 'paid' : 'neutral'}
        large
      />
    </div>
  ) : null;
  const fromAdvance = Math.min(remainingAmountPiasters, advanceCreditPiasters);
  const advanceSentence =
    advanceCreditPiasters > 0 && remainingAmountPiasters > 0
      ? fromAdvance >= remainingAmountPiasters
        ? `المتبقي يُخصم بالكامل من رصيدنا السابق عند ${name}.`
        : `يُخصم ${formatMoney(fromAdvance)} من رصيدنا السابق عند ${name} والباقي ${formatMoney(remainingAmountPiasters - fromAdvance)} يُسجل دين علينا.`
      : `المتبقي يُسجل دين علينا في حساب ${name}.`;

  if (state === 'full') {
    return (
      <Shell tone="paid" icon={<CheckCircle className="w-5 h-5" />} title="الفاتورة مسددة بالكامل">
        <Sentence>
          {paymentSourceLabel ? `هيخرج ${formatMoney(paidAmountPiasters)} ${paymentSourceLabel}، ولا يتبقى على الفاتورة شيء.` : 'لا يتبقى على الفاتورة شيء.'}
        </Sentence>
        {balanceAfter}
      </Shell>
    );
  }

  if (state === 'partial') {
    return (
      <Shell tone="warn" icon={<AlertTriangle className="w-5 h-5" />} title="سداد جزئي والمتبقي على الحساب">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Figure label="المدفوع الآن" value={formatMoney(paidAmountPiasters)} tone="paid" />
          <Figure label="المتبقي على الحساب" value={formatMoney(remainingAmountPiasters)} tone="warn" large />
        </div>
        <Sentence>
          {paymentSourceLabel ? `هيخرج ${formatMoney(paidAmountPiasters)} ${paymentSourceLabel}. ` : ''}
          {advanceSentence}
        </Sentence>
        {!supplierName ? (
          <div className="p-2.5 rounded-lg border border-warn/30 bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>تنبيه: يجب اختيار المورد من أعلى الصفحة لتسجيل المبلغ المتبقي ({formatMoney(remainingAmountPiasters)}) على حسابه.</span>
          </div>
        ) : balanceAfter}
      </Shell>
    );
  }

  if (state === 'credit') {
    return (
      <Shell tone="warn" icon={<UserCheck className="w-5 h-5" />} title="الفاتورة آجل بالكامل (على الحساب)">
        <div className="p-3 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark flex items-center justify-between">
          <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-bold">إجمالي المبلغ الآجل على الحساب:</span>
          <span className="text-lg font-black font-mono tabular-nums text-warn dark:text-warn-bright">
            {formatMoney(remainingAmountPiasters)}
          </span>
        </div>
        <Sentence>
          لم يتم سداد أي مبالغ نقدية الآن. {advanceSentence}
        </Sentence>
        {!supplierName ? (
          <div className="p-2.5 rounded-lg border border-warn/30 bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>تنبيه: يجب اختيار المورد من أعلى الصفحة لتسجيل الفاتورة الآجلة على حسابه.</span>
          </div>
        ) : balanceAfter}
      </Shell>
    );
  }

  return (
    <Shell tone="paid" icon={<Sparkles className="w-5 h-5" />} title="سداد بزيادة (رصيد للمحل تحت الحساب)">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Figure label="المدفوع نقداً الآن" value={formatMoney(paidAmountPiasters)} tone="neutral" />
        <Figure label="الزيادة تحت الحساب (رصيد لنا)" value={`+${formatMoney(excessPaidPiasters)}`} tone="paid" large />
      </div>
      <Sentence>
        {supplierDebtPiasters > 0
          ? 'الزيادة تُخصم من الحساب القديم للمورد والباقي يترحل رصيد لنا.'
          : `الزيادة تُسجل رصيداً ودُفعة مقدمة للمحل تحت حساب ${name} وتُخصم من الفواتير القادمة.`}
      </Sentence>
      {!supplierName ? (
        <div className="p-2.5 rounded-lg border border-warn/30 bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>تنبيه: يجب اختيار المورد من أعلى الصفحة لتسجيل الزيادة (+{formatMoney(excessPaidPiasters)}) تحت حسابه.</span>
        </div>
      ) : balanceAfter}
    </Shell>
  );
};
