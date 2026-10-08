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

export interface ProductsTableProps {
  products: Product[];
  selectedCategoryFilter: string;
  selectedProductIds: string[];
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
    <div className="flex-1 bg-surface border border-line rounded-2xl flex flex-col overflow-hidden relative shadow-xs">
      {/* Table Header */}
      <div className="h-10 bg-surface-2 border-b border-line px-4 grid grid-cols-12 items-center text-xs font-bold text-ink-muted shrink-0 select-none">
        <div className="col-span-1 flex items-center justify-center gap-1.5">
          <input
            type="checkbox"
            checked={filteredProducts.length > 0 && selectedProductIds.length === filteredProducts.length}
            onChange={() => onToggleSelectAll(filteredProducts)}
            className="w-4 h-4 rounded border-line accent-paid focus:ring-0 cursor-pointer"
            title="تحديد كل الأصناف المعروضة"
          />
          <span>#</span>
        </div>
        <span className="col-span-2">الباركود</span>
        <span className="col-span-3">اسم الصنف والوصف</span>
        <span className="col-span-2 text-left pl-2">سعر البيع</span>
        <span className="col-span-1 text-left">التكلفة</span>
        <span className="col-span-1 text-center" title="رصيد المخزن الحالي / حد التنبيه بالنواقص">الرصيد / حد النواقص</span>
        <span className="col-span-1 text-center">الحالة</span>
        <span className="col-span-1 text-center">إجراءات</span>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0]">
        {filteredProducts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#52605D] gap-2 p-8">
            <Package className="w-12 h-12 stroke-[1.2] text-[#CBD5E1]" />
            <p className="text-sm font-bold text-[#0F172A] m-0">لا توجد منتجات مسجلة مطابقة للبحث أو للقسم المختار</p>
            <p className="text-xs text-[#52605D] m-0">
              اضغط على زر &quot;إضافة صنف جديد&quot; أعلاه لتسجيل صنف في قاعدة البيانات
            </p>
          </div>
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

            let stockStatus = { label: 'متوفر', class: 'bg-emerald-50 text-[#006D41] border-emerald-200' };
            if (stockQuantityCurrent <= 0) {
              stockStatus = { label: 'نافد', class: 'bg-rose-50 text-rose-700 border-rose-200' };
            } else if (stockQuantityCurrent <= minStockQuantityItem) {
              stockStatus = { label: `نقص (${minStockDisplay})`, class: 'bg-amber-50 text-amber-700 border-amber-200' };
            }

            const isSelected = selectedProductIds.includes(prod.id);

            const stockPcs = Math.floor(stockQuantityCurrent);
            const largerUnits = (prod.units || []).filter(u => !u.isBaseUnit && u.conversionFactor > 1);
            let unitBreakdown: string | null = null;
            if (largerUnits.length > 0 && stockPcs > 0 && !isKg) {
              const primaryLargeUnit = largerUnits[0];
              const wholeLarge = Math.floor(stockPcs / primaryLargeUnit.conversionFactor);
              const rem = stockPcs % primaryLargeUnit.conversionFactor;
              if (wholeLarge > 0) {
                unitBreakdown = rem > 0 
                  ? `${wholeLarge} ${primaryLargeUnit.unitName} + ${rem}`
                  : `${wholeLarge} ${primaryLargeUnit.unitName}`;
              }
            }

            return (
              <div 
                key={prod.id} 
                onDoubleClick={() => onEditProduct(prod)}
                title="انقر مرتين لتعديل بيانات الصنف"
                className={`h-12 border-b border-line px-4 grid grid-cols-12 items-center text-xs hover:bg-surface-2/60 transition-colors select-none ${
                  isSelected ? 'bg-brand/10' : ''
                }`}
              >
                <div className="col-span-1 flex items-center justify-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelectProduct(prod.id)}
                    className="w-4 h-4 rounded border-line accent-paid focus:ring-0 cursor-pointer"
                  />
                  <span className="font-mono text-xs text-ink-muted tabular-nums">{index + 1}</span>
                </div>
                
                <div className="col-span-2 flex items-center gap-1 font-mono text-xs text-ink truncate tabular-nums">
                  <span className="truncate">{prod.barcode || <span className="text-ink-muted/50">—</span>}</span>
                  {prod.barcodes && prod.barcodes.length > 1 && (
                    <span 
                      className="px-1.5 py-0.5 rounded-full bg-surface-2 border border-line text-[10px] text-ink-muted shrink-0 font-bold"
                      title={`باركودات إضافية مسجلة للصنف:\n${prod.barcodes.join('\n')}`}
                    >
                      +{prod.barcodes.length - 1}
                    </span>
                  )}
                </div>

                <div className="col-span-3 flex items-center gap-1.5 truncate pr-1">
                  <span className="font-bold text-[#0F172A] truncate">{prod.name}</span>
                  {isKg && (
                    <span className="shrink-0 px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold rounded-full flex items-center gap-0.5" title="يباع بالوزن (ميزان)">
                      <Scale className="w-2.5 h-2.5" />
                      <span>وزن</span>
                    </span>
                  )}
                  {prod.units && prod.units.length > 1 && (
                    <span 
                      className="shrink-0 px-2 py-0.5 bg-emerald-50 text-[#004D3F] text-[10px] font-bold rounded-full border border-emerald-200"
                      title={`وحدات البيع المسجلة:\n${prod.units.map(u => `${u.unitName} (معامل ${u.conversionFactor})`).join('\n')}`}
                    >
                      {prod.units.length} وحدات
                    </span>
                  )}
                  {prod.taxRatePercent > 0 && (
                    <span className="shrink-0 px-2 py-0.5 bg-emerald-50 text-[#006D41] text-[10px] font-bold rounded-full border border-emerald-200">
                      {prod.taxRatePercent}% ضريبة
                    </span>
                  )}
                  {prod.hasVariants && (
                    <span
                      className="shrink-0 px-2 py-0.5 bg-brand-soft text-brand text-[10px] font-bold rounded-full border border-brand/20 flex items-center gap-1"
                      title="منتج متعدد المقاسات والألوان"
                    >
                      <Layers className="w-2.5 h-2.5" />
                      <span>مقاسات وألوان</span>
                    </span>
                  )}
                  {prod.variantColor && prod.variantSize && (
                    <span
                      className="shrink-0 px-1.5 py-0.2 rounded bg-surface-2 border border-line text-[10px] font-mono font-bold text-ink-muted"
                      title={`تركيبة: ${prod.variantColor} - ${prod.variantSize}`}
                    >
                      {prod.variantColor} | {prod.variantSize}
                    </span>
                  )}
                </div>

                <div className="col-span-2 flex items-center justify-start gap-1 font-mono text-left pl-2 tabular-nums">
                  <span className="font-black text-[#006D41] tabular-nums text-xs">
                    {formatArabicCurrency(prod.pricePiasters)}
                  </span>
                  {isKg && (
                    <span className="text-[10px] text-[#006D41]/80 font-normal">/كجم</span>
                  )}
                  {prod.costPiasters > 0 && (
                    prod.pricePiasters < prod.costPiasters ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-bold shrink-0" title="سعر البيع أقل من التكلفة (خسارة)">
                        خسارة
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-[#006D41] border border-emerald-200 font-bold shrink-0" title="نسبة الربح من التكلفة">
                        +{(((prod.pricePiasters - prod.costPiasters) / prod.costPiasters) * 100).toFixed(0)}%
                      </span>
                    )
                  )}
                </div>

                <span className="col-span-1 text-left font-mono text-[#52605D] tabular-nums text-xs">
                  {formatArabicCurrency(prod.costPiasters)}
                </span>

                <div 
                  onClick={() => onSelectProdForMovements(prod)}
                  className="col-span-1 flex flex-col items-center justify-center font-mono tabular-nums leading-tight cursor-pointer hover:bg-surface-2 rounded-lg py-1 group transition-colors"
                  title="انقر لعرض كارت حركات الصنف"
                >
                  <span className="font-bold text-[#0F172A] text-xs group-hover:text-[#006D41] underline decoration-dotted underline-offset-2">{stockDisplay}</span>
                  {unitBreakdown ? (
                    <span className="text-[9px] text-[#006D41] font-bold truncate max-w-full" title={`المكافئ بالوحدة الكبيرة: ${unitBreakdown}`}>
                      ≈ {unitBreakdown}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#52605D]" title={`حد الطلب الأدنى: ${minStockDisplay} ${isKg ? 'كجم' : 'قطعة'}`}>
                      حد {minStockDisplay}
                    </span>
                  )}
                </div>

                <div className="col-span-1 flex justify-center">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${stockStatus.class}`}>
                    {stockStatus.label}
                  </span>
                </div>

                {/* Single Unified Actions Dropdown Trigger */}
                <div className="col-span-1 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={(e) => handleToggleMenu(prod, e)}
                    className={`h-7 px-2.5 rounded-lg border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all shadow-2xs cursor-pointer select-none ${
                      activeMenu?.product.id === prod.id
                        ? 'bg-brand text-white border-brand ring-2 ring-brand/20 shadow-xs'
                        : 'bg-surface hover:bg-surface-2 border-line text-ink hover:text-brand hover:border-brand/40'
                    }`}
                    title="قائمة إجراءات وخيارات الصنف"
                  >
                    <MoreHorizontal
                      className={`w-3.5 h-3.5 transition-colors ${
                        activeMenu?.product.id === prod.id ? 'text-white' : 'text-brand'
                      }`}
                    />
                    <span>إجراءات</span>
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-150 ${
                        activeMenu?.product.id === prod.id ? 'rotate-180 text-white' : 'text-ink-muted'
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedProductIds.length > 0 && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-brand-dark text-white rounded-2xl px-5 py-2.5 shadow-2xl flex items-center gap-4 z-30 border border-paid/40 text-xs font-bold animate-fade-in">
          <span className="flex items-center gap-1.5 text-white">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>تم تحديد {selectedProductIds.length} صنف</span>
          </span>
          {onBulkPrintLabels && (
            <button
              type="button"
              onClick={onBulkPrintLabels}
              className="px-3.5 py-1.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer border border-brand-soft/20"
            >
              <Tag className="w-3.5 h-3.5" />
              <span>طباعة ملصقات ({selectedProductIds.length})</span>
            </button>
          )}
          {onOpenBulkPriceAdjustment && (
            <button
              type="button"
              onClick={onOpenBulkPriceAdjustment}
              className="px-3.5 py-1.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer border border-brand-soft/20"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>تعديل الأسعار والتكلفة ({selectedProductIds.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenBulkMinStockModal}
            className="px-3.5 py-1.5 bg-paid hover:bg-paid-hover text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <span>تعديل حد الطلب جماعياً</span>
          </button>
          {onBulkDelete && (
            <button
              type="button"
              onClick={onBulkDelete}
              className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف الأصناف المحددة ({selectedProductIds.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClearSelection}
            className="text-emerald-200 hover:text-white text-xs underline cursor-pointer"
          >
            إلغاء التحديد
          </button>
        </div>
      )}

      {/* Table Footer Status */}
      <div className="h-8 bg-surface-2 border-t border-line px-4 flex items-center justify-between text-[11px] text-ink-muted shrink-0">
        <span>يتم حفظ الأسعار وتحديث حركة المخزون تلقائياً وفورياً.</span>
        <span className="font-mono tabular-nums font-bold">{filteredProducts.length} صنف في هذه الصفحة</span>
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
            className="bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden animate-fade-in text-right font-sans select-none"
            dir="rtl"
          >
            {/* Product Info Header */}
            <div className="p-2.5 bg-surface-2/80 border-b border-line">
              <div className="font-bold text-xs text-ink truncate">{activeMenu.product.name}</div>
              <div className="flex items-center justify-between text-[10px] text-ink-muted mt-1 font-mono">
                <span className="truncate">كود: {activeMenu.product.barcode || '—'}</span>
                <span className="font-bold text-paid shrink-0 font-sans">
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
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-brand-soft text-ink hover:text-brand text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-brand-soft text-brand group-hover:bg-brand group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
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
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-paid-soft text-ink hover:text-paid text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-paid-soft text-paid group-hover:bg-paid group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Boxes className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate">كارت حركة المخزون</span>
              </button>

              {/* 3. Stock Adjustment */}
              <button
                type="button"
                onClick={() => {
                  const p = activeMenu.product;
                  setActiveMenu(null);
                  onSelectProdForAdjustment(p);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-warn-soft text-ink hover:text-warn text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-warn-soft text-warn group-hover:bg-warn group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Scale className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate">تسوية جردية للصنف</span>
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
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-2 text-ink hover:text-brand text-[12px] font-bold transition-colors cursor-pointer group text-right"
                >
                  <div className="w-6 h-6 rounded-md bg-surface-2 text-ink-muted group-hover:bg-brand-soft group-hover:text-brand flex items-center justify-center shrink-0 transition-colors">
                    <Tag className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 min-w-0 truncate">طباعة ملصق باركود</span>
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
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-2 text-ink hover:text-brand text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-surface-2 text-ink-muted group-hover:bg-brand-soft group-hover:text-brand flex items-center justify-center shrink-0 transition-colors">
                  <History className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate">سجل تغيير الأسعار</span>
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
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-brand-soft text-ink hover:text-brand text-[12px] font-bold transition-colors cursor-pointer group text-right"
                >
                  <div className="w-6 h-6 rounded-md bg-brand-soft text-brand group-hover:bg-brand group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <Truck className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 min-w-0 truncate">استلام بضاعة / شراء</span>
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
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-warn-soft text-ink hover:text-warn text-[12px] font-bold transition-colors cursor-pointer group text-right"
                >
                  <div className="w-6 h-6 rounded-md bg-warn-soft text-warn group-hover:bg-warn group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 min-w-0 truncate">الدفعات وتواريخ الصلاحية</span>
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
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-brand-soft text-ink hover:text-brand text-[12px] font-bold transition-colors cursor-pointer group text-right"
                >
                  <div className="w-6 h-6 rounded-md bg-brand-soft text-brand group-hover:bg-brand group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 min-w-0 truncate">المقاسات والألوان</span>
                </button>
              )}

              {/* Divider */}
              <div className="my-0.5 border-t border-line" />

              {/* 9. Delete Product */}
              <button
                type="button"
                onClick={() => {
                  const p = activeMenu.product;
                  setActiveMenu(null);
                  onDeleteProduct(p);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-danger-soft text-ink hover:text-danger text-[12px] font-bold transition-colors cursor-pointer group text-right"
              >
                <div className="w-6 h-6 rounded-md bg-danger-soft text-danger group-hover:bg-danger group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </div>
                <span className="flex-1 min-w-0 truncate text-danger">حذف الصنف</span>
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
