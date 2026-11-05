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
  Sparkles,
  Calendar,
  ChevronDown,
  Package,
  Pill,
  Tag,
  ScanBarcode,
  SlidersHorizontal,
} from 'lucide-react';
import { CustomSelect } from '../../components/CustomSelect';
import { CustomDatePicker } from '../../components/CustomDatePicker';
import { MoneyInput } from '../../components/MoneyInput';
import { RequiredMark } from '../../components/RequiredMark';
import { useFeatures } from '../../context/useFeatures';
import type { Supplier, Product, ProductUnit } from '../../types/models';
import { formatMoney, type NewPurchaseLineItem } from './types';
import { computePurchaseLine, purchaseLinesTotal } from './purchaseLineMath';
import { normalizeArabicNumerals, formatArabicCurrency } from '../../utils/money';
import { invoke } from '../../bridge/ipc';
import { getStoreTerminology } from '../../utils/storeTerminology';
import { formatCompoundStock } from '../../utils/packaging';

const DETAIL_LABEL_CLS = 'text-micro font-bold text-ink-muted dark:text-ink-dark-muted';
const DETAIL_INPUT_CLS =
  'w-full h-9 text-center font-mono font-bold tabular-nums bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-md text-sm text-ink dark:text-ink-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none';
const DETAIL_MONEY_CLS =
  '!h-9 !px-2 !py-0 !text-center !text-sm !font-bold !bg-surface dark:!bg-surface-dark !border-line dark:!border-line-dark !rounded-md text-ink dark:text-ink-dark';

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
  isSaving: boolean;
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
  isSaving,
  onRequestCancel,
}) => {
  const { isEnabled } = useFeatures();
  const terminology = useMemo(() => getStoreTerminology(), []);
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
    setExpandedItemIds((prev) => ({ ...prev, [productId]: !prev[productId] }));
  };

  const isItemExpanded = (productId: string) => Boolean(expandedItemIds[productId]);

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

  // Unit & Packaging Helpers
  const getItemUnitsMeta = useCallback(
    (item: NewPurchaseLineItem) => {
      const isPharma = isEnabled('feature_pharmacy');
      const isMultiUnits = isEnabled('feature_multi_units');

      const packSize = parseInt(item.packSizeInput || '', 10) || item.packSize || 1;

      // Extract units if configured on product
      const baseUnitObj = item.productUnits?.find((u) => u.isBaseUnit || u.conversionFactor === 1);
      const pkgUnitObj = item.productUnits?.find((u) => !u.isBaseUnit && u.conversionFactor > 1);

      const effectivePackSize = pkgUnitObj?.conversionFactor || packSize;
      const hasPackaging = effectivePackSize > 1 || Boolean(pkgUnitObj) || isPharma || isMultiUnits;

      const packageUnitName =
        item.packageUnitName ||
        pkgUnitObj?.unitName ||
        (isPharma ? 'علبة' : terminology.packagingTopUnitDefault || 'كرتونة');

      const baseUnitName =
        baseUnitObj?.unitName ||
        (isPharma
          ? item.unit && item.unit !== 'piece'
            ? item.unit
            : 'قرص'
          : item.unit || terminology.baseUnitDefaultName || 'قطعة');

      const unitMode: 'package' | 'base' =
        item.purchaseUnitMode || (hasPackaging && effectivePackSize > 1 ? 'package' : 'base');

      const unitsForDisplay: ProductUnit[] =
        item.productUnits && item.productUnits.length > 0
          ? item.productUnits
          : effectivePackSize > 1
          ? [
              {
                id: 'base',
                productId: item.productId,
                unitName: baseUnitName,
                conversionFactor: 1,
                isBaseUnit: true,
                isDivisible: false,
                sortOrder: 0,
                sellPricePiasters: item.currentPricePiasters,
                costPricePiasters: item.currentCostPiasters,
              },
              {
                id: 'pkg',
                productId: item.productId,
                unitName: packageUnitName,
                conversionFactor: effectivePackSize,
                isBaseUnit: false,
                isDivisible: false,
                sortOrder: 1,
                sellPricePiasters: item.currentPricePiasters * effectivePackSize,
                costPricePiasters: item.currentCostPiasters * effectivePackSize,
              },
            ]
          : [];

      return {
        packSize: effectivePackSize,
        packageUnitName,
        baseUnitName,
        hasPackaging,
        unitMode,
        unitsForDisplay,
      };
    },
    [isEnabled, terminology]
  );

  const handleTogglePurchaseUnitMode = (idx: number, newMode: 'package' | 'base') => {
    const updated = [...lineItems];
    const item = { ...updated[idx] };
    const meta = getItemUnitsMeta(item);

    if (item.purchaseUnitMode === newMode) return;

    item.purchaseUnitMode = newMode;
    const packSize = Math.max(1, meta.packSize);

    if (newMode === 'package') {
      const currentUnits = item.quantityUnits || 0;
      const pCount = Math.max(1, Math.round(currentUnits / packSize));
      item.cartonsInput = String(pCount);
      item.packageQuantityInput = String(pCount);
      item.looseInput = '0';
      item.quantityUnits = pCount * packSize;
      item.quantityInput = String(item.quantityUnits);
      if (!item.packageCostPiasters || item.packageCostPiasters === 0) {
        item.packageCostPiasters = Math.round(item.unitCostPiasters * packSize);
      }
    } else {
      item.quantityInput = String(item.quantityUnits || 0);
    }

    updated[idx] = item;
    setLineItems(updated);
  };

  const handleQuantityStep = (idx: number, stepDelta: number) => {
    const updated = [...lineItems];
    const item = { ...updated[idx] };
    const meta = getItemUnitsMeta(item);
    const isWeight = item.unit === 'kg' || item.unit === 'gram';

    if (meta.unitMode === 'package' && meta.packSize > 1) {
      const currentPkg =
        parseInt(item.packageQuantityInput || item.cartonsInput || '', 10) ||
        (item.quantityUnits > 0 ? Math.floor(item.quantityUnits / meta.packSize) : 1);
      const nextPkg = Math.max(1, currentPkg + stepDelta);
      item.cartonsInput = String(nextPkg);
      item.packageQuantityInput = String(nextPkg);
      item.looseInput = '0';
      item.quantityUnits = nextPkg * meta.packSize;
      item.quantityInput = String(item.quantityUnits);
    } else {
      const curr = parseFloat(item.quantityInput || String(item.quantityUnits)) || 0;
      const nextVal = isWeight
        ? Math.max(0, parseFloat((curr + stepDelta).toFixed(3)))
        : Math.max(1, curr + stepDelta);
      item.quantityUnits = nextVal;
      item.quantityInput = String(nextVal);
      if (meta.packSize > 1) {
        item.cartonsInput = String(Math.floor(nextVal / meta.packSize));
        item.looseInput = String(nextVal % meta.packSize);
      }
    }

    updated[idx] = item;
    setLineItems(updated);
  };

  const handleCartonsChange = (idx: number, val: string) => {
    const digitsOnly = normalizeArabicNumerals(val).replace(/[^\d]/g, '');
    const clean = digitsOnly.length > 1 ? digitsOnly.replace(/^0+/, '') || '0' : digitsOnly;
    const updated = [...lineItems];
    const item = { ...updated[idx] };

    item.cartonsInput = clean;
    item.packageQuantityInput = clean;

    const c = parseInt(clean, 10);
    const cVal = isNaN(c) ? 0 : c;

    const p = parseInt(normalizeArabicNumerals(item.packSizeInput || ''), 10);
    const pVal = isNaN(p) || p <= 0 ? (item.packSize || 1) : p;

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
    const pVal = isNaN(p) || p <= 0 ? 1 : p;

    const c = parseInt(normalizeArabicNumerals(item.cartonsInput || item.packageQuantityInput || ''), 10);
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

    if (item.packageCostPiasters && item.packageCostPiasters > 0) {
      item.unitCostPiasters = Math.round(item.packageCostPiasters / pVal);
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

    const c = parseInt(normalizeArabicNumerals(item.cartonsInput || item.packageQuantityInput || ''), 10);
    const cVal = isNaN(c) ? 0 : c;

    const p = parseInt(normalizeArabicNumerals(item.packSizeInput || ''), 10);
    const pVal = isNaN(p) || p <= 0 ? (item.packSize || 1) : p;

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
    const updated = [...lineItems];
    const item = { ...updated[idx] };
    const meta = getItemUnitsMeta(item);
    const isWeightItem = item.unit === 'kg' || item.unit === 'gram';

    let clean = normalizeArabicNumerals(val);
    if (isWeightItem) {
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

    if (meta.unitMode === 'package' && meta.packSize > 1) {
      item.packageQuantityInput = clean;
      item.cartonsInput = clean;
      item.looseInput = '0';
      if (clean === '') {
        item.quantityUnits = 0;
        item.quantityInput = '';
      } else {
        const pkgCount = parseInt(clean, 10) || 0;
        item.quantityUnits = Math.max(0, pkgCount * meta.packSize);
        item.quantityInput = String(item.quantityUnits);
      }
    } else {
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

        if (!isWeightItem && meta.packSize > 1) {
          const c = Math.floor(totalVal / meta.packSize);
          const rem = Math.round(totalVal % meta.packSize);
          item.cartonsInput = c > 0 ? String(c) : '0';
          item.packageQuantityInput = c > 0 ? String(c) : '0';
          item.looseInput = rem > 0 ? String(rem) : '0';
        }
      }
    }

    updated[idx] = item;
    setLineItems(updated);
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

  const handleApplySuggestedPrice = (idx: number, suggestedPiasters: number) => {
    const updated = [...lineItems];
    updated[idx].newSellingPricePiasters = suggestedPiasters;
    setLineItems(updated);
  };

  const totalCostPiasters = useMemo(() => purchaseLinesTotal(lineItems), [lineItems]);

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

  const [showErrors, setShowErrors] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const supplierWrapRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const seenLineIdsRef = useRef<Set<string>>(new Set());

  const supplierRequired = remainingAmountPiasters > 0 || excessPaidPiasters > 0;
  const supplierMissing = supplierRequired && !selectedSupplierId;

  // Lines that need input beyond qty/cost open their details once, when first added, so nothing stays hidden.
  useEffect(() => {
    const seen = seenLineIdsRef.current;
    const needy = lineItems
      .filter((item) => !seen.has(item.productId))
      .filter((item) => {
        const noSellPrice = item.newSellingPricePiasters <= 0 && item.currentPricePiasters <= 0;
        const noExpiry = isEnabled('feature_expiry_dates') && !item.expiryDate;
        return noSellPrice || noExpiry;
      })
      .map((item) => item.productId);
    seenLineIdsRef.current = new Set(lineItems.map((item) => item.productId));
    if (needy.length > 0) {
      setExpandedItemIds((prev) => {
        const next = { ...prev };
        needy.forEach((id) => {
          next[id] = true;
        });
        return next;
      });
    }
  }, [lineItems, isEnabled]);

  const handleRemoveLine = (idx: number) => {
    const removedId = lineItems[idx]?.productId;
    setLineItems(lineItems.filter((_, i) => i !== idx));
    if (removedId) {
      setExpandedItemIds((prev) => {
        const next = { ...prev };
        delete next[removedId];
        return next;
      });
    }
  };

  // Takes the user to the first thing the save validation will complain about (toast text stays in the parent).
  const handleSaveClick = () => {
    setShowErrors(true);
    if (lineItems.length === 0) {
      searchInputRef.current?.focus();
    } else if (supplierMissing) {
      supplierWrapRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      supplierWrapRef.current?.querySelector('button')?.focus({ preventScroll: true });
    } else {
      const badLine = lineItems.find((it) => it.quantityUnits <= 0 || it.unitCostPiasters < 0);
      if (badLine) {
        const row = lineRefs.current.get(badLine.productId);
        row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        row?.querySelector<HTMLInputElement>('input[data-field="qty"]')?.focus({ preventScroll: true });
      }
    }
    onSavePurchase();
  };

  const formatBalanceLabel = (balance: number): string =>
    balance > 0 ? `علينا ${formatMoney(balance)}` : balance < 0 ? `لنا ${formatMoney(Math.abs(balance))}` : 'خالص';

  const cashDrawerBlocked =
    paymentMode === 'PAID' &&
    paymentSource === 'cash_drawer' &&
    paidAmountPiasters > 0 &&
    liveDrawerCashPiasters !== null &&
    (liveDrawerCashPiasters <= 0 || paidAmountPiasters > liveDrawerCashPiasters);

  const fromAdvanceCreditPiasters = Math.min(remainingAmountPiasters, advanceCreditPiasters);
  const settlementTone: 'paid' | 'warn' | 'danger' =
    excessPaidPiasters > 0 || remainingAmountPiasters === 0 ? 'paid' : advanceCreditPiasters > 0 ? 'warn' : 'danger';
  const settlementLabel =
    excessPaidPiasters > 0
      ? 'زيادة تُضاف لرصيدنا'
      : remainingAmountPiasters === 0
      ? 'المتبقي'
      : advanceCreditPiasters > 0
      ? 'المتبقي (يُخصم من رصيدنا أولاً)'
      : 'المتبقي آجل على حساب المورد';
  const settlementAmount = excessPaidPiasters > 0 ? excessPaidPiasters : remainingAmountPiasters;
  const settlementNote =
    excessPaidPiasters > 0
      ? supplierDebtPiasters > 0
        ? 'الزيادة تُخصم من الحساب القديم والباقي يترحل رصيد لنا.'
        : 'تُسجل رصيداً لنا عند المورد وتُخصم من فواتير البضاعة الجاية.'
      : remainingAmountPiasters === 0
      ? 'الفاتورة مسددة بالكامل.'
      : advanceCreditPiasters > 0
      ? remainingAmountPiasters > fromAdvanceCreditPiasters
        ? `يُخصم ${formatMoney(fromAdvanceCreditPiasters)} من رصيدنا والباقي ${formatMoney(remainingAmountPiasters - fromAdvanceCreditPiasters)} دين علينا.`
        : 'يُخصم بالكامل من رصيدنا السابق.'
      : 'يُسجل في دفتر حساب المورد كدين علينا.';

  const SETTLEMENT_TONE_CLS: Record<'paid' | 'warn' | 'danger', string> = {
    paid: 'bg-paid-soft dark:bg-paid-dark-soft border-paid/20 dark:border-paid-dark-border text-paid-dark dark:text-paid-bright',
    warn: 'bg-warn-soft dark:bg-warn-dark-soft border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright',
    danger: 'bg-danger-soft dark:bg-danger-dark-soft border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright',
  };

  const quickBtnCls = (active: boolean) =>
    `h-9 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
      active
        ? 'bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright border border-brand/40 dark:border-brand-bright/50'
        : 'bg-surface dark:bg-surface-dark border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
    }`;

  const extrasChips: string[] = [];
  if (supplierInvoiceNumber.trim()) extrasChips.push(`فاتورة رقم ${supplierInvoiceNumber.trim()}`);
  if (discountPiasters > 0) extrasChips.push(`خصم ${formatMoney(discountPiasters)}`);
  if (costingMethod === 'LATEST') extrasChips.push('آخر سعر شراء');
  if (purchaseNotes.trim()) extrasChips.push('ملاحظة');

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
      {/* Scrollable workspace: header, search, line items, settlement */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-3 pb-1">
        {/* Invoice header: supplier + date always visible, the rest folded away */}
        <section className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs space-y-3">
          {(supplierRequired || lineItems.length > 0) && (
            <p className="text-micro text-ink-muted dark:text-ink-muted-dark">الحقول المميزة بعلامة * مطلوبة</p>
          )}
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div ref={supplierWrapRef} className="flex-1 min-w-0">
              <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1.5">
                المورد {supplierRequired && <RequiredMark />}
              </label>
              <div
                className={`flex items-center gap-2 rounded-xl ${
                  showErrors && supplierMissing ? 'ring-2 ring-danger/40 dark:ring-danger-bright/50' : ''
                }`}
              >
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
                  size="lg"
                  searchable
                />
                <button
                  type="button"
                  onClick={onOpenAddSupplier}
                  className="h-10 px-3 bg-brand-soft dark:bg-brand-dark-soft hover:bg-brand/20 dark:hover:bg-brand/30 text-brand-dark dark:text-brand-bright rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 border border-brand/20 dark:border-brand-bright/40 shadow-2xs transition-colors cursor-pointer"
                  title="إضافة مورد جديد سريعاً"
                >
                  <Plus className="w-4 h-4" />
                  <span>مورد جديد</span>
                </button>
              </div>
            </div>

            <div className="sm:w-48 shrink-0">
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1.5">تاريخ الفاتورة</span>
              <div className="h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg flex items-center gap-2 text-sm font-mono font-bold text-ink dark:text-ink-dark whitespace-nowrap">
                <Calendar className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted shrink-0" />
                <span>{new Date().toLocaleDateString('ar-EG-u-nu-latn', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
          </div>

          {/* Optional invoice-level fields */}
          <div className="border-t border-line dark:border-line-dark pt-3">
            <button
              type="button"
              onClick={() => setExtrasOpen((v) => !v)}
              aria-expanded={extrasOpen}
              aria-controls="purchase-extras"
              className="w-full flex items-center gap-2 text-xs font-bold text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark transition-colors cursor-pointer"
            >
              <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${extrasOpen ? 'rotate-180' : ''}`} />
              <span>بيانات إضافية</span>
              {extrasChips.length > 0 ? (
                <span className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {extrasChips.map((chip) => (
                    <span
                      key={chip}
                      className="px-2 py-0.5 rounded-full bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 text-micro font-bold"
                    >
                      {chip}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="font-medium truncate">رقم فاتورة المورد، طريقة تحديث التكلفة، الخصم، الملاحظات</span>
              )}
            </button>

            {extrasOpen && (
              <div id="purchase-extras" className="grid grid-cols-12 gap-3 items-start mt-3">
                <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1.5">
                    رقم فاتورة المورد (الورقية)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: INV-8840"
                    value={supplierInvoiceNumber}
                    onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                    className="w-full h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg text-sm font-mono font-medium text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:bg-surface dark:focus:bg-surface-dark transition-colors"
                  />
                </div>

                <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted flex items-center gap-1 mb-1.5">
                    <span>تحديث التكلفة</span>
                    <div className="group relative inline-flex items-center justify-center cursor-help">
                      <Info className="w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright transition-colors" />
                      <div className="absolute top-full mt-1.5 right-0 hidden group-hover:block w-64 p-2.5 bg-ink dark:bg-surface-dark-3 text-white text-micro rounded-xl shadow-xl z-50 pointer-events-none leading-relaxed border border-white/10">
                        <div className="font-bold text-paid-bright mb-1 border-b border-white/10 pb-1">
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
                    size="lg"
                  />
                </div>

                <div className="col-span-12 sm:col-span-6 lg:col-span-2">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1.5">خصم المورد</label>
                  <MoneyInput
                    valuePiasters={discountPiasters}
                    onChangePiasters={setDiscountPiasters}
                    className="!h-10 !px-2 !text-center !text-sm font-bold !bg-surface-2 dark:!bg-surface-dark-2 !border-line dark:!border-line-dark !rounded-lg text-ink dark:text-ink-dark shadow-2xs focus:border-brand"
                  />
                </div>

                <div className="col-span-12 sm:col-span-6 lg:col-span-4">
                  <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1.5">ملاحظات على الفاتورة</label>
                  <input
                    type="text"
                    placeholder="اكتب أي ملاحظة أو رقم إذن الاستلام..."
                    value={purchaseNotes}
                    onChange={(e) => setPurchaseNotes(e.target.value)}
                    className="w-full h-10 px-3 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-lg text-sm text-ink dark:text-ink-dark placeholder:text-ink-muted/50 dark:placeholder:text-ink-dark-muted/50 focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:bg-surface dark:focus:bg-surface-dark transition-colors"
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Barcode & Product Scanner Search Bar */}
        <div ref={searchContainerRef} className="sticky top-0 z-30 bg-canvas dark:bg-canvas-dark py-1">
          <div className="h-12 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark focus-within:border-brand dark:focus-within:border-brand-bright focus-within:ring-2 focus-within:ring-brand/20 dark:focus-within:ring-brand-bright/20 rounded-xl flex items-center px-4 gap-3 shadow-2xs transition-colors">
            <Search className="w-5 h-5 text-ink-muted dark:text-ink-dark-muted shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="اضرب باركود الصنف بالاسكانر أو اكتب اسمه عشان ينزل في الفاتورة..."
              value={productSearchQuery}
              onChange={(e) => setProductSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="flex-1 min-w-0 bg-transparent border-none text-sm text-ink dark:text-ink-dark placeholder:text-ink-muted/70 dark:placeholder:text-ink-dark-muted/70 focus:outline-none"
              autoFocus
            />
            {isSearchingProduct && (
              <span className="text-xs text-ink-muted dark:text-ink-dark-muted animate-pulse shrink-0">بندور على الصنف...</span>
            )}
          </div>

          {/* Dropdown Results */}
          {displayedCatalogProducts.length > 0 && (
            <div className="absolute top-[3.75rem] left-0 right-0 z-40 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-xl overflow-hidden divide-y divide-line dark:divide-line-dark max-h-72 overflow-y-auto">
              {displayedCatalogProducts.map((p, idx) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => onAddProduct(p)}
                  className={`w-full px-4 py-3 text-right flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                    idx === selectedProductIndex ? 'bg-surface-2 dark:bg-surface-dark-2 ring-1 ring-inset ring-brand/30 dark:ring-brand-bright/30' : 'hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-ink dark:text-ink-dark">{p.name}</span>
                      {p.hasVariants && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-soft dark:bg-brand-soft/20 border border-brand/20 dark:border-brand-bright/30 text-brand dark:text-brand-bright text-micro font-bold">
                          <Layers className="w-2.5 h-2.5" />
                          <span>{terminology.variantsTitle}</span>
                        </span>
                      )}
                      {(p.variantColor || p.variantSize) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted text-micro font-mono">
                          {p.variantColor && <span>{p.variantColor}</span>}
                          {p.variantColor && p.variantSize && <span>/</span>}
                          {p.variantSize && <span>{p.variantSize}</span>}
                        </span>
                      )}
                    </div>
                    <span className="text-micro text-ink-muted dark:text-ink-dark-muted font-mono block mt-0.5">
                      باركود: {p.barcode || 'بدون'} | الرصيد الحالي: {(p.stockQuantityMilli / 1000).toFixed(0)} {p.unit}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-bold font-mono text-paid dark:text-paid-bright block">
                      سعر البيع: {formatMoney(p.pricePiasters)}
                    </span>
                    <span className="text-micro font-mono text-ink-muted dark:text-ink-dark-muted">
                      التكلفة السابقة: {formatMoney(p.costPiasters)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line Items Table */}
        <section className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl overflow-hidden shadow-2xs">
          <div className="px-4 py-3 border-b border-line dark:border-line-dark flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
            <h2 className="t-card-title text-ink dark:text-ink-dark">أصناف الفاتورة</h2>
            {lineItems.length > 0 && (
              <span className="text-xs font-bold tabular-nums bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright px-2.5 py-0.5 rounded-full border border-brand/20 dark:border-brand-bright/30">
                {lineItems.length} صنف ({totalItemsPieces} قطعة)
              </span>
            )}
          </div>

          {lineItems.length > 0 && (
            <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_176px_128px_112px_120px] gap-x-3 h-9 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark px-4 items-center text-xs font-bold text-ink-muted dark:text-ink-dark-muted">
              <div className="text-right">الصنف</div>
              <div className="text-center">الكمية <RequiredMark /></div>
              <div className="text-center">سعر الشراء</div>
              <div className="text-center">الإجمالي</div>
              <div />
            </div>
          )}

          <div className="divide-y divide-line dark:divide-line-dark">
            {lineItems.length === 0 ? (
              <div className="py-10 px-4 flex flex-col items-center justify-center text-center gap-2">
                <div className="w-14 h-14 rounded-2xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/30 flex items-center justify-center">
                  <ScanBarcode className="w-7 h-7 text-brand dark:text-brand-bright" />
                </div>
                <span className="text-sm font-bold text-ink dark:text-ink-dark">ابدأ بإضافة أول صنف للفاتورة</span>
                <span className="text-xs text-ink-muted dark:text-ink-dark-muted max-w-sm leading-relaxed">
                  اضرب الباركود بالاسكانر أو اكتب اسم الصنف في خانة البحث، واضغط Enter عشان ينزل هنا. بعدها حدد الكمية وسعر الشراء بس.
                </span>
                <button
                  type="button"
                  onClick={() => searchInputRef.current?.focus()}
                  className="mt-1 h-9 px-4 rounded-lg bg-brand-soft dark:bg-brand-dark-soft hover:bg-brand/20 dark:hover:bg-brand/30 text-brand-dark dark:text-brand-bright border border-brand/20 dark:border-brand-bright/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>اذهب لخانة البحث</span>
                </button>
              </div>
            ) : (
              lineItems.map((item, idx) => {
                const meta = getItemUnitsMeta(item);
                const lineAmounts = computePurchaseLine(item);
                const lineTotal = lineAmounts.lineGrossPiasters;
                const currentStockUnits = Math.max(0, item.currentStockMilli / 1000);
                const incomingUnits = item.quantityUnits || 0;
                const isOpen = isItemExpanded(item.productId);
                const detailsId = `purchase-line-details-${item.productId}`;

                const costDiffPiasters = item.unitCostPiasters - item.currentCostPiasters;
                const hasPrevCost = item.currentCostPiasters > 0;
                const costDiffPercent = hasPrevCost
                  ? ((costDiffPiasters / item.currentCostPiasters) * 100).toFixed(1)
                  : null;

                const hasSellPrice = item.newSellingPricePiasters > 0 || item.currentPricePiasters > 0;
                const effectiveSellingPricePiasters =
                  item.newSellingPricePiasters > 0 ? item.newSellingPricePiasters : item.currentPricePiasters;
                const profitPiasters = effectiveSellingPricePiasters - item.unitCostPiasters;
                const marginPercent = effectiveSellingPricePiasters > 0
                  ? ((profitPiasters / effectiveSellingPricePiasters) * 100).toFixed(1)
                  : '0';
                const totalBatchProfitPiasters = Math.round(incomingUnits * profitPiasters);

                const projectedCostPiasters = calculateProjectedCost(item, costingMethod);
                const weightedSuggestedPricePiasters = getWeightedSuggestedSellingPrice(item);
                const currentPackageCost = item.packageCostPiasters || (item.unitCostPiasters * meta.packSize);
                const isPackageMode = meta.unitMode === 'package' && meta.packSize > 1;

                const hasDistributorTerms =
                  (item.distributorDiscountPercent || 0) > 0 || (item.bonusQuantityUnits || 0) > 0;
                const missingExpiry = isEnabled('feature_expiry_dates') && !item.expiryDate;
                const qtyInvalid = showErrors && item.quantityUnits <= 0;

                return (
                  <div
                    key={item.productId}
                    ref={(el) => {
                      if (el) lineRefs.current.set(item.productId, el);
                      else lineRefs.current.delete(item.productId);
                    }}
                    className="px-4 py-3 flex flex-col gap-3 scroll-mt-16 hover:bg-surface-2/40 dark:hover:bg-surface-dark-2/40 transition-colors"
                  >
                    {/* Essentials: name, quantity, unit cost, total, actions */}
                    <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,1fr)_176px_128px_112px_120px] items-start gap-x-3 gap-y-3 text-xs">
                      {/* 1. Product */}
                      <div className="col-span-2 lg:col-span-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-ink dark:text-ink-dark text-sm block line-clamp-2" title={item.productName}>
                            {item.productName}
                          </span>
                          {(item.variantColor || item.variantSize) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-soft dark:bg-brand-soft/20 border border-brand/20 dark:border-brand-bright/30 text-brand dark:text-brand-bright text-micro font-bold shrink-0">
                              <Layers className="w-2.5 h-2.5" />
                              {item.variantColor && <span>{item.variantColor}</span>}
                              {item.variantColor && item.variantSize && <span>/</span>}
                              {item.variantSize && <span>{item.variantSize}</span>}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap mt-1 text-micro font-mono text-ink-muted dark:text-ink-dark-muted">
                          {item.barcode && <span>{item.barcode}</span>}
                          <span>
                            المخزن: <b className="text-ink dark:text-ink-dark font-sans">{formatCompoundStock(item.currentStockMilli, meta.unitsForDisplay, meta.baseUnitName)}</b>
                          </span>
                          {incomingUnits > 0 && (
                            <span className="text-paid dark:text-paid-bright font-bold">
                              ← {formatCompoundStock(item.currentStockMilli + (item.quantityUnits * 1000), meta.unitsForDisplay, meta.baseUnitName)}
                            </span>
                          )}
                        </div>
                        {/* Attention chips only while the details are folded */}
                        {!isOpen && (profitPiasters < 0 || !hasSellPrice || missingExpiry || hasDistributorTerms) && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            {!hasSellPrice && (
                              <span className="text-micro font-bold text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft px-1.5 py-0.5 rounded border border-warn-border dark:border-warn-bright/30">
                                حدد سعر البيع
                              </span>
                            )}
                            {hasSellPrice && profitPiasters < 0 && (
                              <span className="inline-flex items-center gap-1 text-micro font-bold text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft px-1.5 py-0.5 rounded border border-danger/20 dark:border-danger-bright/30">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>البيع أقل من التكلفة</span>
                              </span>
                            )}
                            {missingExpiry && (
                              <span className="text-micro font-bold text-warn dark:text-warn-bright bg-warn-soft dark:bg-warn-dark-soft px-1.5 py-0.5 rounded border border-warn-border dark:border-warn-bright/30">
                                أدخل تاريخ الانتهاء
                              </span>
                            )}
                            {hasDistributorTerms && (
                              <span className="text-micro font-bold text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft px-1.5 py-0.5 rounded border border-paid/20 dark:border-paid-dark-border">
                                خصم موزع {item.distributorDiscountPercent || 0}%
                                {item.bonusQuantityUnits ? ` + ${item.bonusQuantityUnits} بونص` : ''}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 2. Quantity */}
                      <div className="flex flex-col items-center justify-start gap-1.5">
                        <span className="lg:hidden self-start text-xs font-bold text-ink-muted dark:text-ink-dark-muted">الكمية</span>
                        {meta.hasPackaging && meta.packSize > 1 && (
                          <div className="inline-flex items-center p-0.5 bg-surface-2 dark:bg-surface-dark-2 rounded-lg border border-line dark:border-line-dark text-micro font-bold">
                            <button
                              type="button"
                              onClick={() => handleTogglePurchaseUnitMode(idx, 'package')}
                              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all cursor-pointer ${
                                meta.unitMode === 'package'
                                  ? 'bg-brand dark:bg-brand text-white shadow-2xs font-extrabold'
                                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                              }`}
                              title={`الشراء بال${meta.packageUnitName}`}
                            >
                              <Package className="w-3 h-3 shrink-0" />
                              <span>بال{meta.packageUnitName}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTogglePurchaseUnitMode(idx, 'base')}
                              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all cursor-pointer ${
                                meta.unitMode === 'base'
                                  ? 'bg-brand dark:bg-brand text-white shadow-2xs font-extrabold'
                                  : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark'
                              }`}
                              title={`الشراء بال${meta.baseUnitName}`}
                            >
                              {isEnabled('feature_pharmacy') ? <Pill className="w-3 h-3 shrink-0" /> : <Tag className="w-3 h-3 shrink-0" />}
                              <span>بال{meta.baseUnitName}</span>
                            </button>
                          </div>
                        )}

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleQuantityStep(idx, -1)}
                            className="w-9 h-10 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-line dark:hover:bg-surface-dark-3 flex items-center justify-center text-base font-bold text-ink dark:text-ink-dark transition-colors cursor-pointer"
                            title="إنقاص الكمية"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            data-field="qty"
                            value={
                              isPackageMode
                                ? (item.packageQuantityInput ?? (item.quantityUnits > 0 ? String(Math.floor(item.quantityUnits / meta.packSize)) : ''))
                                : (item.quantityInput !== undefined ? item.quantityInput : (item.quantityUnits > 0 ? String(item.quantityUnits) : ''))
                            }
                            onChange={(e) => handleDirectStockChange(idx, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                handleQuantityStep(idx, 1);
                              } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                handleQuantityStep(idx, -1);
                              }
                            }}
                            placeholder="0"
                            className={`w-16 h-10 text-center font-mono font-bold tabular-nums bg-brand-soft dark:bg-brand-dark-soft border rounded-lg text-sm text-brand dark:text-brand-bright focus:outline-none ${
                              qtyInvalid
                                ? 'border-danger dark:border-danger-bright ring-2 ring-danger/30 dark:ring-danger-bright/40'
                                : 'border-brand/30 dark:border-brand-bright/30 focus:border-brand dark:focus:border-brand-bright'
                            }`}
                            title={isPackageMode ? `عدد ال${meta.packageUnitName}` : `عدد ال${meta.baseUnitName}`}
                          />
                          <button
                            type="button"
                            onClick={() => handleQuantityStep(idx, 1)}
                            className="w-9 h-10 rounded-lg bg-surface-2 dark:bg-surface-dark-2 hover:bg-line dark:hover:bg-surface-dark-3 flex items-center justify-center text-base font-bold text-ink dark:text-ink-dark transition-colors cursor-pointer"
                            title="زيادة الكمية"
                          >
                            +
                          </button>
                        </div>

                        {meta.packSize > 1 && (
                          <span className="text-micro font-mono text-ink-muted dark:text-ink-dark-muted">
                            {isPackageMode ? (
                              <span className="text-brand dark:text-brand-bright font-bold">
                                = {item.quantityUnits} {meta.baseUnitName}
                              </span>
                            ) : (
                              `سعة ال${meta.packageUnitName}: ${meta.packSize} ${meta.baseUnitName}`
                            )}
                          </span>
                        )}
                      </div>

                      {/* 3. Unit cost */}
                      <div className="flex flex-col items-center justify-start gap-1.5">
                        <span className="lg:hidden self-start text-xs font-bold text-ink-muted dark:text-ink-dark-muted">سعر الشراء</span>
                        <div className="w-full">
                          <MoneyInput
                            valuePiasters={isPackageMode ? currentPackageCost : item.unitCostPiasters}
                            onChangePiasters={(p) => {
                              const updated = [...lineItems];
                              if (isPackageMode) {
                                updated[idx].packageCostPiasters = p;
                                updated[idx].unitCostPiasters = Math.round(p / meta.packSize);
                              } else {
                                updated[idx].unitCostPiasters = p;
                                if (meta.packSize > 1) {
                                  updated[idx].packageCostPiasters = Math.round(p * meta.packSize);
                                }
                              }
                              setLineItems(updated);
                            }}
                            className="!h-10 !px-2 !py-0 !text-center !text-sm !font-bold !bg-surface-2 dark:!bg-surface-dark-2 !border-line dark:!border-line-dark !rounded-lg text-ink dark:text-ink-dark"
                          />
                        </div>

                        {meta.packSize > 1 && (
                          <span className="text-micro font-mono text-ink-muted dark:text-ink-dark-muted">
                            {isPackageMode
                              ? `(${meta.baseUnitName}: ${formatArabicCurrency(item.unitCostPiasters, true)})`
                              : `(${meta.packageUnitName}: ${formatArabicCurrency(currentPackageCost, true)})`}
                          </span>
                        )}

                        {hasPrevCost && costDiffPiasters > 0 && (
                          <div
                            className="flex items-center gap-1 text-micro text-danger dark:text-danger-bright font-extrabold bg-danger-soft dark:bg-danger-dark-soft px-1.5 py-0.5 rounded border border-danger/20 dark:border-danger-bright/30"
                            title={`ارتفاع في سعر الشراء عن آخر تكلفة (${formatMoney(item.currentCostPiasters)})`}
                          >
                            <TrendingUp className="w-3 h-3 shrink-0" />
                            <span>+{formatArabicCurrency(costDiffPiasters, true)} ({costDiffPercent}%)</span>
                          </div>
                        )}
                        {hasPrevCost && costDiffPiasters < 0 && (
                          <div
                            className="flex items-center gap-1 text-micro text-paid dark:text-paid-bright font-extrabold bg-paid-soft dark:bg-paid-dark-soft px-1.5 py-0.5 rounded border border-paid/20 dark:border-paid-dark-border"
                            title={`انخفاض في سعر الشراء عن آخر تكلفة (${formatMoney(item.currentCostPiasters)})`}
                          >
                            <TrendingDown className="w-3 h-3 shrink-0" />
                            <span>وفر -{formatArabicCurrency(Math.abs(costDiffPiasters), true)} ({costDiffPercent}%)</span>
                          </div>
                        )}
                      </div>

                      {/* 4. Line total */}
                      <div className="text-center">
                        <div className="font-mono font-extrabold tabular-nums whitespace-nowrap text-ink dark:text-ink-dark text-base">
                          {formatMoney(lineTotal)}
                        </div>
                        <span className="text-micro font-mono tabular-nums text-ink-muted dark:text-ink-dark-muted block mt-1 leading-snug">
                          {isPackageMode
                            ? `${Math.round(item.quantityUnits / meta.packSize)} ${meta.packageUnitName} × ${formatArabicCurrency(currentPackageCost, true)}`
                            : `${item.quantityUnits} ${meta.baseUnitName} × ${formatArabicCurrency(item.unitCostPiasters, true)}`}
                        </span>
                      </div>

                      {/* 5. Actions: details toggle follows the cost field in tab order */}
                      <div className="col-span-2 lg:col-span-1 flex items-center justify-end lg:justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleItemExpand(item.productId)}
                          aria-expanded={isOpen}
                          aria-controls={detailsId}
                          className={`h-9 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                            isOpen
                              ? 'text-brand dark:text-brand-bright bg-brand-soft dark:bg-brand-dark-soft'
                              : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark'
                          }`}
                          title="سعر البيع والتعبئة والصلاحية وباقي تفاصيل الصنف"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                          <span>تفاصيل</span>
                          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          className="h-9 w-9 flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft rounded-lg transition-colors cursor-pointer"
                          title="حذف هذا الصنف من الفاتورة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Details drawer: pricing, packaging, expiry */}
                    {isOpen && (
                      <div
                        id={detailsId}
                        className="bg-surface-2/60 dark:bg-surface-dark-2/60 border border-line dark:border-line-dark rounded-xl p-3 flex flex-col gap-3 text-xs"
                      >
                        {/* Pricing and packaging */}
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="flex flex-col gap-1 w-40">
                            <span className={DETAIL_LABEL_CLS}>
                              سعر البيع{isPackageMode ? ` (لل${meta.packageUnitName})` : ''}
                            </span>
                            <MoneyInput
                              valuePiasters={
                                isPackageMode
                                  ? (item.newSellingPricePiasters > 0 ? item.newSellingPricePiasters * meta.packSize : item.currentPricePiasters * meta.packSize)
                                  : item.newSellingPricePiasters
                              }
                              onChangePiasters={(p) => {
                                const updated = [...lineItems];
                                if (isPackageMode) {
                                  updated[idx].newSellingPricePiasters = Math.round(p / meta.packSize);
                                } else {
                                  updated[idx].newSellingPricePiasters = p;
                                }
                                setLineItems(updated);
                              }}
                              className={DETAIL_MONEY_CLS}
                            />
                            {meta.packSize > 1 && (
                              <span className="text-micro font-mono text-ink-muted dark:text-ink-dark-muted">
                                {isPackageMode
                                  ? `(بيع ال${meta.baseUnitName}: ${formatArabicCurrency(effectiveSellingPricePiasters, true)})`
                                  : `(بيع ال${meta.packageUnitName}: ${formatArabicCurrency(effectiveSellingPricePiasters * meta.packSize, true)})`}
                              </span>
                            )}
                            {hasSellPrice && profitPiasters < 0 ? (
                              <div className="flex items-center gap-1 text-micro text-danger dark:text-danger-bright font-extrabold bg-danger-soft dark:bg-danger-dark-soft px-1.5 py-0.5 rounded border border-danger/20 dark:border-danger-bright/30 self-start">
                                <AlertCircle className="w-3 h-3 shrink-0" />
                                <span>خسارة: {formatArabicCurrency(profitPiasters, true)}</span>
                              </div>
                            ) : hasSellPrice && profitPiasters === 0 ? (
                              <div className="text-micro text-warn dark:text-warn-bright font-extrabold bg-warn-soft dark:bg-warn-dark-soft px-1.5 py-0.5 rounded border border-warn-border dark:border-warn-bright/30 self-start">
                                بيع = تكلفة
                              </div>
                            ) : hasSellPrice ? (
                              <div
                                className="flex items-center gap-1 text-micro text-paid dark:text-paid-bright font-extrabold bg-paid-soft dark:bg-paid-dark-soft px-1.5 py-0.5 rounded border border-paid/20 dark:border-paid-dark-border self-start"
                                title={`هامش مجمل الربح: ${marginPercent}%`}
                              >
                                <span>الربح: +{formatArabicCurrency(profitPiasters, true)}</span>
                                <span className="text-micro opacity-80">({marginPercent}%)</span>
                              </div>
                            ) : (
                              <span className="text-micro font-bold text-warn dark:text-warn-bright">حدد سعر البيع</span>
                            )}
                            {weightedSuggestedPricePiasters !== null &&
                              Math.abs(weightedSuggestedPricePiasters - item.newSellingPricePiasters) > 50 && (
                                <button
                                  type="button"
                                  onClick={() => handleApplySuggestedPrice(idx, weightedSuggestedPricePiasters)}
                                  className="text-micro font-bold text-brand dark:text-brand-bright hover:text-brand-dark dark:hover:text-paid-bright flex items-center gap-1 bg-brand-soft dark:bg-brand-soft/20 hover:bg-brand/20 dark:hover:bg-brand-bright/20 px-1.5 py-0.5 rounded border border-brand/20 dark:border-brand-bright/30 transition-colors cursor-pointer self-start"
                                  title="تعديل سعر البيع لاعتماد متوسط التكلفة"
                                >
                                  <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                  <span>
                                    مقترح: {formatArabicCurrency(isPackageMode ? weightedSuggestedPricePiasters * meta.packSize : weightedSuggestedPricePiasters, true)}
                                  </span>
                                </button>
                              )}
                          </div>

                          {isEnabled('feature_pharmacy') ? (
                            <>
                              <div className="flex flex-col gap-1 w-32">
                                <span className={DETAIL_LABEL_CLS}>سعة ال{meta.packageUnitName} ({meta.baseUnitName})</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={item.packSizeInput ?? (meta.packSize > 1 ? String(meta.packSize) : '')}
                                  onChange={(e) => handlePackSizeChange(idx, e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  placeholder="20"
                                  className={DETAIL_INPUT_CLS}
                                />
                              </div>
                              <div className="flex flex-col gap-1 w-40">
                                <span className={DETAIL_LABEL_CLS}>سعر الجمهور (لل{meta.packageUnitName})</span>
                                <MoneyInput
                                  valuePiasters={
                                    item.publicPricePiasters ??
                                    ((item.newSellingPricePiasters || item.currentPricePiasters) * meta.packSize)
                                  }
                                  onChangePiasters={(p) => {
                                    const updated = [...lineItems];
                                    updated[idx].publicPricePiasters = p;
                                    const packSz = Math.max(1, meta.packSize);
                                    updated[idx].newSellingPricePiasters = Math.round(p / packSz);
                                    const disc = updated[idx].distributorDiscountPercent || 0;
                                    if (disc > 0 && p > 0) {
                                      const boxCost = Math.round(p * (1 - disc / 100));
                                      updated[idx].packageCostPiasters = boxCost;
                                      updated[idx].unitCostPiasters = Math.round(boxCost / packSz);
                                    }
                                    setLineItems(updated);
                                  }}
                                  className={DETAIL_MONEY_CLS}
                                />
                              </div>
                              <div className="flex flex-col gap-1 w-24">
                                <span className={DETAIL_LABEL_CLS}>خصم الموزع %</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={item.distributorDiscountInput ?? (item.distributorDiscountPercent !== undefined && item.distributorDiscountPercent > 0 ? String(item.distributorDiscountPercent) : '')}
                                  onChange={(e) => {
                                    const raw = normalizeArabicNumerals(e.target.value);
                                    const val = parseFloat(raw);
                                    const updated = [...lineItems];
                                    updated[idx].distributorDiscountInput = raw;
                                    const discountPct = isNaN(val) ? 0 : Math.min(100, Math.max(0, val));
                                    updated[idx].distributorDiscountPercent = discountPct;
                                    const pub = updated[idx].publicPricePiasters || ((updated[idx].newSellingPricePiasters || updated[idx].currentPricePiasters) * meta.packSize);
                                    if (pub > 0 && discountPct > 0) {
                                      const boxCost = Math.round(pub * (1 - discountPct / 100));
                                      updated[idx].packageCostPiasters = boxCost;
                                      updated[idx].unitCostPiasters = Math.round(boxCost / Math.max(1, meta.packSize));
                                    }
                                    setLineItems(updated);
                                  }}
                                  onFocus={(e) => e.target.select()}
                                  placeholder="0%"
                                  className={DETAIL_INPUT_CLS}
                                />
                              </div>
                              <div className="flex flex-col gap-1 w-28">
                                <span className={DETAIL_LABEL_CLS}>بونص مجاني ({meta.packageUnitName})</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={item.bonusQuantityInput ?? (item.bonusQuantityUnits !== undefined && item.bonusQuantityUnits > 0 ? String(item.bonusQuantityUnits) : '')}
                                  onChange={(e) => {
                                    const raw = normalizeArabicNumerals(e.target.value);
                                    const val = parseFloat(raw);
                                    const updated = [...lineItems];
                                    updated[idx].bonusQuantityInput = raw;
                                    updated[idx].bonusQuantityUnits = isNaN(val) ? 0 : Math.max(0, val);
                                    setLineItems(updated);
                                  }}
                                  onFocus={(e) => e.target.select()}
                                  placeholder="0"
                                  className={DETAIL_INPUT_CLS}
                                />
                              </div>
                            </>
                          ) : isEnabled('feature_multi_units') ? (
                            <div className="flex flex-col gap-1">
                              <span className={DETAIL_LABEL_CLS}>حاسبة ال{meta.packageUnitName} والتجزئة</span>
                              <div className="flex items-center gap-2 flex-wrap">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  aria-label={`عدد ال${meta.packageUnitName}`}
                                  value={item.cartonsInput ?? ''}
                                  onChange={(e) => handleCartonsChange(idx, e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  placeholder="0"
                                  className="w-14 h-9 text-center font-mono font-bold tabular-nums bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-md text-sm text-brand dark:text-brand-bright focus:border-brand dark:focus:border-brand-bright focus:outline-none"
                                />
                                <span className="text-micro text-ink-muted dark:text-ink-dark-muted">{meta.packageUnitName} ×</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  aria-label={`سعة ال${meta.packageUnitName}`}
                                  value={item.packSizeInput ?? ''}
                                  onChange={(e) => handlePackSizeChange(idx, e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  placeholder="0"
                                  className="w-14 h-9 text-center font-mono font-bold tabular-nums bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-md text-sm text-ink dark:text-ink-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none"
                                />
                                <span className="text-micro text-ink-muted dark:text-ink-dark-muted">{meta.baseUnitName} +</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  aria-label="فرط"
                                  value={item.looseInput ?? ''}
                                  onChange={(e) => handleLoosePiecesChange(idx, e.target.value)}
                                  onFocus={(e) => e.target.select()}
                                  placeholder="0"
                                  className="w-14 h-9 text-center font-mono font-bold tabular-nums bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-md text-sm text-ink dark:text-ink-dark focus:border-brand dark:focus:border-brand-bright focus:outline-none"
                                />
                                <span className="text-micro text-ink-muted dark:text-ink-dark-muted">فرط =</span>
                                <span className="px-2.5 py-1 bg-brand-soft dark:bg-brand-soft/20 border border-brand/20 dark:border-brand-bright/30 text-brand dark:text-brand-bright font-mono font-extrabold rounded-md text-xs">
                                  {incomingUnits} {meta.baseUnitName}
                                </span>
                              </div>
                            </div>
                          ) : isEnabled('feature_matrix_variants') && (item.variantColor || item.variantSize) ? (
                            <div className="flex flex-col gap-1">
                              <span className={DETAIL_LABEL_CLS}>مواصفات الموديل</span>
                              <div className="flex items-center gap-2 h-9">
                                {item.variantColor && (
                                  <span className="bg-surface dark:bg-surface-dark px-2 py-0.5 rounded text-xs border border-line dark:border-line-dark text-ink dark:text-ink-dark">
                                    اللون: <b>{item.variantColor}</b>
                                  </span>
                                )}
                                {item.variantSize && (
                                  <span className="bg-surface dark:bg-surface-dark px-2 py-0.5 rounded text-xs border border-line dark:border-line-dark text-ink dark:text-ink-dark">
                                    المقاس: <b>{item.variantSize}</b>
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {isEnabled('feature_pharmacy') && hasDistributorTerms && (
                          <div className="flex items-center gap-3 text-micro font-mono flex-wrap bg-surface dark:bg-surface-dark p-1.5 rounded border border-line/60 dark:border-line-dark/60">
                            <span className="text-brand dark:text-brand-bright font-bold">
                              سعر العلبة بعد الخصم: {formatArabicCurrency(currentPackageCost, true)}
                            </span>
                            <span className="text-line dark:text-line-dark">•</span>
                            <span className="text-ink dark:text-ink-dark">
                              تكلفة ال{meta.baseUnitName}: {formatArabicCurrency(item.unitCostPiasters, true)}
                            </span>
                            {(item.bonusQuantityUnits || 0) > 0 && (item.quantityUnits || 0) > 0 && (
                              <>
                                <span className="text-line dark:text-line-dark">•</span>
                                <span className="text-paid dark:text-paid-bright font-bold">
                                  صافي التكلفة بالبونص: {formatArabicCurrency(Math.round((lineAmounts.lineGrossPiasters * 1000) / (lineAmounts.quantityMilli + lineAmounts.bonusQuantityMilli)), true)} / {meta.baseUnitName}
                                </span>
                              </>
                            )}
                          </div>
                        )}

                        {/* Batch number & expiry */}
                        {isEnabled('feature_expiry_dates') && (
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1 w-36">
                              <span className={DETAIL_LABEL_CLS}>رقم الشحنة</span>
                              <input
                                type="text"
                                placeholder="رقم الشحنة"
                                value={item.batchNumber || ''}
                                onChange={(e) => {
                                  const updated = [...lineItems];
                                  updated[idx].batchNumber = e.target.value;
                                  setLineItems(updated);
                                }}
                                className="w-full h-9 px-2 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-md text-sm font-mono focus:border-brand dark:focus:border-brand-bright focus:outline-none"
                              />
                            </div>
                            <div className="flex flex-col gap-1 w-40">
                              <span className={DETAIL_LABEL_CLS}>تاريخ الانتهاء</span>
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
                                className="w-full"
                              />
                            </div>
                            <div className="flex flex-col gap-1 w-40">
                              <span className={DETAIL_LABEL_CLS}>تاريخ الإنتاج</span>
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
                                className="w-full"
                              />
                            </div>
                          </div>
                        )}

                        {/* Cost and batch profit */}
                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-micro text-ink-muted dark:text-ink-dark-muted border-t border-line/60 dark:border-line-dark/60 pt-2">
                          <span>
                            آخر تكلفة: <b className="font-mono text-ink dark:text-ink-dark">{formatMoney(item.currentCostPiasters)}</b>
                          </span>
                          <span title={costingMethod === 'LATEST' ? 'اعتماد سعر الشراء الأخير كتكلفة للمخزن' : `متوسط مرجح بين ${currentStockUnits.toFixed(0)} سابقة و ${incomingUnits.toFixed(0)} جديدة`}>
                            {costingMethod === 'LATEST' ? 'التكلفة المعتمدة' : 'متوسط التكلفة الجديد'}:{' '}
                            <b className="font-mono text-brand dark:text-brand-bright">{formatArabicCurrency(projectedCostPiasters, true)}</b>
                          </span>
                          {incomingUnits > 0 && (
                            <span>
                              مكسب الشحنة المتوقع:{' '}
                              <b
                                className={`font-mono ${
                                  totalBatchProfitPiasters > 0
                                    ? 'text-paid dark:text-paid-bright'
                                    : totalBatchProfitPiasters < 0
                                    ? 'text-danger dark:text-danger-bright'
                                    : 'text-ink dark:text-ink-dark'
                                }`}
                              >
                                {totalBatchProfitPiasters > 0 ? '+' : ''}
                                {formatArabicCurrency(totalBatchProfitPiasters, true)}
                              </b>
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Settlement: invoice summary + payment */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {/* Invoice summary: three figures */}
          <section className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
              <h2 className="t-card-title text-ink dark:text-ink-dark">ملخص الفاتورة</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark p-3 min-w-0">
                <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">الأصناف</span>
                <span className="block t-kpi font-mono whitespace-nowrap text-ink dark:text-ink-dark">{lineItems.length}</span>
                <span className="block text-micro text-ink-muted dark:text-ink-dark-muted">{totalItemsPieces} قطعة</span>
              </div>
              <div className="rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark p-3 min-w-0">
                <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">إجمالي الأصناف</span>
                <span className="block t-kpi font-mono whitespace-nowrap text-ink dark:text-ink-dark">{formatMoney(totalCostPiasters)}</span>
              </div>
              <div className="rounded-xl bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark p-3 min-w-0">
                <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1">خصم المورد</span>
                <span
                  className={`block text-xl font-extrabold font-mono tabular-nums whitespace-nowrap ${
                    discountPiasters > 0 ? 'text-paid dark:text-paid-bright' : 'text-ink-muted dark:text-ink-dark-muted'
                  }`}
                >
                  {discountPiasters > 0 ? `-${formatMoney(discountPiasters)}` : '—'}
                </span>
              </div>
            </div>
          </section>

          {/* Payment */}
          <section className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
              <h2 className="t-card-title text-ink dark:text-ink-dark">السداد للمورد</h2>
            </div>

            <div>
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block mb-1.5">المدفوع الآن</span>
              <MoneyInput
                valuePiasters={paidAmountPiasters}
                onChangePiasters={(val) => {
                  if (paymentMode === 'CREDIT' && val > 0) setPaymentMode('PAID');
                  setCustomPaidAmountPiasters(val);
                }}
                className="!h-11 !px-2 !py-0 !text-center !text-base font-mono font-bold !bg-surface-2 dark:!bg-surface-dark-2 !border-line dark:!border-line-dark !rounded-lg text-ink dark:text-ink-dark shadow-2xs focus:border-paid"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentMode('PAID');
                  setCustomPaidAmountPiasters(null);
                }}
                className={quickBtnCls(paymentMode === 'PAID' && paidAmountPiasters === netCostPiasters)}
              >
                <Banknote className="w-3.5 h-3.5 shrink-0" />
                <span>دفع كامل</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMode('CREDIT');
                  setCustomPaidAmountPiasters(0);
                }}
                className={quickBtnCls(paidAmountPiasters === 0)}
              >
                {advanceCreditPiasters > 0 ? <Sparkles className="w-3.5 h-3.5 shrink-0" /> : <CreditCard className="w-3.5 h-3.5 shrink-0" />}
                <span>{advanceCreditPiasters > 0 ? 'من رصيدنا المتاح' : 'آجل بالكامل'}</span>
              </button>
              {advanceCreditPiasters > 0 && advanceCreditPiasters < netCostPiasters && (
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMode('PAID');
                    setCustomPaidAmountPiasters(netCostPiasters - advanceCreditPiasters);
                  }}
                  className={quickBtnCls(paymentMode === 'PAID' && paidAmountPiasters === netCostPiasters - advanceCreditPiasters)}
                >
                  <span>سداد الفرق ({formatMoney(netCostPiasters - advanceCreditPiasters)})</span>
                </button>
              )}
              {supplierDebtPiasters > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMode('PAID');
                    setCustomPaidAmountPiasters(supplierDebtPiasters + netCostPiasters);
                  }}
                  className={quickBtnCls(paymentMode === 'PAID' && paidAmountPiasters === supplierDebtPiasters + netCostPiasters)}
                >
                  <span>تصفية الدين ({formatMoney(supplierDebtPiasters + netCostPiasters)})</span>
                </button>
              )}
            </div>

            {/* Remaining amount */}
            <div className={`p-3 rounded-xl border flex flex-col gap-1 ${SETTLEMENT_TONE_CLS[settlementTone]}`}>
              <div className="flex justify-between items-baseline gap-3 flex-wrap">
                <span className="font-bold text-xs">{settlementLabel}</span>
                <span className="t-kpi-lg font-mono whitespace-nowrap">
                  {excessPaidPiasters > 0 ? '+' : ''}
                  {formatMoney(settlementAmount)}
                </span>
              </div>
              <span className="text-xs leading-relaxed">{settlementNote}</span>
            </div>
            {supplierMissing && (
              <p className="text-xs font-bold text-warn dark:text-warn-bright m-0 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>اختر المورد من أعلى الصفحة عشان نقدر نسجل المتبقي أو الزيادة على حسابه.</span>
              </p>
            )}

            {/* Cash source: only when cash actually leaves */}
            {paymentMode === 'PAID' && paidAmountPiasters > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted block">
                  مصدر النقدية المسددة للمورد
                </label>
                <CustomSelect
                  value={paymentSource}
                  onChange={(val) => setPaymentSource(val as 'cash_drawer' | 'external_cash')}
                  size="lg"
                  options={[
                    { value: 'cash_drawer', label: 'من درج كاشير المحل (يخصم من نقدية الدرج)' },
                    { value: 'external_cash', label: 'كاش خارجي من صاحب المحل (لا يخصم من الدرج)' },
                  ]}
                />

                {paymentSource === 'cash_drawer' && (
                  <>
                    <div className="px-3 py-2 rounded-lg border text-xs bg-surface-2 dark:bg-surface-dark-2 border-line dark:border-line-dark flex items-center justify-between gap-3">
                      <span className="text-ink-muted dark:text-ink-dark-muted font-bold">كاش الدرج المتوفر حالياً:</span>
                      <span className={`font-mono font-black tabular-nums whitespace-nowrap text-sm ${(liveDrawerCashPiasters ?? 0) > 0 ? 'text-paid dark:text-paid-bright' : 'text-danger dark:text-danger-bright'}`}>
                        {liveDrawerCashPiasters !== null ? formatArabicCurrency(liveDrawerCashPiasters) : '0.00 ج.م'}
                      </span>
                    </div>

                    {cashDrawerBlocked && (
                      <div className="p-3 rounded-lg border text-xs bg-danger-soft dark:bg-danger-dark-soft border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright space-y-1">
                        <div className="flex items-center gap-1.5 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {(liveDrawerCashPiasters ?? 0) <= 0
                              ? 'درج الكاشير فارغ (0.00 ج.م)!'
                              : 'رصيد نقدية الدرج غير كافٍ!'}
                          </span>
                        </div>
                        <p className="leading-relaxed m-0">
                          {(liveDrawerCashPiasters ?? 0) <= 0
                            ? 'لا يمكن سحب نقدية من درج فارغ لسداد الفاتورة. إذا كان السداد من مالك المحل، يرجى اختيار «كاش خارجي من صاحب المحل» أو تسجيل الفاتورة آجلة.'
                            : `المبلغ المطلوب (${formatArabicCurrency(paidAmountPiasters)}) أكبر من نقدية الدرج المتاحة (${formatArabicCurrency(liveDrawerCashPiasters ?? 0)}). يرجى اختيار «كاش خارجي من صاحب المحل» أو خفض المبلغ المسدد.`}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Supplier account before / after */}
            {selectedSupplier && (
              <div className="px-3 py-2.5 rounded-xl border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="font-bold text-ink-muted dark:text-ink-dark-muted">حساب المورد</span>
                <span className="font-mono tabular-nums flex items-center gap-2 flex-wrap">
                  <span className="text-ink-muted dark:text-ink-dark-muted">{formatBalanceLabel(currentSupplierBalance)}</span>
                  <span className="text-ink-muted dark:text-ink-dark-muted">←</span>
                  <b
                    className={
                      projectedBalance > 0
                        ? 'text-warn dark:text-warn-bright'
                        : projectedBalance < 0
                        ? 'text-paid dark:text-paid-bright'
                        : 'text-ink dark:text-ink-dark'
                    }
                  >
                    {formatBalanceLabel(projectedBalance)}
                  </b>
                </span>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Sticky action bar: net payable + primary actions */}
      <div className="shrink-0 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl px-4 py-3 shadow-card flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-ink-muted dark:text-ink-dark-muted">المطلوب دفعه للشركة</span>
            <span className="t-kpi font-mono whitespace-nowrap text-paid-dark dark:text-paid-bright">
              {formatMoney(netCostPiasters)}
            </span>
          </div>
          {lineItems.length > 0 && (
            <span
              className={`px-2.5 py-1 rounded-full border text-xs font-bold ${
                SETTLEMENT_TONE_CLS[remainingAmountPiasters > 0 ? 'warn' : 'paid']
              }`}
            >
              {excessPaidPiasters > 0
                ? 'سداد بزيادة'
                : remainingAmountPiasters === 0
                ? 'مسددة بالكامل'
                : paidAmountPiasters === 0
                ? 'آجل بالكامل'
                : 'سداد جزئي'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isSaving || lineItems.length === 0 || cashDrawerBlocked}
            className="h-11 px-6 bg-paid hover:bg-paid-hover dark:bg-paid-bright dark:text-surface-dark dark:hover:bg-paid-bright-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
          >
            <Receipt className="w-4 h-4" />
            <span>حفظ الفاتورة وتزويد رصيد البضاعة</span>
          </button>
          <button
            type="button"
            onClick={onRequestCancel}
            className="h-11 px-5 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark rounded-xl text-sm font-semibold transition-colors cursor-pointer"
          >
            إلغاء وتراجع
          </button>
        </div>
      </div>
    </div>
  );
};
