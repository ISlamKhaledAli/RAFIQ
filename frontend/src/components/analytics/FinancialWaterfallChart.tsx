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
  netProfitPiasters: number;
}

export const FinancialWaterfallChart: FC<FinancialWaterfallChartProps> = ({
  grossSalesPiasters,
  returnsPiasters,
  netSalesPiasters,
  cogsPiasters,
  grossProfitPiasters,
  inventoryLossPiasters,
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
    <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs select-none">
      {/* Title & Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-line/60">
        <div>
          <div className="flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-brand" />
            <h3 className="text-sm font-bold text-ink">شلال تدفق الأموال: كيف تحول الإيراد لصافي ربح؟</h3>
          </div>
          <p className="text-xs text-ink-muted mt-0.5">
            تتبع دقيق لكل خصم وتكلفة من أول جنيه دفعه الزبون حتى ما تبقى في جيبك
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="px-2.5 py-1 rounded-lg bg-paid-soft text-paid border border-paid/20 text-xs font-bold font-mono flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>صافي الهامش: {netMargin}%</span>
          </div>
        </div>
      </div>

      {/* Waterfall Visual Blocks */}
      <div className="mt-4 space-y-3">
        {/* Step 1: Gross Sales */}
        <div className="group p-2.5 rounded-lg bg-surface-2 hover:bg-slate-100/70 border border-line/50 transition-all">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-brand-soft text-brand flex items-center justify-center font-bold">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-ink">1. إجمالي مبيعات المتجر</span>
                <span className="text-[10px] text-ink-muted mr-1.5">(100% رأس النهر)</span>
              </div>
            </div>
            <div className="font-mono font-bold text-sm text-ink tabular-nums">
              {formatArabicCurrency(grossSalesPiasters)}
            </div>
          </div>
          <div className="w-full h-3 bg-line/40 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-brand rounded-full transition-all duration-500" 
              style={{ width: `${grossSalesPiasters > 0 ? 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Step 2: Returns Deductions */}
        <div className="group p-2.5 rounded-lg bg-surface-2 hover:bg-slate-100/70 border border-line/50 transition-all mr-3 border-r-2 border-r-danger">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-red-100 text-danger flex items-center justify-center font-bold">
                <Minus className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-ink">2. مرتجعات الزبائن المستردة</span>
                <span className="text-[10px] text-danger mr-1.5 font-mono">
                  ({returnsPiasters > 0 && grossSalesPiasters > 0 ? `-${((returnsPiasters * 100) / grossSalesPiasters).toFixed(1)}%` : '0%'})
                </span>
              </div>
            </div>
            <div className="font-mono font-bold text-sm text-danger tabular-nums">
              {returnsPiasters > 0 ? `- ${formatArabicCurrency(returnsPiasters)}` : formatArabicCurrency(0)}
            </div>
          </div>
          <div className="w-full h-3 bg-line/40 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-danger rounded-full transition-all duration-500" 
              style={{ width: `${getWidthPercent(returnsPiasters)}%` }}
            />
          </div>
        </div>

        {/* Step 3: Net Sales */}
        <div className="group p-2.5 rounded-lg bg-surface-2 hover:bg-slate-100/70 border border-line/50 transition-all">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-emerald-100 text-paid flex items-center justify-center font-bold">
                <ArrowLeft className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-ink">3. صافي المبيعات الفعلي</span>
                <span className="text-[10px] text-ink-muted mr-1.5">(بعد خروج المرتجع)</span>
              </div>
            </div>
            <div className="font-mono font-bold text-sm text-brand-dark tabular-nums">
              {formatArabicCurrency(netSalesPiasters)}
            </div>
          </div>
          <div className="w-full h-3 bg-line/40 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-paid-border rounded-full transition-all duration-500" 
              style={{ width: `${getWidthPercent(netSalesPiasters)}%` }}
            />
          </div>
        </div>

        {/* Step 4: COGS (Cost of Goods Sold) */}
        <div className="group p-2.5 rounded-lg bg-surface-2 hover:bg-slate-100/70 border border-line/50 transition-all mr-3 border-r-2 border-r-slate-400">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-slate-200 text-ink-muted flex items-center justify-center font-bold">
                <Minus className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-ink">4. تكلفة شراء البضاعة المباعة</span>
                <span className="text-[10px] text-ink-muted mr-1.5 font-mono">
                  ({grossSalesPiasters > 0 && cogsPiasters > 0 ? ((cogsPiasters * 100) / grossSalesPiasters).toFixed(1) : 0}% للموردين والشركات)
                </span>
              </div>
            </div>
            <div className="font-mono font-bold text-sm text-ink-muted tabular-nums">
              {cogsPiasters > 0 ? `- ${formatArabicCurrency(cogsPiasters)}` : formatArabicCurrency(0)}
            </div>
          </div>
          <div className="w-full h-3 bg-line/40 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-slate-500 rounded-full transition-all duration-500" 
              style={{ width: `${getWidthPercent(cogsPiasters)}%` }}
            />
          </div>
        </div>

        {/* Step 5: Gross Margin */}
        <div className="group p-2.5 rounded-lg bg-surface-2 hover:bg-slate-100/70 border border-line/50 transition-all">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-paid-soft text-paid flex items-center justify-center font-bold">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-bold text-ink">5. مجمل ربح البيع (Gross Margin)</span>
                <span className="text-[10px] text-paid mr-1.5 font-mono">
                  (فارق سعر البيع عن سعر الشراء)
                </span>
              </div>
            </div>
            <div className="font-mono font-bold text-sm text-paid tabular-nums">
              {formatArabicCurrency(grossProfitPiasters)}
            </div>
          </div>
          <div className="w-full h-3 bg-line/40 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-paid rounded-full transition-all duration-500" 
              style={{ width: `${getWidthPercent(grossProfitPiasters)}%` }}
            />
          </div>
        </div>

        {/* Step 6: Shrinkage and inventory loss */}
        {inventoryLossPiasters > 0 && (
          <div className="group p-2.5 rounded-lg bg-surface-2 hover:bg-slate-100/70 border border-line/50 transition-all mr-3 border-r-2 border-r-warn">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-100 text-warn flex items-center justify-center font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-ink">6. فاقد وعجز الجرد والتوالف</span>
                  <span className="text-[10px] text-warn mr-1.5 font-mono">
                    (توالف + عجز جرد مخزني)
                  </span>
                </div>
              </div>
              <div className="font-mono font-bold text-sm text-warn tabular-nums">
                - {formatArabicCurrency(inventoryLossPiasters)}
              </div>
            </div>
            <div className="w-full h-3 bg-line/40 rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-warn rounded-full transition-all duration-500" 
                style={{ width: `${getWidthPercent(inventoryLossPiasters)}%` }}
              />
            </div>
          </div>
        )}

        {/* Step 7: Final Net Profit in Pocket */}
        <div className="p-3.5 rounded-xl bg-paid-soft/80 border-2 border-paid shadow-sm transition-all">
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-paid text-white flex items-center justify-center font-black shadow-2xs">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-black text-paid">7. صافي الربح الحقيقي في يد التاجر</span>
                <div className="text-[11px] text-ink-muted">
                  المبلغ الصافي الخالي من التكلفة والمرتجعات وعجز الجرد
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono font-black text-lg text-paid tabular-nums">
                {formatArabicCurrency(netProfitPiasters)}
              </div>
              <div className="text-[10px] text-paid font-bold">
                {netMargin}% من إجمالي المبيعات
              </div>
            </div>
          </div>
          <div className="w-full h-3.5 bg-white/80 rounded-full overflow-hidden flex p-0.5 border border-paid/20">
            <div 
              className="h-full bg-paid rounded-full transition-all duration-700 shadow-2xs" 
              style={{ width: `${netProfitPiasters > 0 ? getWidthPercent(netProfitPiasters) : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
