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
  Box,
  Snowflake,
  X,
  CheckSquare,
  CheckCircle2,
} from 'lucide-react';
import type { Product } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';
import { formatCompoundStock, hasOpenPackage } from '../../utils/packaging';
import { formatUnitArabic } from '../../utils/units';
import { RafiqTableLoading } from '../../components/RafiqLoadingState';
import { useSmoothLoading } from '../../utils/useSmoothLoading';
import { getStoreTerminology } from '../../utils/storeTerminology';
import { useFeatures } from '../../context/useFeatures';
import { AppButton } from '../../components/AppButton';
import { RafiqTooltip } from '../../components/RafiqTooltip';
import { MENU_PANEL, MENU_ITEM, MENU_ITEM_DANGER, MENU_ITEM_ICON, MENU_ITEM_ICON_DANGER, MENU_DIVIDER, TABLE_ACTION_TRIGGER } from '../../utils/buttonStyles';
import { remToPx } from '../../utils/textScale';

export interface ProductsTableProps {
  products: Product[];
  selectedCategoryFilter: string;
  selectedProductIds: string[];
  totalCount?: number;
  loading?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  onToggleSelectAll: (filteredProds: Product[]) => void;
  onSelectAllCatalog?: () => void;
  onSelectOnlyPage?: () => void;
  isAllCatalogSelected?: boolean;
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
  totalCount,
  loading = false,
  canEdit = true,
  canDelete = true,
  onToggleSelectAll,
  onSelectAllCatalog,
  onSelectOnlyPage,
  isAllCatalogSelected = false,
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
  const { isEnabled } = useFeatures();
  const terminology = React.useMemo(() => getStoreTerminology(), []);

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
    const menuEstimatedHeight = remToPx(21.5625);
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpwards = spaceBelow < menuEstimatedHeight && rect.top > menuEstimatedHeight;

