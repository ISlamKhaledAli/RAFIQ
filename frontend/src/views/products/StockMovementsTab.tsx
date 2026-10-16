import React, { useMemo } from 'react';
import {
  Boxes,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Search,
  X,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import type { StockMovement, StockDiscrepancy } from '../../types/models';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import { PaginationBar } from '../../components/PaginationBar';
import { useClientPagination } from '../../utils/usePagination';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';

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
  const showLoading = useSmoothLoading(movementsLoading, 300);
  const filteredMovements = useMemo(() => {
    if (!movementSearchQuery.trim()) return allMovements;
    const q = movementSearchQuery.toLowerCase();
    return allMovements.filter((m) =>
      (m.productName && m.productName.toLowerCase().includes(q)) ||
      (m.productBarcode && m.productBarcode.toLowerCase().includes(q)) ||
      (m.note && m.note.toLowerCase().includes(q))
    );
  }, [allMovements, movementSearchQuery]);

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedItems: pagedMovements,
  } = useClientPagination(filteredMovements, 25, `${movementSearchQuery}_${movementTypeFilter}`);

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden select-none">
      {/* Top Reconciliation Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
        {/* 1. Total Movements Card */}
        <div className="bg-surface dark:bg-surface-dark p-3.5 rounded-[6px] border border-line dark:border-line-dark flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center font-bold">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-bold">إجمالي حركات بضاعة المخزن</div>
              <div className="text-[18px] font-mono font-bold text-ink dark:text-ink-dark">{allMovements.length} حركة</div>
            </div>
          </div>
          <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-2 px-2 py-0.5 rounded border border-line dark:border-line-dark">
            دفتر غير قابل للتعديل
          </span>
        </div>

        {/* 2. Consistency & Discrepancies Card (Task 34-1) */}
        <div className={`p-3.5 rounded-[6px] border flex items-center justify-between ${
          discrepancies.length > 0 
            ? 'bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30' 
            : 'bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded flex items-center justify-center font-bold ${
              discrepancies.length > 0 ? 'bg-warn/20 dark:bg-warn-dark-soft text-warn dark:text-warn-bright' : 'bg-paid/20 dark:bg-paid-dark-soft text-paid dark:text-paid-bright'
            }`}>
              {discrepancies.length > 0 ? (
                <AlertTriangle className="w-5 h-5 text-warn dark:text-warn-bright" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-paid dark:text-paid-bright" />
              )}
            </div>
            <div>
              <div className="text-[11px] font-bold text-ink dark:text-ink-dark">مطابقة وجرد بضاعة المخزن</div>
              <div className={`text-[13px] font-bold ${discrepancies.length > 0 ? 'text-warn dark:text-warn-bright' : 'text-paid dark:text-paid-bright'}`}>
                {discrepancies.length > 0 
                  ? `${discrepancies.length} صنف فيهم فرق جرد ومحتاجين مراجعة` 
                  : 'أرصدة البضاعة متطابقة 100% مع حركة المبيعات والمشتريات'}
              </div>
            </div>
          </div>
          {discrepancies.length > 0 && (
            <button
              type="button"
              onClick={onRecalculateStock}
              disabled={recalculating}
              className="px-3 py-1 rounded bg-warn text-white text-[11px] font-bold hover:bg-warn/90 transition-colors shadow-xs flex items-center gap-1"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
              <span>مطابقة وجرد دلوقتي</span>
            </button>
          )}
        </div>

        {/* 3. Reconcile Card (Task 34-3) */}
        <div className="bg-surface dark:bg-surface-dark p-3.5 rounded-[6px] border border-line dark:border-line-dark flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onRecalculateStock}
            disabled={recalculating}
            className="w-full h-10 px-4 bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded text-[12px] font-bold flex items-center justify-center gap-2 transition-colors shadow-2xs"
            title="أداة تدقيق ومطابقة رصيد المخزن بناءً على حركات البيع والشراء الفعلية"
          >
            <RotateCcw className={`w-4 h-4 text-brand dark:text-brand-bright ${recalculating ? 'animate-spin' : ''}`} />
            <span>{recalculating ? 'جاري مراجعة ومطابقة رصيد المخزن...' : 'إعادة مطابقة وحساب رصيد البضاعة بالمخزن'}</span>
          </button>
        </div>
      </div>

      {/* Recalculate Feedback Banner (Auto-dismisses in 3.5s) */}
      {recalcSuccessMsg && (
        <div className="bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-emerald-800/40 text-paid dark:text-paid-bright px-4 py-2.5 rounded-[6px] flex items-center justify-between text-xs font-bold animate-fade-in shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-paid dark:text-paid-bright" />
            <span>{recalcSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setRecalcSuccessMsg(null)}
            className="text-paid dark:text-paid-bright hover:text-ink dark:hover:text-ink-dark p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Movements Toolbar & Filters */}
      <div className="bg-surface dark:bg-surface-dark hairline-all rounded-[6px] px-3 py-2 flex items-center justify-between gap-3 shrink-0">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-[11.5px]">
          {[
            { id: 'ALL', label: 'كل الحركات' },
            { id: 'INITIAL', label: 'رصيد أول المدة' },
            { id: 'SALE', label: 'مبيعات للزبائن' },
            { id: 'PURCHASE', label: 'مشتريات من الموردين' },
            { id: 'ADJUSTMENT', label: 'تسوية جرد وعدّ المخزن' },
            { id: 'RETURN', label: 'مرتجعات بضاعة' },
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
                  : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input for Movements */}
        <div className="relative w-64 h-[34px] flex items-center bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded px-2.5 focus-within:border-brand dark:focus-within:border-brand-bright focus-within:bg-surface dark:focus-within:bg-surface-dark">
          <Search className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted ml-2 shrink-0 pointer-events-none" />
          <input
            type="text"
            placeholder="دور في حركات البضاعة..."
            value={movementSearchQuery}
            onChange={(e) => setMovementSearchQuery(normalizeArabicNumerals(e.target.value))}
            className="w-full bg-transparent border-none text-[11.5px] text-ink dark:text-ink-dark placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted focus:outline-none"
          />
          {movementSearchQuery && (
            <button
              type="button"
              onClick={() => setMovementSearchQuery('')}
              className="text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark text-xs"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Movements Data Table */}
      <div className="flex-1 bg-surface dark:bg-surface-dark hairline-all rounded-[6px] flex flex-col overflow-hidden relative">
        {/* Table Header */}
        <div className="h-[38px] bg-surface-2 dark:bg-surface-dark-2 hairline-b px-4 grid grid-cols-12 items-center text-[12px] font-bold text-ink-muted dark:text-ink-dark-muted shrink-0 select-none">
          <span className="col-span-2">التاريخ والوقت</span>
          <span className="col-span-3">اسم الصنف والباركود</span>
          <span className="col-span-2 text-center">نوع الحركة</span>
          <span className="col-span-2 text-center">الكمية (وارد / صادر)</span>
          <span className="col-span-1 text-left">سعر التكلفة</span>
          <span className="col-span-2">الملاحظات والسبب</span>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-line dark:divide-line-dark">
          {showLoading ? (
            <RafiqLoadingState
              label="جاري تحميل دفتر حركات بضاعة المخزن..."
              sublabel="استرجاع عمليات البيع والشراء وتسويات الجرد ومطابقة الأرصدة"
            />
          ) : filteredMovements.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2 p-6">
              <Boxes className="w-12 h-12 stroke-[1.2] text-ink-muted dark:text-ink-dark-muted opacity-50" />
              <p className="text-[14px] font-semibold text-ink dark:text-ink-dark m-0">مافيش حركات مسجلة للبضاعة مطابقة للبحث أو للفلتر ده</p>
              <p className="text-[12px] text-ink-muted dark:text-ink-dark-muted m-0">
                حركات المخزن بتتسجل تلقائياً مع كل فاتورة بيع أو شراء أو تسوية جرد.
              </p>
            </div>
          ) : (
            pagedMovements.map((m) => {
              const isPositive = m.quantityMilli >= 0;
              const isKg = m.unit === 'kg';
              const qtyUnits = Math.abs(m.quantityMilli / 1000);
              const qtyDisplay = isKg
                ? `${qtyUnits.toFixed(3).replace(/\.?0+$/, '')} كجم`
                : `${Math.round(qtyUnits)} ق`;

              let badgeClass = 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-line dark:border-line-dark';
              if (m.movementType === 'INITIAL') badgeClass = 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand/20 dark:border-brand-bright/30';
              else if (m.movementType === 'SALE') badgeClass = 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30';
              else if (m.movementType === 'PURCHASE') badgeClass = 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid-border dark:border-emerald-800/40';
              else if (m.movementType === 'ADJUSTMENT') badgeClass = 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn-border dark:border-warn-bright/30';
              else if (m.movementType === 'RETURN') badgeClass = 'bg-surface-2 dark:bg-surface-dark-2 text-brand dark:text-brand-bright border-brand/30 dark:border-brand-bright/30';

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
                  className="h-[46px] hairline-b px-4 grid grid-cols-12 items-center text-[12px] hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors"
                >
                  {/* 1. Date */}
                  <div className="col-span-2 flex items-center gap-1.5 font-mono text-[11.5px] text-ink-muted dark:text-ink-dark-muted">
                    <Calendar className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted shrink-0" />
                    <span>{dateFormatted}</span>
                  </div>

                  {/* 2. Product Name & Barcode */}
                  <div className="col-span-3 flex flex-col justify-center truncate pr-1">
                    <span className="font-semibold text-ink dark:text-ink-dark truncate text-[12.5px]">{m.productName || 'صنف غير معروف'}</span>
                    {m.productBarcode && (
                      <span className="font-mono text-[10.5px] text-ink-muted dark:text-ink-dark-muted">{m.productBarcode}</span>
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
                    <div className={`flex items-center gap-1 ${isPositive ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                      {isPositive ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowDownLeft className="w-4 h-4" />
                      )}
                      <span dir="ltr">{isPositive ? `+${qtyDisplay}` : `-${qtyDisplay}`}</span>
                    </div>
                  </div>

                  {/* 5. Unit Cost */}
                  <span className="col-span-1 text-left font-mono text-ink-muted dark:text-ink-dark-muted tabular-nums text-[12px]">
                    {formatArabicCurrency(m.unitCostPiasters)}
                  </span>

                  {/* 6. Note */}
                  <div className="col-span-2 truncate text-[11px] text-ink-muted dark:text-ink-dark-muted" title={m.note || ''}>
                    {m.note || <span className="opacity-40">—</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Table Footer */}
        <div className="h-[32px] bg-surface-2 dark:bg-surface-dark-2 hairline-t px-4 flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-dark-muted shrink-0">
          <span>كل حركة بضاعة متسجلة تلقائياً بدون إمكانية للحذف لحماية المخزن من أي عجز أو تلاعب.</span>
        </div>
      </div>

      {/* Pagination Bar */}
      <PaginationBar
        currentPage={currentPage}
        pageSize={pageSize}
        totalCount={filteredMovements.length}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[25, 50, 100]}
        itemLabel="حركة بضاعة"
      />
    </div>
  );
};
