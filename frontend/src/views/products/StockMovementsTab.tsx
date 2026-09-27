import React from 'react';
import {
  Boxes,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Search,
  X,
  RefreshCw,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import type { StockMovement, StockDiscrepancy } from '../../types/models';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';

export interface StockMovementsTabProps {
  allMovements: StockMovement[];
  discrepancies: StockDiscrepancy[];
  recalculating: boolean;
  recalcSuccessMsg: string | null;
  setRecalcSuccessMsg: (msg: string | null) => void;
  movementTypeFilter: string;
  setMovementTypeFilter: (filter: string) => void;
  movementSearchQuery: string;
  setMovementSearchQuery: (query: string) => void;
  movementsLoading: boolean;
  onRecalculateStock: () => void;
  onLoadMovements: () => void;
}

export const StockMovementsTab: React.FC<StockMovementsTabProps> = ({
  allMovements,
  discrepancies,
  recalculating,
  recalcSuccessMsg,
  setRecalcSuccessMsg,
  movementTypeFilter,
  setMovementTypeFilter,
  movementSearchQuery,
  setMovementSearchQuery,
  movementsLoading,
  onRecalculateStock,
  onLoadMovements,
}) => {
  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden select-none">
      {/* Top Reconciliation Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
        {/* 1. Total Movements Card */}
        <div className="bg-surface p-3.5 rounded-[6px] border border-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-brand-soft text-brand flex items-center justify-center font-bold">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-ink-muted font-bold">إجمالي الحركات المسجلة</div>
              <div className="text-[18px] font-mono font-bold text-ink">{allMovements.length} حركة</div>
            </div>
          </div>
          <span className="text-[10px] text-ink-muted bg-surface-2 px-2 py-0.5 rounded border border-line">
            غير قابلة للتعديل
          </span>
        </div>

        {/* 2. Consistency & Discrepancies Card (Task 34-1) */}
        <div className={`p-3.5 rounded-[6px] border flex items-center justify-between ${
          discrepancies.length > 0 
            ? 'bg-amber-500/10 border-amber-500/30' 
            : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded flex items-center justify-center font-bold ${
              discrepancies.length > 0 ? 'bg-amber-500/20 text-amber-700' : 'bg-emerald-500/20 text-emerald-700'
            }`}>
              {discrepancies.length > 0 ? (
                <AlertTriangle className="w-5 h-5 text-amber-700" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
              )}
            </div>
            <div>
              <div className="text-[11px] font-bold text-ink">مطابقة المخزون الدورية</div>
              <div className={`text-[13px] font-bold ${discrepancies.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {discrepancies.length > 0 
                  ? `${discrepancies.length} صنف به تفاوت بحاجة لمطابقة` 
                  : 'الأرصدة متطابقة بنسبة 100% مع الحركات'}
              </div>
            </div>
          </div>
          {discrepancies.length > 0 && (
            <button
              type="button"
              onClick={onRecalculateStock}
              disabled={recalculating}
              className="px-3 py-1 rounded bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 transition-colors shadow-xs flex items-center gap-1"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
              <span>مطابقة الآن</span>
            </button>
          )}
        </div>

        {/* 3. Reconcile Card (Task 34-3) */}
        <div className="bg-surface p-3.5 rounded-[6px] border border-line flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onRecalculateStock}
            disabled={recalculating}
            className="w-full h-10 px-4 bg-surface-2 hover:bg-surface border border-line text-ink rounded text-[12px] font-bold flex items-center justify-center gap-2 transition-colors shadow-2xs"
            title="أداة تدقيق وإعادة حساب المخزون من الحركات لمعالجة أي تفاوت"
          >
            <RotateCcw className={`w-4 h-4 text-brand ${recalculating ? 'animate-spin' : ''}`} />
            <span>{recalculating ? 'جاري مطابقة وحساب الأرصدة...' : 'إعادة مطابقة وحساب رصيد المخزون'}</span>
          </button>
        </div>
      </div>

      {/* Recalculate Feedback Banner (Auto-dismisses in 3.5s) */}
      {recalcSuccessMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 px-4 py-2.5 rounded-[6px] flex items-center justify-between text-xs font-bold animate-fade-in shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{recalcSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setRecalcSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Movements Toolbar & Filters */}
      <div className="bg-surface hairline-all rounded-[6px] px-3 py-2 flex items-center justify-between gap-3 shrink-0">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-[11.5px]">
          {[
            { id: 'ALL', label: 'كل الحركات' },
            { id: 'INITIAL', label: 'رصيد افتتاحي' },
            { id: 'SALE', label: 'مبيعات' },
            { id: 'PURCHASE', label: 'مشتريات' },
            { id: 'ADJUSTMENT', label: 'تسويات جردية' },
            { id: 'RETURN', label: 'مرتجعات' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMovementTypeFilter(tab.id);
                setTimeout(() => void onLoadMovements(), 50);
              }}
              className={`px-3 py-1 rounded-full font-semibold transition-colors shrink-0 ${
                movementTypeFilter === tab.id
                  ? 'bg-brand text-white shadow-xs'
                  : 'bg-surface-2 text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input for Movements */}
        <div className="relative w-64 h-[34px] flex items-center bg-surface-2 border border-line rounded px-2.5 focus-within:border-brand focus-within:bg-surface">
          <Search className="w-3.5 h-3.5 text-ink-muted ml-2 shrink-0 pointer-events-none" />
          <input
            type="text"
            placeholder="فلترة الحركات بالصنف..."
            value={movementSearchQuery}
            onChange={(e) => setMovementSearchQuery(normalizeArabicNumerals(e.target.value))}
            className="w-full bg-transparent border-none text-[11.5px] text-ink placeholder:text-ink-muted focus:outline-none"
          />
          {movementSearchQuery && (
            <button
              type="button"
              onClick={() => setMovementSearchQuery('')}
              className="text-ink-muted hover:text-ink text-xs"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Movements Data Table */}
      <div className="flex-1 bg-surface hairline-all rounded-[6px] flex flex-col overflow-hidden relative">
        {/* Table Header */}
        <div className="h-[38px] bg-surface-2 hairline-b px-4 grid grid-cols-12 items-center text-[12px] font-bold text-ink-muted shrink-0 select-none">
          <span className="col-span-2">التاريخ والوقت</span>
          <span className="col-span-3">اسم الصنف والباركود</span>
          <span className="col-span-2 text-center">نوع الحركة</span>
          <span className="col-span-2 text-center">الكمية</span>
          <span className="col-span-1 text-left">التكلفة</span>
          <span className="col-span-2">الملاحظات والسبب</span>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-line">
          {movementsLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2 p-6">
              <RefreshCw className="w-8 h-8 animate-spin text-brand" />
              <span className="text-[13px]">جاري تحميل سجل حركات المخزون...</span>
            </div>
          ) : allMovements.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2 p-6">
              <Boxes className="w-12 h-12 stroke-[1.2] text-ink-muted opacity-50" />
              <p className="text-[14px] font-semibold text-ink m-0">لا توجد حركات مخزون مسجلة مطابقة للفلتر</p>
              <p className="text-[12px] text-ink-muted m-0">
                يتم تسجيل الحركات تلقائياً مع البيع وتغيير الأرصدة.
              </p>
            </div>
          ) : (
            allMovements
              .filter((m) => {
                if (!movementSearchQuery.trim()) return true;
                const q = movementSearchQuery.toLowerCase();
                return (
                  (m.productName && m.productName.toLowerCase().includes(q)) ||
                  (m.productBarcode && m.productBarcode.toLowerCase().includes(q)) ||
                  (m.note && m.note.toLowerCase().includes(q))
                );
              })
              .map((m) => {
                const isPositive = m.quantityMilli >= 0;
                const isKg = m.unit === 'kg';
                const qtyUnits = Math.abs(m.quantityMilli / 1000);
                const qtyDisplay = isKg
                  ? `${qtyUnits.toFixed(3).replace(/\.?0+$/, '')} كجم`
                  : `${Math.round(qtyUnits)} ق`;

                let badgeClass = 'bg-surface-2 text-ink-muted border-line';
                if (m.movementType === 'INITIAL') badgeClass = 'bg-blue-500/10 text-blue-700 border-blue-500/20';
                else if (m.movementType === 'SALE') badgeClass = 'bg-red-500/10 text-red-700 border-red-500/20';
                else if (m.movementType === 'PURCHASE') badgeClass = 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
                else if (m.movementType === 'ADJUSTMENT') badgeClass = 'bg-amber-500/10 text-amber-700 border-amber-500/20';
                else if (m.movementType === 'RETURN') badgeClass = 'bg-purple-500/10 text-purple-700 border-purple-500/20';

                const dateFormatted = (() => {
                  try {
                    const d = new Date(m.createdAt);
                    return d.toLocaleDateString('ar-EG-u-nu-latn', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                  } catch {
                    return m.createdAt;
                  }
                })();

                return (
                  <div
                    key={m.id}
                    className="h-[46px] hairline-b px-4 grid grid-cols-12 items-center text-[12px] hover:bg-surface-2 transition-colors"
                  >
                    {/* 1. Date */}
                    <div className="col-span-2 flex items-center gap-1.5 font-mono text-[11.5px] text-ink-muted">
                      <Calendar className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                      <span>{dateFormatted}</span>
                    </div>

                    {/* 2. Product Name & Barcode */}
                    <div className="col-span-3 flex flex-col justify-center truncate pr-1">
                      <span className="font-semibold text-ink truncate text-[12.5px]">{m.productName || 'صنف غير معروف'}</span>
                      {m.productBarcode && (
                        <span className="font-mono text-[10.5px] text-ink-muted">{m.productBarcode}</span>
                      )}
                    </div>

                    {/* 3. Movement Type */}
                    <div className="col-span-2 flex justify-center">
                      <span className={`px-2.5 py-0.5 rounded text-[10.5px] font-bold border ${badgeClass}`}>
                        {m.movementTypeArabic || m.movementType}
                      </span>
                    </div>

                    {/* 4. Signed Quantity */}
                    <div className="col-span-2 flex items-center justify-center font-mono font-bold text-[13px] tabular-nums">
                      <div className={`flex items-center gap-1 ${isPositive ? 'text-paid' : 'text-danger'}`}>
                        {isPositive ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4" />
                        )}
                        <span dir="ltr">{isPositive ? `+${qtyDisplay}` : `-${qtyDisplay}`}</span>
                      </div>
                    </div>

                    {/* 5. Unit Cost */}
                    <span className="col-span-1 text-left font-mono text-ink-muted tabular-nums text-[12px]">
                      {formatArabicCurrency(m.unitCostPiasters)}
                    </span>

                    {/* 6. Note */}
                    <div className="col-span-2 truncate text-[11px] text-ink-muted" title={m.note || ''}>
                      {m.note || <span className="opacity-40">—</span>}
                    </div>
                  </div>
                );
              })
          )}
        </div>

        {/* Table Footer */}
        <div className="h-[32px] bg-surface-2 hairline-t px-4 flex items-center justify-between text-[11px] text-ink-muted shrink-0">
          <span>جميع الحركات مسجلة بقيود ذرية غير قابلة للحذف لضمان سلامة المخزون.</span>
          <span className="font-mono tabular-nums">{allMovements.length} حركة إجمالية</span>
        </div>
      </div>
    </div>
  );
};
