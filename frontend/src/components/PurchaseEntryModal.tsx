import React, { useState } from 'react';
import { AppButton } from './AppButton';
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
import { CustomSelect } from './CustomSelect';
import { RequiredMark } from './RequiredMark';
import { formatArabicCurrency, normalizeArabicNumerals } from '../utils/money';
import { formatUnitArabic } from '../utils/units';
import { useModalDismiss } from '../hooks/useModalDismiss';

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

  const defaultUnit = (product?.defaultPurchaseUnitId ? unitsList.find(u => u.id === product.defaultPurchaseUnitId) : null) ||
    unitsList.find(u => !u.isBaseUnit && u.conversionFactor > 1) ||
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

  const isDirty = Boolean(
    invoiceNumber.trim() ||
    supplierName.trim() ||
    (purchaseQtyInput.trim() !== '' && purchaseQtyInput.trim() !== '1') ||
    packageCostPiasters !== initialCost
  );

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen: isOpen && Boolean(product),
    onDismiss: onClose,
    isDirty,
    confirmTitle: 'إلغاء تسجيل استلام البضاعة؟',
    confirmMessage: 'تم إدخال بيانات توريد للصنف. هل أنت متأكد من الإلغاء والتراجع دون حفظ؟',
  });

  if (!isOpen || !product) return null;

  // Selected unit or fallback to default
  const selectedUnit = unitsList.find(u => u.id === selectedUnitId) || defaultUnit;
  const factor = selectedUnit && selectedUnit.conversionFactor > 0 ? selectedUnit.conversionFactor : 1;
  const unitName = selectedUnit ? formatUnitArabic(selectedUnit.unitName) : (isKg ? 'كجم' : 'قطعة');

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

      setSuccessMsg(`تم استلام الشراء: أُضيف ${baseQtyAdded} ${isKg ? 'كجم' : 'قطعة'} للمخزون`);
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
    <div onClick={handleBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none">
      <div className="bg-surface dark:bg-surface-dark rounded-xl shadow-2xl border border-line dark:border-line-dark w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-ink dark:text-ink-dark">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2 dark:bg-surface-dark-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand text-white flex items-center justify-center font-bold">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="t-modal-title text-ink dark:text-ink-dark leading-tight">تسجيل استلام بضاعة / فاتورة شراء</h3>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-tight mt-0.5">{product.name}</p>
            </div>
          </div>
          <AppButton variant="subtle" size="sm" icon={X} aria-label="إغلاق" onClick={requestClose} />
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 rounded text-danger dark:text-danger-bright text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid-dark-border rounded text-paid dark:text-paid-bright text-xs flex items-center gap-2 font-bold">
              <PackageCheck className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Current Stock Banner */}
          <div className="p-3 bg-surface-2 dark:bg-surface-dark-2 rounded border border-line dark:border-line-dark flex items-center justify-between text-xs">
            <span className="text-ink-muted dark:text-ink-dark-muted">الرصيد الفعلي الحالي في المخزن:</span>
            <span className="font-mono font-bold text-ink dark:text-ink-dark text-sm">
              {isKg ? `${currentBaseQty.toFixed(3)} كجم` : `${Math.round(currentBaseQty)} قطعة`}
            </span>
          </div>

          {/* Task 161-8: Unit Selection Dropdown & Conversion Factor Display */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
                وحدة الشراء المستلمة
              </label>
              {unitsList.length > 1 ? (
                  <CustomSelect
                    value={selectedUnit?.id || ''}
                    onChange={(val) => handleUnitChange(val)}
                    options={unitsList.map((u) => ({
                      value: u.id || '',
                      label: `${formatUnitArabic(u.unitName)} ${u.conversionFactor > 1 ? `(تحتوي على ${u.conversionFactor} قطعة)` : '(الوحدة الأساسية)'}`
                    }))}
                    className="w-full"
                    size="md"
                  />
              ) : (
                <div className="h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded flex items-center justify-between text-xs text-ink dark:text-ink-dark font-bold">
                  <span>{unitName} (الوحدة الأساسية)</span>
                  <span className="text-ink-muted dark:text-ink-dark-muted text-micro">معامل: ×1</span>
                </div>
              )}
            </div>

            {/* Quantity Input */}
            <div>
              <label className="text-xs font-bold text-ink dark:text-ink-dark block mb-1">
                الكمية المشتراة <RequiredMark />
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
                  className="w-full h-10 px-3 font-mono text-sm font-bold text-ink dark:text-ink-dark bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded focus:border-brand dark:focus:border-brand-bright focus:outline-none placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50"
                />
                <span className="absolute left-3 top-2.5 text-xs text-ink-muted dark:text-ink-dark-muted font-bold pointer-events-none">
                  {unitName}
                </span>
              </div>
            </div>
          </div>

          {/* Conversion Indicator (Task 161-9 & 161-10) */}
          {factor > 1 && (
            <div className="px-3 py-2 bg-brand-soft/60 dark:bg-brand-dark-soft/60 border border-brand/20 dark:border-brand-bright/20 rounded flex items-center justify-between text-xs text-brand dark:text-brand-bright font-bold">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
                <span>العبوة: 1 {unitName} = {factor} قطعة أساسية</span>
              </div>
              <span>إجمالي الكمية للمخزن: +{baseQtyAdded} قطعة</span>
            </div>
          )}

          {/* Unit Purchase Cost Input via MoneyInput */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-ink dark:text-ink-dark block">
              سعر شراء الوحدة الواحدة ({unitName})
            </label>
            <MoneyInput
              valuePiasters={packageCostPiasters}
              onChangePiasters={(p) => setPackageCostPiasters(p)}
              placeholder="0.00"
              className="h-10 text-sm"
            />
          </div>

          {/* Financial & Stock Preview Box */}
          <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark space-y-2 text-xs">
            <div className="flex items-center justify-between text-ink-muted dark:text-ink-dark-muted">
              <span>إجمالي فاتورة الشراء للصنف:</span>
              <span className="font-mono font-bold text-ink dark:text-ink-dark text-sm">
                {formatArabicCurrency(totalPurchasePiasters)}
              </span>
            </div>

            {/* Task 161-10: Calculated Base Unit Cost */}
            <div className="flex items-center justify-between pt-1 border-t border-line dark:border-line-dark">
              <div className="flex items-center gap-1 text-ink dark:text-ink-dark">
                <TrendingDown className="w-3.5 h-3.5 text-paid dark:text-paid-bright" />
                <span className="font-bold">سعر تكلفة القطعة الأساسية المحتسب:</span>
              </div>
              <span className="font-mono font-bold text-paid dark:text-paid-bright text-sm">
                {formatArabicCurrency(computedBaseCostPiasters)}
              </span>
            </div>

            {/* Task 161-9: Stock Addition Preview */}
            <div className="flex items-center justify-between pt-1 border-t border-line dark:border-line-dark text-ink dark:text-ink-dark">
              <span>رصيد المخزن بعد الاستلام:</span>
              <div className="flex items-center gap-1.5 font-mono font-bold">
                <span className="text-ink-muted dark:text-ink-dark-muted">({Math.round(currentBaseQty)})</span>
                <ArrowRight className="w-3 h-3 text-brand dark:text-brand-bright" />
                <span className="text-brand dark:text-brand-bright text-sm">{Math.round(newBaseQtyTotal)} {isKg ? 'كجم' : 'قطعة'}</span>
              </div>
            </div>
          </div>

          {/* Checkbox: Update Product Cost in Catalog */}
          <label className="flex items-center gap-2 text-xs font-semibold text-ink dark:text-ink-dark cursor-pointer select-none">
            <input
              type="checkbox"
              checked={updateProductCost}
              onChange={(e) => setUpdateProductCost(e.target.checked)}
              className="cursor-pointer"
            />
            <span>تحديث سعر التكلفة الافتراضي للصنف في الكتالوج إلى {formatArabicCurrency(computedBaseCostPiasters)}</span>
          </label>

          {/* Supplier & Invoice Reference Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-line dark:border-line-dark">
            <div>
              <label className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                <span>اسم المورد / الشركة</span>
              </label>
              <input
                type="text"
                placeholder="مثال: شركة النور للتوزيع"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50 focus:border-brand dark:focus:border-brand-bright focus:outline-none"
              />
            </div>
            <div>
              <label className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1 flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5" />
                <span>رقم الفاتورة / إذن الاستلام</span>
              </label>
              <input
                type="text"
                placeholder="مثال: INV-9842"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50 focus:border-brand dark:focus:border-brand-bright focus:outline-none"
              />
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between shrink-0">
          <AppButton variant="secondary" size="md" onClick={requestClose} disabled={loading}>
            إلغاء (Esc)
          </AppButton>

          <AppButton variant="primary" size="md" icon={PackageCheck} onClick={handleSubmit} disabled={loading || !isValidQty}>
            {loading ? 'جارٍ الحفظ...' : 'تأكيد استلام البضاعة وإضافة المخزون'}
          </AppButton>
        </div>
      </div>
    </div>
  );
};
