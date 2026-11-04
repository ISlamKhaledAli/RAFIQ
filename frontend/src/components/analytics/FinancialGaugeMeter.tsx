import type { FC } from 'react';
import { Activity, AlertTriangle, Banknote, Hourglass, Info, Percent, ShieldCheck, ShieldAlert } from 'lucide-react';

export interface FinancialGaugeMeterProps {
  score: number; // 0 to 100
  title?: string;
  cashRatioPercent: number;
  netMarginPercent: number;
  uncollectedCreditPercent: number;
}

type Tone = 'brand' | 'paid' | 'warn' | 'danger';

const DANGER_BELOW = 45;
const WARN_BELOW = 72;
// Every arc uses pathLength=100, so dash values read directly as score points.
const ARC_PATH = 'M 14 100 A 86 86 0 0 1 186 100';
const ZONE_GAP = 1.2;

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

const TONE_DOT: Record<Tone, string> = {
  brand: 'bg-brand dark:bg-brand-bright',
  paid: 'bg-paid dark:bg-paid-bright',
  warn: 'bg-warn dark:bg-warn-bright',
  danger: 'bg-danger dark:bg-danger-bright',
};

// Faint zone colours behind the progress arc (same tokens, low opacity).
const ZONES: ReadonlyArray<{ from: number; to: number; className: string }> = [
  { from: 0, to: DANGER_BELOW, className: 'text-danger/25 dark:text-danger-bright/25' },
  { from: DANGER_BELOW, to: WARN_BELOW, className: 'text-warn/25 dark:text-warn-bright/25' },
  { from: WARN_BELOW, to: 100, className: 'text-paid/25 dark:text-paid-bright/25' },
];

export const FinancialGaugeMeter: FC<FinancialGaugeMeterProps> = ({
  score,
  title = 'مؤشر صحة التدفق النقدي والأرباح',
  cashRatioPercent,
  netMarginPercent,
  uncollectedCreditPercent,
}) => {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  // Zero sales activity detection
  const isZeroActivity = cashRatioPercent === 0 && netMarginPercent === 0 && uncollectedCreditPercent === 0;

  let tone: Tone = 'paid';
  let statusLabel = 'جيد';
  let statusText = 'سيولة وأرباح ممتازة';
  let StatusIcon = ShieldCheck;

  if (isZeroActivity) {
    tone = 'brand';
    statusLabel = 'جاهز';
    statusText = 'جاهز للعمل / في انتظار المبيعات';
  } else if (clampedScore < DANGER_BELOW) {
    tone = 'danger';
    statusLabel = 'خطر';
    statusText = 'تحذير: سيولة حرجة وضغط ديون';
    StatusIcon = ShieldAlert;
  } else if (clampedScore < WARN_BELOW) {
    tone = 'warn';
    statusLabel = 'تحذير';
    statusText = 'وضع تشغيلي متوازن وحذر';
    StatusIcon = AlertTriangle;
  }

  const creditHigh = uncollectedCreditPercent > 30;

  const metrics = [
    {
      key: 'cash',
      label: 'سيولة فورية',
      value: `${cashRatioPercent}%`,
      Icon: Banknote,
      chip: TONE_CHIP.paid,
      valueClass: TONE_TEXT.paid,
    },
    {
      key: 'margin',
      label: 'هامش الصافي',
      value: `${netMarginPercent.toFixed(1)}%`,
      Icon: Percent,
      chip: TONE_CHIP.brand,
      valueClass: TONE_TEXT.brand,
    },
    {
      key: 'credit',
      label: 'ديون معلقة',
      value: `${uncollectedCreditPercent}%`,
      Icon: Hourglass,
      chip: creditHigh ? TONE_CHIP.danger : TONE_CHIP.warn,
      valueClass: creditHigh ? TONE_TEXT.danger : 'text-ink dark:text-ink-dark',
    },
  ];

  return (
    <div className="h-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 sm:p-5 shadow-2xs flex flex-col gap-4 select-none">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center shrink-0">
          <Activity className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h3 className="t-card-title text-ink dark:text-ink-dark leading-snug">{title}</h3>
          <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
            تلخص حالة سيولة المحل وأرباحه الآن
          </p>
        </div>
      </div>

      {/* Semicircle meter */}
      <div className="flex flex-col items-center">
        <div dir="ltr" className="relative w-full max-w-[17rem]">
          <svg viewBox="0 0 200 108" className="w-full h-auto block" role="img" aria-label={`${clampedScore} من 100 - ${statusLabel}`}>
            {ZONES.map((zone) => (
              <path
                key={zone.from}
                d={ARC_PATH}
                pathLength={100}
                fill="none"
                stroke="currentColor"
                strokeWidth={14}
                strokeDasharray={`${zone.to - zone.from - ZONE_GAP} 100`}
                strokeDashoffset={-(zone.from + ZONE_GAP / 2)}
                className={zone.className}
              />
            ))}
            {clampedScore > 0 && (
              <path
                d={ARC_PATH}
                pathLength={100}
                fill="none"
                stroke="currentColor"
                strokeWidth={14}
                strokeLinecap="round"
                strokeDasharray={`${clampedScore} 100`}
                className={`${TONE_TEXT[tone]} transition-all duration-700`}
              />
            )}
          </svg>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
            <div className={`text-4xl font-black tabular-nums leading-none ${TONE_TEXT[tone]}`}>{clampedScore}</div>
            <div className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1">من 100</div>
          </div>
        </div>

        <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${TONE_CHIP[tone]}`}>
          <StatusIcon className="w-4 h-4 shrink-0" />
          <span>{statusLabel}</span>
        </div>
        <p className="mt-1.5 text-sm text-center text-ink-muted dark:text-ink-dark-muted">{statusText}</p>
      </div>

      {/* Zone legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-muted dark:text-ink-dark-muted">
        <span className="inline-flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${TONE_DOT.danger}`} />
          خطر: أقل من {DANGER_BELOW}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${TONE_DOT.warn}`} />
          تحذير: {DANGER_BELOW} إلى {WARN_BELOW - 1}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${TONE_DOT.paid}`} />
          جيد: {WARN_BELOW} فأكثر
        </span>
      </div>

      {/* Supporting metrics */}
      <div className="grid grid-cols-3 gap-2 mt-auto">
        {metrics.map(({ key, label, value, Icon, chip, valueClass }) => (
          <div
            key={key}
            className="rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line/60 dark:border-line-dark/60 px-2 py-3 flex flex-col items-center gap-1.5 text-center"
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${chip}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <div className={`text-lg font-black tabular-nums leading-none ${valueClass}`}>{value}</div>
            <div className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-1.5 text-xs text-ink-muted dark:text-ink-dark-muted">
        <Info className="w-3.5 h-3.5 mt-0.5 text-brand dark:text-brand-bright shrink-0" />
        <span>يُحسب بناءً على تدفق النقد بالدرج، نسبة الأرباح، وانضباط سداد الآجل.</span>
      </div>
    </div>
  );
};
