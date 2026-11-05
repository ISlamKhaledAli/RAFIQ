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
      </Shell>
    );
  }

  if (state === 'partial') {
    return (
      <Shell tone="warn" icon={<AlertTriangle className="w-5 h-5" />} title="دفع جزء الآن والباقي آجل على المورد">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Figure label="المدفوع الآن" value={formatMoney(paidAmountPiasters)} tone="paid" />
          <Figure label="المتبقي آجل على المورد" value={formatMoney(remainingAmountPiasters)} tone="warn" large />
        </div>
        <Sentence>
          {paymentSourceLabel ? `هيخرج ${formatMoney(paidAmountPiasters)} ${paymentSourceLabel}. ` : ''}
          {advanceSentence}
        </Sentence>
        {balanceAfter}
      </Shell>
    );
  }

  if (state === 'credit') {
    return (
      <Shell tone="warn" icon={<UserCheck className="w-5 h-5" />} title="الفاتورة كلها آجل على المورد (بدون كاش)">
        <Sentence>
          مفيش فلوس هتخرج دلوقتي. {advanceSentence}
        </Sentence>
        {balanceAfter}
      </Shell>
    );
  }

  return (
    <Shell tone="paid" icon={<Sparkles className="w-5 h-5" />} title="سداد بزيادة عن الفاتورة">
      <div className="flex flex-col gap-1">
        <span className="t-label text-ink-muted dark:text-ink-dark-muted">الزيادة تُضاف لرصيدنا</span>
        <span className="t-kpi-lg text-paid dark:text-paid-bright">+{formatMoney(excessPaidPiasters)}</span>
      </div>
      <Sentence>
        {supplierDebtPiasters > 0
          ? 'الزيادة تُخصم من الحساب القديم للمورد والباقي يترحل رصيد لنا.'
          : `الزيادة تُسجل رصيداً لنا عند ${name} وتُخصم من فواتير البضاعة الجاية.`}
      </Sentence>
      {balanceAfter}
    </Shell>
  );
};
