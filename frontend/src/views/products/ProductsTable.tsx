import React from 'react';
import {
  Package,
  Scale,
  Boxes,
  History,
  Edit2,
  Trash2,
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
  onClearSelection: () => void;
  onSelectProdForMovements: (prod: Product) => void;
  onSelectProdForAdjustment: (prod: Product) => void;
  onOpenPriceHistory: (prod: Product) => void;
  onEditProduct: (prod: Product) => void;
  onDeleteProduct: (prod: Product) => void;
}

export const ProductsTable: React.FC<ProductsTableProps> = ({
  products,
  selectedCategoryFilter,
  selectedProductIds,
  onToggleSelectAll,
  onToggleSelectProduct,
  onOpenBulkMinStockModal,
  onClearSelection,
  onSelectProdForMovements,
  onSelectProdForAdjustment,
  onOpenPriceHistory,
  onEditProduct,
  onDeleteProduct,
}) => {
  const filteredProducts = products.filter(
    (p) => selectedCategoryFilter === 'all' || (p.categoryId || 'cat_general') === selectedCategoryFilter
  );

  return (
    <div className="flex-1 bg-surface hairline-all rounded-[6px] flex flex-col overflow-hidden relative">
      {/* Table Header */}
      <div className="h-[38px] bg-surface-2 hairline-b px-4 grid grid-cols-12 items-center text-[12px] font-bold text-ink-muted shrink-0 select-none">
        <div className="col-span-1 flex items-center justify-center gap-1.5">
          <input
            type="checkbox"
            checked={filteredProducts.length > 0 && selectedProductIds.length === filteredProducts.length}
            onChange={() => onToggleSelectAll(filteredProducts)}
            className="w-3.5 h-3.5 rounded border-line text-brand focus:ring-0 cursor-pointer"
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
      <div className="flex-1 overflow-y-auto divide-y divide-line">
        {filteredProducts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2 p-6">
            <Package className="w-12 h-12 stroke-[1.2] text-ink-muted opacity-50" />
            <p className="text-[14px] font-semibold text-ink m-0">لا توجد منتجات مسجلة مطابقة للبحث أو للقسم المختار</p>
            <p className="text-[12px] text-ink-muted m-0">
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

            let stockStatus = { label: 'متوفر', class: 'bg-paid-soft text-paid border-paid-border' };
            if (stockQuantityCurrent <= 0) {
              stockStatus = { label: 'نافد', class: 'bg-danger-soft text-danger border-danger-border' };
            } else if (stockQuantityCurrent <= minStockQuantityItem) {
              stockStatus = { label: `نقص (${minStockDisplay})`, class: 'bg-warn-soft text-warn border-warn-border' };
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
                className={`h-[46px] hairline-b px-4 grid grid-cols-12 items-center text-[13px] hover:bg-surface-2 transition-colors ${
                  isSelected ? 'bg-brand-soft/40' : ''
                }`}
              >
                <div className="col-span-1 flex items-center justify-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelectProduct(prod.id)}
                    className="w-3.5 h-3.5 rounded border-line text-brand focus:ring-0 cursor-pointer"
                  />
                  <span className="font-mono text-xs text-ink-muted">{index + 1}</span>
                </div>
                
                <div className="col-span-2 flex items-center gap-1 font-mono text-xs text-ink truncate">
                  <span className="truncate">{prod.barcode || <span className="text-ink-muted">—</span>}</span>
                  {prod.barcodes && prod.barcodes.length > 1 && (
                    <span 
                      className="px-1.5 py-0.5 rounded bg-surface-2 border border-line text-[10px] text-ink-muted shrink-0 font-bold"
                      title={`باركودات إضافية مسجلة للصنف:\n${prod.barcodes.join('\n')}`}
                    >
                      +{prod.barcodes.length - 1}
                    </span>
                  )}
                </div>

                <div className="col-span-3 flex items-center gap-1.5 truncate pr-1">
                  <span className="font-semibold text-ink truncate">{prod.name}</span>
                  {isKg && (
                    <span className="shrink-0 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold rounded flex items-center gap-0.5" title="يباع بالوزن (ميزان)">
                      <Scale className="w-2.5 h-2.5" />
                      <span>وزن</span>
                    </span>
                  )}
                  {prod.units && prod.units.length > 1 && (
                    <span 
                      className="shrink-0 px-1.5 py-0.5 bg-brand-soft text-brand text-[9.5px] font-bold rounded border border-brand/20"
                      title={`وحدات البيع المسجلة:\n${prod.units.map(u => `${u.unitName} (معامل ${u.conversionFactor})`).join('\n')}`}
                    >
                      {prod.units.length} وحدات
                    </span>
                  )}
                  {prod.taxRatePercent > 0 && (
                    <span className="shrink-0 px-1.5 py-0.5 bg-brand-soft text-brand text-[10px] font-bold rounded">
                      {prod.taxRatePercent}% ضريبة
                    </span>
                  )}
                </div>

                <div className="col-span-2 flex items-center justify-start gap-1 font-mono text-left pl-2">
                  <span className="font-bold text-brand tabular-nums text-[13px]">
                    {formatArabicCurrency(prod.pricePiasters)}
                  </span>
                  {isKg && (
                    <span className="text-[10px] text-brand/80 font-normal">/كجم</span>
                  )}
                  {prod.costPiasters > 0 && (
                    prod.pricePiasters < prod.costPiasters ? (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-danger-soft text-danger font-bold shrink-0" title="سعر البيع أقل من التكلفة (خسارة)">
                        خسارة
                      </span>
                    ) : (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-brand-soft text-brand font-bold shrink-0" title="نسبة الربح من التكلفة">
                        +{(((prod.pricePiasters - prod.costPiasters) / prod.costPiasters) * 100).toFixed(0)}%
                      </span>
                    )
                  )}
                </div>

                <span className="col-span-1 text-left font-mono text-ink-muted tabular-nums text-[12px]">
                  {formatArabicCurrency(prod.costPiasters)}
                </span>

                <div 
                  onClick={() => onSelectProdForMovements(prod)}
                  className="col-span-1 flex flex-col items-center justify-center font-mono tabular-nums leading-tight cursor-pointer hover:bg-surface-2 rounded py-0.5 group transition-colors"
                  title="انقر لعرض كارت حركات الصنف"
                >
                  <span className="font-bold text-ink text-[12px] group-hover:text-brand underline decoration-dotted underline-offset-2">{stockDisplay}</span>
                  {unitBreakdown ? (
                    <span className="text-[9px] text-brand font-bold truncate max-w-full" title={`المكافئ بالوحدة الكبيرة: ${unitBreakdown}`}>
                      ≈ {unitBreakdown}
                    </span>
                  ) : (
                    <span className="text-[9.5px] text-ink-muted" title={`حد الطلب الأدنى: ${minStockDisplay} ${isKg ? 'كجم' : 'قطعة'}`}>
                      حد {minStockDisplay}
                    </span>
                  )}
                </div>

                <div className="col-span-1 flex justify-center">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${stockStatus.class}`}>
                    {stockStatus.label}
                  </span>
                </div>

                {/* Actions: History, Stock Adjust, Edit & Soft Delete */}
                <div className="col-span-1 flex items-center justify-center gap-1">
                  <button
                    onClick={() => onSelectProdForMovements(prod)}
                    className="p-1 rounded text-ink-muted hover:text-brand hover:bg-surface transition-colors"
                    title="عرض كارت حركات الصنف"
                  >
                    <Boxes className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onSelectProdForAdjustment(prod)}
                    className="p-1 rounded text-ink-muted hover:text-amber-600 hover:bg-surface transition-colors"
                    title="تسوية جردية للصنف"
                  >
                    <Scale className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onOpenPriceHistory(prod)}
                    className="p-1 rounded text-ink-muted hover:text-brand hover:bg-surface transition-colors"
                    title="سجل تغيير الأسعار"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onEditProduct(prod)}
                    className="p-1 rounded text-ink-muted hover:text-brand hover:bg-surface transition-colors"
                    title="تعديل الصنف"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteProduct(prod)}
                    className="p-1 rounded text-ink-muted hover:text-danger hover:bg-surface transition-colors"
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

      {/* Floating Bulk Action Bar (Feature #18 / Task 18-2) */}
      {selectedProductIds.length > 0 && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-ink text-surface rounded-full px-5 py-2.5 shadow-2xl flex items-center gap-4 z-30 border border-line text-[12px] font-bold animate-fade-in">
          <span className="flex items-center gap-1.5 text-white">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            <span>تم تحديد {selectedProductIds.length} صنف</span>
          </span>
          <button
            type="button"
            onClick={onOpenBulkMinStockModal}
            className="px-3.5 py-1 bg-brand hover:bg-brand-hover text-white rounded-full text-[11.5px] font-bold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <span>تعديل حد الطلب جماعياً</span>
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            className="text-ink-muted hover:text-white text-[11px] underline"
          >
            إلغاء التحديد
          </button>
        </div>
      )}

      {/* Table Footer Status */}
      <div className="h-[32px] bg-surface-2 hairline-t px-4 flex items-center justify-between text-[11px] text-ink-muted shrink-0">
        <span>يتم تخزين جميع الأسعار بالقروش وتحديث حركة المخزون في معاملات SQLite فورية.</span>
        <span className="font-mono tabular-nums">{products.length} منتج مسجل</span>
      </div>
    </div>
  );
};
