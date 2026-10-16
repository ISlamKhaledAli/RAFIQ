import type { FC } from 'react';
import { 
  ArrowLeft, 
  TrendingUp, 
  Minus, 
  DollarSign, 
  Layers, 
  AlertTriangle,
  Wallet,
  Sparkles
} from 'lucide-react';
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

  const getWidthPercent = (val: number) => {
    if (val <= 0 || grossSalesPiasters <= 0) return 0;
    return Math.min(100, Math.max(2, Math.round((Math.abs(val) * 100) / baseValue)));
  };

  const netMargin = grossSalesPiasters > 0 
    ? ((netProfitPiasters * 100) / grossSalesPiasters).toFixed(1) 
    : '0.0';

  return (
    <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs select-none">
      {/* Title & Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-line/60 dark:border-line-dark/60">
        <div>
          <div className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
            <h3 className="text-sm font-bold text-ink dark:text-ink-dark">شلال تدفق الأموال: كيف تحول الإيراد لصافي ربح؟</h3>
          </div>
          <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
            تتبع دقيق لكل خصم وتكلفة من أول جنيه دفعه الزبون حتى ما تبقى في جيبك
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="px-2.5 py-1 rounded-lg bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20 dark:border-paid/40 text-xs font-bold font-mono flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>صافي الهامش: {netMargin}%</span>
          </div>
        </div>
      </div>

      {/* Waterfall Visual Blocks */}
      <div className="mt-4 space-y-3">
        {/* Step 1: Gross Sales */}
        <div className="group p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-slate-100/70 dark:hover:bg-surface-dark-2/80 border border-line/50 dark:border-line-dark/50 transition-all">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center font-bold">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-ink dark:text-ink-dark">1. إجمالي مبيعات المتجر</span>
                <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted mr-1.5">(100% رأس النهر)</span>
              </div>
            </div>
            <div className="font-mono font-bold text-sm text-ink dark:text-ink-dark tabular-nums">
              {formatArabicCurrency(grossSalesPiasters)}
            </div>
          </div>
          <div className="w-full h-3 bg-line/40 dark:bg-line-dark/40 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-brand dark:bg-brand-bright rounded-full transition-all duration-500" 
              style={{ width: `${grossSalesPiasters > 0 ? 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Step 2: Returns Deductions */}
        <div className="group p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-slate-100/70 dark:hover:bg-surface-dark-2/80 border border-line/50 dark:border-line-dark/50 transition-all mr-3 border-r-2 border-r-danger dark:border-r-danger-bright">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright flex items-center justify-center font-bold">
                <Minus className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-ink dark:text-ink-dark">2. مرتجعات الزبائن المستردة</span>
                <span className="text-[10px] text-danger dark:text-danger-bright mr-1.5 font-mono">
                  ({returnsPiasters > 0 && grossSalesPiasters > 0 ? `-${((returnsPiasters * 100) / grossSalesPiasters).toFixed(1)}%` : '0%'})
                </span>
              </div>
            </div>
            <div className="font-mono font-bold text-sm text-danger dark:text-danger-bright tabular-nums">
              {returnsPiasters > 0 ? `- ${formatArabicCurrency(returnsPiasters)}` : formatArabicCurrency(0)}
            </div>
          </div>
          <div className="w-full h-3 bg-line/40 dark:bg-line-dark/40 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-danger dark:bg-danger-bright rounded-full transition-all duration-500" 
              style={{ width: `${getWidthPercent(returnsPiasters)}%` }}
            />
          </div>
        </div>

        {/* Step 3: Net Sales */}
        <div className="group p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-slate-100/70 dark:hover:bg-surface-dark-2/80 border border-line/50 dark:border-line-dark/50 transition-all">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-emerald-100 dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center font-bold">
                <ArrowLeft className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-ink dark:text-ink-dark">3. صافي المبيعات الفعلي</span>
                <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted mr-1.5">(بعد خروج المرتجع)</span>
              </div>
            </div>
            <div className="font-mono font-bold text-sm text-brand-dark dark:text-brand-bright tabular-nums">
              {formatArabicCurrency(netSalesPiasters)}
            </div>
          </div>
          <div className="w-full h-3 bg-line/40 dark:bg-line-dark/40 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-paid-border dark:bg-paid rounded-full transition-all duration-500" 
              style={{ width: `${getWidthPercent(netSalesPiasters)}%` }}
            />
          </div>
        </div>

        {/* Step 4: COGS (Cost of Goods Sold) */}
        <div className="group p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-slate-100/70 dark:hover:bg-surface-dark-2/80 border border-line/50 dark:border-line-dark/50 transition-all mr-3 border-r-2 border-r-slate-400 dark:border-r-slate-600">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-slate-200 dark:bg-slate-800 text-ink-muted dark:text-ink-dark-muted flex items-center justify-center font-bold">
                <Minus className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-ink dark:text-ink-dark">4. تكلفة شراء البضاعة المباعة</span>
                <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted mr-1.5 font-mono">
                  ({grossSalesPiasters > 0 && cogsPiasters > 0 ? ((cogsPiasters * 100) / grossSalesPiasters).toFixed(1) : 0}% للموردين والشركات)
                </span>
              </div>
            </div>
            <div className="font-mono font-bold text-sm text-ink-muted dark:text-ink-dark-muted tabular-nums">
              {cogsPiasters > 0 ? `- ${formatArabicCurrency(cogsPiasters)}` : formatArabicCurrency(0)}
            </div>
          </div>
          <div className="w-full h-3 bg-line/40 dark:bg-line-dark/40 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-slate-500 dark:bg-slate-600 rounded-full transition-all duration-500" 
              style={{ width: `${getWidthPercent(cogsPiasters)}%` }}
            />
          </div>
        </div>

        {/* Step 5: Gross Margin */}
        <div className="group p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-slate-100/70 dark:hover:bg-surface-dark-2/80 border border-line/50 dark:border-line-dark/50 transition-all">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright flex items-center justify-center font-bold">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-ink dark:text-ink-dark">5. مجمل ربح البيع (Gross Margin)</span>
                <span className="text-[10px] text-paid dark:text-paid-bright mr-1.5 font-mono">
                  (فارق سعر البيع عن سعر الشراء)
                </span>
              </div>
            </div>
            <div className="font-mono font-bold text-sm text-paid dark:text-paid-bright tabular-nums">
              {formatArabicCurrency(grossProfitPiasters)}
            </div>
          </div>
          <div className="w-full h-3 bg-line/40 dark:bg-line-dark/40 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-paid dark:bg-paid-bright rounded-full transition-all duration-500" 
              style={{ width: `${getWidthPercent(grossProfitPiasters)}%` }}
            />
          </div>
        </div>

        {/* Step 6: Shrinkage and inventory loss */}
        {inventoryLossPiasters > 0 && (
          <div className="group p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-slate-100/70 dark:hover:bg-surface-dark-2/80 border border-line/50 dark:border-line-dark/50 transition-all mr-3 border-r-2 border-r-warn dark:border-r-warn-bright">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright flex items-center justify-center font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-ink dark:text-ink-dark">6. فاقد وعجز الجرد والتوالف</span>
                  <span className="text-[10px] text-warn dark:text-warn-bright mr-1.5 font-mono">
                    (توالف + عجز جرد مخزني)
                  </span>
                </div>
              </div>
              <div className="font-mono font-bold text-sm text-warn dark:text-warn-bright tabular-nums">
                - {formatArabicCurrency(inventoryLossPiasters)}
              </div>
            </div>
            <div className="w-full h-3 bg-line/40 dark:bg-line-dark/40 rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-warn dark:bg-warn-bright rounded-full transition-all duration-500" 
                style={{ width: `${getWidthPercent(inventoryLossPiasters)}%` }}
              />
            </div>
          </div>
        )}

        {/* Step 6b: Operational Expenses */}
        {operationalExpensesPiasters > 0 && (
          <div className="group p-2.5 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-slate-100/70 dark:hover:bg-surface-dark-2/80 border border-line/50 dark:border-line-dark/50 transition-all mr-3 border-r-2 border-r-warn dark:border-r-warn-bright">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright flex items-center justify-center font-bold">
                  <Minus className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-ink dark:text-ink-dark">المصروفات التشغيلية والنثرية</span>
                  <span className="text-[10px] text-warn dark:text-warn-bright mr-1.5 font-mono">
                    (إيجار، فواتير، مرتبات، بوفيه، نثريات)
                  </span>
                </div>
              </div>
              <div className="font-mono font-bold text-sm text-warn dark:text-warn-bright tabular-nums">
                - {formatArabicCurrency(operationalExpensesPiasters)}
              </div>
            </div>
            <div className="w-full h-3 bg-line/40 dark:bg-line-dark/40 rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-warn dark:bg-warn-bright rounded-full transition-all duration-500" 
                style={{ width: `${getWidthPercent(operationalExpensesPiasters)}%` }}
              />
            </div>
          </div>
        )}

        {/* Step 7: Final Net Profit in Pocket */}
        <div className="p-3.5 rounded-xl bg-paid-soft/80 dark:bg-paid-dark-soft/80 border-2 border-paid dark:border-paid-bright shadow-sm transition-all">
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-paid dark:bg-paid-bright text-white dark:text-surface-dark flex items-center justify-center font-black shadow-2xs">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-black text-paid dark:text-paid-bright">7. صافي الربح الحقيقي في يد التاجر</span>
                <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
                  المبلغ الصافي المتبقي بعد التكلفة والمرتجعات والمصروفات وعجز الجرد
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono font-black text-lg text-paid dark:text-paid-bright tabular-nums">
                {formatArabicCurrency(netProfitPiasters)}
              </div>
              <div className="text-[10px] text-paid dark:text-paid-bright font-bold">
                {netMargin}% من إجمالي المبيعات
              </div>
            </div>
          </div>
          <div className="w-full h-3.5 bg-white/80 dark:bg-surface-dark/80 rounded-full overflow-hidden flex p-0.5 border border-paid/20 dark:border-paid/40">
            <div 
              className="h-full bg-paid dark:bg-paid-bright rounded-full transition-all duration-700 shadow-2xs" 
              style={{ width: `${netProfitPiasters > 0 ? getWidthPercent(netProfitPiasters) : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
