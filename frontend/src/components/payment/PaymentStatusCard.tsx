import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, Calculator, Sparkles, UserCheck } from 'lucide-react';
import type { Customer } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';

type Tone = 'paid' | 'warn' | 'danger' | 'neutral';

const CARD_TONE: Record<Exclude<Tone, 'neutral'>, string> = {
  paid: 'border-paid-border dark:border-paid-dark-border bg-paid-soft dark:bg-paid-dark-soft',
  warn: 'border-warn-border dark:border-warn-bright/30 bg-warn-soft dark:bg-warn-dark-soft',
  danger: 'border-danger-border dark:border-danger-bright/30 bg-danger-soft dark:bg-danger-dark-soft',
};

const ACCENT_TONE: Record<Tone, string> = {
  paid: 'text-paid dark:text-paid-bright',
  warn: 'text-warn dark:text-warn-bright',
  danger: 'text-danger dark:text-danger-bright',
  neutral: 'text-ink dark:text-ink-dark',
};

interface StatusShellProps {
  tone: Exclude<Tone, 'neutral'>;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

const StatusShell = ({ tone, icon, title, children }: StatusShellProps) => (
  <div role="status" className={`h-full min-h-0 overflow-y-auto p-4 rounded-xl border flex flex-col gap-3 ${CARD_TONE[tone]}`}>
    <div className="flex items-center gap-2 shrink-0">
      <span className={`shrink-0 ${ACCENT_TONE[tone]}`}>{icon}</span>
      <h4 className="t-card-title text-ink dark:text-ink-dark m-0">{title}</h4>
    </div>
    {children}
  </div>
);

interface FigureProps {
  label: string;
  value: string;
  tone?: Tone;
  large?: boolean;
}

const Figure = ({ label, value, tone = 'neutral', large = false }: FigureProps) => (
  <div className="rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark p-3 flex flex-col gap-1 min-w-0">
    <span className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</span>
    <span className={`${large ? 'text-xl' : 'text-lg'} font-black tabular-nums ${ACCENT_TONE[tone]}`}>{value}</span>
  </div>
);

const Sentence = ({ children }: { children: ReactNode }) => (
  <p className="m-0 text-xs leading-relaxed text-ink dark:text-ink-dark">{children}</p>
);

interface PaymentStatusCardProps {
  selectedCustomer: Customer | undefined;
  hasRegisteredCustomer: boolean;
  isCreditActive: boolean;
  isShortPayment: boolean;
  receivedPiasters: number;
  shortAmountPiasters: number;
  changeDuePiasters: number;
  netTotalPiasters: number;
  saveChangeToCustomerAccount: boolean;
  onToggleSaveChangeToCustomerAccount: (v: boolean) => void;
}

export const PaymentStatusCard = ({
  selectedCustomer,
  hasRegisteredCustomer,
  isCreditActive,
  isShortPayment,
  receivedPiasters,
  shortAmountPiasters,
  changeDuePiasters,
  netTotalPiasters,
  saveChangeToCustomerAccount,
  onToggleSaveChangeToCustomerAccount,
}: PaymentStatusCardProps) => {
  if (isCreditActive && hasRegisteredCustomer && selectedCustomer) {
    if (selectedCustomer.balancePiasters < 0) {
      const creditAvail = Math.abs(selectedCustomer.balancePiasters);
      const coversAll = creditAvail >= netTotalPiasters;
      return (
        <StatusShell tone="paid" icon={<Sparkles className="w-5 h-5" />} title="خصم من الفلوس اللي سايبها العميل تحت حسابه">
          <Sentence>
            {coversAll
              ? `الفاتورة هتتخصم كلها من الفلوس اللي سايبها العميل «${selectedCustomer.name}».`
              : `الفلوس اللي كان سايبها العميل «${selectedCustomer.name}» هتخلص كلها، والباقي هيتسجل عليه في حسابه.`}
          </Sentence>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Figure label="الفلوس اللي سايبها في المحل" value={formatArabicCurrency(creditAvail)} tone="paid" />
            {coversAll ? (
              <Figure label="هيتبقى له في حسابه بالمحل" value={formatArabicCurrency(creditAvail - netTotalPiasters)} tone="paid" large />
            ) : (
              <Figure label="هيتسجل عليه في حسابه" value={formatArabicCurrency(netTotalPiasters - creditAvail)} tone="warn" large />
            )}
          </div>
        </StatusShell>
      );
    }
    return (
      <StatusShell tone="warn" icon={<UserCheck className="w-5 h-5" />} title="الفاتورة كلها على حساب الزبون">
        <Sentence>
          مفيش كاش هيدخل الدرج، والفاتورة هتتسجل دين على حساب «{selectedCustomer.name}» في النوتة.
        </Sentence>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Figure label="كان عليه قديم" value={formatArabicCurrency(selectedCustomer.balancePiasters)} tone="danger" />
          <Figure label="إجمالي اللي عليه بعد الفاتورة" value={formatArabicCurrency(selectedCustomer.balancePiasters + netTotalPiasters)} tone="danger" large />
        </div>
      </StatusShell>
    );
  }

  if (receivedPiasters === 0) {
    return (
      <div
        role="status"
        className="h-full min-h-0 p-4 rounded-xl border border-dashed border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex flex-col items-center justify-center gap-2 text-center"
      >
        <Calculator className="w-6 h-6 text-ink-muted dark:text-ink-dark-muted" />
        <p className="m-0 text-sm font-bold text-ink dark:text-ink-dark">الباقي أو المتبقي هيظهر هنا</p>
        <p className="m-0 text-xs text-ink-muted dark:text-ink-dark-muted">اكتب المبلغ المستلم أو اختار مبلغ جاهز من فوق.</p>
      </div>
    );
  }

  if (isShortPayment) {
    if (selectedCustomer) {
      return (
        <StatusShell tone="warn" icon={<AlertTriangle className="w-5 h-5" />} title="دفع جزء كاش والباقي على الحساب (دين)">
          <div className="flex flex-col gap-1">
            <span className="t-label text-ink-muted dark:text-ink-dark-muted">المتبقي على النوتة</span>
            <span className="t-kpi-lg text-warn dark:text-warn-bright">+{formatArabicCurrency(shortAmountPiasters)}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Figure label="كان عليه قديم" value={formatArabicCurrency(selectedCustomer.balancePiasters)} tone="danger" />
            <Figure label="إجمالي اللي عليه الآن" value={formatArabicCurrency(selectedCustomer.balancePiasters + shortAmountPiasters)} tone="danger" large />
          </div>
          <Sentence>
            هيتحط المبلغ المستلم في الدرج كاش، والباقي هيتسجل دين على حساب «{selectedCustomer.name}» في النوتة.
          </Sentence>
        </StatusShell>
      );
    }
    return (
      <StatusShell tone="danger" icon={<AlertTriangle className="w-5 h-5" />} title="المبلغ ناقص (دفع جزء)">
        <div className="flex flex-col gap-1">
          <span className="t-label text-ink-muted dark:text-ink-dark-muted">المتبقي</span>
          <span className="text-3xl font-black tabular-nums text-danger dark:text-danger-bright">-{formatArabicCurrency(shortAmountPiasters)}</span>
        </div>
        <Sentence>مينفعش يدفع جزء من الفاتورة إلا لما تختار اسم الزبون عشان نسجل الباقي عليه.</Sentence>
      </StatusShell>
    );
  }

  return (
    <StatusShell tone="paid" icon={<CheckCircle className="w-5 h-5" />} title="الحساب مظبوط وجاهز لطباعة الفاتورة">
      <div className="flex flex-col gap-1">
        <span className="t-label text-ink-muted dark:text-ink-dark-muted">الباقي للعميل</span>
        <span className="text-4xl font-black tabular-nums leading-tight text-paid dark:text-paid-bright">
          {formatArabicCurrency(changeDuePiasters)}
        </span>
      </div>

      {hasRegisteredCustomer && changeDuePiasters > 0 && selectedCustomer && (
        <div className="rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              id="payment-save-change-switch"
              type="button"
              role="switch"
              aria-checked={saveChangeToCustomerAccount}
              onClick={() => onToggleSaveChangeToCustomerAccount(!saveChangeToCustomerAccount)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paid dark:focus-visible:ring-paid-bright ${
                saveChangeToCustomerAccount ? 'bg-paid dark:bg-paid-bright' : 'bg-line-hover dark:bg-surface-dark-3'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full shadow-md ring-0 transition duration-200 ease-in-out ${
                  saveChangeToCustomerAccount
                    ? 'bg-surface dark:bg-surface-dark -translate-x-5'
                    : 'bg-surface dark:bg-ink-dark-muted translate-x-0'
                }`}
              />
            </button>
            <label htmlFor="payment-save-change-switch" className="flex flex-col gap-0.5 cursor-pointer text-ink dark:text-ink-dark">
              <span className="t-label">سيب الباقي في حساب العميل بدل ما ترجعه كاش</span>
              <span className="text-xs text-ink-muted dark:text-ink-dark-muted">
                {saveChangeToCustomerAccount
                  ? 'هيتخصم الباقي من دينه القديم، أو يتحفظ له كرصيد في المحل.'
                  : 'هتسلم الباقي نقداً باليد، وحسابه في النوتة يفضل زي ما هو.'}
              </span>
            </label>
          </div>

          {saveChangeToCustomerAccount ? (
            selectedCustomer.balancePiasters > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-line dark:border-line-dark">
                <Figure label="كان عليه قديم" value={formatArabicCurrency(selectedCustomer.balancePiasters)} tone="danger" />
                {selectedCustomer.balancePiasters - changeDuePiasters > 0 ? (
                  <Figure label="بقى عليه الآن في النوتة" value={formatArabicCurrency(selectedCustomer.balancePiasters - changeDuePiasters)} tone="warn" large />
                ) : (
                  <Figure label="سدد دينه بالكامل وبقى له رصيد" value={formatArabicCurrency(Math.abs(selectedCustomer.balancePiasters - changeDuePiasters))} tone="paid" large />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-line dark:border-line-dark">
                <Figure label="رصيده السابق" value={formatArabicCurrency(Math.abs(selectedCustomer.balancePiasters))} tone="paid" />
                <Figure label="إجمالي رصيده الجديد" value={formatArabicCurrency(Math.abs(selectedCustomer.balancePiasters) + changeDuePiasters)} tone="paid" large />
              </div>
            )
          ) : (
            selectedCustomer.balancePiasters > 0 && (
              <div className="flex items-start gap-2 pt-3 border-t border-line dark:border-line-dark text-xs text-ink dark:text-ink-dark">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-warn dark:text-warn-bright" />
                <span>
                  دينه القديم المسجل في النوتة <strong className="tabular-nums text-danger dark:text-danger-bright">({formatArabicCurrency(selectedCustomer.balancePiasters)})</strong> هيفضل زي ما هو بدون تعديل.
                </span>
              </div>
            )
          )}
        </div>
      )}
    </StatusShell>
  );
};
