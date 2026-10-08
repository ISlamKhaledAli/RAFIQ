import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  ShoppingCart,
  Plus,
  Search,
  Trash2,
  Receipt,
  Banknote,
  CreditCard,
  AlertCircle,
  Info,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
  Calculator,
  Zap,
  Sparkles,
} from 'lucide-react';
import { CustomSelect } from '../../components/CustomSelect';
import { CustomDatePicker } from '../../components/CustomDatePicker';
import { useFeatures } from '../../context/useFeatures';
import type { Supplier, Product } from '../../types/models';
import { formatMoney, type NewPurchaseLineItem } from './types';
import { normalizeArabicNumerals } from '../../utils/money';

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
  const { isEnabled } = useFeatures();
  const [selectedProductIndex, setSelectedProductIndex] = useState(0);
  const [isDropdownDismissed, setIsDropdownDismissed] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const displayedCatalogProducts = useMemo(() => {
    if (!productSearchQuery.trim() || isDropdownDismissed) return [];
    return catalogProducts;
  }, [productSearchQuery, catalogProducts, isDropdownDismissed]);

  // Reset index & dismissed state when search query changes
  useEffect(() => {
    setSelectedProductIndex(0);
    setIsDropdownDismissed(false);
  }, [productSearchQuery]);

  // Click outside to dismiss dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownDismissed(true);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (displayedCatalogProducts.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedProductIndex((prev) => (prev + 1) % displayedCatalogProducts.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedProductIndex((prev) => (prev - 1 + displayedCatalogProducts.length) % displayedCatalogProducts.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = displayedCatalogProducts[selectedProductIndex] || displayedCatalogProducts[0];
      if (chosen) {
        onAddProduct(chosen);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownDismissed(true);
    }
  };

  const handleCartonsChange = (idx: number, val: string) => {
    const clean = normalizeArabicNumerals(val);
    const updated = [...lineItems];
    const item = { ...updated[idx] };

    item.cartonsInput = clean;

    const c = parseInt(clean, 10);
    const cVal = isNaN(c) ? 0 : c;

    const p = parseInt(normalizeArabicNumerals(item.packSizeInput || ''), 10);
    const pVal = isNaN(p) ? 0 : p;

    const l = parseInt(normalizeArabicNumerals(item.looseInput || ''), 10);
    const lVal = isNaN(l) ? 0 : l;

    const total = (cVal * pVal) + lVal;
    item.quantityUnits = Math.max(0, total);
    if (clean === '' && (!item.packSizeInput || item.packSizeInput === '') && (!item.looseInput || item.looseInput === '')) {
      item.quantityInput = '';
    } else {
      item.quantityInput = String(total);
    }

    updated[idx] = item;
    setLineItems(updated);
  };

  const handlePackSizeChange = (idx: number, val: string) => {
    const clean = normalizeArabicNumerals(val);
    const updated = [...lineItems];
    const item = { ...updated[idx] };

    item.packSizeInput = clean;

    const p = parseInt(clean, 10);
    const pVal = isNaN(p) ? 0 : p;

    const c = parseInt(normalizeArabicNumerals(item.cartonsInput || ''), 10);
    const cVal = isNaN(c) ? 0 : c;

    const l = parseInt(normalizeArabicNumerals(item.looseInput || ''), 10);
    const lVal = isNaN(l) ? 0 : l;

    const total = (cVal * pVal) + lVal;
    item.quantityUnits = Math.max(0, total);
    if (clean === '' && (!item.cartonsInput || item.cartonsInput === '') && (!item.looseInput || item.looseInput === '')) {
      item.quantityInput = '';
    } else {
      item.quantityInput = String(total);
    }

    updated[idx] = item;
    setLineItems(updated);
  };

  const handleLoosePiecesChange = (idx: number, val: string) => {
    const clean = normalizeArabicNumerals(val);
    const updated = [...lineItems];
    const item = { ...updated[idx] };

    item.looseInput = clean;

    const l = parseInt(clean, 10);
    const lVal = isNaN(l) ? 0 : l;

    const c = parseInt(normalizeArabicNumerals(item.cartonsInput || ''), 10);
    const cVal = isNaN(c) ? 0 : c;

    const p = parseInt(normalizeArabicNumerals(item.packSizeInput || ''), 10);
    const pVal = isNaN(p) ? 0 : p;

    const total = (cVal * pVal) + lVal;
    item.quantityUnits = Math.max(0, total);
    if (clean === '' && (!item.cartonsInput || item.cartonsInput === '') && (!item.packSizeInput || item.packSizeInput === '')) {
      item.quantityInput = '';
    } else {
      item.quantityInput = String(total);
    }

    updated[idx] = item;
    setLineItems(updated);
  };

  const handleDirectStockChange = (idx: number, val: string) => {
    const clean = normalizeArabicNumerals(val);
    const updated = [...lineItems];
    const item = { ...updated[idx] };

    item.quantityInput = clean;
    if (clean === '') {
      item.quantityUnits = 0;
      item.cartonsInput = '';
      item.looseInput = '';
    } else {
      const total = parseFloat(clean);
      const totalVal = isNaN(total) ? 0 : Math.max(0, total);
      item.quantityUnits = totalVal;

      const p = parseInt(normalizeArabicNumerals(item.packSizeInput || ''), 10) || 0;
      if (p > 0 && totalVal > 0) {
        const c = Math.floor(totalVal / p);
        const rem = Math.round(totalVal % p);
        item.cartonsInput = c > 0 ? String(c) : '0';
        item.looseInput = rem > 0 ? String(rem) : '0';
      } else if (p > 0 && totalVal === 0) {
        item.cartonsInput = '0';
        item.looseInput = '0';
      } else {
        item.cartonsInput = '0';
        item.looseInput = clean;
      }
    }

    updated[idx] = item;
    setLineItems(updated);
  };

  const getUnitLabel = (unit?: string) => {
    if (!unit || unit === 'piece') return 'قطعة';
    if (unit === 'kg') return 'كجم';
    if (unit === 'gram') return 'جرام';
    if (unit === 'meter') return 'متر';
    if (unit === 'liter') return 'لتر';
    return unit;
  };

  const calculateProjectedCost = (item: NewPurchaseLineItem, method: 'LATEST' | 'WEIGHTED_AVERAGE') => {
    if (method === 'LATEST') {
      return item.unitCostPiasters;
    }
    const currentStockUnits = Math.max(0, item.currentStockMilli / 1000);
    const newUnits = item.quantityUnits || 0;
    const totalUnits = currentStockUnits + newUnits;
    if (totalUnits <= 0) return item.unitCostPiasters;

    const oldTotal = currentStockUnits * item.currentCostPiasters;
    const newTotal = newUnits * item.unitCostPiasters;
    return Math.round((oldTotal + newTotal) / totalUnits);
  };

  const getSuggestedSellingPrice = (item: NewPurchaseLineItem): number | null => {
    if (item.currentCostPiasters <= 0 || item.currentPricePiasters <= item.currentCostPiasters) {
      return null;
    }
    const markupRatio = item.currentPricePiasters / item.currentCostPiasters;
    const suggested = Math.round(item.unitCostPiasters * markupRatio);
    return suggested > item.unitCostPiasters ? suggested : null;
  };

  const handleApplySuggestedPrice = (idx: number, suggestedPiasters: number) => {
    const updated = [...lineItems];
    updated[idx].newSellingPricePiasters = suggestedPiasters;
    setLineItems(updated);
  };

  const totalCostPiasters = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + Math.round(item.quantityUnits * item.unitCostPiasters), 0);
  }, [lineItems]);

  const totalItemsPieces = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + (item.quantityUnits || 0), 0);
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
        <div className="bg-surface border border-line rounded-xl p-3 sm:p-3.5 shadow-2xs shrink-0 flex flex-col gap-2.5">
          <div className="grid grid-cols-12 gap-2.5 sm:gap-3 items-center">
            {/* Supplier Selection */}
            <div className="col-span-12 sm:col-span-5 md:col-span-4">
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

            {/* Supplier Invoice Number */}
            <div className="col-span-6 sm:col-span-3 md:col-span-3">
              <label className="text-[11px] font-bold text-ink-muted block mb-1">
                رقم فاتورة المورد الورقية
              </label>
              <input
                type="text"
                placeholder="مثال: INV-8840"
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                className="w-full h-8 px-2.5 bg-surface-2 border border-line rounded-lg text-xs font-mono font-medium text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
              />
            </div>

            {/* Costing Method */}
            <div className="col-span-6 sm:col-span-4 md:col-span-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-ink-muted flex items-center gap-1">
                  <span>تحديث التكلفة</span>
                  <div
                    className="group relative inline-flex items-center justify-center cursor-help"
                    title="طريقة تحديث سعر التكلفة في كارت الصنف عند حفظ الفاتورة"
                  >
                    <Info className="w-3 h-3 text-ink-muted hover:text-brand transition-colors" />
                    <div className="absolute bottom-full mb-1 right-0 hidden group-hover:block w-56 p-2 bg-ink text-surface text-[10px] rounded-lg shadow-lg z-50 pointer-events-none leading-relaxed">
                      • <b>آخر سعر شراء:</b> يجعل تكلفة الصنف مساوية لسعر هذه الفاتورة مباشرة (المعتاد للتجزئة).<br />
                      • <b>متوسط التكلفة:</b> يدمج تكلفة الرصيد القديم مع الشحنة الجديدة كمتوسط حسابي مرجح.
                    </div>
                  </div>
                </label>
                <span className="text-[10px] font-bold text-brand px-1 rounded bg-brand-soft border border-brand/20">
                  {costingMethod === 'LATEST' ? 'استبدال مباشر' : 'متوسط مرجح'}
                </span>
              </div>
              <CustomSelect
                value={costingMethod}
                onChange={(val) => setCostingMethod(val as 'LATEST' | 'WEIGHTED_AVERAGE')}
                options={[
                  { value: 'LATEST', label: 'آخر سعر شراء (المعتاد للتجزئة)' },
                  { value: 'WEIGHTED_AVERAGE', label: 'متوسط التكلفة (محاسبي دقيق)' },
                ]}
                className="w-full"
                size="md"
              />
            </div>

            {/* Invoice Date */}
            <div className="col-span-12 sm:col-span-2 md:col-span-2 text-left sm:text-left flex flex-col justify-end">
              <span className="text-[10.5px] text-ink-muted block">تاريخ الفاتورة</span>
              <span className="text-xs font-bold text-ink font-mono mt-0.5">
                {new Date().toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* Barcode & Product Scanner Search Bar */}
        <div ref={searchContainerRef} className="relative shrink-0">
          <div className="h-11 bg-surface border border-line focus-within:border-brand rounded-xl flex items-center px-3 gap-2.5 shadow-2xs transition-colors">
            <Search className="w-4 h-4 text-ink-muted" />
            <input
              type="text"
              placeholder="امسح باركود المنتج (قارئ الباركود) أو اكتب اسم الصنف للإضافة للفاتورة..."
              value={productSearchQuery}
              onChange={(e) => setProductSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="flex-1 bg-transparent border-none text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none"
              autoFocus
            />
            {isSearchingProduct && (
              <span className="text-xs text-ink-muted animate-pulse">جاري البحث...</span>
            )}
          </div>

          {/* Dropdown Results */}
          {displayedCatalogProducts.length > 0 && (
            <div className="absolute top-14 left-0 right-0 z-40 bg-surface border border-line rounded-xl shadow-xl overflow-hidden divide-y divide-line max-h-72 overflow-y-auto">
              {displayedCatalogProducts.map((p, idx) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => onAddProduct(p)}
                  className={`w-full p-3 text-right flex items-center justify-between transition-colors cursor-pointer ${
                    idx === selectedProductIndex ? 'bg-surface-2 ring-1 ring-inset ring-brand/30' : 'hover:bg-surface-2'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-ink">{p.name}</span>
                      {p.hasVariants && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-soft border border-brand/20 text-brand text-[10px] font-bold">
                          <Layers className="w-2.5 h-2.5" />
                          <span>مقاسات وألوان</span>
                        </span>
                      )}
                      {(p.variantColor || p.variantSize) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 border border-line text-ink-muted text-[10px] font-mono">
                          {p.variantColor && <span>{p.variantColor}</span>}
                          {p.variantColor && p.variantSize && <span>/</span>}
                          {p.variantSize && <span>{p.variantSize}</span>}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-ink-muted font-mono block mt-0.5">
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
          {/* Table Header */}
          <div className="h-9 bg-surface-2 border-b border-line grid grid-cols-12 px-3 sm:px-4 items-center text-xs font-bold text-ink-muted shrink-0">
            <div className="col-span-12 sm:col-span-3">اسم الصنف والباركود</div>
            <div className="col-span-4 sm:col-span-2 text-center">الكمية المشتراة</div>
            <div className="col-span-4 sm:col-span-2 text-center">سعر الشراء للوحدة</div>
            <div className="col-span-4 sm:col-span-2 text-center">سعر البيع الجديد</div>
            <div className="hidden sm:block sm:col-span-2 text-center">الإجمالي</div>
            <div className="col-span-12 sm:col-span-1 text-left sm:text-left">إجراء</div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-line p-2 sm:p-2.5 space-y-2">
            {lineItems.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-ink-muted gap-2">
                <ShoppingCart className="w-10 h-10 opacity-30" />
                <span className="text-sm font-semibold">لم تتم إضافة أي أصناف إلى الفاتورة بعد</span>
                <span className="text-xs text-ink-muted">استخدم شريط البحث بالأعلى لإضافة الأصناف بالباركود أو الاسم</span>
              </div>
            ) : (
              lineItems.map((item, idx) => {
                const lineTotal = Math.round(item.quantityUnits * item.unitCostPiasters);
                const currentStockUnits = Math.max(0, item.currentStockMilli / 1000);
                const incomingUnits = item.quantityUnits || 0;
                const totalStockUnits = currentStockUnits + incomingUnits;

                // 1. Cost Comparison (السعر كان كام وبقى كام)
                const costDiffPiasters = item.unitCostPiasters - item.currentCostPiasters;
                const hasPrevCost = item.currentCostPiasters > 0;
                const costDiffPercent = hasPrevCost
                  ? ((costDiffPiasters / item.currentCostPiasters) * 100).toFixed(1)
                  : null;

                // 2. Selling Price & Profit Margin Analysis
                const effectiveSellingPricePiasters =
                  item.newSellingPricePiasters > 0 ? item.newSellingPricePiasters : item.currentPricePiasters;
                const profitPiasters = effectiveSellingPricePiasters - item.unitCostPiasters;
                const marginPercent = effectiveSellingPricePiasters > 0
                  ? ((profitPiasters / effectiveSellingPricePiasters) * 100).toFixed(1)
                  : '0';
                const suggestedPricePiasters = getSuggestedSellingPrice(item);

                // 3. Projected Cost
                const projectedCostPiasters = calculateProjectedCost(item, costingMethod);

                return (
                  <div
                    key={item.productId}
                    className="bg-surface rounded-xl border border-line hover:border-brand/30 p-3 flex flex-col gap-2.5 shadow-2xs transition-colors"
                  >
                    {/* Main Row: Core Columns */}
                    <div className="grid grid-cols-12 items-center gap-2 text-xs">
                      {/* 1. Product Name & Info (col-span-3) */}
                      <div className="col-span-12 sm:col-span-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-ink text-xs sm:text-[13px] block truncate">{item.productName}</span>
                          {(item.variantColor || item.variantSize) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-brand-soft border border-brand/20 text-brand text-[10px] font-bold shrink-0">
                              <Layers className="w-2.5 h-2.5" />
                              {item.variantColor && <span>{item.variantColor}</span>}
                              {item.variantColor && item.variantSize && <span>/</span>}
                              {item.variantSize && <span>{item.variantSize}</span>}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[10px] font-mono text-ink-muted">
                            كود: {item.barcode || '—'}
                          </span>
                          <span className="text-line">•</span>
                          <span className="text-[10px] font-mono text-ink-muted">
                            السابق: {(item.currentCostPiasters / 100).toFixed(2)} ج.م
                          </span>
                        </div>
                        {/* Stock Equation Badge */}
                        <div className="mt-1">
                          <div
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 border border-line text-[10px] font-mono"
                            title="الرصيد الحالي بالمخزن + الكمية المشتراة = إجمالي الرصيد القادم بالمخزن بعد الفاتورة"
                          >
                            <span className="text-ink-muted">المخزن:</span>
                            <span className="font-bold text-ink">{currentStockUnits.toFixed(0)}</span>
                            <span className="text-ink-muted">+</span>
                            <span className="font-bold text-brand">{incomingUnits.toFixed(0)} شراء</span>
                            <span className="text-ink-muted">=</span>
                            <span className="font-bold text-paid bg-paid-soft px-1 rounded border border-paid/20">
                              {totalStockUnits.toFixed(0)} {getUnitLabel(item.unit)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Quantity Control (col-span-2) */}
                      <div className="col-span-4 sm:col-span-2 flex flex-col items-center justify-center gap-0.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const curr = parseFloat(item.quantityInput ?? String(item.quantityUnits)) || 0;
                              if (curr > 0) {
                                handleDirectStockChange(idx, String(curr - 1));
                              }
                            }}
                            className="w-6 h-6 rounded-lg bg-surface-2 hover:bg-line flex items-center justify-center text-xs font-bold text-ink transition-colors cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            value={item.quantityInput !== undefined ? item.quantityInput : (item.quantityUnits > 0 ? String(item.quantityUnits) : '')}
                            onChange={(e) => handleDirectStockChange(idx, e.target.value)}
                            placeholder="0"
                            className="w-14 h-7 text-center font-mono font-bold bg-brand-soft border border-brand/30 rounded-lg text-xs text-brand focus:outline-none focus:border-brand"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const curr = parseFloat(item.quantityInput ?? String(item.quantityUnits)) || 0;
                              handleDirectStockChange(idx, String(curr + 1));
                            }}
                            className="w-6 h-6 rounded-lg bg-surface-2 hover:bg-line flex items-center justify-center text-xs font-bold text-ink transition-colors cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        {((item.cartonsInput && parseInt(item.cartonsInput, 10) > 0) || (item.looseInput && parseInt(item.looseInput, 10) > 0)) && (
                          <span className="text-[9.5px] font-mono text-ink-muted text-center mt-0.5">
                            {parseInt(item.cartonsInput || '0', 10) > 0 ? `${item.cartonsInput} كرتونة ` : ''}
                            {parseInt(item.looseInput || '0', 10) > 0 ? `+ ${item.looseInput} فرط` : ''}
                          </span>
                        )}
                      </div>

                      {/* 3. Unit Cost (col-span-2) */}
                      <div className="col-span-4 sm:col-span-2 flex flex-col items-center justify-center gap-0.5">
                        <div className="flex items-center gap-1">
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
                          <span className="text-[10px] text-ink-muted font-bold">ج.م</span>
                        </div>

                        {/* Price Change Indicator */}
                        {hasPrevCost ? (
                          costDiffPiasters > 0 ? (
                            <div
                              className="flex items-center gap-1 text-[9.5px] text-danger font-bold bg-danger-soft px-1.5 py-0.2 rounded border border-danger/20"
                              title="ارتفاع في سعر الشراء مقارنة بآخر شراء مسجل"
                            >
                              <TrendingUp className="w-2.5 h-2.5 shrink-0" />
                              <span>ارتفع +{(costDiffPiasters / 100).toFixed(2)} (+{costDiffPercent}%)</span>
                            </div>
                          ) : costDiffPiasters < 0 ? (
                            <div
                              className="flex items-center gap-1 text-[9.5px] text-paid font-bold bg-paid-soft px-1.5 py-0.2 rounded border border-paid/20"
                              title="انخفاض في سعر الشراء (وفر)"
                            >
                              <TrendingDown className="w-2.5 h-2.5 shrink-0" />
                              <span>انخفض -{(Math.abs(costDiffPiasters) / 100).toFixed(2)} ({costDiffPercent}%)</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-[9.5px] text-ink-muted bg-surface-2 px-1.5 py-0.2 rounded border border-line">
                              <Minus className="w-2.5 h-2.5 shrink-0" />
                              <span>نفس التكلفة</span>
                            </div>
                          )
                        ) : (
                          <span className="text-[9.5px] text-brand font-medium">تكلفة أول مرة</span>
                        )}
                      </div>

                      {/* 4. New Selling Price & Profit Margin (col-span-2) */}
                      <div className="col-span-4 sm:col-span-2 flex flex-col items-center justify-center gap-0.5">
                        <div className="flex items-center gap-1">
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
                            className="w-20 h-7 text-center font-mono font-bold text-xs text-ink bg-surface-2 border border-line rounded-lg focus:outline-none focus:border-brand"
                            title="تحديث سعر البيع في الكتالوج"
                          />
                          <span className="text-[10px] text-ink-muted font-bold">ج.م</span>
                        </div>

                        {/* Profit margin badge */}
                        {profitPiasters < 0 ? (
                          <div className="flex items-center gap-1 text-[9.5px] text-danger font-bold bg-danger-soft px-1.5 py-0.2 rounded border border-danger/20">
                            <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                            <span>خسارة: {(profitPiasters / 100).toFixed(2)}</span>
                          </div>
                        ) : profitPiasters === 0 ? (
                          <div className="text-[9.5px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                            <span>بيع = تكلفة</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[9.5px] text-paid font-bold bg-paid-soft px-1.5 py-0.2 rounded border border-paid/20">
                            <span>الربح: +{(profitPiasters / 100).toFixed(2)} ({marginPercent}%)</span>
                          </div>
                        )}

                        {/* Suggested Selling Price Button */}
                        {suggestedPricePiasters !== null &&
                          Math.abs(suggestedPricePiasters - item.newSellingPricePiasters) > 50 && (
                            <button
                              type="button"
                              onClick={() => handleApplySuggestedPrice(idx, suggestedPricePiasters)}
                              className="text-[9px] font-bold text-brand hover:text-brand-dark flex items-center gap-1 bg-brand-soft hover:bg-brand/20 px-1.5 py-0.2 rounded border border-brand/20 transition-colors cursor-pointer"
                              title="تعديل سعر البيع للحفاظ على نفس نسبة الربح السابقة للصنف"
                            >
                              <Sparkles className="w-2.5 h-2.5 text-brand shrink-0" />
                              <span>اقتراح: {(suggestedPricePiasters / 100).toFixed(2)}</span>
                            </button>
                          )}
                      </div>

                      {/* 5. Line Total (col-span-2) */}
                      <div className="col-span-6 sm:col-span-2 text-center">
                        <div className="font-mono font-bold text-ink text-xs sm:text-sm">
                          {formatMoney(lineTotal)}
                        </div>
                        <span className="text-[9.5px] font-mono text-ink-muted block mt-0.5">
                          {item.quantityUnits} × {(item.unitCostPiasters / 100).toFixed(2)} ج.م
                        </span>
                      </div>

                      {/* 6. Delete Item (col-span-1) */}
                      <div className="col-span-6 sm:col-span-1 text-left sm:text-left">
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

                    {/* Integrated Sub-Tools: Compact Cartons Calculator & Cost Policy Strip */}
                    <div className="bg-surface-2/60 border border-line rounded-lg p-2 flex flex-col gap-2">
                      {/* 1. Cartons & Loose Breakdown Row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center text-xs">
                        {/* عدد الكراتين */}
                        <div>
                          <label className="block text-[10px] font-bold text-ink-muted mb-0.5">
                            عدد الكراتين:
                          </label>
                          <input
                            type="text"
                            value={item.cartonsInput ?? ''}
                            onChange={(e) => handleCartonsChange(idx, e.target.value)}
                            placeholder="0"
                            className="w-full bg-surface border border-line rounded h-7 px-2 text-xs font-mono text-center font-bold text-brand focus:outline-none focus:border-brand"
                          />
                        </div>

                        {/* سعة الكرتونة */}
                        <div>
                          <label className="block text-[10px] font-bold text-ink-muted mb-0.5">
                            × سعة الكرتونة:
                          </label>
                          <input
                            type="text"
                            value={item.packSizeInput ?? ''}
                            onChange={(e) => handlePackSizeChange(idx, e.target.value)}
                            placeholder="0"
                            className="w-full bg-surface border border-line rounded h-7 px-2 text-xs font-mono text-center font-bold text-ink focus:outline-none focus:border-brand"
                          />
                        </div>

                        {/* قطع فرط */}
                        <div>
                          <label className="block text-[10px] font-bold text-ink-muted mb-0.5">
                            + قطع فرط:
                          </label>
                          <input
                            type="text"
                            value={item.looseInput ?? ''}
                            onChange={(e) => handleLoosePiecesChange(idx, e.target.value)}
                            placeholder="0"
                            className="w-full bg-surface border border-line rounded h-7 px-2 text-xs font-mono text-center font-bold text-ink focus:outline-none focus:border-brand"
                          />
                        </div>

                        {/* الرصيد الفعلي الإجمالي */}
                        <div>
                          <label className="block text-[10px] font-bold text-brand mb-0.5">
                            = الرصيد الفعلي (قطعة) *:
                          </label>
                          <input
                            type="text"
                            value={item.quantityInput !== undefined ? item.quantityInput : (item.quantityUnits > 0 ? String(item.quantityUnits) : '')}
                            onChange={(e) => handleDirectStockChange(idx, e.target.value)}
                            placeholder="0"
                            className="w-full bg-brand-soft border border-brand/40 rounded h-7 px-2 text-xs font-mono text-center font-extrabold text-brand focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* 2. Projected Cost Impact & Batch/Expiry Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1.5 border-t border-line/60 text-[11px]">
                        {/* Cost Impact */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-ink flex items-center gap-1">
                            {costingMethod === 'LATEST' ? (
                              <Zap className="w-3 h-3 text-brand" />
                            ) : (
                              <Calculator className="w-3 h-3 text-brand" />
                            )}
                            <span>أثر التكلفة بالكتالوج:</span>
                          </span>
                          <span className="font-mono font-bold text-brand bg-brand-soft px-1.5 py-0.2 rounded border border-brand/20 text-[11px]">
                            {(projectedCostPiasters / 100).toFixed(2)} ج.م
                          </span>
                          <span className="text-ink-muted text-[10px]">
                            {costingMethod === 'LATEST'
                              ? '(آخر سعر شراء)'
                              : `(متوسط مرجح: ${totalStockUnits.toFixed(0)} قطعة)`}
                          </span>
                        </div>

                        {/* Batch & Expiry Dates */}
                        {isEnabled('feature_expiry_dates') && (
                          <div className="flex items-center gap-2 flex-wrap text-[10.5px]">
                            <div className="flex items-center gap-1">
                              <span className="text-ink-muted">الشحنة:</span>
                              <input
                                type="text"
                                placeholder="رقم الشحنة"
                                value={item.batchNumber || ''}
                                onChange={(e) => {
                                  const updated = [...lineItems];
                                  updated[idx].batchNumber = e.target.value;
                                  setLineItems(updated);
                                }}
                                className="h-6 w-20 px-1.5 bg-surface border border-line rounded text-[10.5px] font-mono focus:border-brand focus:outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-ink-muted">الانتهاء:</span>
                              <CustomDatePicker
                                value={item.expiryDate || ''}
                                onChange={(val) => {
                                  const updated = [...lineItems];
                                  updated[idx].expiryDate = val;
                                  setLineItems(updated);
                                }}
                                placeholder="الصلاحية"
                                size="sm"
                                placement="top"
                                className="w-[110px]"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-ink-muted">الإنتاج:</span>
                              <CustomDatePicker
                                value={item.productionDate || ''}
                                onChange={(val) => {
                                  const updated = [...lineItems];
                                  updated[idx].productionDate = val;
                                  setLineItems(updated);
                                }}
                                placeholder="الإنتاج"
                                size="sm"
                                placement="top"
                                align="left"
                                className="w-[110px]"
                              />
                            </div>
                          </div>
                        )}
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
      <div className="w-[260px] sm:w-[275px] xl:w-[290px] bg-surface border border-line rounded-xl p-3 flex flex-col justify-between shrink-0 shadow-2xs overflow-hidden">
        <div className="space-y-3">
          {/* Header */}
          <div className="pb-2.5 border-b border-line flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-brand" />
              <h2 className="text-[13px] font-bold text-ink">ملخص الفاتورة</h2>
            </div>
            <span className="text-[10px] font-mono font-bold bg-brand-soft text-brand-dark px-2 py-0.5 rounded-full border border-brand/20">
              {lineItems.length} صنف • {totalItemsPieces} قطعة
            </span>
          </div>

          {/* Totals Breakdown */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center text-ink-muted">
              <span className="text-[11.5px]">إجمالي التكلفة:</span>
              <span className="font-mono font-bold text-ink text-xs">
                {formatMoney(totalCostPiasters)}
              </span>
            </div>

            <div className="flex items-center justify-between text-ink-muted">
              <span className="text-[11.5px]">الخصم التجاري:</span>
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
                  className="w-16 h-6 text-center font-mono font-bold bg-surface-2 border border-line rounded-lg text-xs text-ink focus:outline-none focus:border-brand"
                />
                <span className="text-[10.5px]">ج.م</span>
              </div>
            </div>

            {/* Net Payable Highlight Card */}
            <div className="p-2.5 rounded-xl bg-paid-soft/80 border border-paid/20 flex flex-col gap-0.5">
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-[11.5px] text-paid-dark">الصافي المستحق:</span>
                <span className="text-base font-extrabold font-mono text-paid-dark">
                  {formatMoney(netCostPiasters)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-paid font-medium">
                <span>حالة السداد:</span>
                <span>{paymentMode === 'PAID' ? 'سداد نقدي كامل' : paymentMode === 'CREDIT' ? 'آجل على المورد' : 'سداد جزئي'}</span>
              </div>
            </div>
          </div>

          {/* Payment Options */}
          <div className="pt-2 border-t border-line space-y-1.5">
            <label className="text-[11px] font-bold text-ink-muted block">طريقة السداد للمورد</label>
            <div className="grid grid-cols-3 gap-1 bg-surface-2 p-1 rounded-xl border border-line">
              <button
                type="button"
                onClick={() => setPaymentMode('PAID')}
                className={`h-7 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  paymentMode === 'PAID'
                    ? 'bg-paid text-white shadow-2xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Banknote className="w-3 h-3" />
                <span>نقداً</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('CREDIT')}
                className={`h-7 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  paymentMode === 'CREDIT'
                    ? 'bg-warn text-white shadow-2xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <CreditCard className="w-3 h-3" />
                <span>آجل</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('PARTIAL')}
                className={`h-7 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  paymentMode === 'PARTIAL'
                    ? 'bg-brand text-white shadow-2xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <span>جزئي</span>
              </button>
            </div>

            {paymentMode === 'PARTIAL' && (
              <div className="p-2 bg-surface-2 border border-line rounded-lg space-y-1.5 mt-1.5 text-[11px]">
                <div className="flex justify-between items-center">
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
                      className="w-20 h-6 text-center font-mono font-bold bg-surface border border-line rounded text-xs text-ink focus:outline-none focus:border-brand"
                    />
                    <span className="text-[10px] text-ink-muted">ج.م</span>
                  </div>
                </div>
                <div className="flex justify-between text-danger font-bold text-[10.5px]">
                  <span>المتبقي آجل:</span>
                  <span className="font-mono">{formatMoney(remainingAmountPiasters)}</span>
                </div>
              </div>
            )}

            {paymentMode === 'CREDIT' && (
              <div className="p-1.5 bg-danger-soft border border-danger/20 text-danger rounded-lg text-[10.5px] flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>يُسجل بالكامل في دفتر آجل المورد.</span>
              </div>
            )}
          </div>

          {/* Notes Input */}
          <div className="pt-2">
            <label className="text-[10.5px] font-bold text-ink-muted block mb-1">ملاحظات الفاتورة</label>
            <input
              type="text"
              placeholder="ملاحظات أو رقم إذن الاستلام..."
              value={purchaseNotes}
              onChange={(e) => setPurchaseNotes(e.target.value)}
              className="w-full h-8 px-2.5 bg-surface-2 border border-line rounded-lg text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-1.5 pt-3 border-t border-line">
          <button
            type="button"
            onClick={onSavePurchase}
            disabled={lineItems.length === 0}
            className="w-full h-10 bg-paid hover:bg-paid-hover disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
          >
            <Receipt className="w-4 h-4" />
            <span>اعتماد الفاتورة وإضافة المخزون</span>
          </button>
          <button
            type="button"
            onClick={onRequestCancel}
            className="w-full h-8 bg-surface hover:bg-surface-2 border border-line text-ink-muted hover:text-ink rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            إلغاء والتراجع
          </button>
        </div>
      </div>
    </div>
  );
};
