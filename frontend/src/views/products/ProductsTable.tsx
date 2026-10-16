import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Package,
  Scale,
  Boxes,
  Truck,
  History,
  Edit2,
  Trash2,
  Layers,
  Tag,
  TrendingUp,
  Clock,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import type { Product } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';
import { RafiqTableLoading } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';

export interface ProductsTableProps {
  products: Product[];
  selectedCategoryFilter: string;
  selectedProductIds: string[];
  loading?: boolean;
  onToggleSelectAll: (filteredProds: Product[]) => void;
  onToggleSelectProduct: (id: string) => void;
  onOpenBulkMinStockModal: () => void;
  onOpenBulkPriceAdjustment?: () => void;
  onBulkDelete?: () => void;
  onBulkPrintLabels?: () => void;
  onClearSelection: () => void;
  onSelectProdForMovements: (prod: Product) => void;
  onSelectProdForAdjustment: (prod: Product) => void;
  onSelectProdForPurchase?: (prod: Product) => void;
  onOpenPriceHistory: (prod: Product) => void;
  onEditProduct: (prod: Product) => void;
  onDeleteProduct: (prod: Product) => void;
  onPrintLabel?: (prod: Product) => void;
  onViewVariants?: (prod: Product) => void;
  onNavigateToBatches?: (prodName: string) => void;
}

