import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ShoppingCart,
  Plus,
  Search,
  Trash2,
  Receipt,
  Banknote,
  CreditCard,
  AlertCircle,
  AlertTriangle,
  Info,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
  Calculator,
  Zap,
  Sparkles,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { CustomSelect } from '../../components/CustomSelect';
import { CustomDatePicker } from '../../components/CustomDatePicker';
import { MoneyInput } from '../../components/MoneyInput';
import { useFeatures } from '../../context/useFeatures';
import type { Supplier, Product } from '../../types/models';
import { formatMoney, type NewPurchaseLineItem } from './types';
import { normalizeArabicNumerals, formatArabicCurrency } from '../../utils/money';
import { invoke } from '../../bridge/ipc';

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
  paymentSource: 'cash_drawer' | 'external_cash';
  setPaymentSource: (source: 'cash_drawer' | 'external_cash') => void;
  customPaidAmountPiasters: number | null;
  setCustomPaidAmountPiasters: (p: number | null) => void;
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
  paymentSource,
  setPaymentSource,
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
  const [liveDrawerCashPiasters, setLiveDrawerCashPiasters] = useState<number | null>(null);

  const fetchLiveDrawerCash = useCallback(async () => {
    try {
      const res = await invoke<{ availableCashPiasters: number }>('drawer:getBalance');
      if (res && typeof res.availableCashPiasters === 'number') {
        setLiveDrawerCashPiasters(res.availableCashPiasters);
      }
    } catch {
      setLiveDrawerCashPiasters(null);
    }
  }, []);

  useEffect(() => {
    void fetchLiveDrawerCash();
  }, [fetchLiveDrawerCash]);
  const [selectedProductIndex, setSelectedProductIndex] = useState(0);
  const [isDropdownDismissed, setIsDropdownDismissed] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [expandedItemIds, setExpandedItemIds] = useState<Record<string, boolean>>({});

  const toggleItemExpand = (productId: string) => {
    setExpandedItemIds((prev) => {
      const currentVal = prev[productId];
      return {
        ...prev,
        [productId]: currentVal !== undefined ? !currentVal : false,
      };
    });
  };

  const isItemExpanded = (productId: string, item: NewPurchaseLineItem) => {
    if (expandedItemIds[productId] !== undefined) {
      return expandedItemIds[productId];
    }
    const hasCartonData =
      (item.cartonsInput && parseInt(item.cartonsInput, 10) > 0) ||
      (item.packSizeInput && parseInt(item.packSizeInput, 10) > 0) ||
      (item.looseInput && parseInt(item.looseInput, 10) > 0);
    const hasBatchData =
      (item.batchNumber && item.batchNumber.trim() !== '') ||
      (item.expiryDate && item.expiryDate.trim() !== '');
    return Boolean(hasCartonData || hasBatchData || lineItems.length === 1);
  };

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
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
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
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
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
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
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
    const isWeightItem = lineItems[idx]?.unit === 'kg' || lineItems[idx]?.unit === 'gram';
    let clean = normalizeArabicNumerals(val);
    if (isWeightItem) {
      // Allow digits and a single decimal point/comma
      clean = clean.replace(/,/g, '.').replace(/[^\d.]/g, '');
      const parts = clean.split('.');
      if (parts.length > 2) {
        clean = parts[0] + '.' + parts.slice(1).join('');
      }
      if (clean.length > 1 && clean.startsWith('0') && !clean.startsWith('0.')) {
        clean = clean.replace(/^0+/, '') || '0';
      }
    } else {
      const digitsOnly = clean.replace(/[^\d]/g, '');
      clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
    }

    const updated = [...lineItems];
    const item = { ...updated[idx] };

    item.quantityInput = clean;
    if (clean === '' || clean === '.') {
      item.quantityUnits = 0;
      item.cartonsInput = '';
      item.looseInput = '';
    } else {
      const totalVal = isWeightItem
        ? (parseFloat(clean) || 0)
        : (parseInt(clean, 10) || 0);
      item.quantityUnits = Math.max(0, totalVal);

      if (!isWeightItem) {
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

  // 1. Calculate suggested selling price based on weighted average cost (preserves historical profit margin across combined old + new inventory)
  const getWeightedSuggestedSellingPrice = (item: NewPurchaseLineItem): number | null => {
    if (item.currentCostPiasters <= 0 || item.currentPricePiasters <= item.currentCostPiasters) {
      return null;
    }
    const markupRatio = item.currentPricePiasters / item.currentCostPiasters;
    const projectedCost = calculateProjectedCost(item, 'WEIGHTED_AVERAGE');
    const suggested = Math.round(projectedCost * markupRatio);
    return suggested > projectedCost ? suggested : null;
  };

  // 2. Calculate suggested selling price based on latest unit cost (if priced according to newest shipment alone)
  const getLatestSuggestedSellingPrice = (item: NewPurchaseLineItem): number | null => {
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

  const selectedSupplier = useMemo(() => {
    return suppliers.find((s) => s.id === selectedSupplierId);
  }, [suppliers, selectedSupplierId]);

  const advanceCreditPiasters = useMemo(() => {
    if (!selectedSupplier || selectedSupplier.balancePiasters >= 0) return 0;
    return Math.abs(selectedSupplier.balancePiasters);
  }, [selectedSupplier]);

  const supplierDebtPiasters = useMemo(() => {
    if (!selectedSupplier || selectedSupplier.balancePiasters <= 0) return 0;
    return selectedSupplier.balancePiasters;
  }, [selectedSupplier]);

  const paidAmountPiasters = useMemo(() => {
    if (paymentMode === 'CREDIT') return 0;
    if (customPaidAmountPiasters !== null) {
      return Math.max(0, customPaidAmountPiasters);
    }
    if (paymentMode === 'PAID') return netCostPiasters;
    return 0;
  }, [paymentMode, netCostPiasters, customPaidAmountPiasters]);

  const remainingAmountPiasters = useMemo(() => {
    return Math.max(0, netCostPiasters - paidAmountPiasters);
  }, [netCostPiasters, paidAmountPiasters]);

  const excessPaidPiasters = useMemo(() => {
    return Math.max(0, paidAmountPiasters - netCostPiasters);
  }, [netCostPiasters, paidAmountPiasters]);

  const currentSupplierBalance = selectedSupplier ? selectedSupplier.balancePiasters : 0;
  const balanceDelta = netCostPiasters - paidAmountPiasters;
  const projectedBalance = currentSupplierBalance + balanceDelta;

  const handleSupplierChange = (supId: string) => {
    setSelectedSupplierId(supId);
    const sup = suppliers.find((s) => s.id === supId);
    if (sup && sup.balancePiasters < 0) {
      // Supplier has advance credit in our favor: default to deducting from credit (0 cash)
      setPaymentMode('CREDIT');
      setCustomPaidAmountPiasters(0);
    } else {
      setPaymentMode('PAID');
      setCustomPaidAmountPiasters(null);
    }
  };

  return (
    <div className="flex-1 flex gap-3 sm:gap-4 overflow-hidden">
      {/* Left: Line Items & Search (Canvas) */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
        {/* Invoice Master Header Inputs */}
        <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-3 sm:p-3.5 shadow-2xs shrink-0 flex flex-col gap-2.5">
          <div className="grid grid-cols-12 gap-2.5 sm:gap-3 items-center">
            {/* Supplier Selection */}
            <div className="col-span-12 sm:col-span-5 md:col-span-4">
              <label className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">
                المورد <span className="text-danger dark:text-danger-bright">*</span>
              </label>
              <div className="flex items-center gap-1.5">
                <CustomSelect
                  value={selectedSupplierId}
                  onChange={handleSupplierChange}
                  placeholder="-- اختر مورد الفاتورة --"
                  options={[
                    { value: '', label: '-- اختار مورد الفاتورة / الشركة --' },
                    ...suppliers
                      .filter((s) => s.isActive)
                      .map((s) => ({
                        value: s.id,
                        label: s.name,
                        badge:
                          s.balancePiasters > 0
                            ? `مديونية علينا: ${formatMoney(s.balancePiasters)}`
                            : s.balancePiasters < 0
                            ? `لنا رصيد: ${formatMoney(Math.abs(s.balancePiasters))}`
                            : undefined,
                      })),
                  ]}
                  className="flex-1 min-w-0"
                  size="md"
                  searchable
                />
                <button
                  type="button"
                  onClick={onOpenAddSupplier}
                  className="h-8 px-2.5 bg-brand-soft dark:bg-brand-dark-soft hover:bg-brand/20 dark:hover:bg-brand/30 text-brand-dark dark:text-brand-bright rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 border border-brand/20 dark:border-brand-bright/40 shadow-2xs transition-colors cursor-pointer"
                  title="إضافة مورد جديد سريعاً"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>مورد جديد</span>
                </button>
              </div>
            </div>

            {/* Supplier Invoice Number */}
            <div className="col-span-6 sm:col-span-3 md:col-span-3">
              <label className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">
                رقم فاتورة المورد (الورقية)
              </label>
              <input
                type="text"
                placeholder="مثال: INV-8840"
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                className="w-full h-8 px-2.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg text-xs font-mono font-medium text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:bg-surface dark:focus:bg-surface-dark transition-colors"
              />
            </div>

            {/* Costing Method */}
            <div className="col-span-6 sm:col-span-4 md:col-span-3">
              <label className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1 mb-1">
                <span>تحديث التكلفة</span>
                <div className="group relative inline-flex items-center justify-center cursor-help">
                  <Info className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright transition-colors" />
                  <div className="absolute top-full mt-1.5 right-0 hidden group-hover:block w-64 p-2.5 bg-ink dark:bg-surface-dark-3 text-white text-[10px] rounded-xl shadow-xl z-50 pointer-events-none leading-relaxed border border-white/10">
                    <div className="font-bold text-emerald-300 mb-1 border-b border-white/10 pb-1">
                      طريقة تحديث سعر التكلفة في كارت الصنف:
                    </div>
                    <div className="space-y-1">
                      <p className="m-0">• <b className="text-white">آخر سعر شراء:</b> يثبت تكلفة الصنف على سعر الفاتورة دي فوراً.</p>
                      <p className="m-0">• <b className="text-white">متوسط التكلفة:</b> يحسب متوسط سعر البضاعة القديمة مع الشحنة الجديدة بدقة محاسبية.</p>
                    </div>
                  </div>
                </div>
              </label>
              <CustomSelect
                value={costingMethod}
                onChange={(val) => setCostingMethod(val as 'LATEST' | 'WEIGHTED_AVERAGE')}
                options={[
                  { value: 'WEIGHTED_AVERAGE', label: 'متوسط التكلفة (محاسبي دقيق)' },
                  { value: 'LATEST', label: 'آخر سعر شراء (المتعارف عليه)' },
                ]}
                className="w-full"
                size="md"
              />
            </div>

            {/* Invoice Date */}
            <div className="col-span-12 sm:col-span-2 md:col-span-2">
              <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">تاريخ الفاتورة</span>
              <div className="h-8 px-2.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg flex items-center gap-1.5 text-xs font-mono font-bold text-ink dark:text-ink-dark">
                <Calendar className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted shrink-0" />
                <span>{new Date().toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Barcode & Product Scanner Search Bar */}
        <div ref={searchContainerRef} className="relative shrink-0">
          <div className="h-11 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark focus-within:border-brand dark:focus-within:border-brand-bright rounded-xl flex items-center px-3 gap-2.5 shadow-2xs transition-colors">
            <Search className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted" />
            <input
              type="text"
              placeholder="اضرب باركود الصنف بالاسكانر أو اكتب اسمه عشان ينزل في الفاتورة..."
              value={productSearchQuery}
              onChange={(e) => setProductSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="flex-1 bg-transparent border-none text-sm text-ink dark:text-ink-dark placeholder:text-ink-muted/70 dark:placeholder:text-ink-dark-muted/70 focus:outline-none"
              autoFocus
            />
            {isSearchingProduct && (
              <span className="text-xs text-ink-muted dark:text-ink-dark-muted animate-pulse">بندور على الصنف...</span>
            )}
          </div>

          {/* Dropdown Results */}
          {displayedCatalogProducts.length > 0 && (
            <div className="absolute top-14 left-0 right-0 z-40 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-xl overflow-hidden divide-y divide-line dark:divide-line-dark max-h-72 overflow-y-auto">
              {displayedCatalogProducts.map((p, idx) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => onAddProduct(p)}
                  className={`w-full p-3 text-right flex items-center justify-between transition-colors cursor-pointer ${
                    idx === selectedProductIndex ? 'bg-surface-2 dark:bg-surface-dark-2 ring-1 ring-inset ring-brand/30 dark:ring-brand-bright/30' : 'hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-ink dark:text-ink-dark">{p.name}</span>
                      {p.hasVariants && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-soft dark:bg-brand-soft/20 border border-brand/20 dark:border-brand-bright/30 text-brand dark:text-brand-bright text-[10px] font-bold">
                          <Layers className="w-2.5 h-2.5" />
                          <span>مقاسات وألوان</span>
                        </span>
                      )}
                      {(p.variantColor || p.variantSize) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted text-[10px] font-mono">
                          {p.variantColor && <span>{p.variantColor}</span>}
                          {p.variantColor && p.variantSize && <span>/</span>}
                          {p.variantSize && <span>{p.variantSize}</span>}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-ink-muted dark:text-ink-dark-muted font-mono block mt-0.5">
                      باركود: {p.barcode || 'بدون'} | الرصيد الحالي: {(p.stockQuantityMilli / 1000).toFixed(0)} {p.unit}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-bold font-mono text-paid dark:text-paid-bright block">
                      سعر البيع: {formatMoney(p.pricePiasters)}
                    </span>
                    <span className="text-[11px] font-mono text-ink-muted dark:text-ink-dark-muted">
                      التكلفة السابقة: {formatMoney(p.costPiasters)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line Items Table */}
        <div className="flex-1 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl overflow-hidden flex flex-col shadow-2xs">
          {/* Table Header */}
          <div className="h-9 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-5 sm:px-6 grid grid-cols-12 gap-2 items-center text-xs font-bold text-ink-muted dark:text-ink-dark-muted shrink-0">
            <div className="col-span-12 sm:col-span-3 text-right">اسم الصنف / الباركود والرصيد</div>
            <div className="col-span-4 sm:col-span-2 text-center">العدد اللي دخل</div>
            <div className="col-span-4 sm:col-span-2 text-center">سعر الشراء (التكلفة)</div>
            <div className="col-span-4 sm:col-span-2 text-center">سعر البيع للزبون</div>
            <div className="hidden sm:block sm:col-span-2 text-center">الإجمالي</div>
            <div className="col-span-12 sm:col-span-1 text-center">إجراءات</div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-line dark:divide-line-dark p-2 sm:p-2.5 space-y-2">
            {lineItems.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-ink-muted dark:text-ink-dark-muted gap-2">
                <ShoppingCart className="w-10 h-10 opacity-30" />
                <span className="text-sm font-semibold">لسه ما ضفتش أصناف للفاتورة</span>
                <span className="text-xs text-ink-muted dark:text-ink-dark-muted">اضرب الباركود بالاسكانر أو اكتب اسم الصنف فوق عشان ينزل هنا</span>
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
                const totalBatchProfitPiasters = Math.round(incomingUnits * profitPiasters);

                // 3. Projected Cost
                const projectedCostPiasters = calculateProjectedCost(item, costingMethod);

                // 4. Suggested Selling Prices (Weighted Average & Latest)
                const weightedSuggestedPricePiasters = getWeightedSuggestedSellingPrice(item);
                const latestSuggestedPricePiasters = getLatestSuggestedSellingPrice(item);

                return (
                  <div
                    key={item.productId}
                    className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark hover:border-brand/40 dark:hover:border-brand-bright/40 p-3 sm:p-3.5 flex flex-col gap-2.5 shadow-2xs transition-colors"
                  >
                    {/* Main Row: Core Columns */}
                    <div className="grid grid-cols-12 items-center gap-2 text-xs">
                      {/* 1. Product Name & Info (col-span-3) */}
                      <div className="col-span-12 sm:col-span-3 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-ink dark:text-ink-dark text-sm block truncate" title={item.productName}>
                            {item.productName}
                          </span>
                          {(item.variantColor || item.variantSize) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-soft dark:bg-brand-soft/20 border border-brand/20 dark:border-brand-bright/30 text-brand dark:text-brand-bright text-[10px] font-bold shrink-0">
                              <Layers className="w-2.5 h-2.5" />
                              {item.variantColor && <span>{item.variantColor}</span>}
                              {item.variantColor && item.variantSize && <span>/</span>}
                              {item.variantSize && <span>{item.variantSize}</span>}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <span className="text-xs font-mono text-ink-muted dark:text-ink-dark-muted">
                            كود: {item.barcode || '—'}
                          </span>
                          <span className="text-line dark:text-line-dark">•</span>
                          <span className="text-xs font-mono text-ink-muted dark:text-ink-dark-muted">
                            السابق: <b className="text-ink dark:text-ink-dark font-sans">{formatMoney(item.currentCostPiasters)}</b>
                          </span>
                        </div>
                        {/* Compact Stock Info */}
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-ink-muted dark:text-ink-dark-muted mt-1 flex-wrap">
                          <span className="bg-surface-2 dark:bg-surface-dark-2 px-1.5 py-0.5 rounded border border-line dark:border-line-dark">
                            المخزن: <b className="text-ink dark:text-ink-dark font-sans">{item.unit === 'kg' ? currentStockUnits.toFixed(3).replace(/\.?0+$/, '') : currentStockUnits.toFixed(0)}</b> {getUnitLabel(item.unit)}
                          </span>
                          {incomingUnits > 0 && (
                            <span className="bg-paid-soft dark:bg-paid-dark-soft text-paid-dark dark:text-paid-bright px-1.5 py-0.5 rounded border border-paid/20 dark:border-emerald-800/40 font-bold">
                              ← بعد الشراء: {item.unit === 'kg' ? totalStockUnits.toFixed(3).replace(/\.?0+$/, '') : totalStockUnits.toFixed(0)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 2. Quantity Control (col-span-2) */}
                      <div className="col-span-4 sm:col-span-2 flex flex-col items-center justify-center gap-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const isWeight = item.unit === 'kg' || item.unit === 'gram';
                              const curr = parseFloat(item.quantityInput || String(item.quantityUnits)) || 0;
                              if (curr > 0) {
                                const nextVal = isWeight ? Math.max(0, parseFloat((curr - 1).toFixed(3))) : Math.max(0, curr - 1);
                                handleDirectStockChange(idx, String(nextVal));
                              }
                            }}
                            className="w-7 h-7 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-line dark:hover:bg-surface-dark-3 flex items-center justify-center text-xs font-bold text-ink dark:text-ink-dark transition-colors cursor-pointer"
                            title="إنقاص الكمية"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={item.quantityInput !== undefined ? item.quantityInput : (item.quantityUnits > 0 ? String(item.quantityUnits) : '')}
                            onChange={(e) => handleDirectStockChange(idx, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              const isWeight = item.unit === 'kg' || item.unit === 'gram';
                              const step = 1;
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                const curr = parseFloat(item.quantityInput || String(item.quantityUnits)) || 0;
                                const nextVal = isWeight ? parseFloat((curr + step).toFixed(3)) : curr + step;
                                handleDirectStockChange(idx, String(nextVal));
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                const curr = parseFloat(item.quantityInput || String(item.quantityUnits)) || 0;
                                if (curr > 0) {
                                  const nextVal = isWeight ? Math.max(0, parseFloat((curr - step).toFixed(3))) : Math.max(0, curr - step);
                                  handleDirectStockChange(idx, String(nextVal));
                                }
                              }
                            }}
                            placeholder="0"
                            className="w-16 h-7 text-center font-mono font-bold bg-brand-soft dark:bg-brand-soft/20 border border-brand/30 dark:border-brand-bright/30 rounded-lg text-xs text-brand dark:text-brand-bright focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                            title="الكمية المشتراة"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const isWeight = item.unit === 'kg' || item.unit === 'gram';
                              const curr = parseFloat(item.quantityInput || String(item.quantityUnits)) || 0;
                              const nextVal = isWeight ? parseFloat((curr + 1).toFixed(3)) : curr + 1;
                              handleDirectStockChange(idx, String(nextVal));
                            }}
                            className="w-7 h-7 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-line dark:hover:bg-surface-dark-3 flex items-center justify-center text-xs font-bold text-ink dark:text-ink-dark transition-colors cursor-pointer"
                            title="زيادة الكمية"
                          >
                            +
                          </button>
                        </div>

                        {/* Cartons Summary / Shortcut */}
                        {((item.cartonsInput && parseInt(item.cartonsInput, 10) > 0) || (item.looseInput && parseInt(item.looseInput, 10) > 0)) ? (
                          <span className="text-[10.5px] font-mono text-brand dark:text-brand-bright font-bold bg-brand-soft dark:bg-brand-soft/20 px-1.5 py-0.5 rounded border border-brand/20 dark:border-brand-bright/30">
                            {parseInt(item.cartonsInput || '0', 10) > 0 ? `${item.cartonsInput} كرتونة ` : ''}
                            {parseInt(item.looseInput || '0', 10) > 0 ? `+ ${item.looseInput} فرط` : ''}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleItemExpand(item.productId)}
                            className="text-[10px] text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright font-medium flex items-center gap-0.5 cursor-pointer transition-colors"
                          >
                            <Layers className="w-2.5 h-2.5" />
                            <span>حاسبة الكراتين</span>
                          </button>
                        )}
                      </div>

                      {/* 3. Unit Cost (col-span-2) */}
                      <div className="col-span-4 sm:col-span-2 flex flex-col items-center justify-center gap-1">
                        <div className="w-24 sm:w-28">
                          <MoneyInput
                            valuePiasters={item.unitCostPiasters}
                            onChangePiasters={(p) => {
                              const updated = [...lineItems];
                              updated[idx].unitCostPiasters = p;
                              setLineItems(updated);
                            }}
                            className="!h-8 !px-2 !py-0 !text-center !text-xs !font-bold !bg-surface-2 dark:!bg-surface-dark-2 !border-line dark:!border-line-dark !rounded-lg text-ink dark:text-ink-dark"
                          />
                        </div>

                        {/* Price Change Indicator */}
                        {hasPrevCost ? (
                          costDiffPiasters > 0 ? (
                            <div
                              className="flex items-center gap-1 text-[10.5px] text-danger dark:text-danger-bright font-extrabold bg-danger-soft dark:bg-danger-dark-soft px-1.5 py-0.5 rounded border border-danger/20 dark:border-danger-bright/30"
                              title="ارتفاع في سعر الشراء"
                            >
                              <TrendingUp className="w-3 h-3 shrink-0" />
                              <span>ارتفع +{formatArabicCurrency(costDiffPiasters, true)} (+{costDiffPercent}%)</span>
                            </div>
                          ) : costDiffPiasters < 0 ? (
                            <div
                              className="flex items-center gap-1 text-[10.5px] text-paid dark:text-paid-bright font-extrabold bg-paid-soft dark:bg-paid-dark-soft px-1.5 py-0.5 rounded border border-paid/20 dark:border-emerald-800/40"
                              title="انخفاض في سعر الشراء (وفر)"
                            >
                              <TrendingDown className="w-3 h-3 shrink-0" />
                              <span>وفر -{formatArabicCurrency(Math.abs(costDiffPiasters), true)} ({costDiffPercent}%)</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5 text-[10.5px] text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-2 px-1.5 py-0.5 rounded border border-line dark:border-line-dark">
                              <Minus className="w-3 h-3 shrink-0" />
                              <span>نفس التكلفة</span>
                            </div>
                          )
                        ) : (
                          <span className="text-[10.5px] text-brand dark:text-brand-bright font-bold bg-brand-soft dark:bg-brand-soft/20 px-1.5 py-0.5 rounded border border-brand/20 dark:border-brand-bright/30">تكلفة أول مرة</span>
                        )}
                      </div>

                      {/* 4. New Selling Price & Profit Margin (col-span-2) */}
                      <div className="col-span-4 sm:col-span-2 flex flex-col items-center justify-center gap-1">
                        <div className="w-24 sm:w-28">
                          <MoneyInput
                            valuePiasters={item.newSellingPricePiasters}
                            onChangePiasters={(p) => {
                              const updated = [...lineItems];
                              updated[idx].newSellingPricePiasters = p;
                              setLineItems(updated);
                            }}
                            className="!h-8 !px-2 !py-0 !text-center !text-xs !font-bold !bg-surface-2 dark:!bg-surface-dark-2 !border-line dark:!border-line-dark !rounded-lg text-ink dark:text-ink-dark"
                          />
                        </div>

                        {/* Profit margin badge */}
                        {profitPiasters < 0 ? (
                          <div className="flex items-center gap-1 text-[10.5px] text-danger dark:text-danger-bright font-extrabold bg-danger-soft dark:bg-danger-dark-soft px-1.5 py-0.5 rounded border border-danger/20 dark:border-danger-bright/30">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>خسارة: {formatArabicCurrency(profitPiasters, true)}</span>
                          </div>
                        ) : profitPiasters === 0 ? (
                          <div className="text-[10.5px] text-warn dark:text-warn-bright font-extrabold bg-warn-soft dark:bg-warn-dark-soft px-1.5 py-0.5 rounded border border-warn-border dark:border-warn-bright/30">
                            <span>بيع = تكلفة</span>
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-1 text-[10.5px] text-paid dark:text-paid-bright font-extrabold bg-paid-soft dark:bg-paid-dark-soft px-1.5 py-0.5 rounded border border-paid/20 dark:border-emerald-800/40"
                            title={`هامش مجمل الربح: ${marginPercent}%`}
                          >
                            <span>الربح: +{formatArabicCurrency(profitPiasters, true)}</span>
                            <span className="text-[10px] opacity-80">({marginPercent}%)</span>
                          </div>
                        )}

                        {/* Suggested Selling Price Button */}
                        {weightedSuggestedPricePiasters !== null &&
                          Math.abs(weightedSuggestedPricePiasters - item.newSellingPricePiasters) > 50 && (
                            <button
                              type="button"
                              onClick={() => handleApplySuggestedPrice(idx, weightedSuggestedPricePiasters)}
                              className="text-[10px] font-bold text-brand dark:text-brand-bright hover:text-brand-dark dark:hover:text-emerald-300 flex items-center gap-1 bg-brand-soft dark:bg-brand-soft/20 hover:bg-brand/20 dark:hover:bg-brand-bright/20 px-1.5 py-0.5 rounded border border-brand/20 dark:border-brand-bright/30 transition-colors cursor-pointer"
                              title="تعديل سعر البيع لاعتماد متوسط التكلفة"
                            >
                              <Sparkles className="w-2.5 h-2.5 text-brand dark:text-brand-bright shrink-0" />
                              <span>مقترح: {formatArabicCurrency(weightedSuggestedPricePiasters, true)}</span>
                            </button>
                          )}
                      </div>

                      {/* 5. Line Total (col-span-2) */}
                      <div className="col-span-6 sm:col-span-2 text-center">
                        <div className="font-mono font-extrabold text-ink dark:text-ink-dark text-sm sm:text-base">
                          {formatMoney(lineTotal)}
                        </div>
                        <span className="text-[11px] font-mono text-ink-muted dark:text-ink-dark-muted block mt-0.5">
                          {item.quantityUnits} × {formatArabicCurrency(item.unitCostPiasters, true)}
                        </span>
                      </div>

                      {/* 6. Actions (col-span-1) */}
                      <div className="col-span-6 sm:col-span-1 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleItemExpand(item.productId)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            isItemExpanded(item.productId, item)
                              ? 'text-brand dark:text-brand-bright bg-brand-soft dark:bg-brand-soft/20'
                              : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                          }`}
                          title="عرض / إخفاء تفاصيل وحاسبة الكراتين"
                        >
                          {isItemExpanded(item.productId, item) ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLineItems(lineItems.filter((_, i) => i !== idx));
                          }}
                          className="p-1.5 text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft rounded-lg transition-colors cursor-pointer"
                          title="حذف هذا الصنف من الفاتورة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Integrated Sub-Tools: Cartons Breakdown & Smart Pricing Insights */}
                    {isItemExpanded(item.productId, item) && (
                      <div className="bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line dark:border-line-dark rounded-xl p-3 flex flex-col gap-3 transition-all">
                        {/* 1. Cartons Formula Strip */}
                        <div className="bg-surface dark:bg-surface-dark rounded-lg p-2.5 border border-line dark:border-line-dark flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark shrink-0">
                            <Layers className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
                            <span>حاسبة الكراتين والشكاير:</span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-muted dark:text-ink-dark-muted font-medium text-[11px]">عدد الكراتين:</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={item.cartonsInput ?? ''}
                                onChange={(e) => handleCartonsChange(idx, e.target.value)}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                className="w-14 h-7 text-center font-mono font-bold bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-md text-xs text-brand dark:text-brand-bright focus:border-brand dark:focus:border-brand-bright focus:outline-none"
                              />
                            </div>
                            <span className="text-ink-muted dark:text-ink-dark-muted font-bold">×</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-muted dark:text-ink-dark-muted font-medium text-[11px]">سعة الكرتونة:</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={item.packSizeInput ?? ''}
                                onChange={(e) => handlePackSizeChange(idx, e.target.value)}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                className="w-14 h-7 text-center font-mono font-bold bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-md text-xs text-ink dark:text-ink-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none"
                              />
                              <span className="text-ink-muted dark:text-ink-dark-muted text-[11px]">قطعة</span>
                            </div>
                            <span className="text-ink-muted dark:text-ink-dark-muted font-bold">+</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-muted dark:text-ink-dark-muted font-medium text-[11px]">فرط:</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={item.looseInput ?? ''}
                                onChange={(e) => handleLoosePiecesChange(idx, e.target.value)}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                className="w-14 h-7 text-center font-mono font-bold bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-md text-xs text-ink dark:text-ink-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none"
                              />
                              <span className="text-ink-muted dark:text-ink-dark-muted text-[11px]">قطعة</span>
                            </div>
                            <span className="text-ink-muted dark:text-ink-dark-muted font-bold">=</span>
                            <div className="px-2.5 py-1 bg-brand-soft dark:bg-brand-soft/20 border border-brand/20 dark:border-brand-bright/30 text-brand dark:text-brand-bright font-mono font-extrabold rounded-md text-xs">
                              {incomingUnits} قطعة إجمالي
                            </div>
                          </div>
                        </div>

                        {/* 2. Smart Cost & Selling Price Analysis Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                          {/* Card 1: Projected Cost */}
                          <div className="bg-surface dark:bg-surface-dark rounded-lg p-2.5 border border-line dark:border-line-dark flex flex-col justify-between gap-1.5 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-ink dark:text-ink-dark flex items-center gap-1.5 text-xs">
                                {costingMethod === 'LATEST' ? (
                                  <Zap className="w-3.5 h-3.5 text-brand dark:text-brand-bright shrink-0" />
                                ) : (
                                  <Calculator className="w-3.5 h-3.5 text-brand dark:text-brand-bright shrink-0" />
                                )}
                                <span>متوسط التكلفة الجديد:</span>
                              </span>
                              <span className="font-mono font-extrabold text-brand dark:text-brand-bright bg-brand-soft dark:bg-brand-soft/20 px-2 py-0.5 rounded border border-brand/20 dark:border-brand-bright/30 text-xs">
                                {formatArabicCurrency(projectedCostPiasters, true)}
                              </span>
                            </div>
                            <p className="text-ink-muted dark:text-ink-dark-muted text-[11px] leading-relaxed m-0">
                              {costingMethod === 'LATEST'
                                ? 'اعتماد سعر الشراء الأخير كتكلفة للمخزن.'
                                : `متوسط مرجح بين ${currentStockUnits.toFixed(0)} قديمة و ${incomingUnits.toFixed(0)} جديدة (الإجمالي: ${totalStockUnits.toFixed(0)} قطعة).`}
                            </p>
                          </div>

                          {/* Card 2: Weighted Selling Price */}
                          <div className="bg-surface dark:bg-surface-dark rounded-lg p-2.5 border border-line dark:border-line-dark flex flex-col justify-between gap-1.5 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-ink dark:text-ink-dark flex items-center gap-1.5 text-xs">
                                <Sparkles className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />
                                <span>سعر البيع المقترح:</span>
                              </span>
                              {weightedSuggestedPricePiasters ? (
                                <span className="font-mono font-extrabold text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft px-2 py-0.5 rounded border border-paid/20 dark:border-emerald-800/40 text-xs">
                                  {formatArabicCurrency(weightedSuggestedPricePiasters, true)}
                                </span>
                              ) : (
                                <span className="text-ink-muted dark:text-ink-dark-muted text-xs font-mono">—</span>
                              )}
                            </div>
                            <p className="text-ink-muted dark:text-ink-dark-muted text-[11px] leading-relaxed m-0">
                              {weightedSuggestedPricePiasters
                                ? `يحافظ على نفس نسبة مكسبك السابقة (${marginPercent}%).`
                                : 'لا توجد بيانات سابقة لاحتساب المتوسط.'}
                            </p>
                            <div className="flex flex-col gap-1 mt-1">
                              {weightedSuggestedPricePiasters && (
                                <button
                                  type="button"
                                  onClick={() => handleApplySuggestedPrice(idx, weightedSuggestedPricePiasters)}
                                  className="w-full py-1 px-2.5 bg-paid dark:bg-emerald-600 text-white hover:bg-paid/90 rounded-md text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs"
                                >
                                  <Sparkles className="w-3 h-3 shrink-0" />
                                  <span>تطبيق متوسط البيع ({formatArabicCurrency(weightedSuggestedPricePiasters, true)})</span>
                                </button>
                              )}
                              {latestSuggestedPricePiasters && latestSuggestedPricePiasters !== weightedSuggestedPricePiasters && (
                                <button
                                  type="button"
                                  onClick={() => handleApplySuggestedPrice(idx, latestSuggestedPricePiasters)}
                                  className="w-full py-0.5 px-2 bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright hover:bg-brand/20 dark:hover:bg-brand-bright/20 rounded-md text-[10.5px] font-bold border border-brand/20 dark:border-brand-bright/30 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                >
                                  <span>بسعر اليوم فقط: {formatArabicCurrency(latestSuggestedPricePiasters, true)}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Card 3: Batch Profit */}
                          <div className="bg-surface dark:bg-surface-dark rounded-lg p-2.5 border border-line dark:border-line-dark flex flex-col justify-between gap-1.5 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-ink dark:text-ink-dark flex items-center gap-1.5 text-xs">
                                <Banknote className="w-3.5 h-3.5 text-brand dark:text-brand-bright shrink-0" />
                                <span>إجمالي مكسب الشحنة:</span>
                              </span>
                              <span
                                className={`font-mono font-extrabold px-2 py-0.5 rounded text-xs ${
                                  totalBatchProfitPiasters > 0
                                    ? 'text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-emerald-800/40'
                                    : totalBatchProfitPiasters < 0
                                    ? 'text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30'
                                    : 'text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark'
                                }`}
                              >
                                {totalBatchProfitPiasters > 0 ? '+' : ''}
                                {formatArabicCurrency(totalBatchProfitPiasters, true)}
                              </span>
                            </div>
                            <p className="text-ink-muted dark:text-ink-dark-muted text-[11px] leading-relaxed m-0">
                              {incomingUnits > 0
                                ? `مكسب ${incomingUnits.toFixed(0)} قطعة (ربح القطعة: ${formatArabicCurrency(profitPiasters, true)} | هامش الربح: ${marginPercent}%).`
                                : 'حدد الكمية لحساب إجمالي المكسب.'}
                            </p>
                          </div>
                        </div>

                        {/* 3. Batch & Expiry Dates */}
                        {isEnabled('feature_expiry_dates') && (
                          <div className="bg-surface dark:bg-surface-dark rounded-lg p-2.5 border border-line dark:border-line-dark flex items-center gap-4 flex-wrap text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-muted dark:text-ink-dark-muted font-bold text-[11px]">رقم الشحنة:</span>
                              <input
                                type="text"
                                placeholder="رقم الشحنة"
                                value={item.batchNumber || ''}
                                onChange={(e) => {
                                  const updated = [...lineItems];
                                  updated[idx].batchNumber = e.target.value;
                                  setLineItems(updated);
                                }}
                                className="h-7 w-28 px-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded text-xs font-mono focus:border-brand dark:focus:border-brand-bright focus:outline-none"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-muted dark:text-ink-dark-muted font-bold text-[11px]">تاريخ الانتهاء:</span>
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
                                className="w-[120px]"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-muted dark:text-ink-dark-muted font-bold text-[11px]">تاريخ الإنتاج:</span>
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
                                className="w-[120px]"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right: Settlement & Totals Dock */}
      <div className="w-[280px] sm:w-[300px] xl:w-[320px] bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl flex flex-col h-full min-h-0 shrink-0 shadow-2xs overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {/* Header */}
          <div className="pb-2.5 border-b border-line dark:border-line-dark flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-brand dark:text-brand-bright" />
              <h2 className="text-[13px] font-bold text-ink dark:text-ink-dark">حساب الفاتورة</h2>
            </div>
            <span className="text-[10px] font-mono font-bold bg-brand-soft dark:bg-brand-soft/20 text-brand-dark dark:text-brand-bright px-2 py-0.5 rounded-full border border-brand/20 dark:border-brand-bright/20">
              {lineItems.length} صنف ({totalItemsPieces} قطعة)
            </span>
          </div>

          {/* Totals Breakdown */}
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center text-ink-muted dark:text-ink-dark-muted">
              <span className="text-[11.5px]">إجمالي الأصناف:</span>
              <span className="font-mono font-bold text-ink dark:text-ink-dark text-xs">
                {formatMoney(totalCostPiasters)}
              </span>
            </div>

            <div className="flex items-center justify-between py-1 text-ink-muted dark:text-ink-dark-muted">
              <span className="text-xs font-bold text-ink dark:text-ink-dark">خصم المورد:</span>
              <div className="w-28 sm:w-32">
                <MoneyInput
                  valuePiasters={discountPiasters}
                  onChangePiasters={setDiscountPiasters}
                  className="!h-8 !px-2 !py-0 !text-center !text-xs font-bold !bg-surface dark:!bg-surface-dark !border-line dark:!border-line-dark !rounded-lg text-ink dark:text-ink-dark shadow-2xs focus:border-brand"
                />
              </div>
            </div>

            {/* Net Payable Highlight Card */}
            <div className="p-2.5 rounded-xl bg-paid-soft/80 dark:bg-paid-dark-soft/80 border border-paid/20 dark:border-paid/40 flex flex-col gap-0.5">
              <div className="flex justify-between items-baseline">
                <span className="font-bold text-[11.5px] text-paid-dark dark:text-paid-bright">المطلوب دفعه للشركة:</span>
                <span className="text-base font-extrabold font-mono text-paid-dark dark:text-paid-bright">
                  {formatMoney(netCostPiasters)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-paid dark:text-paid-bright font-medium">
                <span>حالة السداد:</span>
                <span>
                  {paidAmountPiasters >= netCostPiasters
                    ? excessPaidPiasters > 0
                      ? `مدفوع بالزيادة (+${formatMoney(excessPaidPiasters)})`
                      : 'مدفوع كاش بالكامل'
                    : paidAmountPiasters === 0
                    ? advanceCreditPiasters >= netCostPiasters
                      ? 'خصم كامل من رصيدنا المتاح (0 كاش)'
                      : advanceCreditPiasters > 0
                      ? 'خصم رصيدنا + الباقي آجل'
                      : 'آجل بالكامل على الحساب'
                    : `سداد جزئي (${formatMoney(paidAmountPiasters)} كاش)`}
                </span>
              </div>
            </div>

            {/* Advance Credit Notice for Selected Supplier */}
            {advanceCreditPiasters > 0 && (
              <div className="p-2.5 rounded-xl bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid/40 flex flex-col gap-1 text-[11px] text-paid-dark dark:text-paid-bright">
                <div className="flex items-center justify-between font-bold">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />
                    <span>رصيد متاح لنا عند الشركة:</span>
                  </span>
                  <span className="font-mono text-paid dark:text-paid-bright font-extrabold text-xs">{formatMoney(advanceCreditPiasters)}</span>
                </div>
                <p className="text-[10px] text-paid dark:text-paid-bright leading-tight">
                  {netCostPiasters <= advanceCreditPiasters
                    ? `رصيدنا السابق يغطي الفاتورة بالكامل، وهيتبقى لنا ${formatMoney(advanceCreditPiasters - netCostPiasters)} تحت الحساب.`
                    : `هيغطي من رصيدنا ${formatMoney(advanceCreditPiasters)}، والباقي ندفعه ${formatMoney(netCostPiasters - advanceCreditPiasters)}.`}
                </p>
              </div>
            )}

            {supplierDebtPiasters > 0 && (
              <div className="p-2 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 flex items-center justify-between text-[11px]">
                <span className="font-bold text-warn-dark dark:text-warn-bright">حساب قديم علينا للمورد:</span>
                <span className="font-mono font-bold text-warn-dark dark:text-warn-bright">{formatMoney(supplierDebtPiasters)}</span>
              </div>
            )}
          </div>

          {/* Payment Options */}
          <div className="pt-2 border-t border-line dark:border-line-dark space-y-1.5">
            <label className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted block">طريقة سداد الفاتورة للمورد</label>
            <div className="grid grid-cols-2 gap-1.5 bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark">
              {/* Option 1: Cash */}
              <button
                type="button"
                onClick={() => {
                  setPaymentMode('PAID');
                  if (customPaidAmountPiasters === 0) {
                    setCustomPaidAmountPiasters(null);
                  }
                }}
                className={`h-8 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMode === 'PAID'
                    ? 'bg-paid dark:bg-paid-bright dark:text-surface-dark text-white shadow-2xs'
                    : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>كاش / سداد نقدي</span>
              </button>

              {/* Option 2: Credit / Advance */}
              <button
                type="button"
                onClick={() => {
                  setPaymentMode('CREDIT');
                  setCustomPaidAmountPiasters(0);
                }}
                className={`h-8 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMode === 'CREDIT'
                    ? advanceCreditPiasters > 0
                      ? 'bg-brand dark:bg-brand-bright dark:text-surface-dark text-white shadow-2xs'
                      : 'bg-warn dark:bg-warn text-white shadow-2xs'
                    : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                }`}
              >
                {advanceCreditPiasters > 0 ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>من رصيدنا المتاح</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>آجل بالكامل (0 كاش)</span>
                  </>
                )}
              </button>
            </div>

            {/* Credit Notice Details */}
            {paymentMode === 'CREDIT' && (
              <div className="p-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg text-[10.5px] mt-1 space-y-1">
                {advanceCreditPiasters > 0 ? (
                  <div className="p-1.5 bg-paid-soft dark:bg-paid-dark-soft border border-paid/20 dark:border-paid/40 text-paid-dark dark:text-paid-bright rounded flex flex-col gap-1">
                    <div className="flex items-center gap-1 font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />
                      <span>خصم تلقائي من رصيدنا المتاح (0 كاش من الخزينة):</span>
                    </div>
                    <span className="leading-tight">
                      {netCostPiasters <= advanceCreditPiasters
                        ? `الفاتورة هتتخصم بالكامل من رصيدنا السابق. المتبقي لنا بعد الخصم: ${formatMoney(advanceCreditPiasters - netCostPiasters)}.`
                        : `هيتم استهلاك كامل رصيدنا السابق (${formatMoney(advanceCreditPiasters)})، والمتبقي (${formatMoney(netCostPiasters - advanceCreditPiasters)}) هيتسجل دين علينا للمورد.`}
                    </span>
                    {netCostPiasters > advanceCreditPiasters && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMode('PAID');
                          setCustomPaidAmountPiasters(netCostPiasters - advanceCreditPiasters);
                        }}
                        className="self-start mt-0.5 px-2 py-0.5 rounded bg-paid dark:bg-paid-bright dark:text-surface-dark text-white text-[10px] font-bold cursor-pointer hover:bg-paid/90 transition-colors"
                      >
                        دفع الفرق كاش الآن ({formatMoney(netCostPiasters - advanceCreditPiasters)})
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-1.5 bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn-dark dark:text-warn-bright rounded flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {supplierDebtPiasters > 0
                        ? `الفاتورة بالكامل ستُضاف للدين القديم، فيصبح إجمالي المديونية ${formatMoney(supplierDebtPiasters + netCostPiasters)}.`
                        : `هيتسجل المبلغ كله في دفتر حساب المورد الآجل (${formatMoney(netCostPiasters)}).`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Cash Payment Section */}
            {paymentMode === 'PAID' && (
              <div className="p-2.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl space-y-2 mt-1 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-muted dark:text-ink-dark-muted font-bold text-xs shrink-0">المبلغ اللي دفعته كاش:</span>
                  <div className="w-36 sm:w-40">
                    <MoneyInput
                      valuePiasters={customPaidAmountPiasters !== null ? customPaidAmountPiasters : netCostPiasters}
                      onChangePiasters={(val) => setCustomPaidAmountPiasters(val)}
                      className="!h-8.5 !px-2 !py-0 !text-center !text-xs font-mono font-bold !bg-surface dark:!bg-surface-dark !border-line dark:!border-line-dark !rounded-lg text-ink dark:text-ink-dark shadow-2xs focus:border-paid"
                    />
                  </div>
                </div>

                {/* Quick Shortcuts */}
                <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-line/60 dark:border-line-dark/60">
                  <button
                    type="button"
                    onClick={() => setCustomPaidAmountPiasters(0)}
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition-colors cursor-pointer ${
                      paidAmountPiasters === 0
                        ? 'bg-ink dark:bg-surface-dark-3 text-white dark:text-ink-dark'
                        : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                    }`}
                  >
                    0 كاش
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomPaidAmountPiasters(netCostPiasters)}
                    className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition-colors cursor-pointer ${
                      paidAmountPiasters === netCostPiasters
                        ? 'bg-ink dark:bg-surface-dark-3 text-white dark:text-ink-dark'
                        : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                    }`}
                  >
                    الفاتورة كاملة ({formatMoney(netCostPiasters)})
                  </button>

                  {advanceCreditPiasters > 0 && advanceCreditPiasters < netCostPiasters && (
                    <button
                      type="button"
                      onClick={() => setCustomPaidAmountPiasters(netCostPiasters - advanceCreditPiasters)}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition-colors cursor-pointer ${
                        paidAmountPiasters === netCostPiasters - advanceCreditPiasters
                          ? 'bg-paid dark:bg-paid-bright dark:text-surface-dark text-white'
                          : 'bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid/40 text-paid-dark dark:text-paid-bright hover:bg-paid hover:text-white'
                      }`}
                    >
                      سداد الفرق ({formatMoney(netCostPiasters - advanceCreditPiasters)})
                    </button>
                  )}

                  {supplierDebtPiasters > 0 && (
                    <button
                      type="button"
                      onClick={() => setCustomPaidAmountPiasters(supplierDebtPiasters + netCostPiasters)}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition-colors cursor-pointer ${
                        paidAmountPiasters === supplierDebtPiasters + netCostPiasters
                          ? 'bg-brand dark:bg-brand-bright dark:text-surface-dark text-white'
                          : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-brand-dark dark:text-brand-bright hover:bg-brand-soft dark:hover:bg-brand-soft/20'
                      }`}
                    >
                      تصفية الدين بالكامل ({formatMoney(supplierDebtPiasters + netCostPiasters)})
                    </button>
                  )}
                </div>

                {/* Payment Source Selection */}
                <div className="pt-2 border-t border-line/60 dark:border-line-dark/60 space-y-1">
                  <label className="text-[10.5px] font-bold text-ink-muted dark:text-ink-dark-muted block">
                    مصدر النقدية المسددة للمورد:
                  </label>
                  <CustomSelect
                    value={paymentSource}
                    onChange={(val) => setPaymentSource(val as any)}
                    options={[
                      { value: 'cash_drawer', label: 'من درج كاشير المحل (يخصم من نقدية الدرج)' },
                      { value: 'external_cash', label: 'كاش خارجي من صاحب المحل (لا يخصم من الدرج)' },
                    ]}
                  />

                  {paymentSource === 'cash_drawer' && (
                    <div className="space-y-1 mt-1">
                      <div className="p-1.5 rounded-lg border text-[10.5px] bg-surface dark:bg-surface-dark border-line dark:border-line-dark flex items-center justify-between">
                        <span className="text-ink-muted dark:text-ink-dark-muted font-bold">كاش الدرج المتوفر حالياً:</span>
                        <span className={`font-mono font-black ${(liveDrawerCashPiasters ?? 0) > 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                          {liveDrawerCashPiasters !== null ? formatArabicCurrency(liveDrawerCashPiasters) : '0.00 ج.م'}
                        </span>
                      </div>

                      {liveDrawerCashPiasters !== null && (liveDrawerCashPiasters <= 0 || (paidAmountPiasters > 0 && paidAmountPiasters > liveDrawerCashPiasters)) && (
                        <div className="p-2 rounded-lg border text-[10px] bg-danger-soft dark:bg-danger-dark-soft border-danger/30 text-danger dark:text-danger-bright space-y-0.5">
                          <div className="flex items-center gap-1 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {liveDrawerCashPiasters <= 0
                                ? 'درج الكاشير فارغ (0.00 ج.م)!'
                                : 'رصيد نقدية الدرج غير كافٍ!'}
                            </span>
                          </div>
                          <p className="leading-relaxed">
                            {liveDrawerCashPiasters <= 0
                              ? 'لا يمكن سحب نقدية من درج فارغ لسداد الفاتورة. إذا كان السداد من مالك المحل، يرجى اختيار «كاش خارجي من صاحب المحل» أو تسجيل الفاتورة آجلة.'
                              : `المبلغ المطلوب (${formatArabicCurrency(paidAmountPiasters)}) أكبر من نقدية الدرج المتاحة (${formatArabicCurrency(liveDrawerCashPiasters)}). يرجى اختيار «كاش خارجي من صاحب المحل» أو خفض المبلغ المسدد.`}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {excessPaidPiasters > 0 && (
                  <div className="p-1.5 bg-paid-soft dark:bg-paid-dark-soft border border-paid/30 dark:border-paid/40 rounded-lg text-paid-dark dark:text-paid-bright text-[10px] flex flex-col gap-0.5">
                    <div className="flex justify-between items-center font-bold">
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-paid dark:text-paid-bright" />
                        <span>فلوس زيادة سايبينها تحت الحساب:</span>
                      </span>
                      <span className="font-mono font-extrabold text-paid dark:text-paid-bright">+{formatMoney(excessPaidPiasters)}</span>
                    </div>
                    <span className="leading-tight">
                      {supplierDebtPiasters > 0
                        ? 'الزيادة هتتخصم علطول من الحساب القديم، والباقي يترحل رصيد لنا.'
                        : 'الزيادة هتتسجل كرصيد لنا عند الشركة تتخصم من فواتير البضاعة اللي جاية.'}
                    </span>
                  </div>
                )}

                {paidAmountPiasters < netCostPiasters && (
                  <div className="flex justify-between text-danger dark:text-danger-bright font-bold text-[10.5px]">
                    <span>{advanceCreditPiasters > 0 ? 'المتبقي يُخصم من رصيدنا:' : 'الباقي علينا آجل:'}</span>
                    <span className="font-mono">{formatMoney(remainingAmountPiasters)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Interactive Supplier Ledger Impact Card */}
            {selectedSupplier && (
              <div className="p-2.5 rounded-xl border border-line dark:border-line-dark bg-surface-2/80 dark:bg-surface-dark-2/80 space-y-1.5 mt-1.5">
                <div className="flex items-center justify-between text-[10.5px] font-bold border-b border-line dark:border-line-dark pb-1">
                  <span className="text-ink dark:text-ink-dark flex items-center gap-1">
                    <Receipt className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                    <span>كشف حساب المورد بعد العملية:</span>
                  </span>
                  <span className="font-mono text-[11px]">
                    {selectedSupplier.balancePiasters < 0 ? (
                      <span className="text-paid dark:text-paid-bright">رصيد متاح لنا: {formatMoney(Math.abs(selectedSupplier.balancePiasters))}</span>
                    ) : selectedSupplier.balancePiasters > 0 ? (
                      <span className="text-warn-dark dark:text-warn-bright">مديونية قديمة علينا: {formatMoney(selectedSupplier.balancePiasters)}</span>
                    ) : (
                      <span className="text-ink-muted dark:text-ink-dark-muted">الحساب السابق خالص</span>
                    )}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="bg-surface dark:bg-surface-dark p-1 rounded-lg border border-line dark:border-line-dark flex flex-col">
                    <span className="text-ink-muted dark:text-ink-dark-muted">المدفوع كاش الآن:</span>
                    <span className="font-mono font-bold text-ink dark:text-ink-dark text-[11px] mt-0.5">{formatMoney(paidAmountPiasters)}</span>
                  </div>
                  <div className="bg-surface dark:bg-surface-dark p-1 rounded-lg border border-line dark:border-line-dark flex flex-col">
                    <span className="text-ink-muted dark:text-ink-dark-muted">
                      {paidAmountPiasters >= netCostPiasters
                        ? (paidAmountPiasters > netCostPiasters ? 'زيادة تضاف لرصيدنا:' : 'المتبقي من الفاتورة:')
                        : (advanceCreditPiasters > 0 ? 'يُخصم من رصيدنا:' : 'المتبقي دين علينا:')
                      }
                    </span>
                    <span className="font-mono font-bold text-ink dark:text-ink-dark text-[11px] mt-0.5">
                      {paidAmountPiasters > netCostPiasters
                        ? `+${formatMoney(paidAmountPiasters - netCostPiasters)}`
                        : advanceCreditPiasters > 0
                        ? formatMoney(Math.min(remainingAmountPiasters, advanceCreditPiasters))
                        : formatMoney(remainingAmountPiasters)
                      }
                    </span>
                  </div>
                </div>

                {/* Final Projected Outcome Banner */}
                <div className={`p-1.5 rounded-lg border flex items-center justify-between text-[10.5px] font-bold ${
                  projectedBalance < 0
                    ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid-dark dark:text-paid-bright border-paid/30 dark:border-paid/40'
                    : projectedBalance > 0
                    ? 'bg-warn-soft dark:bg-warn-dark-soft text-warn-dark dark:text-warn-bright border-warn/30 dark:border-warn-bright/30'
                    : 'bg-paid-soft dark:bg-paid-dark-soft text-paid-dark dark:text-paid-bright border-paid/30 dark:border-paid/40'
                }`}>
                  <span className="flex items-center gap-1">
                    {projectedBalance < 0 ? (
                      <Sparkles className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />
                    ) : projectedBalance > 0 ? (
                      <AlertCircle className="w-3.5 h-3.5 text-warn dark:text-warn-bright shrink-0" />
                    ) : (
                      <Receipt className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />
                    )}
                    <span>
                      {projectedBalance < 0
                        ? 'الموقف النهائي: رصيد متبقي لنا عند المورد'
                        : projectedBalance > 0
                        ? 'الموقف النهائي: إجمالي مديونية علينا للمورد'
                        : 'الموقف النهائي: الحساب خالص تماماً'}
                    </span>
                  </span>
                  <span className="font-mono text-xs font-extrabold">
                    {projectedBalance === 0 ? '0.00 ج.م' : formatMoney(Math.abs(projectedBalance))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notes Input */}
          <div className="pt-2">
            <label className="text-[10.5px] font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">ملاحظات على الفاتورة</label>
            <input
              type="text"
              placeholder="اكتب أي ملاحظة أو رقم إذن الاستلام..."
              value={purchaseNotes}
              onChange={(e) => setPurchaseNotes(e.target.value)}
              className="w-full h-8 px-2.5 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50 focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:bg-surface dark:focus:bg-surface-dark transition-colors"
            />
          </div>
        </div>

        {/* Action Buttons (Pinned Bottom) */}
        <div className="p-3 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark shrink-0 space-y-1.5 shadow-[0_-4px_10px_rgba(0,0,0,0.03)] dark:shadow-[0_-4px_10px_rgba(0,0,0,0.2)]">
          <button
            type="button"
            onClick={onSavePurchase}
            disabled={
              lineItems.length === 0 ||
              (paymentMode === 'PAID' &&
                paymentSource === 'cash_drawer' &&
                paidAmountPiasters > 0 &&
                liveDrawerCashPiasters !== null &&
                (liveDrawerCashPiasters <= 0 || paidAmountPiasters > liveDrawerCashPiasters))
            }
            className="w-full h-10 bg-paid hover:bg-paid-hover dark:bg-paid-bright dark:text-surface-dark dark:hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
          >
            <Receipt className="w-4 h-4" />
            <span>حفظ الفاتورة وتزويد رصيد البضاعة</span>
          </button>
          <button
            type="button"
            onClick={onRequestCancel}
            className="w-full h-8 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            إلغاء وتراجع
          </button>
        </div>
      </div>
    </div>
  );
};
