import React, { useMemo } from 'react';
import {
  ShoppingCart,
  Plus,
  Search,
  Trash2,
  Receipt,
  Banknote,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import { CustomSelect } from '../../components/CustomSelect';
import type { Supplier, Product } from '../../types/models';
import { formatMoney, type NewPurchaseLineItem } from './types';

interface NewPurchaseTabProps {
  suppliers: Supplier[];
  selectedSupplierId: string;
  setSelectedSupplierId: (id: string) => void;
  supplierInvoiceNumber: string;
  setSupplierInvoiceNumber: (num: string) => void;
  costingMethod: 'LATEST' | 'WEIGHTED_AVERAGE';
  setCostingMethod: (method: 'LATEST' | 'WEIGHTED_AVERAGE') => void;
  purchaseNotes: string;
  setPurchaseNotes: (notes: string) => void;
  discountPiasters: number;
  setDiscountPiasters: (p: number) => void;
  paymentMode: 'PAID' | 'CREDIT' | 'PARTIAL';
  setPaymentMode: (mode: 'PAID' | 'CREDIT' | 'PARTIAL') => void;
  customPaidAmountPiasters: number;
  setCustomPaidAmountPiasters: (p: number) => void;
  lineItems: NewPurchaseLineItem[];
  setLineItems: React.Dispatch<React.SetStateAction<NewPurchaseLineItem[]>>;
  productSearchQuery: string;
  setProductSearchQuery: (q: string) => void;
  isSearchingProduct: boolean;
  catalogProducts: Product[];
  onAddProduct: (prod: Product) => void;
  onOpenAddSupplier: () => void;
  onSavePurchase: () => void;
  onRequestCancel: () => void;
}

export const NewPurchaseTab: React.FC<NewPurchaseTabProps> = ({
  suppliers,
  selectedSupplierId,
  setSelectedSupplierId,
  supplierInvoiceNumber,
  setSupplierInvoiceNumber,
  costingMethod,
  setCostingMethod,
  purchaseNotes,
  setPurchaseNotes,
  discountPiasters,
  setDiscountPiasters,
  paymentMode,
  setPaymentMode,
  customPaidAmountPiasters,
  setCustomPaidAmountPiasters,
  lineItems,
  setLineItems,
  productSearchQuery,
  setProductSearchQuery,
  isSearchingProduct,
  catalogProducts,
  onAddProduct,
  onOpenAddSupplier,
  onSavePurchase,
  onRequestCancel,
}) => {
  const displayedCatalogProducts = useMemo(() => {
    if (!productSearchQuery.trim() || productSearchQuery.length < 2) return [];
    return catalogProducts;
  }, [productSearchQuery, catalogProducts]);

  const totalCostPiasters = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + Math.round(item.quantityUnits * item.unitCostPiasters), 0);
  }, [lineItems]);

  const netCostPiasters = useMemo(() => {
    return Math.max(0, totalCostPiasters - discountPiasters);
  }, [totalCostPiasters, discountPiasters]);

  const paidAmountPiasters = useMemo(() => {
    if (paymentMode === 'PAID') return netCostPiasters;
    if (paymentMode === 'CREDIT') return 0;
    return Math.min(netCostPiasters, Math.max(0, customPaidAmountPiasters));
  }, [paymentMode, netCostPiasters, customPaidAmountPiasters]);

  const remainingAmountPiasters = useMemo(() => {
    return Math.max(0, netCostPiasters - paidAmountPiasters);
  }, [netCostPiasters, paidAmountPiasters]);

  return (
    <div className="flex-1 flex gap-3 sm:gap-4 overflow-hidden">
      {/* Left: Line Items & Search (Canvas) */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
        {/* Invoice Master Header Inputs */}
        <div className="bg-surface border border-line rounded-xl p-3 sm:p-3.5 grid grid-cols-12 gap-2.5 sm:gap-3 items-center shrink-0 shadow-2xs">
          <div className="col-span-4">
            <label className="text-[11px] font-bold text-ink-muted block mb-1">
              المورد <span className="text-danger">*</span>
            </label>
            <div className="flex items-center gap-1.5">
              <CustomSelect
                value={selectedSupplierId}
                onChange={(val) => setSelectedSupplierId(val)}
                placeholder="-- اختر مورد الفاتورة --"
                options={[
                  { value: '', label: '-- اختر مورد الفاتورة --' },
                  ...suppliers
                    .filter((s) => s.isActive)
                    .map((s) => ({
                      value: s.id,
                      label: s.name,
                      badge: s.balancePiasters > 0 ? `مديونية: ${(s.balancePiasters / 100).toFixed(2)} ج.م` : undefined,
                    })),
                ]}
                className="flex-1 min-w-0"
                size="md"
                searchable
              />
              <button
                type="button"
                onClick={onOpenAddSupplier}
                className="h-8 px-2.5 bg-brand-soft hover:bg-brand/20 text-brand-dark rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 border border-brand/20 transition-colors cursor-pointer"
                title="إضافة مورد جديد سريعاً"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>مورد جديد</span>
              </button>
            </div>
          </div>

          <div className="col-span-3">
            <label className="text-[11px] font-bold text-ink-muted block mb-1">
              رقم فاتورة المورد الورقية
            </label>
            <input
              type="text"
              placeholder="مثال: INV-8840"
              value={supplierInvoiceNumber}
              onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
              className="w-full h-9 px-3 bg-surface-2 border border-line rounded-xl text-xs font-mono font-medium text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
            />
          </div>

          <div className="col-span-3">
            <label className="text-[11px] font-bold text-ink-muted block mb-1">
              طريقة تحديث التكلفة
            </label>
            <CustomSelect
              value={costingMethod}
              onChange={(val) => setCostingMethod(val as 'LATEST' | 'WEIGHTED_AVERAGE')}
              options={[
                { value: 'LATEST', label: 'آخر سعر شراء (المعتاد في السوبرماركت)' },
                { value: 'WEIGHTED_AVERAGE', label: 'المتوسط المرجح للتكلفة (محاسبي)' },
              ]}
              className="w-full"
              size="md"
            />
          </div>

          <div className="col-span-2 text-left">
            <span className="text-[11px] text-ink-muted block">تاريخ الفاتورة</span>
            <span className="text-xs font-bold text-ink">
              {new Date().toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Barcode & Product Scanner Search Bar */}
        <div className="relative shrink-0">
          <div className="h-12 bg-surface border border-line focus-within:border-brand rounded-xl flex items-center px-3.5 gap-2.5 shadow-2xs transition-colors">
            <Search className="w-5 h-5 text-ink-muted" />
            <input
              type="text"
              placeholder="امسح باركود المنتج (قارئ الباركود) أو اكتب اسم الصنف للإضافة للفاتورة..."
              value={productSearchQuery}
              onChange={(e) => setProductSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none"
              autoFocus
            />
            {isSearchingProduct && (
              <span className="text-xs text-ink-muted animate-pulse">جاري البحث...</span>
            )}
          </div>

          {/* Dropdown Results */}
          {displayedCatalogProducts.length > 0 && (
            <div className="absolute top-14 left-0 right-0 z-40 bg-surface border border-line rounded-xl shadow-xl overflow-hidden divide-y divide-line">
              {displayedCatalogProducts.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => onAddProduct(p)}
                  className="w-full p-3 text-right hover:bg-surface-2 flex items-center justify-between transition-colors cursor-pointer"
                >
                  <div>
                    <span className="font-bold text-xs text-ink block">{p.name}</span>
                    <span className="text-[11px] text-ink-muted font-mono">
                      باركود: {p.barcode || 'بدون'} | الرصيد الحالي: {(p.stockQuantityMilli / 1000).toFixed(0)} {p.unit}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-bold font-mono text-paid block">
                      سعر البيع: {formatMoney(p.pricePiasters)}
                    </span>
                    <span className="text-[11px] font-mono text-ink-muted">
                      التكلفة السابقة: {formatMoney(p.costPiasters)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line Items Table */}
        <div className="flex-1 bg-surface border border-line rounded-xl overflow-hidden flex flex-col shadow-2xs">
          <div className="h-10 bg-surface-2 border-b border-line grid grid-cols-12 px-4 items-center text-xs font-bold text-ink-muted">
            <div className="col-span-4">اسم الصنف والباركود</div>
            <div className="col-span-2 text-center">الكمية المشتراة</div>
            <div className="col-span-2 text-center">سعر الشراء للوحدة</div>
            <div className="col-span-2 text-center">الإجمالي</div>
            <div className="col-span-1 text-center">سعر البيع الجديد</div>
            <div className="col-span-1 text-left">حذف</div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-line">
            {lineItems.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-ink-muted gap-2">
                <ShoppingCart className="w-10 h-10 opacity-30" />
                <span className="text-sm font-semibold">لم تتم إضافة أي أصناف إلى الفاتورة بعد</span>
                <span className="text-xs text-ink-muted">استخدم شريط البحث بالأعلى لإضافة الأصناف بالباركود أو الاسم</span>
              </div>
            ) : (
              lineItems.map((item, idx) => {
                const lineTotal = Math.round(item.quantityUnits * item.unitCostPiasters);
                return (
                  <div
                    key={item.productId}
                    className="py-2.5 px-4 flex flex-col gap-1.5 hover:bg-surface-2/60 transition-colors"
                  >
                    <div className="grid grid-cols-12 items-center text-xs">
                      <div className="col-span-4">
                        <span className="font-bold text-ink block truncate">{item.productName}</span>
                        <span className="text-[10px] font-mono text-ink-muted">
                          كود: {item.barcode || '—'} | الرصيد الحالي: {(item.currentStockMilli / 1000).toFixed(0)}
                        </span>
                      </div>

                      {/* Quantity control */}
                      <div className="col-span-2 flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...lineItems];
                            if (updated[idx].quantityUnits > 1) {
                              updated[idx].quantityUnits -= 1;
                              setLineItems(updated);
                            }
                          }}
                          className="w-6 h-6 rounded-lg bg-surface-2 hover:bg-line flex items-center justify-center text-xs font-bold text-ink transition-colors cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={item.quantityUnits}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 1;
                            const updated = [...lineItems];
                            updated[idx].quantityUnits = Math.max(1, val);
                            setLineItems(updated);
                          }}
                          className="w-14 h-7 text-center font-mono font-bold bg-surface-2 border border-line rounded-lg text-xs text-ink focus:outline-none focus:border-brand"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...lineItems];
                            updated[idx].quantityUnits += 1;
                            setLineItems(updated);
                          }}
                          className="w-6 h-6 rounded-lg bg-surface-2 hover:bg-line flex items-center justify-center text-xs font-bold text-ink transition-colors cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      {/* Unit Cost input */}
                      <div className="col-span-2 flex items-center justify-center gap-1">
                        <input
                          type="number"
                          step="0.25"
                          value={(item.unitCostPiasters / 100).toFixed(2)}
                          onChange={(e) => {
                            const valEGP = parseFloat(e.target.value) || 0;
                            const updated = [...lineItems];
                            updated[idx].unitCostPiasters = Math.round(valEGP * 100);
                            setLineItems(updated);
                          }}
                          className="w-20 h-7 text-center font-mono font-bold bg-surface-2 border border-line rounded-lg text-xs text-ink focus:outline-none focus:border-brand"
                        />
                        <span className="text-[10px] text-ink-muted">ج.م</span>
                      </div>

                      {/* Line Total */}
                      <div className="col-span-2 text-center font-mono font-bold text-ink">
                        {formatMoney(lineTotal)}
                      </div>

                      {/* New Selling Price */}
                      <div className="col-span-1 flex items-center justify-center">
                        <input
                          type="number"
                          step="0.5"
                          value={(item.newSellingPricePiasters / 100).toFixed(2)}
                          onChange={(e) => {
                            const valEGP = parseFloat(e.target.value) || 0;
                            const updated = [...lineItems];
                            updated[idx].newSellingPricePiasters = Math.round(valEGP * 100);
                            setLineItems(updated);
                          }}
                          className="w-16 h-7 text-center font-mono text-xs text-ink bg-surface-2 border border-line rounded-lg focus:outline-none focus:border-brand"
                          title="تحديث سعر البيع في الكتالوج"
                        />
                      </div>

                      {/* Delete Item */}
                      <div className="col-span-1 text-left">
                        <button
                          type="button"
                          onClick={() => {
                            setLineItems(lineItems.filter((_, i) => i !== idx));
                          }}
                          className="p-1.5 text-ink-muted hover:text-danger hover:bg-danger-soft rounded-lg transition-colors cursor-pointer"
                          title="حذف هذا الصنف من الفاتورة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Batch & Expiry Input Row */}
                    <div className="flex items-center gap-3 pr-2 text-[11px] text-ink-muted flex-wrap bg-surface/60 p-1.5 rounded-lg border border-line/60">
                      <span className="font-bold text-brand text-[10.5px]">بيانات الدفعة (FEFO):</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-ink-muted">رقم التشغيلة:</span>
                        <input
                          type="text"
                          placeholder="مثال: BATCH-01"
                          value={item.batchNumber || ''}
                          onChange={(e) => {
                            const updated = [...lineItems];
                            updated[idx].batchNumber = e.target.value;
                            setLineItems(updated);
                          }}
                          className="h-6 w-28 px-2 bg-surface border border-line rounded text-[11px] font-mono focus:border-brand focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-ink-muted">تاريخ انتهاء الصلاحية:</span>
                        <input
                          type="date"
                          value={item.expiryDate || ''}
                          onChange={(e) => {
                            const updated = [...lineItems];
                            updated[idx].expiryDate = e.target.value;
                            setLineItems(updated);
                          }}
                          className="h-6 px-2 bg-surface border border-line rounded text-[11px] font-mono focus:border-brand focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-ink-muted">تاريخ الإنتاج:</span>
                        <input
                          type="date"
                          value={item.productionDate || ''}
                          onChange={(e) => {
                            const updated = [...lineItems];
                            updated[idx].productionDate = e.target.value;
                            setLineItems(updated);
                          }}
                          className="h-6 px-2 bg-surface border border-line rounded text-[11px] font-mono focus:border-brand focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right: Settlement & Totals Dock */}
      <div className="w-[290px] sm:w-[320px] xl:w-[350px] bg-surface border border-line rounded-xl p-3.5 sm:p-4 flex flex-col justify-between shrink-0 shadow-2xs">
        <div className="space-y-4">
          <div className="pb-3 border-b border-line">
            <h2 className="text-sm font-bold text-ink">ملخص واعتماد فاتورة الشراء</h2>
            <span className="text-xs text-ink-muted">إجمالي الكميات: {lineItems.length} صنف</span>
          </div>

          {/* Totals Breakdown */}
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between text-ink-muted">
              <span>إجمالي التكلفة:</span>
              <span className="font-mono font-bold text-ink">
                {formatMoney(totalCostPiasters)}
              </span>
            </div>

            <div className="flex items-center justify-between text-ink-muted">
              <span>الخصم التجاري:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={(discountPiasters / 100).toFixed(2)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    setDiscountPiasters(Math.round(val * 100));
                  }}
                  className="w-20 h-7 text-center font-mono font-bold bg-surface-2 border border-line rounded-lg text-xs text-ink focus:outline-none"
                />
                <span>ج.م</span>
              </div>
            </div>

            <div className="pt-2 border-t border-line flex justify-between items-baseline">
              <span className="font-bold text-sm text-ink">الصافي المستحق:</span>
              <span className="text-xl font-bold font-mono text-ink">
                {formatMoney(netCostPiasters)}
              </span>
            </div>
          </div>

          {/* Payment Options */}
          <div className="pt-3 border-t border-line space-y-2">
            <label className="text-xs font-bold text-ink block">طريقة السداد للمورد</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMode('PAID')}
                className={`h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                  paymentMode === 'PAID'
                    ? 'bg-paid text-white border-paid shadow-2xs'
                    : 'bg-surface-2 text-ink-muted border-line hover:text-ink hover:bg-surface'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>مسددة نقداً</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('CREDIT')}
                className={`h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                  paymentMode === 'CREDIT'
                    ? 'bg-warn text-white border-warn shadow-2xs'
                    : 'bg-surface-2 text-ink-muted border-line hover:text-ink hover:bg-surface'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>آجل بالكامل</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('PARTIAL')}
                className={`h-9 rounded-xl text-xs font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ${
                  paymentMode === 'PARTIAL'
                    ? 'bg-brand text-white border-brand shadow-2xs'
                    : 'bg-surface-2 text-ink-muted border-line hover:text-ink hover:bg-surface'
                }`}
              >
                <span>سداد جزئي</span>
              </button>
            </div>

            {paymentMode === 'PARTIAL' && (
              <div className="p-3 bg-surface-2 border border-line rounded-xl space-y-2 mt-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-ink-muted">المدفوع نقداً:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={(customPaidAmountPiasters / 100).toFixed(2)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setCustomPaidAmountPiasters(Math.round(val * 100));
                      }}
                      className="w-24 h-7 text-center font-mono font-bold bg-surface border border-line rounded-lg text-xs text-ink"
                    />
                    <span className="text-ink-muted">ج.م</span>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-danger font-bold">
                  <span>المتبقي آجل على المورد:</span>
                  <span className="font-mono">{formatMoney(remainingAmountPiasters)}</span>
                </div>
              </div>
            )}

            {paymentMode === 'CREDIT' && (
              <div className="p-2.5 bg-danger-soft border border-danger-border text-danger rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>سيتم إضافة كامل المبلغ إلى حساب مديونية المورد في دفتر الآجل.</span>
              </div>
            )}
          </div>

          {/* Notes Input */}
          <div className="pt-2">
            <label className="text-[11px] font-bold text-ink-muted block mb-1">ملاحظات الفاتورة</label>
            <textarea
              rows={2}
              placeholder="ملاحظات أو رقم إذن الاستلام..."
              value={purchaseNotes}
              onChange={(e) => setPurchaseNotes(e.target.value)}
              className="w-full p-2.5 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface resize-none transition-colors"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-4 border-t border-line">
          <button
            type="button"
            onClick={onSavePurchase}
            disabled={lineItems.length === 0}
            className="w-full h-11 bg-paid hover:bg-paid-hover disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
          >
            <Receipt className="w-4 h-4" />
            <span>اعتماد الفاتورة وإضافة المخزون</span>
          </button>
          <button
            type="button"
            onClick={onRequestCancel}
            className="w-full h-9 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            إلغاء والتراجع
          </button>
        </div>
      </div>
    </div>
  );
};