export const ProductsTable: React.FC<ProductsTableProps> = ({
  products,
  selectedCategoryFilter,
  selectedProductIds,
  loading = false,
  onToggleSelectAll,
  onToggleSelectProduct,
  onOpenBulkMinStockModal,
  onOpenBulkPriceAdjustment,
  onBulkDelete,
  onBulkPrintLabels,
  onClearSelection,
  onSelectProdForMovements,
  onSelectProdForAdjustment,
  onSelectProdForPurchase,
  onOpenPriceHistory,
  onEditProduct,
  onDeleteProduct,
  onPrintLabel,
  onViewVariants,
  onNavigateToBatches,
}) => {
  const filteredProducts = products.filter(
    (p) => selectedCategoryFilter === 'all' || (p.categoryId || 'cat_general') === selectedCategoryFilter
  );

  const showLoading = useSmoothLoading(loading, 300);

  const [activeMenu, setActiveMenu] = useState<{
    product: Product;
    top: number;
    left: number;
    openUpwards: boolean;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close actions menu on click outside, Escape, or scrolling
  useEffect(() => {
    if (!activeMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenu(null);
      }
    };

    const handleScroll = (e: Event) => {
      // Don't close the menu if the user is scrolling inside the actions dropdown itself!
      if (menuRef.current && (menuRef.current === e.target || menuRef.current.contains(e.target as Node))) {
        return;
      }
      setActiveMenu(null);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [activeMenu]);

  const handleToggleMenu = (prod: Product, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (activeMenu?.product.id === prod.id) {
      setActiveMenu(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuEstimatedHeight = 345;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;

    const menuWidth = 220;
    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 12) {
      left = window.innerWidth - menuWidth - 12;
    }
    if (left < 12) {
      left = 12;
    }

    let top = openUpwards ? rect.top - 6 : rect.bottom + 6;
    if (!openUpwards && top + menuEstimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - menuEstimatedHeight - 8);
    }

    setActiveMenu({
      product: prod,
      top,
      left,
      openUpwards,
    });
  };

  return (
    <div className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl flex flex-col overflow-hidden relative shadow-xs">
      {/* Table Scroll Area */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-right border-collapse text-xs select-none">
          {/* Table Header */}
          <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold text-xs select-none shadow-2xs">
            <tr className="h-10">
              <th className="w-14 px-3 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filteredProducts.length > 0 && selectedProductIds.length === filteredProducts.length}
                    onChange={() => onToggleSelectAll(filteredProducts)}
                    className="w-4 h-4 rounded border-line dark:border-line-dark accent-paid focus:ring-0 cursor-pointer"
                    title="تحديد كل الأصناف المعروضة"
                  />
                  <span>#</span>
                </div>
              </th>
              <th className="w-36 px-3 text-right">الباركود</th>
              <th className="px-3 text-right min-w-[200px]">اسم الصنف</th>
              <th className="w-36 px-3 text-right">سعر البيع</th>
              <th className="w-28 px-3 text-right">سعر الشراء (التكلفة)</th>
              <th className="w-32 px-3 text-center" title="رصيد المخزن الحالي / حد التنبيه بالنواقص">
                رصيد المخزن / النواقص
              </th>
              <th className="w-24 px-3 text-center">حالة الصنف</th>
              <th className="w-28 px-3 text-center">خيارات الصنف</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-line dark:divide-line-dark">
            {showLoading ? (
              <RafiqTableLoading
                colSpan={8}
                label="جاري تحميل أصناف وبضاعة المحل..."
                sublabel="استرجاع السلع والوحدات ومطابقة الأرصدة الحالية من قاعدة البيانات"
              />
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-ink-muted dark:text-ink-dark-muted">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Package className="w-12 h-12 stroke-[1.2] text-line-hover dark:text-line-dark-strong" />
                    <p className="text-sm font-bold text-ink dark:text-ink-dark m-0">مافيش أصناف مطابقة للبحث أو للقسم ده</p>
                    <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0">
                      دوس على زرار &quot;+ صنف جديد&quot; فوق عشان تسجل صنف جديد في المحل
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredProducts.map((prod, index) => {
                const isKg = prod.unit === 'kg';
                const stockQuantityCurrent = (prod.stockQuantityMilli || 0) / 1000;
                const minStockQuantityItem = (prod.minStockQuantityMilli ?? 5000) / 1000;

                const stockDisplay = isKg
                  ? `${stockQuantityCurrent.toFixed(3).replace(/\.?0+$/, '')} كجم`
                  : `${Math.round(stockQuantityCurrent)} ق`;

                const minStockDisplay = isKg
                  ? `${minStockQuantityItem.toFixed(3).replace(/\.?0+$/, '')}`
                  : `${Math.round(minStockQuantityItem)}`;

                let stockStatus = { label: 'متوفر', class: 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid-border dark:border-paid-dark-border' };
                if (stockQuantityCurrent <= 0) {
                  stockStatus = { label: 'خلصان', class: 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30' };
                } else if (stockQuantityCurrent <= minStockQuantityItem) {
                  stockStatus = { label: `ناقص (${minStockDisplay})`, class: 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn-border dark:border-warn-bright/30' };
                }

                const isSelected = selectedProductIds.includes(prod.id);

                const stockPcs = Math.floor(stockQuantityCurrent);
                const largerUnits = (prod.units || []).filter((u) => !u.isBaseUnit && u.conversionFactor > 1);
                let unitBreakdown: string | null = null;
                if (largerUnits.length > 0 && stockPcs > 0 && !isKg) {
                  const primaryLargeUnit = largerUnits[0];
                  const wholeLarge = Math.floor(stockPcs / primaryLargeUnit.conversionFactor);
                  const rem = stockPcs % primaryLargeUnit.conversionFactor;
                  if (wholeLarge > 0) {
                    unitBreakdown =
                      rem > 0
                        ? `${wholeLarge} ${primaryLargeUnit.unitName} + ${rem}`
                        : `${wholeLarge} ${primaryLargeUnit.unitName}`;
                  }
                }

                return (
                  <tr
                    key={prod.id}
                    onDoubleClick={() => onEditProduct(prod)}
                    title="انقر مرتين لتعديل بيانات الصنف"
                    className={`h-12 hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors select-none ${
                      isSelected ? 'bg-brand/10 dark:bg-brand/20' : ''
                    }`}
                  >
                    {/* 1. Selection & Index */}
                    <td className="w-14 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelectProduct(prod.id)}
                          className="w-4 h-4 rounded border-line dark:border-line-dark accent-paid focus:ring-0 cursor-pointer"
                        />
                        <span className="font-mono text-xs text-ink-muted dark:text-ink-dark-muted tabular-nums">{index + 1}</span>
                      </div>
                    </td>

                    {/* 2. Barcode */}
                    <td className="w-36 px-3 text-right font-mono text-xs text-ink dark:text-ink-dark tabular-nums">
                      <div className="flex items-center gap-1">
                        <span className="truncate">{prod.barcode || <span className="text-ink-muted/50 dark:text-ink-dark-muted/50">—</span>}</span>
                        {prod.barcodes && prod.barcodes.length > 1 && (
                          <span
                            className="px-1.5 py-0.5 rounded-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-[10px] text-ink-muted dark:text-ink-dark-muted shrink-0 font-bold"
                            title={`باركودات إضافية مسجلة للصنف:\n${prod.barcodes.join('\n')}`}
                          >
                            +{prod.barcodes.length - 1}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. Name & Badges */}
                    <td className="px-3 text-right">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-ink dark:text-ink-dark">{prod.name}</span>
                        {isKg && (
                          <span
                            className="shrink-0 px-2 py-0.5 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright text-[10px] font-bold rounded-full flex items-center gap-0.5"
                            title="يباع بالوزن (ميزان)"
                          >
                            <Scale className="w-2.5 h-2.5" />
                            <span>وزن</span>
                          </span>
                        )}
                        {prod.units && prod.units.length > 1 && (
                          <span
                            className="shrink-0 px-2 py-0.5 bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-[10px] font-bold rounded-full border border-paid/20 dark:border-paid/30"
                            title={`وحدات البيع المسجلة:\n${prod.units.map((u) => `${u.unitName} (معامل ${u.conversionFactor})`).join('\n')}`}
                          >
                            {prod.units.length} وحدات
                          </span>
                        )}
                        {prod.taxRatePercent > 0 && (
                          <span className="shrink-0 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-paid dark:text-paid-bright text-[10px] font-bold rounded-full border border-emerald-200 dark:border-emerald-800/40">
                            {prod.taxRatePercent}% ضريبة
                          </span>
                        )}
                        {prod.hasVariants && (
                          <span
                            className="shrink-0 px-2 py-0.5 bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright text-[10px] font-bold rounded-full border border-brand/20 flex items-center gap-1"
                            title="منتج متعدد المقاسات والألوان"
                          >
                            <Layers className="w-2.5 h-2.5" />
                            <span>مقاسات وألوان</span>
                          </span>
                        )}
                        {prod.variantColor && prod.variantSize && (
                          <span
                            className="shrink-0 px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-[10px] font-mono font-bold text-ink-muted dark:text-ink-dark-muted"
                            title={`تركيبة: ${prod.variantColor} - ${prod.variantSize}`}
                          >
                            {prod.variantColor} | {prod.variantSize}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 4. Selling Price */}
                    <td className="w-36 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="flex items-center gap-1.5 justify-start">
                        <span className="font-black text-paid dark:text-paid-bright text-xs">
                          {formatArabicCurrency(prod.pricePiasters)}
                        </span>
                        {isKg && <span className="text-[10px] text-paid/80 dark:text-paid-bright/80 font-normal">/كجم</span>}
                        {prod.costPiasters > 0 &&
                          (prod.pricePiasters < prod.costPiasters ? (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/30 font-bold shrink-0"
                              title="سعر البيع أقل من التكلفة (خسارة)"
                            >
                              خسارة
                            </span>
                          ) : (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-paid-soft dark:bg-emerald-950/60 text-paid dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50 font-bold shrink-0"
                              title="نسبة الربح من التكلفة"
                            >
                              +{(((prod.pricePiasters - prod.costPiasters) / prod.costPiasters) * 100).toFixed(0)}%
                            </span>
                          ))}
                      </div>
                    </td>

                    {/* 5. Cost */}
                    <td className="w-28 px-3 text-right font-mono text-ink-muted dark:text-ink-dark-muted tabular-nums text-xs whitespace-nowrap">
                      {formatArabicCurrency(prod.costPiasters)}
                    </td>

                    {/* 6. Stock / Min Stock */}
                    <td className="w-32 px-3 text-center whitespace-nowrap">
                      <div
                        onClick={() => onSelectProdForMovements(prod)}
                        className="inline-flex flex-col items-center justify-center font-mono tabular-nums leading-tight cursor-pointer hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-lg px-2 py-0.5 group transition-colors"
                        title="دوس هنا لعرض دفتر حركة الصنف بالمخزن"
                      >
                        <span className="font-bold text-ink dark:text-ink-dark text-xs group-hover:text-paid dark:group-hover:text-brand-bright underline decoration-dotted underline-offset-2">
                          {stockDisplay}
                        </span>
                        {unitBreakdown ? (
                          <span
                            className="text-[9px] text-paid dark:text-paid-bright font-bold truncate max-w-[110px]"
                            title={`المكافئ بالوحدة الكبيرة: ${unitBreakdown}`}
                          >
                            ≈ {unitBreakdown}
                          </span>
                        ) : (
                          <span
                            className="text-[10px] text-ink-muted dark:text-ink-dark-muted"
                            title={`حد النواقص: ${minStockDisplay} ${isKg ? 'كجم' : 'قطعة'}`}
                          >
                            حد {minStockDisplay}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 7. Status */}
                    <td className="w-24 px-3 text-center whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${stockStatus.class}`}>
                        {stockStatus.label}
                      </span>
                    </td>

                    {/* 8. Actions */}
                    <td className="w-28 px-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => handleToggleMenu(prod, e)}
                        className={`h-7 px-2.5 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer select-none ${
                          activeMenu?.product.id === prod.id
                            ? 'bg-brand dark:bg-brand text-white border-brand ring-2 ring-brand/20 shadow-xs'
                            : 'bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border-line dark:border-line-dark text-ink dark:text-ink-dark hover:text-brand dark:hover:text-brand-bright hover:border-brand/40'
                        }`}
                        title="قائمة إجراءات وخيارات الصنف"
                      >
                        <MoreHorizontal
                          className={`w-3.5 h-3.5 transition-colors ${
                            activeMenu?.product.id === prod.id ? 'text-white' : 'text-brand dark:text-brand-bright'
                          }`}
                        />
                        <span>خيارات</span>
                        <ChevronDown
                          className={`w-3 h-3 transition-transform duration-150 ${
                            activeMenu?.product.id === prod.id ? 'rotate-180 text-white' : 'text-ink-muted dark:text-ink-dark-muted'
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedProductIds.length > 0 && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-brand-dark dark:bg-surface-dark-2 text-white rounded-2xl px-5 py-2.5 shadow-2xl flex items-center gap-4 z-30 border border-paid/40 dark:border-line-dark text-xs font-bold animate-fade-in">
          <span className="flex items-center gap-1.5 text-white">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>محدد {selectedProductIds.length} صنف</span>
          </span>
          {onBulkPrintLabels && (
            <button
              type="button"
              onClick={onBulkPrintLabels}
              className="px-3.5 py-1.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer border border-brand-soft/20"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>طباعة استيكرات ({selectedProductIds.length})</span>
            </button>
          )}
          {onOpenBulkPriceAdjustment && (
            <button
              type="button"
              onClick={onOpenBulkPriceAdjustment}
              className="px-3.5 py-1.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer border border-brand-soft/20"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>تعديل الأسعار والتكلفة بالجملة ({selectedProductIds.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenBulkMinStockModal}
            className="px-3.5 py-1.5 bg-paid hover:bg-paid-hover text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <span>تعديل حد النواقص للأصناف المحددة</span>
          </button>
          {onBulkDelete && (
            <button
              type="button"
              onClick={onBulkDelete}
              className="px-3.5 py-1.5 bg-danger hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح الأصناف المحددة ({selectedProductIds.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClearSelection}
            className="text-emerald-200 hover:text-white text-xs underline cursor-pointer"
          >
            فك التحديد
          </button>
        </div>
      )}

      {/* Table Footer Status */}
      <div className="h-8 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark px-4 flex items-center justify-between text-[11px] text-ink-muted dark:text-ink-dark-muted shrink-0">
        <span>حركات المخزن وتغيير الأسعار بتتسجل تلقائياً أول بأول بدون نت.</span>
      </div>

      {/* Floating Actions Portal Dropdown Menu */}
      {activeMenu &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: activeMenu.top,
              left: activeMenu.left,
              transform: activeMenu.openUpwards ? 'translateY(-100%)' : 'none',
              width: '220px',
              zIndex: 9999,
            }}
            onWheel={(e) => e.stopPropagation()}
            className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl overflow-hidden animate-fade-in text-right font-sans select-none"
            dir="rtl"
          >
            {/* Product Info Header */}
            <div className="p-2.5 bg-surface-2/80 dark:bg-surface-dark-2/80 border-b border-line dark:border-line-dark">
              <div className="font-bold text-xs text-ink dark:text-ink-dark truncate">{activeMenu.product.name}</div>
              <div className="flex items-center justify-between text-[10px] text-ink-muted dark:text-ink-dark-muted mt-1 font-mono">
                <span className="truncate">كود: {activeMenu.product.barcode || '—'}</span>
                <span className="font-bold text-paid dark:text-paid-bright shrink-0 font-sans">
                  {formatArabicCurrency(activeMenu.product.pricePiasters)}
                </span>
              </div>
            </div>

            {/* Actions List */}
            <div className="p-1.5 flex flex-col gap-0.5 max-h-[min(520px,calc(100vh-60px))] overflow-y-auto">
              {/* 1. Edit */}
              <button
                type="button"
                onClick={() => {
                  const p = activeMenu.product;
                  setActiveMenu(null);
                  onEditProduct(p);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-brand-soft dark:hover:bg-brand-soft/20 text-ink dark:text-ink-dark hover:text-brand dark:hover:text-brand-bright text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright group-hover:bg-brand group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Edit2 className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate">تعديل بيانات الصنف</span>
              </button>

              {/* 2. Movements Card */}
              <button
                type="button"
                onClick={() => {
                  const p = activeMenu.product;
                  setActiveMenu(null);
                  onSelectProdForMovements(p);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-paid-soft dark:hover:bg-paid-dark-soft text-ink dark:text-ink-dark hover:text-paid dark:hover:text-paid-bright text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright group-hover:bg-paid group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Boxes className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate">دفتر حركة الصنف بالمخزن</span>
              </button>

              {/* 3. Stock Adjustment */}
              <button
                type="button"
                onClick={() => {
                  const p = activeMenu.product;
                  setActiveMenu(null);
                  onSelectProdForAdjustment(p);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-warn-soft dark:hover:bg-warn-soft/20 text-ink dark:text-ink-dark hover:text-warn dark:hover:text-warn-bright text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-warn-soft dark:bg-warn-soft/20 text-warn dark:text-warn-bright group-hover:bg-warn group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Scale className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate">تسوية جرد وعدّ المخزن</span>
              </button>

              {/* 4. Print Barcode Label */}
              {onPrintLabel && (
                <button
                  type="button"
                  onClick={() => {
                    const p = activeMenu.product;
                    setActiveMenu(null);
                    onPrintLabel(p);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark hover:text-brand dark:hover:text-brand-bright text-[12px] font-bold transition-colors cursor-pointer group text-right"
                >
                  <div className="w-6 h-6 rounded-md bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted group-hover:bg-brand-soft dark:group-hover:bg-brand-soft/20 group-hover:text-brand dark:group-hover:text-brand-bright flex items-center justify-center shrink-0 transition-colors">
                    <Tag className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 min-w-0 truncate">طباعة استيكر باركود</span>
                </button>
              )}

              {/* 5. Price History */}
              <button
                type="button"
                onClick={() => {
                  const p = activeMenu.product;
                  setActiveMenu(null);
                  onOpenPriceHistory(p);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark hover:text-brand dark:hover:text-brand-bright text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted group-hover:bg-brand-soft dark:group-hover:bg-brand-soft/20 group-hover:text-brand dark:group-hover:text-brand-bright flex items-center justify-center shrink-0 transition-colors">
                  <History className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate">سجل وتاريخ تغيير الأسعار</span>
              </button>

              {/* 6. Purchase / Receiving */}
              {onSelectProdForPurchase && (
                <button
                  type="button"
                  onClick={() => {
                    const p = activeMenu.product;
                    setActiveMenu(null);
                    onSelectProdForPurchase(p);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-brand-soft dark:hover:bg-brand-soft/20 text-ink dark:text-ink-dark hover:text-brand dark:hover:text-brand-bright text-[12px] font-bold transition-colors cursor-pointer group text-right"
                >
                  <div className="w-6 h-6 rounded-md bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright group-hover:bg-brand group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <Truck className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 min-w-0 truncate">استلام وتزويد بضاعة للمخزن</span>
                </button>
              )}

              {/* 7. Batches / Expiry */}
              {onNavigateToBatches && (
                <button
                  type="button"
                  onClick={() => {
                    const p = activeMenu.product;
                    setActiveMenu(null);
                    onNavigateToBatches(p.name);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-warn-soft dark:hover:bg-warn-soft/20 text-ink dark:text-ink-dark hover:text-warn dark:hover:text-warn-bright text-[12px] font-bold transition-colors cursor-pointer group text-right"
                >
                  <div className="w-6 h-6 rounded-md bg-warn-soft dark:bg-warn-soft/20 text-warn dark:text-warn-bright group-hover:bg-warn group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 min-w-0 truncate">تواريخ الصلاحية والتشغيلات</span>
                </button>
              )}

              {/* 8. Variants / Matrix */}
              {activeMenu.product.hasVariants && onViewVariants && (
                <button
                  type="button"
                  onClick={() => {
                    const p = activeMenu.product;
                    setActiveMenu(null);
                    onViewVariants(p);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-brand-soft dark:hover:bg-brand-soft/20 text-ink dark:text-ink-dark hover:text-brand dark:hover:text-brand-bright text-[12px] font-bold transition-colors cursor-pointer group text-right"
                >
                  <div className="w-6 h-6 rounded-md bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright group-hover:bg-brand group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 min-w-0 truncate">المقاسات والألوان (الأصناف المتفرعة)</span>
                </button>
              )}

              {/* Divider */}
              <div className="my-0.5 border-t border-line dark:border-line-dark" />

              {/* 9. Delete Product */}
              <button
                type="button"
                onClick={() => {
                  const p = activeMenu.product;
                  setActiveMenu(null);
                  onDeleteProduct(p);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-danger-soft dark:hover:bg-danger-dark-soft text-ink dark:text-ink-dark hover:text-danger dark:hover:text-danger-bright text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright group-hover:bg-danger group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate text-danger dark:text-danger-bright">مسح الصنف من المحل</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
