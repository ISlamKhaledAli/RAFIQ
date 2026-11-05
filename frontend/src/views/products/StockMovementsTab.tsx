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

/** Shared column template so the header and every row line up; fixed gaps keep the last columns apart. */
const MOVEMENTS_GRID =
  'grid grid-cols-[minmax(7.75rem,1.3fr)_minmax(0,2.6fr)_minmax(6rem,1.1fr)_minmax(6.5rem,1.2fr)_minmax(5rem,1fr)_minmax(0,2fr)] gap-x-4';

const MOVEMENT_TYPE_FILTERS = [
  { id: 'ALL', label: 'كل الحركات' },
  { id: 'INITIAL', label: 'رصيد أول المدة' },
  { id: 'SALE', label: 'مبيعات للزبائن' },
  { id: 'PURCHASE', label: 'مشتريات من الموردين' },
  { id: 'ADJUSTMENT', label: 'تسوية جرد وعدّ المخزن' },
  { id: 'RETURN', label: 'مرتجعات بضاعة' },
];

const MOVEMENTS_PAGE_SIZE_OPTIONS = [25, 50, 100];

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
        <div className="bg-surface dark:bg-surface-dark p-4 rounded-2xl border border-line dark:border-line-dark flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center font-bold">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="text-micro text-ink-muted dark:text-ink-dark-muted font-bold">إجمالي حركات بضاعة المخزن</div>
              <div className="text-lg font-mono font-bold text-ink dark:text-ink-dark">{allMovements.length} حركة</div>
            </div>
          </div>
        </div>

        {/* 2. Consistency & Discrepancies Card (Task 34-1) */}
        <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
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
              <div className="text-micro font-bold text-ink dark:text-ink-dark">مطابقة وجرد بضاعة المخزن</div>
              <div className={`text-sm font-bold ${discrepancies.length > 0 ? 'text-warn dark:text-warn-bright' : 'text-paid dark:text-paid-bright'}`}>
                {discrepancies.length > 0 
                  ? `${discrepancies.length} صنف فيهم فرق جرد ومحتاجين مراجعة` 
                  : 'أرصدة البضاعة متطابقة 100% مع حركة المبيعات والمشتريات'}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Reconcile Card (Task 34-3) */}
        <div className="bg-surface dark:bg-surface-dark p-4 rounded-2xl border border-line dark:border-line-dark flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onRecalculateStock}
            disabled={recalculating}
            className="w-full h-10 px-4 bg-surface-2 dark:bg-surface-dark-2 hover:bg-surface dark:hover:bg-surface-dark border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-2xs"
            title="أداة تدقيق ومطابقة رصيد المخزن بناءً على حركات البيع والشراء الفعلية"
          >
            <RotateCcw className={`w-4 h-4 text-brand dark:text-brand-bright ${recalculating ? 'animate-spin' : ''}`} />
            <span>{recalculating ? 'جاري مراجعة ومطابقة رصيد المخزن...' : 'إعادة مطابقة وحساب رصيد البضاعة بالمخزن'}</span>
          </button>
        </div>
      </div>

      {/* Recalculate Feedback Banner (Auto-dismisses in 3.5s) */}
      {recalcSuccessMsg && (
        <div className="bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright px-4 py-2.5 rounded-xl flex items-center justify-between text-xs font-bold animate-fade-in shrink-0">
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
      <div className="bg-surface dark:bg-surface-dark hairline-all rounded-2xl p-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 shrink-0">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {MOVEMENT_TYPE_FILTERS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMovementTypeFilter(tab.id);
                setTimeout(() => void onLoadMovements(), 50);
              }}
              className={`h-9 px-3.5 rounded-full font-semibold transition-colors shrink-0 cursor-pointer ${
                movementTypeFilter === tab.id
                  ? 'bg-brand text-white dark:bg-brand-dark-soft dark:text-brand-bright dark:ring-1 dark:ring-inset dark:ring-brand-bright/40 shadow-xs'
                  : 'bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input for Movements */}
        <div className="relative w-full sm:w-72 h-10 flex items-center bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3 focus-within:border-brand dark:focus-within:border-brand-bright focus-within:bg-surface dark:focus-within:bg-surface-dark">
          <Search className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted ml-2 shrink-0 pointer-events-none" />
          <input
            type="text"
            placeholder="دور في حركات البضاعة..."
            value={movementSearchQuery}
            onChange={(e) => setMovementSearchQuery(normalizeArabicNumerals(e.target.value))}
            className="w-full bg-transparent border-none text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted focus:outline-none"
          />
          {movementSearchQuery && (
            <button
              type="button"
              onClick={() => setMovementSearchQuery('')}
              aria-label="مسح نص البحث"
              className="text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark text-xs cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Movements Data Table */}
      <div className="flex-1 bg-surface dark:bg-surface-dark hairline-all rounded-2xl flex flex-col overflow-hidden relative">
        {/* Table Header */}
        <div className={`h-10 bg-surface-2 dark:bg-surface-dark-2 hairline-b px-4 ${MOVEMENTS_GRID} items-center text-xs font-bold text-ink-muted dark:text-ink-dark-muted shrink-0 select-none`}>
          <span>التاريخ والوقت</span>
          <span>اسم الصنف والباركود</span>
          <span className="text-center">نوع الحركة</span>
          <span className="text-center">الكمية (وارد / صادر)</span>
          <span className="text-center">سعر التكلفة</span>
          <span>الملاحظات</span>
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
              <p className="text-sm font-semibold text-ink dark:text-ink-dark m-0">مافيش حركات مسجلة للبضاعة مطابقة للبحث أو للفلتر ده</p>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0">
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
              else if (m.movementType === 'PURCHASE') badgeClass = 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid-border dark:border-paid-dark-border';
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
                  className={`h-[48px] hairline-b px-4 ${MOVEMENTS_GRID} items-center text-xs hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors`}
                >
                  {/* 1. Date */}
                  <div className="flex items-center gap-1.5 font-mono text-micro text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">
                    <Calendar className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted shrink-0" />
                    <span>{dateFormatted}</span>
                  </div>

                  {/* 2. Product Name & Barcode */}
                  <div className="min-w-0 flex flex-col justify-center">
                    <span className="font-semibold text-ink dark:text-ink-dark truncate text-xs">{m.productName || 'صنف غير معروف'}</span>
                    {m.productBarcode && (
                      <span className="font-mono text-micro text-ink-muted dark:text-ink-dark-muted truncate">{m.productBarcode}</span>
                    )}
                  </div>

                  {/* 3. Movement Type */}
                  <div className="flex justify-center">
                    <span className={`px-2.5 py-0.5 rounded text-micro font-bold border whitespace-nowrap ${badgeClass}`}>
                      {m.movementTypeArabic || m.movementType}
                    </span>
                  </div>

                  {/* 4. Signed Quantity */}
                  <div className="flex items-center justify-center font-mono font-bold text-sm tabular-nums whitespace-nowrap">
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
                  <span className="text-center font-mono text-ink-muted dark:text-ink-dark-muted tabular-nums text-xs whitespace-nowrap">
                    {formatArabicCurrency(m.unitCostPiasters)}
                  </span>

                  {/* 6. Note */}
                  <div className="min-w-0 truncate text-micro text-ink-muted dark:text-ink-dark-muted" title={m.note || ''}>
                    {m.note || <span className="opacity-40">—</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Table Footer */}
        <div className="h-[32px] bg-surface-2 dark:bg-surface-dark-2 hairline-t px-4 flex items-center justify-between text-micro text-ink-muted dark:text-ink-dark-muted shrink-0">
          <span>كل حركة بضاعة متسجلة تلقائياً بدون إمكانية للحذف لحماية المخزن من أي عجز أو تلاعب.</span>
        </div>
      </div>

      {/* Pagination Bar: only when more than one page is possible */}
      {filteredMovements.length > MOVEMENTS_PAGE_SIZE_OPTIONS[0] && (
        <PaginationBar
          currentPage={currentPage}
          pageSize={pageSize}
          totalCount={filteredMovements.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={MOVEMENTS_PAGE_SIZE_OPTIONS}
          itemLabel="حركة بضاعة"
        />
      )}    </div>
  );
};
