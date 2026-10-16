import type { FC } from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, TrendingUp, Info } from 'lucide-react';

export interface FinancialGaugeMeterProps {
  score: number; // 0 to 100
  title?: string;
  cashRatioPercent: number;
  netMarginPercent: number;
  uncollectedCreditPercent: number;
}

export const FinancialGaugeMeter: FC<FinancialGaugeMeterProps> = ({
  score,
  title = 'مؤشر صحة التدفق النقدي والأرباح',
  cashRatioPercent,
  netMarginPercent,
  uncollectedCreditPercent,
}) => {
  // Clamped score between 0 and 100
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  // Gauge angles: Semi-circle from -90 deg (far-left/0%) to +90 deg (far-right/100%).
  // The needle polygon points straight up (12 o'clock, 50%) at angle = 0 deg.
  const angle = -90 + (clampedScore / 100) * 180;

  // Zero sales activity detection
  const isZeroActivity = cashRatioPercent === 0 && netMarginPercent === 0 && uncollectedCreditPercent === 0;

  // Status diagnosis
  let statusText = 'سيولة وأرباح ممتازة';
  let StatusIcon = ShieldCheck;

  if (isZeroActivity) {
    statusText = 'جاهز للعمل / في انتظار المبيعات';
    StatusIcon = ShieldCheck;
  } else if (clampedScore < 45) {
    statusText = 'تحذير: سيولة حرجة وضغط ديون';
    StatusIcon = ShieldAlert;
  } else if (clampedScore < 72) {
    statusText = 'وضع تشغيلي متوازن وحذر';
    StatusIcon = AlertTriangle;
  }

  return (
    <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs flex flex-col justify-between select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-line/60 dark:border-line-dark/60">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-brand dark:text-brand-bright" />
          <h3 className="text-sm font-bold text-ink dark:text-ink-dark">{title}</h3>
        </div>
        <div className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
          isZeroActivity ? 'bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright' :
          clampedScore < 45 ? 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright' :
          clampedScore < 72 ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright' :
          'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
        }`}>
          <StatusIcon className="w-3.5 h-3.5" />
          <span>{statusText}</span>
        </div>
      </div>

      {/* 3D-Styled Pure SVG Semi-Circular Gauge */}
      <div className="relative flex flex-col items-center justify-center my-3">
        <svg viewBox="0 0 200 115" className="w-52 h-28 overflow-visible">
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#B23A2E" />    {/* Danger red */}
              <stop offset="45%" stopColor="#B3720E" />   {/* Warning amber */}
              <stop offset="80%" stopColor="#006D41" />   {/* Paid green */}
              <stop offset="100%" stopColor="#004D3F" />  {/* Deep brand */}
            </linearGradient>
            <filter id="gaugeShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Background Track */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="#DCE1DC"
            strokeWidth="14"
            strokeLinecap="round"
            className="stroke-[#DCE1DC] dark:stroke-[#2A3532]"
          />

          {/* Colored Gradient Arc */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="14"
            strokeLinecap="round"
            filter="url(#gaugeShadow)"
          />

          {/* Scale Tick Marks */}
          <line x1="20" y1="100" x2="28" y2="100" stroke="#94A3B8" strokeWidth="2" />
          <line x1="100" y1="20" x2="100" y2="28" stroke="#94A3B8" strokeWidth="2" />
          <line x1="180" y1="100" x2="172" y2="100" stroke="#94A3B8" strokeWidth="2" />

          {/* Center Pivot Base */}
          <circle cx="100" cy="100" r="10" fill="#0F172A" className="fill-[#0F172A] dark:fill-[#E6ECEA]" />
          <circle cx="100" cy="100" r="5" fill="#FFFFFF" className="fill-[#FFFFFF] dark:fill-[#151B1A]" />

          {/* Dynamic Gauge Needle with Smooth Transition */}
          <g
            transform={`rotate(${angle} 100 100)`}
            style={{ transition: 'transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
          >
            <polygon
              points="97,100 103,100 100,28"
              fill="#0F172A"
              filter="url(#gaugeShadow)"
              className="fill-[#0F172A] dark:fill-[#E6ECEA]"
            />
            <circle cx="100" cy="30" r="3" fill="#006D41" />
          </g>
        </svg>

        {/* Center Score Readout */}
        <div className="text-center -mt-3">
          <div className="text-2xl font-black font-mono text-ink dark:text-ink-dark tracking-tight">
            {clampedScore}
            <span className="text-xs font-normal text-ink-muted dark:text-ink-dark-muted mr-0.5">/100</span>
          </div>
          <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted font-medium">مستوى الأمان المالي اللحظي</div>
        </div>
      </div>

      {/* Sub-metrics breakdown */}
      <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-line/60 dark:border-line-dark/60 text-center text-xs">
        <div className="p-1.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2">
          <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted">سيولة فورية</div>
          <div className="font-mono font-bold text-paid dark:text-paid-bright mt-0.5">{cashRatioPercent}%</div>
        </div>
        <div className="p-1.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2">
          <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted">هامش الصافي</div>
          <div className="font-mono font-bold text-brand dark:text-brand-bright mt-0.5">{netMarginPercent.toFixed(1)}%</div>
        </div>
        <div className="p-1.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2">
          <div className="text-[10px] text-ink-muted dark:text-ink-dark-muted">ديون معلقة</div>
          <div className={`font-mono font-bold mt-0.5 ${uncollectedCreditPercent > 30 ? 'text-danger dark:text-danger-bright' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
            {uncollectedCreditPercent}%
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1 text-[10px] text-ink-muted dark:text-ink-dark-muted">
        <Info className="w-3 h-3 text-brand dark:text-brand-bright shrink-0" />
        <span>يُحسب بناءً على تدفق النقد بالدرج، نسبة الأرباح، وانضباط سداد الآجل.</span>
      </div>
    </div>
  );
};
