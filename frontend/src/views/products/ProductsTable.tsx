import React from 'react';
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
}) => {
  const filteredProducts = products.filter(
    (p) => selectedCategoryFilter === 'all' || (p.categoryId || 'cat_general') === selectedCategoryFilter
  );

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
                className={`h-12 border-b border-line px-4 grid grid-cols-12 items-center text-xs hover:bg-surface-2/60 transition-colors ${
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
                      className="px-1.5 py-0.5 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] text-[10px] text-[#52605D] shrink-0 font-bold"
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
                      title="منتج متعدد المقاسات والألوان (Matrix)"
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
                  className="col-span-1 flex flex-col items-center justify-center font-mono tabular-nums leading-tight cursor-pointer hover:bg-[#F8FAFC] rounded-lg py-1 group transition-colors"
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

                {/* Actions: History, Stock Adjust, Edit & Soft Delete */}
                <div className="col-span-1 flex items-center justify-center gap-1">
                  <button
                    onClick={() => onSelectProdForMovements(prod)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#52605D] hover:text-[#006D41] hover:bg-emerald-50 transition-colors cursor-pointer"
                    title="عرض كارت حركات الصنف"
                  >
                    <Boxes className="w-3.5 h-3.5" />
                  </button>
                  {onSelectProdForPurchase && (
                    <button
                      onClick={() => onSelectProdForPurchase(prod)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-[#52605D] hover:text-brand hover:bg-brand-soft transition-colors cursor-pointer"
                      title="استلام بضاعة / تسجيل شراء بالوحدة (كرتونة/دستة)"
                    >
                      <Truck className="w-3.5 h-3.5 text-brand" />
                    </button>
                  )}
                  <button
                    onClick={() => onSelectProdForAdjustment(prod)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#52605D] hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                    title="تسوية جردية للصنف"
                  >
                    <Scale className="w-3.5 h-3.5" />
                  </button>
                  {onPrintLabel && (
                    <button
                      onClick={() => onPrintLabel(prod)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-[#52605D] hover:text-[#006D41] hover:bg-emerald-50 transition-colors cursor-pointer"
                      title="طباعة ملصق باركود وسعر"
                    >
                      <Tag className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onOpenPriceHistory(prod)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#52605D] hover:text-[#006D41] hover:bg-emerald-50 transition-colors cursor-pointer"
                    title="سجل تغيير الأسعار"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onEditProduct(prod)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#52605D] hover:text-[#006D41] hover:bg-emerald-50 transition-colors cursor-pointer"
                    title="تعديل بيانات الصنف"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteProduct(prod)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-[#52605D] hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="حذف الصنف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
        <span>يتم تخزين جميع الأسعار بالقروش وتحديث حركة المخزون في معاملات SQLite فورية.</span>
        <span className="font-mono tabular-nums font-bold">{filteredProducts.length} صنف في هذه الصفحة</span>
      </div>
    </div>
  );
};
