import type { FC } from 'react';
import {
  Banknote,
  Layers,
  PiggyBank,
  Package,
  Receipt,
  TrendingUp,
  Undo2,
  Wallet,
  AlertTriangle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatArabicCurrency } from '../../utils/money';

export interface FinancialWaterfallChartProps {
  grossSalesPiasters: number;
  returnsPiasters: number;
  netSalesPiasters: number;
  cogsPiasters: number;
  grossProfitPiasters: number;
  inventoryLossPiasters: number;
  operationalExpensesPiasters?: number;
  netProfitPiasters: number;
}

type Tone = 'brand' | 'paid' | 'warn' | 'danger';
type StepKind = 'total' | 'deduction';

interface Step {
  key: string;
  label: string;
  hint: string;
  kind: StepKind;
  tone: Tone;
  Icon: LucideIcon;
  amount: number;
  // Running balance (in piasters) before and after this step; drives bar position and connectors.
  levelIn: number;
  levelOut: number;
  isFinal?: boolean;
}

const BAR_FILL: Record<Tone, string> = {
  brand: 'bg-brand dark:bg-brand-bright',
  paid: 'bg-paid dark:bg-paid-bright',
  warn: 'bg-warn dark:bg-warn-bright',
  danger: 'bg-danger dark:bg-danger-bright',
};

const TONE_TEXT: Record<Tone, string> = {
  brand: 'text-brand dark:text-brand-bright',
  paid: 'text-paid dark:text-paid-bright',
  warn: 'text-warn dark:text-warn-bright',
  danger: 'text-danger dark:text-danger-bright',
};

const TONE_CHIP: Record<Tone, string> = {
  brand: 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright',
  paid: 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright',
  warn: 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright',
  danger: 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright',
};

const LEGEND: ReadonlyArray<{ tone: Tone; text: string }> = [
  { tone: 'brand', text: 'مجموع المبيعات' },
  { tone: 'paid', text: 'ربح' },
  { tone: 'warn', text: 'تكلفة ومصروفات' },
  { tone: 'danger', text: 'مرتجع أو فاقد' },
];

