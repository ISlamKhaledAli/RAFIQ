import React, { useState } from 'react';
import {
  Truck,
  X,
  AlertCircle,
  PackageCheck,
  Building2,
  Receipt,
  Layers,
  ArrowRight,
  TrendingDown
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Product, ProductUnit } from '../types/models';
import { MoneyInput } from './MoneyInput';
import { formatArabicCurrency, normalizeArabicNumerals } from '../utils/money';

export interface PurchaseEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSuccess: () => void;
}

export const PurchaseEntryModal: React.FC<PurchaseEntryModalProps> = ({
  isOpen,
  onClose,
  product,
  onSuccess,
}) => {
  const unitsList: ProductUnit[] = product?.units || [];
  const isKg = product?.unit === 'kg';

  const defaultUnit = unitsList.find(u => !u.isBaseUnit && u.conversionFactor > 1) ||
    unitsList.find(u => u.isBaseUnit) ||
    (unitsList.length > 0 ? unitsList[0] : null);

  const initialCost = defaultUnit && defaultUnit.costPricePiasters > 0
    ? defaultUnit.costPricePiasters
    : (product && product.costPiasters > 0 ? product.costPiasters * (defaultUnit?.conversionFactor || 1) : 0);

  const [purchaseQtyInput, setPurchaseQtyInput] = useState('1');
  const [packageCostPiasters, setPackageCostPiasters] = useState(initialCost);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(defaultUnit?.id || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [updateProductCost, setUpdateProductCost] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen || !product) return null;

  // Selected unit or fallback to default
  const selectedUnit = unitsList.find(u => u.id === selectedUnitId) || defaultUnit;
  const factor = selectedUnit && selectedUnit.conversionFactor > 0 ? selectedUnit.conversionFactor : 1;
  const unitName = selectedUnit ? selectedUnit.unitName : (isKg ? 'كجم' : 'قطعة');

  // Calculations
  const parsedQty = parseFloat(normalizeArabicNumerals(purchaseQtyInput));
  const isValidQty = !isNaN(parsedQty) && parsedQty > 0;

  // Task 161-9: Added base stock = entered qty * conversion factor
  const baseQtyAdded = isValidQty ? parsedQty * factor : 0;
  const currentBaseQty = (product.stockQuantityMilli || 0) / 1000;
  const newBaseQtyTotal = currentBaseQty + baseQtyAdded;

  // Task 161-10: Base unit cost = package purchase cost / conversion factor
  const computedBaseCostPiasters = factor > 0 ? Math.round(packageCostPiasters / factor) : packageCostPiasters;

  // Total invoice line cost
  const totalPurchasePiasters = isValidQty ? Math.round(parsedQty * packageCostPiasters) : 0;

  const handleUnitChange = (newUnitId: string) => {
    setSelectedUnitId(newUnitId);
    const chosen = unitsList.find(u => u.id === newUnitId);
    if (chosen && chosen.costPricePiasters > 0) {
      setPackageCostPiasters(chosen.costPricePiasters);
    } else if (chosen && product.costPiasters > 0) {
      setPackageCostPiasters(product.costPiasters * chosen.conversionFactor);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidQty) {
      setError('يرجى إدخال كمية شراء صحيحة أكبر من صفر');
      return;
    }

    if (packageCostPiasters < 0) {
      setError('سعر الشراء لا يمكن أن يكون سالباً');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await invoke('inventory:recordPurchase', {
        productId: product.id,
        unitId: selectedUnit?.id || null,
        purchaseQuantity: parsedQty,
        packageCostPiasters: packageCostPiasters,
        invoiceNumber: invoiceNumber.trim() || null,
        supplierName: supplierName.trim() || null,
        updateProductCost: updateProductCost,
        userId: 'admin'
      });

      setSuccessMsg(`تم استلام الشراء بنجاح! أُضيف ${baseQtyAdded} ${isKg ? 'كجم' : 'قطعة'} للمخزون.`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`فشل تسجيل الشراء: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-surface rounded-xl shadow-2xl border border-line w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between bg-surface-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand text-white flex items-center justify-center font-bold">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink leading-tight">تسجيل استلام بضاعة / فاتورة شراء</h3>
              <p className="text-xs text-ink-muted leading-tight mt-0.5">{product.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface border border-transparent hover:border-line transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-danger-soft border border-danger/30 rounded text-danger text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-paid-soft border border-paid/30 rounded text-paid text-xs flex items-center gap-2 font-bold">
              <PackageCheck className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Current Stock Banner */}
          <div className="p-3 bg-surface-2 rounded border border-line flex items-center justify-between text-xs">
            <span className="text-ink-muted">الرصيد الفعلي الحالي في المخزن:</span>
            <span className="font-mono font-bold text-ink text-sm">
              {isKg ? `${currentBaseQty.toFixed(3)} كجم` : `${Math.round(currentBaseQty)} قطعة`}
            </span>
          </div>

          {/* Task 161-8: Unit Selection Dropdown & Conversion Factor Display */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-ink block mb-1">
                وحدة الشراء المستلمة <span className="text-danger">*</span>
              </label>
              {unitsList.length > 1 ? (
                <div className="relative">
                  <select
                    value={selectedUnit?.id || ''}
                    onChange={(e) => handleUnitChange(e.target.value)}
                    className="w-full h-10 px-3 bg-surface border border-line rounded text-xs font-bold text-brand focus:border-brand focus:outline-none"
                  >
                    {unitsList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitName} {u.conversionFactor > 1 ? `(تحتوي على ${u.conversionFactor} قطعة)` : '(الوحدة الأساسية)'}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="h-10 px-3 bg-surface-2 border border-line rounded flex items-center justify-between text-xs text-ink font-bold">
                  <span>{unitName} (الوحدة الأساسية)</span>
                  <span className="text-ink-muted text-[11px]">معامل: ×1</span>
                </div>
              )}
            </div>

            {/* Quantity Input */}
            <div>
              <label className="text-xs font-bold text-ink block mb-1">
                الكمية المشتراة <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  placeholder="مثال: 5"
                  value={purchaseQtyInput}
                  onChange={(e) => {
                    setPurchaseQtyInput(normalizeArabicNumerals(e.target.value));
                    setError('');
                  }}
                  className="w-full h-10 px-3 font-mono text-sm font-bold text-ink bg-surface border border-line rounded focus:border-brand focus:outline-none"
                />
                <span className="absolute left-3 top-2.5 text-xs text-ink-muted font-bold pointer-events-none">
                  {unitName}
                </span>
              </div>
            </div>
          </div>

          {/* Conversion Indicator (Task 161-9 & 161-10) */}
          {factor > 1 && (
            <div className="px-3 py-2 bg-brand-soft/60 border border-brand/20 rounded flex items-center justify-between text-xs text-brand font-bold">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-brand" />
                <span>العبوة: 1 {unitName} = {factor} قطعة أساسية</span>
              </div>
              <span>إجمالي الكمية للمخزن: +{baseQtyAdded} قطعة</span>
            </div>
          )}

          {/* Unit Purchase Cost Input via MoneyInput */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-ink block">
              سعر شراء الوحدة الواحدة ({unitName}) <span className="text-danger">*</span>
            </label>
            <MoneyInput
              valuePiasters={packageCostPiasters}
              onChangePiasters={(p) => setPackageCostPiasters(p)}
              placeholder="0.00"
              className="h-10 text-sm"
            />
          </div>

          {/* Financial & Stock Preview Box */}
          <div className="p-3.5 bg-surface-2 rounded-xl border border-line space-y-2 text-xs">
            <div className="flex items-center justify-between text-ink-muted">
              <span>إجمالي فاتورة الشراء للصنف:</span>
              <span className="font-mono font-bold text-ink text-sm">
                {formatArabicCurrency(totalPurchasePiasters)}
              </span>
            </div>

            {/* Task 161-10: Calculated Base Unit Cost */}
            <div className="flex items-center justify-between pt-1 border-t border-line">
              <div className="flex items-center gap-1 text-ink">
                <TrendingDown className="w-3.5 h-3.5 text-paid" />
                <span className="font-bold">سعر تكلفة القطعة الأساسية المحتسب:</span>
              </div>
              <span className="font-mono font-bold text-paid text-sm">
                {formatArabicCurrency(computedBaseCostPiasters)}
              </span>
            </div>

            {/* Task 161-9: Stock Addition Preview */}
            <div className="flex items-center justify-between pt-1 border-t border-line text-ink">
              <span>رصيد المخزن بعد الاستلام:</span>
              <div className="flex items-center gap-1.5 font-mono font-bold">
                <span className="text-ink-muted">({Math.round(currentBaseQty)})</span>
                <ArrowRight className="w-3 h-3 text-brand" />
                <span className="text-brand text-sm">{Math.round(newBaseQtyTotal)} {isKg ? 'كجم' : 'قطعة'}</span>
              </div>
            </div>
          </div>

          {/* Checkbox: Update Product Cost in Catalog */}
          <label className="flex items-center gap-2 text-xs font-semibold text-ink cursor-pointer select-none">
            <input
              type="checkbox"
              checked={updateProductCost}
              onChange={(e) => setUpdateProductCost(e.target.checked)}
              className="w-4 h-4 rounded border-line text-brand focus:ring-0 cursor-pointer"
            />
            <span>تحديث سعر التكلفة الافتراضي للصنف في الكتالوج إلى {formatArabicCurrency(computedBaseCostPiasters)}</span>
          </label>

          {/* Supplier & Invoice Reference Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-line">
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                <span>اسم المورد / الشركة</span>
              </label>
              <input
                type="text"
                placeholder="مثال: شركة النور للتوزيع"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-surface border border-line rounded text-ink focus:border-brand focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-ink-muted block mb-1 flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5" />
                <span>رقم الفاتورة / إذن الاستلام</span>
              </label>
              <input
                type="text"
                placeholder="مثال: INV-9842"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono bg-surface border border-line rounded text-ink focus:border-brand focus:outline-none"
              />
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-line bg-surface-2 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-surface border border-line text-ink hover:bg-surface-2 rounded text-xs font-bold transition-colors disabled:opacity-50"
          >
            إلغاء (Esc)
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !isValidQty}
            className="px-5 py-2 bg-brand hover:bg-brand-hover text-white rounded text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <PackageCheck className="w-4 h-4" />
            <span>{loading ? 'جارٍ الحفظ...' : 'تأكيد استلام البضاعة وإضافة المخزون'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
