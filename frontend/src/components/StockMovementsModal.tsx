import React, { useState, useEffect, useMemo } from 'react';
import { 
  Boxes, 
  X, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Calendar, 
  AlertCircle, 
  RefreshCw,
  PlusCircle,
  FileText
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import type { StockMovement, ProductUnit } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { formatCompoundStock } from '../utils/packaging';
import { formatUnitArabic } from '../utils/units';
import { cleanMovementNote, movementTypeLabel } from '../utils/movementText';
import { DateFilterControl } from './DateFilterControl';
import { AppButton } from './AppButton';
import {
  type DateFilterValue,
  DEFAULT_DATE_FILTER,
  describeDateFilter,
  isDateFilterActive,
  useToday,
} from '../utils/dateFilter';
import { PRODUCT_MOVEMENTS_LOAD_LIMIT, buildMovementsRequest } from '../views/products/stockMovementsQuery';

interface StockMovementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  unit: string;
  units?: ProductUnit[] | null;
  currentStockMilli: number;
  onOpenAdjustment?: () => void;
}

export const StockMovementsModal: React.FC<StockMovementsModalProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
  unit,
  units,
  currentStockMilli,
  onOpenAdjustment,
}) => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ ...DEFAULT_DATE_FILTER });
  // Re-evaluates relative presets when the day rolls over while the modal stays open
  const today = useToday();

  // Every opening (or another product) starts from unfiltered type and period
  const resetKey = isOpen ? productId : '';
  const [handledResetKey, setHandledResetKey] = useState(resetKey);
  if (handledResetKey !== resetKey) {
    setHandledResetKey(resetKey);
    setMovementTypeFilter('ALL');
    setDateFilter({ ...DEFAULT_DATE_FILTER });
  }

  const isDateActive = isDateFilterActive(dateFilter);
  const periodLabel = describeDateFilter(dateFilter);
  const isTruncated = movements.length >= PRODUCT_MOVEMENTS_LOAD_LIMIT;
  const isKg = unit === 'kg';
  const rawBaseUnit = (units && units.length > 0)
    ? (units.find(u => u.isBaseUnit)?.unitName || unit)
    : unit;
  const baseUnitClean = (!rawBaseUnit || rawBaseUnit === 'piece' || rawBaseUnit === 'pc' || rawBaseUnit === 'unit' || rawBaseUnit === 'item')
    ? 'قطعة'
    : rawBaseUnit;

  const isMultiUnit = Boolean(units && units.length > 1 && !isKg);

  const compoundStock = (units && units.length > 1 && !isKg)
    ? formatCompoundStock(currentStockMilli, units, baseUnitClean)
    : null;

  const currentStockDisplay = isKg
    ? `${(currentStockMilli / 1000).toFixed(3).replace(/\.?0+$/, '')} كجم`
    : compoundStock
      ? `${compoundStock} (${Math.round(currentStockMilli / 1000)} ${baseUnitClean})`
      : `${Math.round(currentStockMilli / 1000)} ${baseUnitClean}`;

  // Structured breakdown of current stock across units for the top strip
  const retailBreakdown = useMemo(() => {
    if (!isMultiUnit || !units) return null;

    const validUnits = units
      .filter((u) => u && u.conversionFactor > 0)
      .map((u) => ({ ...u, unitName: formatUnitArabic(u.unitName) }))
      .sort((a, b) => b.conversionFactor - a.conversionFactor);

    if (validUnits.length <= 1) return null;

    const absStock = Math.floor(Math.abs(currentStockMilli) / 1000);
    let rem = absStock;
    const items: { name: string; count: number; factor: number; isBase: boolean }[] = [];

    for (const u of validUnits) {
      if (u.conversionFactor > 1) {
        const c = Math.floor(rem / u.conversionFactor);
        items.push({ name: u.unitName, count: c, factor: u.conversionFactor, isBase: false });
        rem %= u.conversionFactor;
      }
    }

    const baseUnitObj = validUnits.find((u) => u.isBaseUnit || u.conversionFactor === 1);
    const baseName = baseUnitObj?.unitName || baseUnitClean;
    items.push({ name: `${baseName} (فرط)`, count: rem, factor: 1, isBase: true });

    return items;
  }, [isMultiUnit, units, currentStockMilli, baseUnitClean]);

  // Fallback / Calibration map of running balances
  const computedBalances = useMemo(() => {
    // If backend provided balanceAfterMilli and it aligns with currentStockMilli:
    if (movements.length > 0 && typeof movements[0].balanceAfterMilli === 'number') {
      const latestBal = movements[0].balanceAfterMilli;
      if (Math.abs(latestBal - currentStockMilli) < 1000) {
        return null;
      }
    }
    // Backward reconstruction from currentStockMilli guarantees table always reconciles with live stock
    const map = new Map<string, number>();
    let running = currentStockMilli;
    for (const m of movements) {
      map.set(m.id, running);
      running -= m.quantityMilli;
    }
    return map;
  }, [movements, currentStockMilli]);

  useEffect(() => {
    if (!isOpen || !productId) return;
    let active = true;

    const fetchMovements = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await invoke<StockMovement[]>(
          'inventory:getMovements',
          buildMovementsRequest(movementTypeFilter, dateFilter, PRODUCT_MOVEMENTS_LOAD_LIMIT, productId),
        );
        if (active) {
          setMovements(Array.isArray(res) ? res : []);
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(`فشل تحميل حركات المخزون: ${msg}`);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchMovements();

    return () => {
      active = false;
    };
  }, [isOpen, productId, movementTypeFilter, dateFilter, today]);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty: false,
  });

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-EG-u-nu-latn', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getBadgeStyle = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'INITIAL':
        return 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border-brand/20 dark:border-brand/30';
      case 'SALE':
      case 'RECIPE_SALE_CONSUMPTION':
        return 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger/20 dark:border-danger-bright/30';
      case 'PURCHASE':
        return 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/30';
      case 'ADJUSTMENT':
        return 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn/20 dark:border-warn-bright/30';
      case 'RETURN':
      case 'REFUND':
      case 'RECIPE_SALE_REVERSAL':
      case 'SALE_CANCEL':
        return 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid/20 dark:border-paid/30';
      case 'DAMAGED_RETURN':
      case 'DAMAGE':
        return 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger/20 dark:border-danger-bright/30';
      default:
        return 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border-line dark:border-line-dark';
    }
  };



  const formatMovementDetail = (m: StockMovement) => {
    const isPositive = m.quantityMilli >= 0;
    const sign = isPositive ? '+' : '-';
    const absQty = Math.abs(m.quantityMilli / 1000);

    if (isKg) {
      return {
        mainDisplay: `${sign}${absQty.toFixed(3).replace(/\.?0+$/, '')} كجم`,
        equivalentDisplay: null,
        unitLabel: 'كجم',
        factor: 1,
      };
    }

    if (!isMultiUnit || !units || units.length <= 1) {
      const formatted = Math.round(absQty);
      const unitLabel = baseUnitClean === 'قطعة' ? 'ق' : ` ${baseUnitClean}`;
      return {
        mainDisplay: `${sign}${formatted}${unitLabel}`,
        equivalentDisplay: null,
        unitLabel: baseUnitClean,
        factor: 1,
      };
    }

    const noteClean = (m.note || '').toLowerCase();
    const sortedUnits = [...units]
      .filter((u) => u && u.conversionFactor > 0)
      .sort((a, b) => b.conversionFactor - a.conversionFactor);

    let matchedUnitName: string | null = null;
    let matchedUnitCount: number | null = null;

    for (const u of sortedUnits) {
      const uArabic = formatUnitArabic(u.unitName).toLowerCase();
      const escaped = uArabic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexWithCount = new RegExp(`\\((\\d+)\\s*${escaped}\\)`, 'i');
      const regexBare = new RegExp(`\\(${escaped}\\)`, 'i');

      const matchCount = noteClean.match(regexWithCount);
      if (matchCount) {
        matchedUnitName = u.unitName;
        matchedUnitCount = parseInt(matchCount[1], 10);
        break;
      }

      if (regexBare.test(noteClean)) {
        matchedUnitName = u.unitName;
        matchedUnitCount = Math.round(absQty / u.conversionFactor);
        break;
      }
    }

    // Fallback: check exact factor match if note didn't specify unit
    if (!matchedUnitName) {
      for (const u of sortedUnits) {
        if (u.conversionFactor > 1 && absQty >= u.conversionFactor && absQty % u.conversionFactor === 0) {
          matchedUnitName = u.unitName;
          matchedUnitCount = Math.round(absQty / u.conversionFactor);
          break;
        }
      }
    }

    if (matchedUnitName && matchedUnitCount !== null && matchedUnitCount > 0) {
      const matchedObj = sortedUnits.find((u) => u.unitName === matchedUnitName);
      const uClean = formatUnitArabic(matchedUnitName);
      const isBaseUnitMatch = matchedObj?.isBaseUnit;
      if (!isBaseUnitMatch) {
        return {
          mainDisplay: `${sign}${matchedUnitCount} ${uClean}`,
          equivalentDisplay: `يعادل ${sign}${Math.round(absQty)} ${baseUnitClean}`,
          unitLabel: uClean,
          factor: matchedObj?.conversionFactor || 1,
        };
      }
    }

    return {
      mainDisplay: `${sign}${Math.round(absQty)} ${baseUnitClean}`,
      equivalentDisplay: null,
      unitLabel: baseUnitClean,
      factor: 1,
    };
  };

  const formatCostDetail = (m: StockMovement, movementDetail: { unitLabel: string; factor: number }) => {
    const rawCost = m.unitCostPiasters;
    if (!rawCost || rawCost <= 0) {
      return { main: '0.00 ج.م', sub: null };
    }

    if (isKg) {
      return {
        main: `${formatArabicCurrency(rawCost)} لكل كجم`,
        sub: null,
      };
    }

    if (!isMultiUnit || movementDetail.factor <= 1) {
      return {
        main: `${formatArabicCurrency(rawCost)} لكل ${baseUnitClean}`,
        sub: null,
      };
    }

    const factor = movementDetail.factor;
    const isPurchase = m.movementType?.toUpperCase() === 'PURCHASE';

    if (isPurchase) {
      // In purchases, unitCostPiasters is stored per base unit (e.g. 3.00 EGP per cigarette)
      const baseCost = rawCost;
      const packageCost = rawCost * factor;
      return {
        main: `${formatArabicCurrency(baseCost)} لكل ${baseUnitClean}`,
        sub: `${formatArabicCurrency(packageCost)} لكل ${movementDetail.unitLabel}`,
      };
    } else {
      // In sales, unitCostPiasters is stored per transacted unit (e.g. 575.00 EGP per carton or 58.20 per pack)
      const packageCost = rawCost;
      const baseCost = Math.round(rawCost / factor);
      return {
        main: `${formatArabicCurrency(packageCost)} لكل ${movementDetail.unitLabel}`,
        sub: `${formatArabicCurrency(baseCost)} لكل ${baseUnitClean}`,
      };
    }
  };

  const formatBalanceAfter = (balanceMilli: number | null | undefined) => {
    if (balanceMilli === undefined || balanceMilli === null) {
      return { main: '—', sub: null, isNegative: false, isZero: false };
    }
    if (isKg) {
      const val = (balanceMilli / 1000).toFixed(3).replace(/\.?0+$/, '');
      return { main: `${val} كجم`, sub: null, isNegative: balanceMilli < 0, isZero: balanceMilli === 0 };
    }

    const isNeg = balanceMilli < 0;
    const isZero = balanceMilli === 0;
    const baseCount = Math.round(balanceMilli / 1000);

    if (isMultiUnit && units && units.length > 1) {
      const comp = formatCompoundStock(balanceMilli, units, baseUnitClean);
      return {
        main: comp,
        sub: `${baseCount} ${baseUnitClean}`,
        isNegative: isNeg,
        isZero,
      };
    }

    return {
      main: `${baseCount} ${baseUnitClean}`,
      sub: null,
      isNegative: isNeg,
      isZero,
    };
  };

  const cleanNote = (note: string | null | undefined) => cleanMovementNote(note) || '—';

  if (!isOpen) return null;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none"
    >
      <div 
        className="bg-surface dark:bg-surface-dark rounded-xl hairline-all shadow-2xl w-full max-w-5xl flex flex-col max-h-[88vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-line dark:border-line-dark flex items-center justify-between gap-3 bg-surface-2/60 dark:bg-surface-dark-2/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center shrink-0">
              <Boxes className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="t-modal-title text-ink dark:text-ink-dark leading-tight whitespace-nowrap">كارت حركة المخزون</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-micro font-mono font-bold whitespace-nowrap shadow-2xs ${
                  currentStockMilli > 0
                    ? 'bg-brand dark:bg-brand text-white'
                    : currentStockMilli === 0
                    ? 'bg-warn-bright text-ink dark:bg-warn-dark-soft dark:text-warn-bright'
                    : 'bg-danger text-white'
                }`}>
                  الرصيد الحالي: {currentStockDisplay}
                </span>
              </div>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted leading-tight mt-1 truncate" title={productName}>
                {productName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenAdjustment && (
              <AppButton
                variant="primary"
                size="sm"
                icon={PlusCircle}
                onClick={() => {
                  onClose();
                  onOpenAdjustment();
                }}
              >
                تسوية جردية
              </AppButton>
            )}
            <AppButton variant="subtle" size="sm" icon={X} onClick={requestClose} aria-label="إغلاق" />
          </div>
        </div>

        {/* Retail Packaging Breakdown Strip (Multi-tier retail stock clarification) */}
        {retailBreakdown && retailBreakdown.length > 1 && (
          <div className="px-5 py-2.5 bg-brand-soft/50 dark:bg-brand-dark-soft/40 border-b border-line dark:border-line-dark flex items-center justify-between gap-3 flex-wrap shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-micro font-bold text-brand dark:text-brand-bright shrink-0">
                <Boxes className="w-4 h-4" />
                <span>تفكيك رصيد التجزئة الفعلي:</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {retailBreakdown.map((item, idx) => (
                  <React.Fragment key={item.name}>
                    {idx > 0 && <span className="text-ink-muted/50 dark:text-ink-dark-muted text-xs font-bold">+</span>}
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg shadow-2xs text-xs">
                      <span className="text-ink-muted dark:text-ink-dark-muted text-micro font-semibold">{item.name}:</span>
                      <span className={`font-mono font-extrabold ${item.count > 0 ? 'text-brand dark:text-brand-bright' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                        {item.count}
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="text-micro font-mono font-bold text-ink-muted dark:text-ink-dark-muted shrink-0 mr-auto">
              إجمالي الرصيد: <span className="text-brand dark:text-brand-bright font-extrabold">{Math.round(currentStockMilli / 1000)} {baseUnitClean}</span>
            </div>
          </div>
        )}

        {/* Filter Toolbar */}
        <div className="px-5 py-2.5 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark flex items-center justify-between gap-x-4 gap-y-2.5 flex-wrap shrink-0">
          <div className="flex items-center gap-1 flex-wrap text-micro">
            {[
              { id: 'ALL', label: 'كل الحركات' },
              { id: 'INITIAL', label: 'رصيد افتتاحي' },
              { id: 'SALE', label: 'مبيعات' },
              { id: 'PURCHASE', label: 'مشتريات' },
              { id: 'ADJUSTMENT', label: 'تسويات جردية' },
              { id: 'RETURN', label: 'مرتجعات' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMovementTypeFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                  movementTypeFilter === tab.id
                    ? 'bg-brand dark:bg-brand text-white shadow-2xs font-extrabold'
                    : 'text-ink-muted dark:text-ink-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-ink-dark'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <DateFilterControl
              value={dateFilter}
              onChange={setDateFilter}
              size="md"
              selectWidthClass="w-44 sm:w-48"
            />
            <div
              className="w-64 shrink-0 truncate text-micro text-ink-muted dark:text-ink-dark-muted font-mono"
              title={isDateActive ? periodLabel : undefined}
            >
              {movements.length}{isTruncated ? '+' : ''} حركة{isDateActive ? ` في الفترة: ${periodLabel}` : ' مسجلة'}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3">
          {error && (
            <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 rounded text-danger dark:text-danger-bright text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-ink-muted dark:text-ink-dark-muted">
              <RefreshCw className="w-6 h-6 animate-spin text-brand dark:text-brand-bright" />
              <span className="text-xs">جاري تحميل سجل حركات المخزون...</span>
            </div>
          ) : movements.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-ink-muted dark:text-ink-dark-muted">
              <Boxes className="w-8 h-8 opacity-40 text-brand dark:text-brand-bright" />
              <p className="text-sm font-semibold text-ink dark:text-ink-dark m-0">
                {isDateActive ? `لا توجد حركات مخزون في الفترة دي (${periodLabel})` : 'لا توجد حركات مخزون مسجلة لهذا الصنف'}
              </p>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted m-0">
                تسجل الحركات تلقائياً عند عمليات البيع، الشراء، أو التسويات الجردية.
              </p>
              {(isDateActive || movementTypeFilter !== 'ALL') && (
                <AppButton
                  variant="soft"
                  onClick={() => {
                    setDateFilter({ ...DEFAULT_DATE_FILTER });
                    setMovementTypeFilter('ALL');
                  }}
                  className="mt-1"
                >
                  مسح الفلاتر وعرض كل الحركات
                </AppButton>
              )}
            </div>
          ) : (
            <div className="border border-line dark:border-line-dark rounded-xl overflow-x-auto shadow-2xs bg-surface dark:bg-surface-dark">
              <table className="w-full min-w-[51.25rem] text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold text-micro h-9">
                    <th className="py-2.5 px-3 whitespace-nowrap">التاريخ والوقت</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">نوع الحركة</th>
                    <th className="py-2.5 px-3 whitespace-nowrap font-mono">الكمية وتفصيلها</th>
                    <th className="py-2.5 px-3 whitespace-nowrap font-mono">الرصيد بعد الحركة</th>
                    <th className="py-2.5 px-3 whitespace-nowrap font-mono">تكلفة الوحدة</th>
                    <th className="py-2.5 px-3">الملاحظات والسبب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {movements.map(m => {
                    const isPositive = m.quantityMilli >= 0;
                    const movementDetail = formatMovementDetail(m);
                    const rawBalanceMilli = typeof m.balanceAfterMilli === 'number'
                      ? m.balanceAfterMilli
                      : computedBalances?.get(m.id);
                    const bal = formatBalanceAfter(rawBalanceMilli);

                    return (
                      <tr key={m.id} className="hover:bg-surface-2/50 dark:hover:bg-surface-dark-2/50 transition-colors h-12">
                        <td className="py-2.5 px-3 font-mono text-xs text-ink dark:text-ink-dark whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted shrink-0" />
                            <span>{formatDate(m.createdAt)}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-micro font-bold border inline-block ${getBadgeStyle(m.movementType)}`}>
                            {movementTypeLabel(m.movementType, m.movementTypeArabic)}
                          </span>
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="flex flex-col items-start leading-tight">
                            <div className={`inline-flex items-center gap-1 font-mono font-bold text-xs ${isPositive ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                              {isPositive ? (
                                <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span dir="ltr">{movementDetail.mainDisplay}</span>
                            </div>
                            {movementDetail.equivalentDisplay && (
                              <span className="text-micro text-ink-muted/80 dark:text-ink-dark-muted font-sans font-medium mt-0.5" dir="rtl">
                                ({movementDetail.equivalentDisplay})
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2 px-3 whitespace-nowrap">
                          <div className="flex flex-col items-start leading-tight">
                            <span
                              className={`font-mono font-bold text-xs ${
                                bal.isNegative
                                  ? 'text-danger dark:text-danger-bright'
                                  : bal.isZero
                                  ? 'text-ink-muted dark:text-ink-dark-muted'
                                  : 'text-paid dark:text-paid-bright'
                              }`}
                            >
                              {bal.main}
                            </span>
                            {bal.sub && (
                              <span className="text-micro font-mono text-ink-muted/80 dark:text-ink-dark-muted mt-0.5" dir="rtl">
                                ({bal.sub})
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2.5 px-3 font-mono text-ink dark:text-ink-dark whitespace-nowrap">
                          {(() => {
                            const costDetail = formatCostDetail(m, movementDetail);
                            return (
                              <div className="flex flex-col items-start leading-tight">
                                <span className="font-bold">{costDetail.main}</span>
                                {costDetail.sub && (
                                  <span className="text-micro text-ink-muted/80 dark:text-ink-dark-muted font-sans font-normal mt-0.5">
                                    ({costDetail.sub})
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        <td className="py-2.5 px-3 text-ink-muted dark:text-ink-dark-muted text-micro max-w-sm truncate" title={cleanNote(m.note)}>
                          {m.note ? (
                            <span>{cleanNote(m.note)}</span>
                          ) : (
                            <span className="text-ink-muted/50 dark:text-ink-dark-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line dark:border-line-dark bg-surface-2/40 dark:bg-surface-dark-2/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 text-micro text-ink-muted dark:text-ink-dark-muted">
            <FileText className="w-3.5 h-3.5" />
            <span>
              {isTruncated
                ? `معروض أحدث ${PRODUCT_MOVEMENTS_LOAD_LIMIT} حركة فقط، حدّد فترة أضيق لعرض الحركات الأقدم`
                : 'جميع الحركات مسجلة بقيود ذرية غير قابلة للحذف المادي (قاعدة أمان البيانات #2)'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