export const FinancialWaterfallChart: FC<FinancialWaterfallChartProps> = ({
  grossSalesPiasters,
  returnsPiasters,
  netSalesPiasters,
  cogsPiasters,
  grossProfitPiasters,
  inventoryLossPiasters,
  operationalExpensesPiasters = 0,
  netProfitPiasters,
}) => {
  const baseValue = Math.max(1, grossSalesPiasters);

  // Position on the 0-100 scale (share of gross sales), clamped to the track.
  const toPercent = (val: number) => Math.min(100, Math.max(0, (val * 100) / baseValue));

  const shareOfSales = (val: number) =>
    grossSalesPiasters > 0 ? `${((Math.abs(val) * 100) / grossSalesPiasters).toFixed(1)}%` : '0.0%';

  const netMargin = grossSalesPiasters > 0
    ? ((netProfitPiasters * 100) / grossSalesPiasters).toFixed(1)
    : '0.0';

  const isLoss = netProfitPiasters < 0;

  const steps: Step[] = [];
  const pushTotal = (s: Omit<Step, 'kind' | 'levelIn' | 'levelOut'>) => {
    const levelIn = steps.length > 0 ? steps[steps.length - 1].levelOut : s.amount;
    steps.push({ ...s, kind: 'total', levelIn, levelOut: s.amount });
  };
  const pushDeduction = (s: Omit<Step, 'kind' | 'levelIn' | 'levelOut'>) => {
    const levelIn = steps[steps.length - 1].levelOut;
    steps.push({ ...s, kind: 'deduction', levelIn, levelOut: Math.max(0, levelIn - s.amount) });
  };

  pushTotal({
    key: 'gross',
    label: 'إجمالي مبيعات المتجر',
    hint: 'كل ما دفعه الزبائن (رأس النهر)',
    tone: 'brand',
    Icon: Banknote,
    amount: grossSalesPiasters,
  });
  pushDeduction({
    key: 'returns',
    label: 'مرتجعات الزبائن المستردة',
    hint: 'مبالغ أُعيدت للزبائن',
    tone: 'danger',
    Icon: Undo2,
    amount: returnsPiasters,
  });
  pushTotal({
    key: 'net',
    label: 'صافي المبيعات الفعلي',
    hint: 'بعد خروج المرتجع',
    tone: 'brand',
    Icon: Receipt,
    amount: netSalesPiasters,
  });
  pushDeduction({
    key: 'cogs',
    label: 'تكلفة شراء البضاعة المباعة',
    hint: 'ما دُفع للموردين والشركات',
    tone: 'warn',
    Icon: Package,
    amount: cogsPiasters,
  });
  pushTotal({
    key: 'gp',
    label: 'مجمل ربح البيع',
    hint: 'فارق سعر البيع عن سعر الشراء',
    tone: 'paid',
    Icon: TrendingUp,
    amount: grossProfitPiasters,
  });
  if (inventoryLossPiasters > 0) {
    pushDeduction({
      key: 'loss',
      label: 'فاقد وعجز الجرد والتوالف',
      hint: 'توالف + عجز جرد مخزني',
      tone: 'danger',
      Icon: AlertTriangle,
      amount: inventoryLossPiasters,
    });
  }
  if (operationalExpensesPiasters > 0) {
    pushDeduction({
      key: 'opex',
      label: 'المصروفات التشغيلية والنثرية',
      hint: 'إيجار، فواتير، مرتبات، بوفيه، نثريات',
      tone: 'warn',
      Icon: Wallet,
      amount: operationalExpensesPiasters,
    });
  }
  pushTotal({
    key: 'profit',
    label: 'صافي الربح الحقيقي في يد التاجر',
    hint: 'المتبقي بعد التكلفة والمرتجعات والمصروفات وعجز الجرد',
    tone: isLoss ? 'danger' : 'paid',
    Icon: PiggyBank,
    amount: netProfitPiasters,
    isFinal: true,
  });

  return (
    <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 sm:p-5 shadow-2xs select-none">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="t-card-title text-ink dark:text-ink-dark leading-snug">شلال تدفق الأموال: كيف تحول الإيراد لصافي ربح؟</h3>
            <p className="text-sm text-ink-muted dark:text-ink-dark-muted mt-0.5">
              تتبع دقيق لكل خصم وتكلفة من أول جنيه دفعه الزبون حتى ما تبقى في جيبك
            </p>
          </div>
        </div>
      </div>

      {/* How to read */}
      <div className="mt-4 rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line/60 dark:border-line-dark/60 px-3 py-2.5">
        <p className="text-xs text-ink-muted dark:text-ink-dark-muted">
          النسبة بجوار كل مبلغ هي حصته من إجمالي المبيعات، وطول الشريط يعبر عنها. الشريط الممتد من الحافة هو رصيد، والشريط المنفصل عنها هو مبلغ خُصم من الرصيد السابق.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted dark:text-ink-dark-muted">
          {LEGEND.map(({ tone, text }) => (
            <span key={tone} className="inline-flex items-center gap-1.5">
              <span className={`w-3 h-1.5 rounded-full ${BAR_FILL[tone]}`} />
              {text}
            </span>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div className="mt-3">
        {steps.map((step, index) => {
          const isFirst = index === 0;
          const isLast = index === steps.length - 1;
          const isDeduction = step.kind === 'deduction';
          const barEnd = toPercent(step.kind === 'total' ? step.amount : step.levelIn);
          const barStart = isDeduction ? toPercent(step.levelOut) : 0;
          const barWidth = step.amount > 0 ? Math.max(1.5, barEnd - barStart) : 0;
          const barOffset = Math.min(barStart, 100 - barWidth);
          const valueText = isDeduction
            ? (step.amount > 0 ? `- ${formatArabicCurrency(step.amount)}` : formatArabicCurrency(0))
            : formatArabicCurrency(step.amount);
          const caption = step.isFinal ? `${netMargin}%` : shareOfSales(step.amount);
          const finalSurface = isLoss
            ? 'border border-danger/30 dark:border-danger-bright/30 bg-danger-soft/60 dark:bg-danger-dark-soft/50'
            : 'border border-paid/30 dark:border-paid-bright/30 bg-paid-soft/60 dark:bg-paid-dark-soft/50';

          return (
            <div
              key={step.key}
              className={`grid grid-cols-1 sm:grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] gap-x-4 gap-y-2 px-3 py-3 ${
                step.isFinal ? `mt-2 rounded-xl ${finalSurface}` : ''
              }`}
            >
              {/* Label block: icon, label, value, caption */}
              <div className="flex items-start gap-2.5 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${TONE_CHIP[step.tone]}`}>
                  <step.Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink dark:text-ink-dark leading-snug">{step.label}</div>
                  <div className="flex flex-wrap items-baseline gap-x-2 mt-0.5">
                    <span className={`${step.isFinal ? 'text-xl' : 'text-base'} font-black tabular-nums whitespace-nowrap leading-tight ${TONE_TEXT[step.tone]}`}>
                      {valueText}
                    </span>
                    <span className="text-xs font-bold tabular-nums text-ink-muted dark:text-ink-dark-muted">{caption}</span>
                  </div>
                  <div className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">{step.hint}</div>
                </div>
              </div>

              {/* Bar track with connectors to the previous / next step */}
              <div className="relative h-5 sm:h-auto sm:self-stretch sm:min-h-[1.25rem]">
                {!isFirst && (
                  <span
                    aria-hidden="true"
                    className="hidden sm:block absolute top-[-0.75rem] h-[calc(50%+0.75rem)] border-s border-dashed border-ink-muted/50 dark:border-ink-dark-muted/50"
                    style={{ insetInlineStart: `${toPercent(step.levelIn)}%` }}
                  />
                )}
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="hidden sm:block absolute bottom-[-0.75rem] h-[calc(50%+0.75rem)] border-s border-dashed border-ink-muted/50 dark:border-ink-dark-muted/50"
                    style={{ insetInlineStart: `${toPercent(step.levelOut)}%` }}
                  />
                )}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 rounded-full bg-line/60 dark:bg-line-dark/70">
                  <div
                    className={`absolute top-0 h-full rounded-full transition-all duration-500 ${BAR_FILL[step.tone]}`}
                    style={{ insetInlineStart: `${barOffset}%`, width: `${barWidth}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
