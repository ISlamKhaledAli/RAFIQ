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
  onBulkDelete?: () => void;
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
  onBulkDelete,
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
    <div className="flex-1 bg-white border border-[#dce1dc] rounded-lg flex flex-col overflow-hidden relative shadow-2xs">
      {/* Table Header */}
      <div className="h-[38px] bg-[#f7f8f6] border-b border-[#dce1dc] px-4 grid grid-cols-12 items-center text-xs font-bold text-[#5b6664] shrink-0 select-none">
        <div className="col-span-1 flex items-center justify-center gap-1.5">
          <input
            type="checkbox"
            checked={filteredProducts.length > 0 && selectedProductIds.length === filteredProducts.length}
            onChange={() => onToggleSelectAll(filteredProducts)}
            className="w-3.5 h-3.5 rounded border-[#dce1dc] accent-[#006d41] focus:ring-0 cursor-pointer"
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
      <div className="flex-1 overflow-y-auto divide-y divide-[#dce1dc]">
        {filteredProducts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#5b6664] gap-2 p-6">
            <Package className="w-12 h-12 stroke-[1.2] text-[#dce1dc]" />
            <p className="text-sm font-bold text-[#14181a] m-0">لا توجد منتجات مسجلة مطابقة للبحث أو للقسم المختار</p>
            <p className="text-xs text-[#5b6664] m-0">
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

            let stockStatus = { label: 'متوفر', class: 'bg-[#eaf5ee] text-[#1b7a4d] border-[#c4e3d0]' };
            if (stockQuantityCurrent <= 0) {
              stockStatus = { label: 'نافد', class: 'bg-[#fdf3f2] text-[#b23a2e] border-[#f6cbc6]' };
            } else if (stockQuantityCurrent <= minStockQuantityItem) {
              stockStatus = { label: `نقص (${minStockDisplay})`, class: 'bg-[#fef7ec] text-[#b3720e] border-[#f5deb4]' };
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
                className={`h-[46px] border-b border-[#dce1dc] px-4 grid grid-cols-12 items-center text-xs hover:bg-[#f7f8f6] transition-colors ${
                  isSelected ? 'bg-[#e1eae5]/40' : ''
                }`}
              >
                <div className="col-span-1 flex items-center justify-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelectProduct(prod.id)}
                    className="w-3.5 h-3.5 rounded border-[#dce1dc] accent-[#006d41] focus:ring-0 cursor-pointer"
                  />
                  <span className="font-mono text-xs text-[#5b6664] tabular-nums">{index + 1}</span>
                </div>
                
                <div className="col-span-2 flex items-center gap-1 font-mono text-xs text-[#14181a] truncate tabular-nums">
                  <span className="truncate">{prod.barcode || <span className="text-[#5b6664]">—</span>}</span>
                  {prod.barcodes && prod.barcodes.length > 1 && (
                    <span 
                      className="px-1.5 py-0.2 rounded bg-[#f7f8f6] border border-[#dce1dc] text-[10px] text-[#5b6664] shrink-0 font-bold"
                      title={`باركودات إضافية مسجلة للصنف:\n${prod.barcodes.join('\n')}`}
                    >
                      +{prod.barcodes.length - 1}
                    </span>
                  )}
                </div>

                <div className="col-span-3 flex items-center gap-1.5 truncate pr-1">
                  <span className="font-bold text-[#14181a] truncate">{prod.name}</span>
                  {isKg && (
                    <span className="shrink-0 px-1.5 py-0.2 bg-[#fef7ec] border border-[#f5deb4] text-[#b3720e] text-[10px] font-bold rounded flex items-center gap-0.5" title="يباع بالوزن (ميزان)">
                      <Scale className="w-2.5 h-2.5" />
                      <span>وزن</span>
                    </span>
                  )}
                  {prod.units && prod.units.length > 1 && (
                    <span 
                      className="shrink-0 px-1.5 py-0.2 bg-[#e1eae5] text-[#00372d] text-[9.5px] font-bold rounded border border-[#83bfaf]"
                      title={`وحدات البيع المسجلة:\n${prod.units.map(u => `${u.unitName} (معامل ${u.conversionFactor})`).join('\n')}`}
                    >
                      {prod.units.length} وحدات
                    </span>
                  )}
                  {prod.taxRatePercent > 0 && (
                    <span className="shrink-0 px-1.5 py-0.2 bg-[#e1eae5] text-[#006d41] text-[10px] font-bold rounded">
                      {prod.taxRatePercent}% ضريبة
                    </span>
                  )}
                </div>

                <div className="col-span-2 flex items-center justify-start gap-1 font-mono text-left pl-2 tabular-nums">
                  <span className="font-bold text-[#006d41] tabular-nums text-xs">
                    {formatArabicCurrency(prod.pricePiasters)}
                  </span>
                  {isKg && (
                    <span className="text-[10px] text-[#006d41]/80 font-normal">/كجم</span>
                  )}
                  {prod.costPiasters > 0 && (
                    prod.pricePiasters < prod.costPiasters ? (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-[#fdf3f2] text-[#b23a2e] border border-[#f6cbc6] font-bold shrink-0" title="سعر البيع أقل من التكلفة (خسارة)">
                        خسارة
                      </span>
                    ) : (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-[#e1eae5] text-[#006d41] border border-[#83bfaf] font-bold shrink-0" title="نسبة الربح من التكلفة">
                        +{(((prod.pricePiasters - prod.costPiasters) / prod.costPiasters) * 100).toFixed(0)}%
                      </span>
                    )
                  )}
                </div>

                <span className="col-span-1 text-left font-mono text-[#5b6664] tabular-nums text-xs">
                  {formatArabicCurrency(prod.costPiasters)}
                </span>

                <div 
                  onClick={() => onSelectProdForMovements(prod)}
                  className="col-span-1 flex flex-col items-center justify-center font-mono tabular-nums leading-tight cursor-pointer hover:bg-[#f7f8f6] rounded py-0.5 group transition-colors"
                  title="انقر لعرض كارت حركات الصنف"
                >
                  <span className="font-bold text-[#14181a] text-xs group-hover:text-[#006d41] underline decoration-dotted underline-offset-2">{stockDisplay}</span>
                  {unitBreakdown ? (
                    <span className="text-[9px] text-[#006d41] font-bold truncate max-w-full" title={`المكافئ بالوحدة الكبيرة: ${unitBreakdown}`}>
                      ≈ {unitBreakdown}
                    </span>
                  ) : (
                    <span className="text-[9.5px] text-[#5b6664]" title={`حد الطلب الأدنى: ${minStockDisplay} ${isKg ? 'كجم' : 'قطعة'}`}>
                      حد {minStockDisplay}
                    </span>
                  )}
                </div>

                <div className="col-span-1 flex justify-center">
                  <span className={`px-2 py-0.2 rounded text-[10px] font-bold border ${stockStatus.class}`}>
                    {stockStatus.label}
                  </span>
                </div>

                {/* Actions: History, Stock Adjust, Edit & Soft Delete */}
                <div className="col-span-1 flex items-center justify-center gap-1">
                  <button
                    onClick={() => onSelectProdForMovements(prod)}
                    className="p-1 rounded text-[#5b6664] hover:text-[#006d41] hover:bg-[#e1eae5] transition-colors cursor-pointer"
                    title="عرض كارت حركات الصنف"
                  >
                    <Boxes className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onSelectProdForAdjustment(prod)}
                    className="p-1 rounded text-[#5b6664] hover:text-[#b3720e] hover:bg-[#fef7ec] transition-colors cursor-pointer"
                    title="تسوية جردية للصنف"
                  >
                    <Scale className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onOpenPriceHistory(prod)}
                    className="p-1 rounded text-[#5b6664] hover:text-[#006d41] hover:bg-[#e1eae5] transition-colors cursor-pointer"
                    title="سجل تغيير الأسعار"
                  >
                    <History className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onEditProduct(prod)}
                    className="p-1 rounded text-[#5b6664] hover:text-[#006d41] hover:bg-[#e1eae5] transition-colors cursor-pointer"
                    title="تعديل بيانات الصنف"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteProduct(prod)}
                    className="p-1 rounded text-[#5b6664] hover:text-[#b23a2e] hover:bg-[#fdf3f2] transition-colors cursor-pointer"
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
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-[#00372d] text-white rounded-full px-5 py-2.5 shadow-2xl flex items-center gap-4 z-30 border border-[#0b4f42] text-xs font-bold animate-fade-in">
          <span className="flex items-center gap-1.5 text-white">
            <span className="w-2 h-2 rounded-full bg-[#006d41] animate-pulse" />
            <span>تم تحديد {selectedProductIds.length} صنف</span>
          </span>
          <button
            type="button"
            onClick={onOpenBulkMinStockModal}
            className="px-3.5 py-1 bg-[#006d41] hover:bg-[#005230] text-white rounded-full text-[11.5px] font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
          >
            <span>تعديل حد الطلب جماعياً</span>
          </button>
          {onBulkDelete && (
            <button
              type="button"
              onClick={onBulkDelete}
              className="px-3.5 py-1 bg-[#b23a2e] hover:bg-[#962e24] text-white rounded-full text-[11.5px] font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف الأصناف المحددة ({selectedProductIds.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClearSelection}
            className="text-[#96d3c1] hover:text-white text-[11px] underline cursor-pointer"
          >
            إلغاء التحديد
          </button>
        </div>
      )}

      {/* Table Footer Status */}
      <div className="h-[32px] bg-[#f7f8f6] border-t border-[#dce1dc] px-4 flex items-center justify-between text-[11px] text-[#5b6664] shrink-0">
        <span>يتم تخزين جميع الأسعار بالقروش وتحديث حركة المخزون في معاملات SQLite فورية.</span>
        <span className="font-mono tabular-nums">{products.length} منتج مسجل</span>
      </div>
    </div>
  );
};