    const menuWidth = remToPx(17);
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
        <table className="w-full text-right border-collapse text-sm select-none">
          {/* Table Header */}
          <thead className="sticky top-0 z-10 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold text-xs select-none shadow-2xs">
            <tr className="h-10">
              <th className="w-14 px-2 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={
                      filteredProducts.length > 0 &&
                      (isAllCatalogSelected || selectedProductIds.length === filteredProducts.length)
                    }
                    ref={(el) => {
                      if (el) {
                        el.indeterminate =
                          selectedProductIds.length > 0 &&
                          !isAllCatalogSelected &&
                          selectedProductIds.length < filteredProducts.length;
                      }
                    }}
                    onChange={() => {
                      if (selectedProductIds.length > 0) {
                        onClearSelection();
                      } else {
                        onToggleSelectAll(filteredProducts);
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <span>#</span>
                </div>
              </th>
              <th className="w-36 px-2 text-right">الباركود</th>
              <th className="px-2 text-right min-w-[11rem]">اسم الصنف</th>
              <th className="w-36 px-2 text-right">سعر البيع</th>
              <th className="w-28 px-2 text-right">سعر الشراء (التكلفة)</th>
              <th className="w-32 px-2 text-center">
                <RafiqTooltip content="رصيد المخزن الحالي / حد التنبيه بالنواقص">
                  <span className="cursor-help">رصيد المخزن / النواقص</span>
                </RafiqTooltip>
              </th>
              <th className="w-24 px-2 text-center">حالة الصنف</th>
              <th className="w-28 px-2 text-center">خيارات الصنف</th>
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

                const rawBaseUnit = (prod.units && prod.units.length > 0)
                  ? (prod.units.find((u) => u.isBaseUnit)?.unitName || prod.unit)
                  : prod.unit;
                const baseUnitClean = (!rawBaseUnit || rawBaseUnit === 'piece' || rawBaseUnit === 'pc' || rawBaseUnit === 'unit' || rawBaseUnit === 'item')
                  ? 'قطعة'
                  : rawBaseUnit;

                const unitSuffix = isKg ? 'كجم' : (baseUnitClean === 'قطعة' ? 'ق' : ` ${baseUnitClean}`);
                const stockDisplay = isKg
                  ? `${stockQuantityCurrent.toFixed(3).replace(/\.?0+$/, '')} كجم`
                  : `${Math.round(stockQuantityCurrent)}${unitSuffix}`;

                const minStockDisplay = isKg
                  ? `${minStockQuantityItem.toFixed(3).replace(/\.?0+$/, '')}`
                  : `${Math.round(minStockQuantityItem)}`;

                let stockStatus = { label: 'متوفر', class: 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid-border dark:border-paid-dark-border' };
                if (stockQuantityCurrent <= 0) {
                  stockStatus = { label: 'خلصان', class: 'bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/30' };
                } else if (stockQuantityCurrent <= minStockQuantityItem) {
                  stockStatus = { label: 'ناقص', class: 'bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright border-warn-border dark:border-warn-bright/30' };
                }

                const isSelected = selectedProductIds.includes(prod.id);

                const displayUnit = (prod.displayUnitId ? (prod.units || []).find((u) => u.id === prod.displayUnitId) : null)
                  || (prod.defaultSaleUnitId ? (prod.units || []).find((u) => u.id === prod.defaultSaleUnitId) : null);
                const effectivePrice = displayUnit && displayUnit.sellPricePiasters > 0 ? displayUnit.sellPricePiasters : prod.pricePiasters;
                const effectiveCost = displayUnit && displayUnit.costPricePiasters > 0 ? displayUnit.costPricePiasters : prod.costPiasters;
                const rawUnitLabel = displayUnit ? displayUnit.unitName : (!isKg ? (prod.unit || 'قطعة') : null);
                const displayUnitLabel = (!rawUnitLabel || rawUnitLabel === 'piece' || rawUnitLabel === 'pc' || rawUnitLabel === 'item' || rawUnitLabel === 'unit')
                  ? 'قطعة'
                  : rawUnitLabel;

                const isCompound = (isEnabled('feature_loose_selling') || isEnabled('feature_multi_units')) && ((prod.isLooseSellable && isEnabled('feature_loose_selling')) || (prod.units && prod.units.length > 1 && isEnabled('feature_multi_units'))) && !isKg;
                const compoundStock = isCompound ? formatCompoundStock(prod.stockQuantityMilli, prod.units, baseUnitClean) : null;
                const openPackage = isCompound && hasOpenPackage(prod.stockQuantityMilli, prod.units);

                const stockPcs = Math.floor(stockQuantityCurrent);
                const largerUnits = (prod.units || []).filter((u) => !u.isBaseUnit && u.conversionFactor > 1);
                let unitBreakdown: string | null = null;
                if (isEnabled('feature_multi_units') && largerUnits.length > 0 && stockPcs > 0 && !isKg) {
                  const primaryLargeUnit = largerUnits[0];
                  const wholeLarge = Math.floor(stockPcs / primaryLargeUnit.conversionFactor);
                  const rem = stockPcs % primaryLargeUnit.conversionFactor;
                  if (wholeLarge > 0) {
                    unitBreakdown =
                      rem > 0
                        ? `${wholeLarge} ${formatUnitArabic(primaryLargeUnit.unitName)} + ${rem}`
                        : `${wholeLarge} ${formatUnitArabic(primaryLargeUnit.unitName)}`;
                  }
                }

                return (
                  <tr
                    key={prod.id}
                    onDoubleClick={() => {
                      if (canEdit) onEditProduct(prod);
                    }}
                    title={canEdit ? "انقر مرتين لتعديل بيانات الصنف" : undefined}
                    className={`h-12 hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors select-none ${
                      isSelected ? 'bg-brand/10 dark:bg-brand/20' : ''
                    }`}
                  >
                    {/* 1. Selection & Index */}
                    <td className="w-14 px-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelectProduct(prod.id)}
                          className="cursor-pointer"
                        />
                        <span className="font-mono text-xs text-ink-muted dark:text-ink-dark-muted tabular-nums">{index + 1}</span>
                      </div>
                    </td>

                    {/* 2. Barcode */}
                    <td className="w-36 px-2 text-right font-mono text-xs text-ink dark:text-ink-dark tabular-nums">
                      <div className="flex items-center gap-1">
                        <span className="truncate">{prod.barcode || <span className="text-ink-muted/50 dark:text-ink-dark-muted/70">—</span>}</span>
                        {prod.barcodes && prod.barcodes.length > 1 && (
                          <RafiqTooltip
                            content={`باركودات إضافية مسجلة للصنف:\n${prod.barcodes.map((b) => `• ${b}`).join('\n')}`}
                          >
                            <span
                              className="px-1.5 py-0.5 rounded-full bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-micro text-ink-muted dark:text-ink-dark-muted shrink-0 font-bold cursor-help"
                            >
                              +{prod.barcodes.length - 1}
                            </span>
                          </RafiqTooltip>
                        )}
                      </div>
                    </td>

                    {/* 3. Name & Badges */}
                    <td className="px-2 text-right">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-ink dark:text-ink-dark">{prod.name}</span>
                        {isKg && (
                          <RafiqTooltip content="يباع بالوزن (ميزان إلكتروني)">
                            <span
                              className="shrink-0 px-2 py-0.5 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright text-micro font-bold rounded-full flex items-center gap-0.5 cursor-help"
                            >
                              <Scale className="w-2.5 h-2.5" />
                              <span>وزن</span>
                            </span>
                          </RafiqTooltip>
                        )}
                        {isEnabled('feature_multi_units') && prod.units && prod.units.length > 1 && (
                          <RafiqTooltip
                            content={`وحدات البيع والعبوات المسجلة للصنف:\n${prod.units.map((u) => `• ${formatUnitArabic(u.unitName)} (يحتوي على ${u.conversionFactor} ${baseUnitClean})`).join('\n')}`}
                          >
                            <span
                              className="shrink-0 px-2 py-0.5 bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-micro font-bold rounded-full border border-paid/20 dark:border-paid/30 cursor-help"
                            >
                              {prod.units.length === 2 ? 'وحدتان' : `${prod.units.length} وحدات`}
                            </span>
                          </RafiqTooltip>
                        )}
                        {isEnabled('feature_taxes') && prod.taxRatePercent > 0 && (
                          <RafiqTooltip content={`تطبق ضريبة قيمة مضافة بنسبة ${prod.taxRatePercent}% على هذا الصنف`}>
                            <span className="shrink-0 px-2 py-0.5 bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-micro font-bold rounded-full border border-paid-border dark:border-paid-dark-border cursor-help">
                              {prod.taxRatePercent}% ضريبة
                            </span>
                          </RafiqTooltip>
                        )}
                        {isEnabled('feature_matrix_variants') && prod.hasVariants && (
                          <RafiqTooltip content={terminology.variantsTitle}>
                            <span
                              className="shrink-0 px-2 py-0.5 bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright text-micro font-bold rounded-full border border-brand/20 flex items-center gap-1 cursor-help"
                            >
                              <Layers className="w-2.5 h-2.5" />
                              <span>{terminology.variantsTitle}</span>
                            </span>
                          </RafiqTooltip>
                        )}
                        {isEnabled('feature_matrix_variants') && prod.variantColor && prod.variantSize && !/^[-—–_./\\]+$/.test(prod.variantColor.trim()) && !/^[-—–_./\\]+$/.test(prod.variantSize.trim()) && (
                          <RafiqTooltip content={`تركيبة: ${prod.variantColor} - ${prod.variantSize}`}>
                            <span
                              className="shrink-0 px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-micro font-mono font-bold text-ink-muted dark:text-ink-dark-muted cursor-help"
                            >
                              {prod.variantColor} | {prod.variantSize}
                            </span>
                          </RafiqTooltip>
                        )}
                        {isEnabled('feature_loose_selling') && prod.isLooseSellable && (
                          <RafiqTooltip content="صنف مفكوك يباع بالتجزئة">
                            <span
                              className="shrink-0 px-2 py-0.5 bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright text-micro font-bold rounded-full border border-brand/20 flex items-center gap-1 cursor-help"
                            >
                              <Boxes className="w-2.5 h-2.5" />
                              <span>تجزئة</span>
                            </span>
                          </RafiqTooltip>
                        )}
                        {isEnabled('feature_loose_selling') && openPackage && (
                          <RafiqTooltip content="يوجد عبوة مفتوحة بالمخزن">
                            <span
                              className="shrink-0 px-2 py-0.5 bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright text-micro font-bold rounded-full border border-warn-border dark:border-warn-bright/30 flex items-center gap-1 cursor-help"
                            >
                              <Box className="w-2.5 h-2.5" />
                              <span>علبة مفتوحة</span>
                            </span>
                          </RafiqTooltip>
                        )}
                        {isEnabled('feature_shelf_locations') && prod.locationCode && (
                          <RafiqTooltip content={`موقع التخزين والرف: ${prod.locationCode}${prod.locationName ? ` (${prod.locationName})` : ''}`}>
                            <span
                              className="shrink-0 px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-micro font-mono font-bold text-ink dark:text-ink-dark flex items-center gap-1 cursor-help"
                            >
                              <span>[{prod.locationCode}]</span>
                            </span>
                          </RafiqTooltip>
                        )}
                        {prod.isColdChain && (
                          <RafiqTooltip content="سلسلة تبريد (يحفظ في الثلاجة 2-8 درجات مئوية)">
                            <span
                              className="shrink-0 px-2 py-0.5 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 text-micro font-bold rounded-full border border-cyan-200 dark:border-cyan-800 flex items-center gap-1 cursor-help"
                            >
                              <Snowflake className="w-2.5 h-2.5" />
                              <span>ثلاجة</span>
                            </span>
                          </RafiqTooltip>
                        )}
                      </div>
                    </td>

                    {/* 4. Selling Price */}
                    <td className="w-36 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="flex items-center gap-1.5 justify-start">
                        <span className="font-black text-paid dark:text-paid-bright text-sm">
                          {formatArabicCurrency(effectivePrice)}
                        </span>
                        {isKg ? (
                          <span className="text-micro text-paid/80 dark:text-paid-bright font-normal">/كجم</span>
                        ) : displayUnitLabel ? (
                          <span className="text-micro text-paid/70 dark:text-paid-bright/70 font-normal">/{displayUnitLabel}</span>
                        ) : null}
                        {effectiveCost > 0 &&
                          (effectivePrice < effectiveCost ? (
                            <RafiqTooltip content="سعر البيع أقل من التكلفة (خسارة مادية)">
                              <span
                                className="text-micro px-1.5 py-0.5 rounded-full bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger-border dark:border-danger-bright/30 font-bold shrink-0 cursor-help"
                              >
                                خسارة
                              </span>
                            </RafiqTooltip>
                          ) : (
                            <RafiqTooltip content="نسبة هامش الربح المحسوبة من سعر التكلفة">
                              <span
                                className="text-micro px-1.5 py-0.5 rounded-full bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid-border dark:border-paid-dark-border font-bold shrink-0 cursor-help"
                              >
                                +{(((effectivePrice - effectiveCost) / effectiveCost) * 100).toFixed(0)}%
                              </span>
                            </RafiqTooltip>
                          ))}
                      </div>
                    </td>

                    {/* 5. Cost */}
                    <td className="w-28 px-2 text-right font-mono text-ink-muted dark:text-ink-dark-muted tabular-nums text-sm whitespace-nowrap">
                      {formatArabicCurrency(effectiveCost)}
                    </td>

                    {/* 6. Stock / Min Stock */}
                    <td className="w-32 px-2 text-center whitespace-nowrap">
                      <RafiqTooltip content="انقر لعرض دفتر كشف حركة الصنف بالمخزن ومتابعة الوارد والمنصرف">
                        <div
                          onClick={() => onSelectProdForMovements(prod)}
                          className="inline-flex flex-col items-center justify-center font-mono tabular-nums leading-tight cursor-pointer hover:bg-surface-2 dark:hover:bg-surface-dark-2 rounded-lg px-2 py-0.5 group transition-colors"
                        >
                          <span className="font-bold text-ink dark:text-ink-dark text-sm group-hover:text-paid dark:group-hover:text-brand-bright underline decoration-dotted underline-offset-2">
                            {stockDisplay}
                          </span>
                          {compoundStock ? (
                            <span
                              className="text-micro text-paid dark:text-paid-bright font-bold truncate max-w-[8.125rem]"
                            >
                              {compoundStock}
                            </span>
                          ) : unitBreakdown ? (
                            <span
                              className="text-micro text-paid dark:text-paid-bright font-bold truncate max-w-[6.875rem]"
                            >
                              ≈ {unitBreakdown}
                            </span>
                          ) : (
                            <span
                              className="text-micro text-ink-muted dark:text-ink-dark-muted"
                            >
                              حد {minStockDisplay}
                            </span>
                          )}
                        </div>
                      </RafiqTooltip>
                    </td>

                    {/* 7. Status */}
                    <td className="w-24 px-2 text-center whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-micro font-bold border ${stockStatus.class}`}>
                        {stockStatus.label}
                      </span>
                    </td>

                    {/* 8. Actions */}
                    <td className="w-28 px-2 text-center whitespace-nowrap">
                      <RafiqTooltip content="قائمة إجراءات وخيارات الصنف">
                        <button
                          type="button"
                          onClick={(e) => handleToggleMenu(prod, e)}
                          aria-haspopup="menu"
                          aria-expanded={activeMenu?.product.id === prod.id}
                          className={`${TABLE_ACTION_TRIGGER} select-none`}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                          <span>خيارات</span>
                          <ChevronDown
                            className={`w-3 h-3 text-ink-muted dark:text-ink-dark-muted transition-transform duration-150 ${
                              activeMenu?.product.id === prod.id ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      </RafiqTooltip>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk Action Bar: shown inline above the table while rows are selected */}
      {selectedProductIds.length > 0 && (
        <div className="order-first shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-brand-soft/80 dark:bg-brand-dark-soft/60 border-b border-brand/20 dark:border-brand-bright/20 text-xs font-bold animate-in fade-in select-none overflow-x-auto">
          {/* Right section: Selection scope & details */}
          <div className="flex items-center gap-2.5 shrink-0">
            {isAllCatalogSelected ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 h-8 px-3 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-brand-bright/30 text-paid dark:text-brand-bright shadow-2xs">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-paid dark:text-brand-bright" />
                  <span className="text-xs font-bold whitespace-nowrap">تم تحديد كل أصناف المحل</span>
                  <span className="font-mono font-black text-xs px-2 py-0.5 rounded-lg bg-paid dark:bg-brand-bright text-white dark:text-surface-dark tabular-nums">
                    {totalCount?.toLocaleString('ar-EG')} صنف
                  </span>
                </div>

                {onSelectOnlyPage && (
                  <AppButton
                    variant="secondary"
                    size="sm"
                    onClick={onSelectOnlyPage}
                    title="تحديد أصناف الصفحة المعروضة فقط"
                  >
                    تحديد هذه الصفحة فقط ({filteredProducts.length})
                  </AppButton>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 h-8 px-3 rounded-xl bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-2xs text-ink dark:text-ink-dark">
                  <span className="font-mono font-black text-xs px-2 py-0.5 rounded-lg bg-brand text-white dark:bg-brand-bright dark:text-surface-dark tabular-nums">
                    {selectedProductIds.length.toLocaleString('ar-EG')}
                  </span>
                  <span className="text-xs font-bold whitespace-nowrap">صنف محدد</span>
                  <span className="text-micro font-medium text-ink-muted dark:text-ink-dark-muted px-1.5 py-0.5 rounded-md bg-surface-2 dark:bg-surface-dark-2">
                    {selectedProductIds.length === filteredProducts.length ? 'هذه الصفحة' : 'محدد جزئياً'}
                  </span>
                </div>

                {totalCount !== undefined && totalCount > selectedProductIds.length && onSelectAllCatalog && (
                  <AppButton
                    variant="soft"
                    size="sm"
                    icon={CheckSquare}
                    onClick={onSelectAllCatalog}
                    title="تحديد كافة الأصناف في الكتالوج بالكامل"
                  >
                    <span>تحديد كل أصناف المحل</span>
                    <span className="font-mono tabular-nums">({totalCount.toLocaleString('ar-EG')} صنف)</span>
                  </AppButton>
                )}
              </div>
            )}
          </div>

          {/* Left section: Action buttons + Clear selection */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onBulkPrintLabels && (
              <AppButton variant="secondary" size="sm" icon={Tag} onClick={onBulkPrintLabels} title="طباعة استيكرات الباركود للأصناف المحددة">
                طباعة استيكرات
              </AppButton>
            )}

            {onOpenBulkPriceAdjustment && (
              <AppButton variant="secondary" size="sm" icon={TrendingUp} onClick={onOpenBulkPriceAdjustment} title="تعديل الأسعار والتكلفة بالجملة">
                تعديل الأسعار
              </AppButton>
            )}

            <AppButton variant="secondary" size="sm" icon={Boxes} onClick={onOpenBulkMinStockModal} title="تعديل حد النواقص والطلب">
              حد النواقص
            </AppButton>

            {canDelete && onBulkDelete && (
              <AppButton variant="dangerSoft" size="sm" icon={Trash2} onClick={onBulkDelete} title="حذف الأصناف المحددة">
                حذف
              </AppButton>
            )}

            <div className="h-5 w-px bg-line dark:bg-line-dark mx-1 shrink-0" />

            <AppButton variant="subtle" size="sm" icon={X} onClick={onClearSelection} title="إلغاء التحديد">
              إلغاء
            </AppButton>
          </div>
        </div>
      )}

      {/* Table Footer Status */}
      <div className="h-8 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark px-4 flex items-center justify-between text-micro text-ink-muted dark:text-ink-dark-muted shrink-0">
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
              width: '17rem',
              zIndex: 9999,
            }}
            onWheel={(e) => e.stopPropagation()}
            className={`${MENU_PANEL} !p-0 !gap-0 !rounded-2xl !shadow-2xl font-sans`}
            dir="rtl"
          >
            {/* Product Info Header */}
            <div className="p-2.5 bg-surface-2/80 dark:bg-surface-dark-2/80 border-b border-line dark:border-line-dark">
              <div className="font-bold text-xs text-ink dark:text-ink-dark truncate">{activeMenu.product.name}</div>
            </div>

            {/* Actions List */}
            <div className="p-1.5 flex flex-col gap-0.5 max-h-[min(520px,calc(100vh-60px))] overflow-y-auto">
              {/* 1. Edit */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const p = activeMenu.product;
                    setActiveMenu(null);
                    onEditProduct(p);
                  }}
                  className={MENU_ITEM}
                >
                  <span className={MENU_ITEM_ICON}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0 leading-snug">تعديل بيانات الصنف</span>
                </button>
              )}

              {/* 2. Movements Card */}
              <button
                type="button"
                onClick={() => {
                  const p = activeMenu.product;
                  setActiveMenu(null);
                  onSelectProdForMovements(p);
                }}
                className={MENU_ITEM}
              >
                <span className={MENU_ITEM_ICON}>
                  <Boxes className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 min-w-0 leading-snug">دفتر حركة الصنف بالمخزن</span>
              </button>

              {/* 3. Stock Adjustment */}
              <button
                type="button"
                onClick={() => {
                  const p = activeMenu.product;
                  setActiveMenu(null);
                  onSelectProdForAdjustment(p);
                }}
                className={MENU_ITEM}
              >
                <span className={MENU_ITEM_ICON}>
                  <Scale className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 min-w-0 leading-snug">تسوية جرد وعدّ المخزن</span>
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
                  className={MENU_ITEM}
                >
                  <span className={MENU_ITEM_ICON}>
                    <Tag className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0 leading-snug">طباعة استيكر باركود</span>
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
                className={MENU_ITEM}
              >
                <span className={MENU_ITEM_ICON}>
                  <History className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 min-w-0 leading-snug">سجل وتاريخ تغيير الأسعار</span>
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
                  className={MENU_ITEM}
                >
                  <span className={MENU_ITEM_ICON}>
                    <Truck className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0 leading-snug">استلام وتزويد بضاعة للمخزن</span>
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
                  className={MENU_ITEM}
                >
                  <span className={MENU_ITEM_ICON}>
                    <Clock className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0 leading-snug">تواريخ الصلاحية والتشغيلات</span>
                </button>
              )}

              {/* 8. Variants / Matrix */}
              {isEnabled('feature_matrix_variants') && activeMenu.product.hasVariants && onViewVariants && (
                <button
                  type="button"
                  onClick={() => {
                    const p = activeMenu.product;
                    setActiveMenu(null);
                    onViewVariants(p);
                  }}
                  className={MENU_ITEM}
                >
                  <span className={MENU_ITEM_ICON}>
                    <Layers className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0 leading-snug">{terminology.variantsTitle}</span>
                </button>
              )}

              {/* Divider */}
              <div className={MENU_DIVIDER} />

              {/* 9. Delete Product */}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => {
                    const p = activeMenu.product;
                    setActiveMenu(null);
                    onDeleteProduct(p);
                  }}
                  className={MENU_ITEM_DANGER}
                >
                  <span className={MENU_ITEM_ICON_DANGER}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 min-w-0 leading-snug">مسح الصنف من المحل</span>
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
