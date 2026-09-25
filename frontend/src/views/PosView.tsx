import { useState, useEffect, useRef, useCallback } from 'react';
import type { FormEvent } from 'react';
import { 
  Barcode, 
  Trash2, 
  Plus, 
  Minus, 
  CheckCircle, 
  AlertCircle,
  RotateCcw,
  Search,
  Sparkles,
  ShoppingBag,
  CreditCard,
  Printer,
  UserCheck,
  Eye,
  Scale,
  Loader2,
  Settings,
  X
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Product, SaleItem, Sale, Customer, QuickItem, SalePayment, ProductUnit } from '../types/models';
import { formatArabicCurrency, calculateLineTotal, calculateTaxPiasters, normalizeArabicNumerals } from '../utils/money';
import { MoneyInput } from '../components/MoneyInput';
import { ReceiptModal } from '../components/ReceiptModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { UndoToast } from '../components/UndoToast';
import { WeightInputModal } from '../components/WeightInputModal';
import { QuickItemsManagerModal } from '../components/QuickItemsManagerModal';
import { PaymentModal } from '../components/PaymentModal';
import { BarcodeScannerSettingsModal } from '../components/BarcodeScannerSettingsModal';
import { QuickAddProductModal } from '../components/QuickAddProductModal';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal';
import { 
  physicalCodeToChar, 
  convertArabicLayoutToBarcode, 
  sanitizeScannedBarcode, 
  loadScannerSettings,
  type BarcodeScannerSettings, 
  DEFAULT_SCANNER_SETTINGS 
} from '../utils/barcodeReader';
import { useFeatures } from '../context/useFeatures';

interface CartItem extends SaleItem {
  taxRatePercent?: number;
  stockQuantityMilli?: number;
  productUnits?: ProductUnit[];
  isDivisible?: boolean;
}

export const PosView = () => {
  const { isEnabled } = useFeatures();
  const showFastItems = isEnabled('feature_fast_buttons');
  const showCredit = isEnabled('feature_credit_debts');
  const showTaxes = isEnabled('feature_taxes');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [discountPiasters, setDiscountPiasters] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [quickItems, setQuickItems] = useState<QuickItem[]>([]);
  const [isQuickItemsManagerOpen, setIsQuickItemsManagerOpen] = useState(false);
  const [openPriceItem, setOpenPriceItem] = useState<QuickItem | null>(null);
  const [openPriceInputEgp, setOpenPriceInputEgp] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState<number | null>(null);
  const [nextExpectedInvoiceNumber, setNextExpectedInvoiceNumber] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash');
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [unregisteredBarcode, setUnregisteredBarcode] = useState('');
  const [scannerSettings, setScannerSettings] = useState<BarcodeScannerSettings>(DEFAULT_SCANNER_SETTINGS);
  const [draftPrompt, setDraftPrompt] = useState<{
    items: CartItem[];
    discountPiasters: number;
    customerId?: string | null;
    savedAt: number;
  } | null>(() => {
    try {
      const stored = localStorage.getItem('rafiq_pos_cart_draft');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [undoItem, setUndoItem] = useState<{ item: CartItem; index: number } | null>(null);
  const [editingPriceIndex, setEditingPriceIndex] = useState<number | null>(null);
  const [weightModalProduct, setWeightModalProduct] = useState<{
    id?: string;
    name: string;
    pricePiasters: number;
    barcode?: string | null;
    unit?: string;
    editingCartIndex?: number;
  } | null>(null);
  const [initialWeightMilli, setInitialWeightMilli] = useState<number>(1000);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Live Instant Search State (Task 22-4)
  const [liveSearchResults, setLiveSearchResults] = useState<Product[]>([]);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const [selectedDropdownIndex, setSelectedDropdownIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = useCallback((text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
    }
    setStatusMessage({ text, type });
    statusTimerRef.current = setTimeout(() => {
      setStatusMessage(null);
      statusTimerRef.current = null;
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  const requestClearCart = useCallback(() => {
    if (cart.length === 0) return;
    setIsClearConfirmOpen(true);
  }, [cart.length]);

  const confirmClearCart = () => {
    setIsClearConfirmOpen(false);
    setCart([]);
    setDiscountPiasters(0);
    try {
      localStorage.removeItem('rafiq_pos_cart_draft');
    } catch {
      // ignore
    }
    showStatus('تم إلغاء الفاتورة ومسح السلة بالكامل', 'success');
    barcodeInputRef.current?.focus();
  };

  const addProductToCart = useCallback((prod: Product, customWeightMilli?: number, specificUnit?: ProductUnit) => {
    let unitToUse = specificUnit;
    if (!unitToUse && prod.units && prod.units.length > 0) {
      unitToUse = prod.units.find(u => u.isBaseUnit) || prod.units[0];
    }

    if (prod.unit === 'kg' && customWeightMilli === undefined && (!unitToUse || unitToUse.conversionFactor === 1)) {
      setInitialWeightMilli(1000);
      setWeightModalProduct({
        id: prod.id,
        name: prod.name,
        pricePiasters: prod.pricePiasters,
        barcode: prod.barcode,
        unit: prod.unit,
      });
      return;
    }

    const qtyMilli = customWeightMilli !== undefined ? customWeightMilli : 1000;
    const factor = unitToUse && unitToUse.conversionFactor > 0 ? unitToUse.conversionFactor : 1;
    const unitPrice = unitToUse 
      ? (unitToUse.sellPricePiasters > 0 ? unitToUse.sellPricePiasters : prod.pricePiasters * factor)
      : prod.pricePiasters;
    const unitCost = unitToUse 
      ? (unitToUse.costPricePiasters > 0 ? unitToUse.costPricePiasters : prod.costPiasters * factor)
      : prod.costPiasters;
    const unitName = unitToUse ? unitToUse.unitName : prod.unit;
    const unitId = unitToUse ? unitToUse.id : undefined;
    const isDivisible = unitToUse ? unitToUse.isDivisible : (prod.unit === 'kg');

    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => 
        item.productId === prod.id && (item.unitId || '') === (unitId || '')
      );
      if (existingIndex >= 0) {
        const updated = [...prev];
        const item = updated[existingIndex];
        const newQty = customWeightMilli !== undefined ? customWeightMilli : (item.quantityMilli + 1000);
        item.quantityMilli = newQty;
        item.unit = unitName;
        item.unitName = unitName;
        item.unitId = unitId;
        item.conversionFactor = factor;
        item.isDivisible = isDivisible;
        item.totalPiasters = calculateLineTotal(item.unitPricePiasters, newQty, item.discountPiasters);
        item.taxPiasters = calculateTaxPiasters(item.totalPiasters, item.taxRatePercent || 0, true);
        return updated;
      }

      const totalPiasters = calculateLineTotal(unitPrice, qtyMilli, 0);
      const taxRate = prod.taxRatePercent || 0;
      const newItem: CartItem = {
        productId: prod.id,
        productName: prod.name,
        barcode: (unitToUse && unitToUse.barcode) || prod.barcode,
        quantityMilli: qtyMilli,
        unitPricePiasters: unitPrice,
        unitCostPiasters: unitCost,
        discountPiasters: 0,
        totalPiasters: totalPiasters,
        taxPiasters: calculateTaxPiasters(totalPiasters, taxRate, true),
        taxRatePercent: taxRate,
        stockQuantityMilli: prod.stockQuantityMilli,
        unit: unitName,
        unitName: unitName,
        unitId: unitId,
        conversionFactor: factor,
        productUnits: prod.units,
        isDivisible: isDivisible
      };
      return [newItem, ...prev];
    });
  }, []);

  const changeCartItemUnit = useCallback((index: number, newUnitId: string) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item || !item.productUnits) return prev;
      const targetUnit = item.productUnits.find(u => u.id === newUnitId);
      if (!targetUnit) return prev;

      const baseUnit = item.productUnits.find(u => u.isBaseUnit);
      const currentFactor = item.conversionFactor && item.conversionFactor > 0 ? item.conversionFactor : 1;
      const basePrice = baseUnit && baseUnit.sellPricePiasters > 0 
        ? baseUnit.sellPricePiasters 
        : Math.round(item.unitPricePiasters / currentFactor);
      const baseCost = baseUnit && baseUnit.costPricePiasters > 0 
        ? baseUnit.costPricePiasters 
        : Math.round(item.unitCostPiasters / currentFactor);

      const newFactor = targetUnit.conversionFactor > 0 ? targetUnit.conversionFactor : 1;
      const newPrice = targetUnit.sellPricePiasters > 0 ? targetUnit.sellPricePiasters : (basePrice * newFactor);
      const newCost = targetUnit.costPricePiasters > 0 ? targetUnit.costPricePiasters : (baseCost * newFactor);

      item.unitId = targetUnit.id;
      item.unitName = targetUnit.unitName;
      item.conversionFactor = newFactor;
      item.unit = targetUnit.unitName;
      item.unitPricePiasters = newPrice;
      item.unitCostPiasters = newCost;
      item.isDivisible = targetUnit.isDivisible;

      // Task 161-14: Round quantity to whole numbers if unit is not divisible
      if (!targetUnit.isDivisible && (item.quantityMilli % 1000 !== 0)) {
        item.quantityMilli = Math.max(1000, Math.round(item.quantityMilli / 1000) * 1000);
      }

      item.totalPiasters = calculateLineTotal(item.unitPricePiasters, item.quantityMilli, item.discountPiasters);
      item.taxPiasters = calculateTaxPiasters(item.totalPiasters, item.taxRatePercent || 0, true);
      return updated;
    });
  }, []);

  const updateItemPrice = useCallback((index: number, newPricePiasters: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      item.unitPricePiasters = Math.max(0, newPricePiasters);
      item.totalPiasters = calculateLineTotal(item.unitPricePiasters, item.quantityMilli, item.discountPiasters);
      item.taxPiasters = calculateTaxPiasters(item.totalPiasters, item.taxRatePercent || 0, true);
      return updated;
    });
  }, []);

  // Integer Piaster Math (Rule 1 & Feature #6)
  const subtotalPiasters = cart.reduce((sum, item) => sum + item.totalPiasters, 0);
  const netTotalPiasters = Math.max(0, subtotalPiasters - discountPiasters);
  const totalItemCount = cart.reduce((count, item) => count + (item.quantityMilli / 1000), 0);
  const totalTaxPiasters = cart.reduce((sum, item) => sum + item.taxPiasters, 0);

  // Load customers for selection
  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const data = await invoke<Customer[]>('customers:getAll', { limit: 100 });
        setCustomers(data || []);
      } catch {
        // Offline fallback
      }
    };
    void loadCustomers();
  }, []);

  // Load Quick Items (Feature #20 / Task 20-5)
  const loadQuickItems = useCallback(async () => {
    try {
      const data = await invoke<QuickItem[]>('quickItems:getAll');
      if (Array.isArray(data)) {
        setQuickItems(data);
        const cats = Array.from(new Set(data.map((i) => i.categoryName || 'عام')));
        if (cats.length > 0) {
          setActiveCategory((prev) => (!prev ? '__ALL__' : prev));
        } else {
          setActiveCategory('__ALL__');
        }
      }
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await invoke<QuickItem[]>('quickItems:getAll');
        if (active && Array.isArray(data)) {
          setQuickItems(data);
          const cats = Array.from(new Set(data.map((i) => i.categoryName || 'عام')));
          if (cats.length > 0) {
            setActiveCategory((prev) => (!prev ? '__ALL__' : prev));
          } else {
            setActiveCategory('__ALL__');
          }
        }
      } catch {
        // Offline fallback
      }
    })();
    return () => { active = false; };
  }, []);

  // Feature #131: Load scanner settings on mount
  useEffect(() => {
    let active = true;
    void (async () => {
      const s = await loadScannerSettings();
      if (active) setScannerSettings(s);
      try {
        const appSettings = await invoke<Record<string, string>>('settings:getAll');
        if (appSettings && appSettings.printer_auto_print !== undefined) {
          localStorage.setItem('rafiq_pos_printer_auto_print', appSettings.printer_auto_print);
        }
        const cnt = await invoke<{ nextInvoiceNumber: number }>('counters:getNextExpectedInvoiceNumber');
        if (active && cnt && cnt.nextInvoiceNumber) {
          setNextExpectedInvoiceNumber(cnt.nextInvoiceNumber);
        }
      } catch {
        // non-blocking
      }
    })();
    return () => { active = false; };
  }, []);

  // Feature #132: Auto-save draft on cart change
  useEffect(() => {
    try {
      if (cart.length > 0) {
        const draft = {
          items: cart,
          discountPiasters,
          customerId: selectedCustomerId || null,
          savedAt: Date.now(),
        };
        localStorage.setItem('rafiq_pos_cart_draft', JSON.stringify(draft));
      } else {
        localStorage.removeItem('rafiq_pos_cart_draft');
      }
    } catch {
      // ignore
    }
  }, [cart, discountPiasters, selectedCustomerId]);

  const handleOpenCheckout = useCallback((forcedMethod?: 'cash' | 'credit') => {
    if (cart.length === 0) {
      showStatus('سلة البيع فارغة! يرجى إضافة أصناف أولاً.', 'error');
      return;
    }
    if (forcedMethod) setPaymentMethod(forcedMethod);
    setIsPaymentModalOpen(true);
  }, [cart.length, showStatus]);

  const handleConfirmPayment = useCallback(async (paymentData: {
    paymentMethod: 'cash' | 'credit' | 'card' | 'multi';
    paidPiasters: number;
    payments: SalePayment[];
    changeDuePiasters: number;
    customerId?: string | null;
  }) => {
    setIsPaymentModalOpen(false);
    setLoading(true);
    try {
      const salePayload: Partial<Sale> = {
        subtotalPiasters,
        discountPiasters,
        taxPiasters: totalTaxPiasters,
        totalPiasters: netTotalPiasters,
        paidPiasters: paymentData.paidPiasters,
        paymentMethod: paymentData.paymentMethod,
        customerId: paymentData.customerId || selectedCustomerId || undefined,
        status: 'completed',
        items: cart,
        payments: paymentData.payments,
      };

      const completedSale = await invoke<Sale>('sales:create', salePayload);
      setLastInvoiceNumber(completedSale.invoiceNumber || null);
      if (completedSale.invoiceNumber) {
        setNextExpectedInvoiceNumber(completedSale.invoiceNumber + 1);
      }
      setLastCompletedSale(completedSale);
      setIsReceiptOpen(true);

      // Auto-print receipt if configured (Story 47 / Feature #31)
      try {
        const autoPrint = localStorage.getItem('rafiq_pos_printer_auto_print');
        if (autoPrint === '1' && window.chrome?.webview) {
          void invoke('printer:printReceipt', { sale: completedSale }).catch((printErr) => {
            console.warn('Auto print error:', printErr);
          });
        }
      } catch {
        // Non-blocking
      }

      if (completedSale.negativeStockWarnings && completedSale.negativeStockWarnings.length > 0) {
        showStatus(`تم حفظ الفاتورة #${completedSale.invoiceNumber || ''} بنجاح! [${completedSale.negativeStockWarnings[0]}]`, 'warning');
      } else {
        showStatus(`تم حفظ الفاتورة #${completedSale.invoiceNumber || ''} بنجاح!`, 'success');
      }
      setCart([]);
      setDiscountPiasters(0);
      setSelectedCustomerId('');
      setPaymentMethod('cash');
      try {
        localStorage.removeItem('rafiq_pos_cart_draft');
      } catch {
        // ignore
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus(`فشل حفظ الفاتورة: ${msg}`, 'error');
    } finally {
      setLoading(false);
      barcodeInputRef.current?.focus();
    }
  }, [
    subtotalPiasters, 
    discountPiasters, 
    totalTaxPiasters, 
    netTotalPiasters, 
    cart, 
    selectedCustomerId, 
    showStatus
  ]);

  // Direct quantity edit (Task 23-2)
  const setDirectQuantity = useCallback((index: number, newQtyPieces: number) => {
    if (newQtyPieces <= 0) {
      setCart((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setCart((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        const item = updated[index];
        item.quantityMilli = newQtyPieces * 1000;
        item.totalPiasters = calculateLineTotal(item.unitPricePiasters, item.quantityMilli, item.discountPiasters);
        item.taxPiasters = calculateTaxPiasters(item.totalPiasters, item.taxRatePercent || 0, true);
      }
      return updated;
    });
  }, []);

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Debounced Live Search for POS Barcode & Name Box (Task 22-4 & 22-2)
  useEffect(() => {
    const trimmed = barcodeQuery.trim();
    if (!trimmed) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const results = await invoke<Product[]>('products:search', { query: trimmed, limit: 12 });
        setLiveSearchResults(results || []);
        setIsSearchDropdownOpen((results && results.length > 0) || false);
        setSelectedDropdownIndex(0);
      } catch {
        // Search error fallback
      } finally {
        setIsSearching(false);
      }
    }, 90);

    return () => clearTimeout(timer);
  }, [barcodeQuery]);

  // Click outside to close search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleQuickProductCreated = useCallback((newProd: Product) => {
    addProductToCart(newProd);
    setBarcodeQuery('');
    setIsSearchDropdownOpen(false);
    showStatus(`تم تسجيل الصنف وإضافته للسلة: ${newProd.name}`, 'success');
    barcodeInputRef.current?.focus();
  }, [addProductToCart, showStatus]);

  const handleFastBarcodeScan = useCallback(async (scannedBarcode: string) => {
    if (!scannedBarcode) return;
    try {
      setLoading(true);
      const results = await invoke<Product[]>('products:search', { query: scannedBarcode, limit: 5 });
      if (results && results.length > 0) {
        let matchedUnit: ProductUnit | undefined;
        const exactMatch = results.find((p) => {
          if (p.units && p.units.length > 0) {
            const u = p.units.find(unit => unit.barcode === scannedBarcode);
            if (u) {
              matchedUnit = u;
              return true;
            }
          }
          return p.barcode === scannedBarcode || (p.barcodes && p.barcodes.includes(scannedBarcode));
        }) || results[0];

        if (!matchedUnit && exactMatch.units && exactMatch.units.length > 0) {
          matchedUnit = exactMatch.units.find(u => u.barcode === scannedBarcode);
        }

        addProductToCart(exactMatch, undefined, matchedUnit);
        setBarcodeQuery('');
        setIsSearchDropdownOpen(false);
        const unitSuffix = matchedUnit ? ` [${matchedUnit.unitName}]` : '';
        showStatus(`تم مسح الباركود وإضافة: ${exactMatch.name}${unitSuffix}`, 'success');
      } else {
        // Feature #108 / Task 108-1: Prompt quick add modal for unregistered barcode
        setUnregisteredBarcode(scannedBarcode);
        setIsQuickAddModalOpen(true);
        showStatus(`الباركود الممسوح غير مسجل: "${scannedBarcode}" - يمكنك إضافته سريعاً الآن`, 'warning');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus(`خطأ أثناء مسح الباركود: ${msg}`, 'error');
    } finally {
      setLoading(false);
      barcodeInputRef.current?.focus();
    }
  }, [addProductToCart, showStatus]);



  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (liveSearchResults.length > 0) {
        e.preventDefault();
        setIsSearchDropdownOpen(true);
        setSelectedDropdownIndex((prev) => (prev + 1) % liveSearchResults.length);
      }
    } else if (e.key === 'ArrowUp') {
      if (liveSearchResults.length > 0) {
        e.preventDefault();
        setIsSearchDropdownOpen(true);
        setSelectedDropdownIndex((prev) => (prev - 1 + liveSearchResults.length) % liveSearchResults.length);
      }
    } else if (e.key === 'Escape') {
      setIsSearchDropdownOpen(false);
    }
  };

  const handleBarcodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const query = convertArabicLayoutToBarcode(barcodeQuery.trim());
    if (!query) return;

    if (isSearchDropdownOpen && liveSearchResults.length > 0 && liveSearchResults[selectedDropdownIndex]) {
      const selected = liveSearchResults[selectedDropdownIndex];
      addProductToCart(selected);
      setBarcodeQuery('');
      setIsSearchDropdownOpen(false);
      showStatus(`تمت إضافة: ${selected.name}`, 'success');
      barcodeInputRef.current?.focus();
      return;
    }

    try {
      setLoading(true);
      const results = await invoke<Product[]>('products:search', { query, limit: 10 });
      if (results && results.length > 0) {
        let matchedUnit: ProductUnit | undefined;
        const targetProd = results.find((p) => {
          if (p.units && p.units.length > 0) {
            const u = p.units.find(unit => unit.barcode === query);
            if (u) {
              matchedUnit = u;
              return true;
            }
          }
          return p.barcode === query || (p.barcodes && p.barcodes.includes(query));
        }) || results[0];

        if (!matchedUnit && targetProd.units && targetProd.units.length > 0) {
          matchedUnit = targetProd.units.find(u => u.barcode === query);
        }

        addProductToCart(targetProd, undefined, matchedUnit);
        setBarcodeQuery('');
        setIsSearchDropdownOpen(false);
        const unitSuffix = matchedUnit ? ` [${matchedUnit.unitName}]` : '';
        showStatus(`تمت إضافة: ${targetProd.name}${unitSuffix}`, 'success');
      } else {
        setUnregisteredBarcode(query);
        setIsQuickAddModalOpen(true);
        showStatus(`المنتج غير مسجل: "${query}" - يمكنك إضافته سريعاً الآن`, 'warning');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus(`خطأ في البحث: ${msg}`, 'error');
    } finally {
      setLoading(false);
      barcodeInputRef.current?.focus();
    }
  };

  const handleConfirmWeight = (weightMilli: number) => {
    if (!weightModalProduct) return;

    if (weightModalProduct.editingCartIndex !== undefined) {
      const idx = weightModalProduct.editingCartIndex;
      setCart((prev) => {
        if (!prev[idx]) return prev;
        const updated = [...prev];
        const item = updated[idx];
        item.quantityMilli = weightMilli;
        item.totalPiasters = calculateLineTotal(item.unitPricePiasters, weightMilli, item.discountPiasters);
        item.taxPiasters = calculateTaxPiasters(item.totalPiasters, item.taxRatePercent || 0, true);
        return updated;
      });
      showStatus(`تم تعديل وزن ${weightModalProduct.name} إلى ${(weightMilli / 1000).toFixed(3)} كجم`, 'success');
    } else {
      const dummyId = weightModalProduct.id || (weightModalProduct.barcode ? `prod_${weightModalProduct.barcode}` : `prod_${weightModalProduct.name.replace(/\s+/g, '_')}`);
      const productToAdd: Product = {
        id: dummyId,
        name: weightModalProduct.name,
        barcode: weightModalProduct.barcode || null,
        pricePiasters: weightModalProduct.pricePiasters,
        costPiasters: Math.round(weightModalProduct.pricePiasters * 0.75),
        stockQuantityMilli: 100000,
        unit: 'kg',
        taxRatePercent: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      addProductToCart(productToAdd, weightMilli);
      showStatus(`تمت إضافة ${weightModalProduct.name} (${(weightMilli / 1000).toFixed(3)} كجم)`, 'success');
    }

    setWeightModalProduct(null);
    barcodeInputRef.current?.focus();
  };

  const openWeightEditorForCartItem = useCallback((index: number) => {
    const item = cart[index];
    if (!item) return;
    setInitialWeightMilli(item.quantityMilli);
    setWeightModalProduct({
      id: item.productId,
      name: item.productName,
      pricePiasters: item.unitPricePiasters,
      barcode: item.barcode,
      unit: item.unit || 'kg',
      editingCartIndex: index,
    });
  }, [cart]);

  // Add from fast-item grid (Feature #20 / Task 20-5)
  const handleFastItemClick = (fastItem: QuickItem) => {
    if (fastItem.isOpenPrice) {
      setOpenPriceItem(fastItem);
      setOpenPriceInputEgp('');
      return;
    }

    if (fastItem.unit === 'kg') {
      setInitialWeightMilli(1000);
      setWeightModalProduct({
        id: fastItem.productId || `quick_${fastItem.id}`,
        name: fastItem.name,
        pricePiasters: fastItem.pricePiasters,
        barcode: null,
        unit: 'kg',
      });
      return;
    }

    const dummyProduct: Product = {
      id: fastItem.productId || `quick_${fastItem.id}`,
      name: fastItem.name,
      barcode: null,
      pricePiasters: fastItem.pricePiasters,
      costPiasters: Math.round(fastItem.pricePiasters * 0.75),
      stockQuantityMilli: 100000,
      unit: fastItem.unit || 'piece',
      taxRatePercent: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    addProductToCart(dummyProduct);
    showStatus(`تمت إضافة: ${fastItem.name}`, 'success');
    barcodeInputRef.current?.focus();
  };

  const handleConfirmOpenPrice = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!openPriceItem) return;

    const parsedPrice = parseFloat(openPriceInputEgp);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      showStatus('يرجى إدخال سعر صحيح أكبر من الصفر', 'error');
      return;
    }

    const pricePiasters = Math.round(parsedPrice * 100);

    if (openPriceItem.unit === 'kg') {
      const itemToWeight = { ...openPriceItem, pricePiasters };
      setOpenPriceItem(null);
      setOpenPriceInputEgp('');
      setInitialWeightMilli(1000);
      setWeightModalProduct({
        id: itemToWeight.productId || `quick_${itemToWeight.id}`,
        name: itemToWeight.name,
        pricePiasters: pricePiasters,
        barcode: null,
        unit: 'kg',
      });
      return;
    }

    const dummyProduct: Product = {
      id: openPriceItem.productId || `quick_${openPriceItem.id}`,
      name: openPriceItem.name,
      barcode: null,
      pricePiasters: pricePiasters,
      costPiasters: Math.round(pricePiasters * 0.75),
      stockQuantityMilli: 100000,
      unit: openPriceItem.unit || 'piece',
      taxRatePercent: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    addProductToCart(dummyProduct);
    showStatus(`تمت إضافة: ${openPriceItem.name} (${parsedPrice.toFixed(2)} ج.م)`, 'success');
    setOpenPriceItem(null);
    setOpenPriceInputEgp('');
    barcodeInputRef.current?.focus();
  };

  const updateQuantity = useCallback((index: number, deltaPieces: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      const currentPieces = item.quantityMilli / 1000;
      const newPieces = Math.max(1, currentPieces + deltaPieces);
      item.quantityMilli = newPieces * 1000;
      item.totalPiasters = calculateLineTotal(item.unitPricePiasters, item.quantityMilli, item.discountPiasters);
      item.taxPiasters = calculateTaxPiasters(item.totalPiasters, item.taxRatePercent || 0, true);
      return updated;
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setCart((prev) => {
      const itemToRemove = prev[index];
      if (itemToRemove) {
        setUndoItem({ item: itemToRemove, index });
      }
      return prev.filter((_, i) => i !== index);
    });
    barcodeInputRef.current?.focus();
  }, []);

  const handleDismissUndo = useCallback(() => {
    setUndoItem(null);
  }, []);

  const handleUndoRemove = useCallback(() => {
    if (!undoItem) return;
    setCart((prev) => {
      const updated = [...prev];
      const targetIndex = Math.min(undoItem.index, updated.length);
      updated.splice(targetIndex, 0, undoItem.item);
      return updated;
    });
    showStatus(`تم استرجاع الصنف: ${undoItem.item.productName}`, 'success');
    setUndoItem(null);
  }, [undoItem, showStatus]);

  // Story 52 — Feature #32: Quick Direct Cash Pay & Finish Sale (F12) without mouse
  const handleFastCashCheckout = useCallback(async () => {
    if (cart.length === 0) {
      showStatus('سلة البيع فارغة! أضف أصنافاً أولاً للبيع (F2)', 'warning');
      return;
    }
    if (paymentMethod === 'credit' && !selectedCustomerId) {
      showStatus('يرجى تحديد العميل أولاً لإتمام البيع الآجل (F10)', 'error');
      return;
    }
    await handleConfirmPayment({
      paymentMethod,
      paidPiasters: paymentMethod === 'cash' ? netTotalPiasters : 0,
      payments: paymentMethod === 'cash' 
        ? [{ method: 'cash', amountPiasters: netTotalPiasters }] 
        : [{ method: 'credit', amountPiasters: 0 }],
      changeDuePiasters: 0,
      customerId: selectedCustomerId || undefined
    });
  }, [cart.length, paymentMethod, selectedCustomerId, netTotalPiasters, handleConfirmPayment, showStatus]);

  // Feature #32 (Tasks 32-1 & 32-2): 100% Cashier Keyboard Shortcuts Map (F1 to F12)
  useEffect(() => {
    let scanBuffer = '';
    let lastKeyTime = 0;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // F1: Cheatsheet / Help Modal
      if (e.key === 'F1') {
        e.preventDefault();
        setIsHelpModalOpen(true);
        return;
      }

      // F2: Focus Search / Barcode Input
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
        return;
      }

      // F3: Modify Quantity of Last Cart Item
      if (e.key === 'F3') {
        e.preventDefault();
        if (cart.length > 0) {
          const lastIdx = cart.length - 1;
          const lastItem = cart[lastIdx];
          if (lastItem.unit === 'kg') {
            openWeightEditorForCartItem(lastIdx);
          } else {
            const inputVal = window.prompt(`تعديل كمية "${lastItem.productName}":`, String(lastItem.quantityMilli / 1000));
            if (inputVal !== null) {
              const num = parseFloat(normalizeArabicNumerals(inputVal.trim()));
              if (!isNaN(num) && num > 0) {
                setDirectQuantity(lastIdx, num);
              }
            }
          }
        } else {
          showStatus('السلة فارغة. يرجى إضافة صنف أولاً لتعديل كميته', 'warning');
        }
        return;
      }

      // F4: Edit Discount
      if (e.key === 'F4') {
        e.preventDefault();
        const discVal = window.prompt('أدخل قيمة الخصم المالي الإجمالي بالجنيه:', String(discountPiasters / 100));
        if (discVal !== null) {
          const num = parseFloat(normalizeArabicNumerals(discVal.trim()));
          if (!isNaN(num) && num >= 0) {
            setDiscountPiasters(Math.round(num * 100));
            showStatus(`تم تطبيق خصم بقيمة ${num.toFixed(2)} ج.م`, 'success');
          }
        }
        return;
      }

      // F6: Hold / Suspend or Resume Sale
      if (e.key === 'F6') {
        e.preventDefault();
        if (cart.length > 0) {
          const draft = {
            items: cart,
            discountPiasters,
            customerId: selectedCustomerId,
            savedAt: Date.now()
          };
          localStorage.setItem('rafiq_pos_cart_draft', JSON.stringify(draft));
          setDraftPrompt(draft);
          setCart([]);
          setDiscountPiasters(0);
          showStatus('تم تعليق الفاتورة بنجاح. اضغط F6 لاسترجاعها في أي وقت', 'warning');
        } else if (draftPrompt && draftPrompt.items.length > 0) {
          setCart(draftPrompt.items);
          setDiscountPiasters(draftPrompt.discountPiasters || 0);
          if (draftPrompt.customerId) setSelectedCustomerId(draftPrompt.customerId);
          localStorage.removeItem('rafiq_pos_cart_draft');
          setDraftPrompt(null);
          showStatus('تم استرجاع الفاتورة المعلقة بنجاح إلى السلة', 'success');
        } else {
          showStatus('لا توجد فاتورة في السلة لتعليقها، ولا توجد فاتورة معلقة لاسترجاعها', 'warning');
        }
        return;
      }

      // F7: Clear Cart / New Sale
      if (e.key === 'F7') {
        e.preventDefault();
        requestClearCart();
        return;
      }

      // F8: Scanner Settings
      if (e.key === 'F8') {
        e.preventDefault();
        setIsScannerModalOpen(true);
        return;
      }

      // F9: Preview / Print Last Receipt
      if (e.key === 'F9') {
        e.preventDefault();
        if (lastCompletedSale) {
          setIsReceiptOpen(true);
        } else {
          showStatus('لا توجد فاتورة سابقة لإعادة طباعتها', 'warning');
        }
        return;
      }

      // F10: Toggle Credit / Cash
      if (e.key === 'F10') {
        e.preventDefault();
        setPaymentMethod((prev) => {
          const next = prev === 'cash' ? 'credit' : 'cash';
          showStatus(next === 'credit' ? 'تم التبديل إلى البيع الآجل (F10)' : 'تم التبديل إلى الدفع النقدي (F10)', 'success');
          return next;
        });
        return;
      }

      // F12: Quick Direct Cash Pay
      if (e.key === 'F12') {
        e.preventDefault();
        if (cart.length > 0 && !loading) {
          void handleFastCashCheckout();
        } else if (cart.length === 0) {
          showStatus('السلة فارغة! أضف أصنافاً أولاً للبيع', 'warning');
        }
        return;
      }

      // Space: Open multi-payment modal when outside text input
      if (e.key === ' ' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        if (cart.length > 0 && !loading) {
          handleOpenCheckout();
        }
        return;
      }

      // Delete: Remove last item from cart when not typing
      if (e.key === 'Delete' && document.activeElement?.tagName !== 'INPUT') {
        if (cart.length > 0) {
          e.preventDefault();
          removeItem(cart.length - 1);
        }
        return;
      }

      // + / =: Increase last item quantity by 1
      if ((e.key === '+' || e.key === '=') && document.activeElement?.tagName !== 'INPUT') {
        if (cart.length > 0) {
          e.preventDefault();
          updateQuantity(cart.length - 1, 1);
        }
        return;
      }

      // -: Decrease last item quantity by 1
      if (e.key === '-' && document.activeElement?.tagName !== 'INPUT') {
        if (cart.length > 0 && cart[cart.length - 1].quantityMilli > 1000) {
          e.preventDefault();
          updateQuantity(cart.length - 1, -1);
        }
        return;
      }

      // Escape: Close any open modals and refocus barcode input
      if (e.key === 'Escape') {
        setIsHelpModalOpen(false);
        setIsPaymentModalOpen(false);
        setIsReceiptOpen(false);
        setIsClearConfirmOpen(false);
        setIsScannerModalOpen(false);
        setIsQuickAddModalOpen(false);
        setIsQuickItemsManagerOpen(false);
        setWeightModalProduct(null);
        setIsSearchDropdownOpen(false);
        barcodeInputRef.current?.focus();
        return;
      }

      // Modifiers
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const now = Date.now();
      const timeDelta = now - lastKeyTime;
      lastKeyTime = now;

      const isSuffix = 
        (scannerSettings.suffix === 'Enter' && e.key === 'Enter') ||
        (scannerSettings.suffix === 'Tab' && e.key === 'Tab');

      if (isSuffix) {
        if (scanBuffer.length >= scannerSettings.minBarcodeLength && timeDelta < (scannerSettings.speedThresholdMs + 30)) {
          const barcode = sanitizeScannedBarcode(scanBuffer, scannerSettings.prefix);
          scanBuffer = '';
          e.preventDefault();
          void handleFastBarcodeScan(barcode);
          return;
        }
        scanBuffer = '';
        return;
      }

      // Feature #131: Physical Key Code extraction (immune to Arabic keyboard layout)
      const physicalChar = physicalCodeToChar(e.code, e.shiftKey);
      const charToAdd = physicalChar || (e.key.length === 1 ? e.key : null);

      if (charToAdd) {
        if (timeDelta < scannerSettings.speedThresholdMs || scanBuffer.length === 0) {
          scanBuffer += charToAdd;
        } else {
          scanBuffer = charToAdd;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [
    cart, 
    loading, 
    discountPiasters, 
    selectedCustomerId, 
    paymentMethod, 
    lastCompletedSale, 
    draftPrompt, 
    scannerSettings, 
    handleOpenCheckout, 
    handleFastCashCheckout, 
    requestClearCart, 
    handleFastBarcodeScan, 
    updateQuantity, 
    setDirectQuantity, 
    removeItem, 
    openWeightEditorForCartItem,
    showStatus
  ]);

  // Task 32-3: Focus Management - Always return focus to barcode/search input
  useEffect(() => {
    const isAnyModalOpen = isPaymentModalOpen || isReceiptOpen || isClearConfirmOpen || 
      isScannerModalOpen || isQuickAddModalOpen || isQuickItemsManagerOpen || 
      isHelpModalOpen || !!weightModalProduct;

    if (!isAnyModalOpen) {
      const timer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [
    isPaymentModalOpen, 
    isReceiptOpen, 
    isClearConfirmOpen, 
    isScannerModalOpen, 
    isQuickAddModalOpen, 
    isQuickItemsManagerOpen, 
    isHelpModalOpen, 
    weightModalProduct
  ]);

  return (
    <div className="flex flex-col h-full w-full bg-canvas overflow-hidden">
      {/* 1. THREE-PANE MAIN WORKSPACE */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* ================= REGION A: BARCODE SEARCH & CART TABLE (Responsive Width) ================= */}
        <section className={`${showFastItems ? 'w-[58%]' : 'w-[74%]'} h-full bg-surface hairline-l flex flex-col overflow-hidden`}>
          
          {/* Barcode Search Header (56px tall, 2px brand border focus state) */}
          <div ref={searchContainerRef} className="p-2 sm:p-3 bg-surface hairline-b shrink-0 relative">
            <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-1.5 sm:gap-2">
              <div className="relative flex-1 h-[40px] sm:h-[44px] flex items-center bg-surface rounded border-2 border-brand px-2 sm:px-3 focus-within:ring-1 focus-within:ring-brand">
                <Barcode className="w-5 h-5 text-brand ml-1.5 sm:ml-2 shrink-0" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  placeholder="امسح الباركود أو اكتب اسم الصنف ثم اضغط Enter..."
                  value={barcodeQuery}
                  onChange={(e) => {
                    const val = normalizeArabicNumerals(e.target.value);
                    setBarcodeQuery(val);
                    if (!val.trim()) {
                      setLiveSearchResults([]);
                      setIsSearchDropdownOpen(false);
                    }
                  }}
                  onKeyDown={handleSearchKeyDown}
                  onFocus={() => {
                    if (liveSearchResults.length > 0) setIsSearchDropdownOpen(true);
                  }}
                  className="w-full h-full bg-transparent border-none text-xs sm:text-[14px] text-ink placeholder:text-ink-muted focus:outline-none font-mono"
                />
                {isSearching && (
                  <Loader2 className="w-4 h-4 text-brand animate-spin ml-2 shrink-0" />
                )}
                <div className="mr-1.5 sm:mr-2 flex items-center shrink-0">
                  <span className="px-1.5 py-0.5 text-[10px] sm:text-[11px] font-mono font-bold bg-surface-2 text-ink-muted rounded border border-line">
                    F2
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="h-[40px] sm:h-[44px] px-3 sm:px-4 bg-brand hover:bg-brand-hover text-white rounded text-xs sm:text-[13px] font-bold flex items-center gap-1.5 transition-colors shrink-0 shadow-sm"
              >
                <Search className="w-4 h-4" />
                <span>إضافة</span>
              </button>

              <button
                type="button"
                onClick={() => setIsScannerModalOpen(true)}
                className="h-[40px] sm:h-[44px] px-2.5 sm:px-3 bg-surface-2 hover:bg-surface border border-line text-ink rounded text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 shadow-2xs"
                title="فحص واختبار قارئ الباركود (F10)"
              >
                <Barcode className="w-4 h-4 text-brand" />
                <span className="hidden sm:inline">فحص القارئ</span>
              </button>
            </form>

            {/* Live Search Floating Dropdown (Task 22-4) */}
            {isSearchDropdownOpen && liveSearchResults.length > 0 && (
              <div 
                className="absolute left-3 right-3 top-[64px] z-50 bg-surface rounded-xl border hairline-all shadow-2xl overflow-hidden max-h-[360px] flex flex-col animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-3 py-1.5 bg-surface-2 hairline-b flex items-center justify-between text-[11px] font-semibold text-ink-muted select-none">
                  <div className="flex items-center gap-2">
                    <span>نتائج البحث الفورية ({liveSearchResults.length})</span>
                    <span className="text-[10px] bg-canvas px-1.5 py-0.5 rounded border hairline-all">
                      استخدم الأسهم ↑ ↓ ثم اضغط Enter للإضافة
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSearchDropdownOpen(false)}
                    className="hover:text-ink text-[11px]"
                  >
                    إغلاق (Esc)
                  </button>
                </div>

                <div className="overflow-y-auto divide-y divide-line/40">
                  {liveSearchResults.map((prod, idx) => {
                    const isSelected = idx === selectedDropdownIndex;
                    const stock = prod.stockQuantityMilli / 1000;
                    const minStock = (prod.minStockQuantityMilli || 5000) / 1000;
                    const isOutOfStock = stock <= 0;
                    const isLowStock = !isOutOfStock && stock <= minStock;

                    return (
                      <div
                        key={prod.id}
                        onClick={() => {
                          addProductToCart(prod);
                          setBarcodeQuery('');
                          setIsSearchDropdownOpen(false);
                          showStatus(`تمت إضافة: ${prod.name}`, 'success');
                          barcodeInputRef.current?.focus();
                        }}
                        onMouseEnter={() => setSelectedDropdownIndex(idx)}
                        className={`px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? 'bg-brand/10 border-r-4 border-r-brand pl-2' : 'hover:bg-surface-2'
                        }`}
                      >
                        {/* Right: Product Info */}
                        <div className="flex flex-col items-start gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[13px] text-ink">{prod.name}</span>
                            {prod.unit === 'kg' && (
                              <span className="px-1.5 py-0.2 text-[10px] font-bold bg-amber-500/10 text-amber-700 rounded border border-amber-300">
                                بالوزن (كجم)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-ink-muted font-mono">
                            {prod.barcode && (
                              <span className="flex items-center gap-1 bg-surface-2 px-1.5 py-0.5 rounded">
                                <Barcode className="w-3 h-3" />
                                {prod.barcode}
                              </span>
                            )}
                            {prod.internalCode && (
                              <span className="text-[10px] text-ink-muted">كود: {prod.internalCode}</span>
                            )}
                          </div>
                        </div>

                        {/* Left: Stock Status & Price */}
                        <div className="flex items-center gap-4 text-left">
                          {/* Stock status badge */}
                          <div className="text-right">
                            {isOutOfStock ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-danger-soft border border-danger-border text-danger">
                                نفد من المخزن (0)
                              </span>
                            ) : isLowStock ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 border border-amber-300 text-amber-800">
                                مخزون منخفض ({stock.toLocaleString('en-US')} {prod.unit === 'kg' ? 'كجم' : 'قطعة'})
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-paid-soft border border-paid-border text-paid">
                                متاح ({stock.toLocaleString('en-US')} {prod.unit === 'kg' ? 'كجم' : 'قطعة'})
                              </span>
                            )}
                          </div>

                          {/* Price formatted */}
                          <div className="text-[15px] font-mono font-bold text-brand min-w-[70px] text-left">
                            {formatArabicCurrency(prod.pricePiasters)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Feature #132: Power Outage Cart Draft Recovery Prompt Banner */}
          {draftPrompt && (
            <div className="mx-3 mt-2 p-3 bg-amber-500/15 border-2 border-amber-500/40 rounded-lg flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-ink">
                    توجد فاتورة سابقة مفتوحة لم تكتمل (حُفظت تلقائياً قبل إغلاق النظام أو انقطاع الكهرباء):
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">
                    عدد الأصناف: {draftPrompt.items.length} — الإجمالي: {formatArabicCurrency(draftPrompt.items.reduce((sum, i) => sum + i.totalPiasters, 0) - (draftPrompt.discountPiasters || 0))} — تم الحفظ: {new Date(draftPrompt.savedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setCart(draftPrompt.items);
                    setDiscountPiasters(draftPrompt.discountPiasters || 0);
                    if (draftPrompt.customerId) setSelectedCustomerId(draftPrompt.customerId);
                    setDraftPrompt(null);
                    showStatus('تم استرجاع السلة المفتوحة بنجاح!', 'success');
                  }}
                  className="px-3 py-1.5 bg-brand hover:bg-brand-hover text-white rounded text-xs font-bold transition-colors shadow-2xs"
                >
                  استرجاع السلة
                </button>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('rafiq_pos_cart_draft');
                    setDraftPrompt(null);
                  }}
                  className="px-2.5 py-1.5 bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded text-xs transition-colors"
                >
                  تجاهل ومسح
                </button>
              </div>
            </div>
          )}

          {/* Status Message Notification Toast */}
          {statusMessage && (
            <div className={`mx-3 mt-2 px-3 py-2 rounded text-[12px] font-semibold border flex items-center gap-2 transition-all ${
              statusMessage.type === 'success' 
                ? 'bg-paid-soft border-paid-border text-paid' 
                : statusMessage.type === 'warning'
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300'
                : 'bg-danger-soft border-danger-border text-danger'
            }`}>
              {statusMessage.type === 'warning' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Cart Table Area */}
          <div className="flex-1 flex flex-col overflow-hidden mt-1">
            {/* Table Column Headers (36px tall, surface-2, hairline-b) */}
            <div className="h-[32px] sm:h-[36px] bg-surface-2 hairline-b flex items-center px-2 sm:px-4 text-[11px] sm:text-[12px] font-bold text-ink-muted select-none shrink-0">
              <div className="w-[7%] text-center">#</div>
              <div className="w-[41%] text-right">الصنف / الباركود</div>
              <div className="w-[15%] text-left tabular-nums">السعر</div>
              <div className="w-[20%] text-center">الكمية</div>
              <div className="w-[13%] text-left tabular-nums">الإجمالي</div>
              <div className="w-[4%] text-center">حذف</div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto divide-y divide-line">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-3 p-6">
                  <div className="w-14 h-14 rounded-full bg-surface-2 border border-line flex items-center justify-center">
                    <ShoppingBag className="w-7 h-7 text-ink-muted stroke-[1.4]" />
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-bold text-ink m-0">سلة البيع فارغة</p>
                    <p className="text-[12px] text-ink-muted m-0 mt-1">
                      امسح الباركود، أو اختر من قائمة الأصناف السريعة على اليسار لبدء الفاتورة
                    </p>
                  </div>
                  {lastInvoiceNumber && (
                    <span className="text-[11px] font-mono text-paid bg-paid-soft border border-paid-border px-2.5 py-1 rounded">
                      آخر فاتورة تم حفظها: #{lastInvoiceNumber}
                    </span>
                  )}
                </div>
              ) : (
                cart.map((item, index) => (
                  <div 
                    key={item.productId || index} 
                    className="h-[48px] sm:h-[52px] hairline-b flex items-center px-2 sm:px-4 text-xs sm:text-[13px] hover:bg-surface-2 transition-colors"
                  >
                    {/* Index */}
                    <div className="w-[7%] text-center font-mono text-ink-muted text-[11px] sm:text-xs">
                      {index + 1}
                    </div>

                    {/* Description */}
                    <div className="w-[41%] pr-1 flex flex-col justify-center overflow-hidden">
                      <div className="flex items-center gap-1 truncate">
                        <span className="font-semibold text-ink truncate text-xs sm:text-[13px]">{item.productName}</span>
                        {item.unit === 'kg' && (
                          <span className="shrink-0 px-1 py-0.2 bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-[9px] sm:text-[10px] font-bold rounded flex items-center gap-0.5" title="يباع بالوزن (ميزان)">
                            <Scale className="w-2.5 h-2.5" />
                            <span>وزن</span>
                          </span>
                        )}
                        {/* Task 161-5: Unit Selector Dropdown if multiple units exist */}
                        {item.productUnits && item.productUnits.length > 1 && (
                          <select
                            value={item.unitId || ''}
                            onChange={(e) => changeCartItemUnit(index, e.target.value)}
                            className="h-[22px] px-1 py-0 bg-brand-soft border border-brand/30 text-brand text-[10px] font-bold rounded cursor-pointer focus:outline-none shrink-0"
                            title="تغيير وحدة البيع (قطعة، دستة، كرتونة)"
                          >
                            {item.productUnits.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.unitName} (×{u.conversionFactor})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] sm:text-[10px] font-mono text-ink-muted truncate">
                          {item.barcode || 'بدون باركود'}
                        </span>
                        {item.unitName && item.conversionFactor && item.conversionFactor > 1 && (
                          <span className="text-[9px] text-brand font-bold bg-brand-soft px-1 rounded">
                            {item.unitName} = {item.conversionFactor} قطعة
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Unit Price (Editable on click — Task 161-6) */}
                    <div className="w-[15%] text-left tabular-nums font-mono text-ink text-xs sm:text-[13px]">
                      {editingPriceIndex === index ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.25"
                            autoFocus
                            defaultValue={(item.unitPricePiasters / 100).toFixed(2)}
                            onBlur={(e) => {
                              const val = parseFloat(normalizeArabicNumerals(e.target.value));
                              if (!isNaN(val) && val >= 0) {
                                updateItemPrice(index, Math.round(val * 100));
                              }
                              setEditingPriceIndex(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              } else if (e.key === 'Escape') {
                                setEditingPriceIndex(null);
                              }
                            }}
                            className="w-16 h-6 px-1 text-center font-mono text-xs bg-surface border-2 border-brand rounded text-brand font-bold focus:outline-none"
                          />
                        </div>
                      ) : (
                        <div 
                          onClick={() => setEditingPriceIndex(index)}
                          className="cursor-pointer hover:bg-surface-2 rounded px-1 inline-flex items-center gap-0.5 group"
                          title="اضغط لتعديل السعر يدويًا لهذه الفاتورة"
                        >
                          <span className="group-hover:text-brand font-bold">{formatArabicCurrency(item.unitPricePiasters)}</span>
                          <span className="text-[9px] text-ink-muted group-hover:text-brand">/{item.unit || 'قطعة'}</span>
                        </div>
                      )}
                    </div>

                    {/* Quantity Stepper or Weight Button */}
                    <div className="w-[20%] flex items-center justify-center">
                      {item.unit === 'kg' ? (
                        <button
                          type="button"
                          onClick={() => openWeightEditorForCartItem(index)}
                          className="h-[28px] sm:h-[32px] px-1.5 sm:px-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded flex items-center gap-1 text-amber-800 dark:text-amber-200 transition-colors shadow-2xs group"
                          title="اضغط لتعديل الوزن بالجرام أو الكيلو"
                        >
                          <Scale className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 group-hover:scale-110 transition-transform shrink-0" />
                          <span className="font-mono font-bold text-[11px] sm:text-[12px] tabular-nums">
                            {(item.quantityMilli / 1000).toFixed(3)} كجم
                          </span>
                        </button>
                      ) : (
                        <div className="flex items-center h-[28px] sm:h-[32px] bg-surface border border-line rounded px-0.5 sm:px-1 gap-0.5 sm:gap-1">
                          <button 
                            type="button"
                            onClick={() => updateQuantity(index, -1)}
                            className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-ink-muted hover:text-brand font-bold text-xs sm:text-sm rounded hover:bg-surface-2"
                            title="إنقاص الكمية"
                          >
                            <Minus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          </button>
                          <input
                            type="text"
                            value={item.quantityMilli / 1000}
                            onChange={(e) => {
                              const val = parseInt(normalizeArabicNumerals(e.target.value), 10);
                              if (!isNaN(val) && val >= 0) {
                                setDirectQuantity(index, val);
                              }
                            }}
                            className="w-8 sm:w-9 h-5 sm:h-6 text-center font-mono font-bold text-ink text-xs sm:text-[13px] tabular-nums bg-transparent border-0 focus:outline-hidden focus:bg-surface-2 rounded"
                            title="اضغط لتعديل الكمية بالكتابة مباشرة"
                          />
                          <button 
                            type="button"
                            onClick={() => updateQuantity(index, 1)}
                            className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-ink-muted hover:text-brand font-bold text-xs sm:text-sm rounded hover:bg-surface-2"
                            title="زيادة الكمية"
                          >
                            <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Line Total */}
                    <div className="w-[13%] text-left tabular-nums font-mono font-bold text-brand text-xs sm:text-[13px]">
                      {formatArabicCurrency(item.totalPiasters)}
                    </div>

                    {/* Delete Trigger */}
                    <div className="w-[4%] text-center">
                      <button 
                        onClick={() => removeItem(index)}
                        className="text-ink-muted hover:text-danger p-1 rounded transition-colors"
                        title="حذف الصنف"
                      >
                        <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ================= REGION B: FINANCIAL TOTALS & PAYMENT PANEL (26% Width) ================= */}
        <section className="w-[26%] min-w-[210px] h-full bg-surface hairline-l flex flex-col justify-between p-2.5 sm:p-4 select-none overflow-y-auto">
          {/* Top Section: Line Breakdown */}
          <div className="flex flex-col gap-2.5">
            <div className="pb-2 hairline-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-ink">ملخص الفاتورة</span>
                <span className="text-[11px] font-mono font-bold text-brand bg-brand-soft border border-brand/20 px-2 py-0.5 rounded">
                  #{nextExpectedInvoiceNumber || (lastInvoiceNumber ? lastInvoiceNumber + 1 : '1')}
                </span>
              </div>
              <span className="text-[11px] font-mono text-ink-muted bg-surface-2 border border-line px-2 py-0.5 rounded">
                {cart.length} أصناف ({totalItemCount} قطعة)
              </span>
            </div>

            {/* Breakdown Rows */}
            <div className="flex justify-between items-center text-[13px] py-1">
              <span className="text-ink-muted">الإجمالي قبل الخصم:</span>
              <span className="font-semibold text-ink font-mono tabular-nums">
                {formatArabicCurrency(subtotalPiasters)}
              </span>
            </div>

            <div className="flex justify-between items-center text-[13px] py-1 gap-2">
              <span className="text-danger font-semibold text-xs">خصم الفاتورة:</span>
              <div className="w-36">
                <MoneyInput
                  valuePiasters={discountPiasters}
                  onChangePiasters={setDiscountPiasters}
                  className="h-[32px] text-xs text-danger font-bold border-danger/40 focus:border-danger bg-danger-soft/20 text-right pr-2.5 pl-11"
                />
              </div>
            </div>

            {showTaxes && (
              <div className="flex justify-between items-center text-[11px] py-1 text-ink-muted border-t border-line">
                <span>ضريبة القيمة المضافة:</span>
                <span className="font-mono text-ink-muted">
                  {totalTaxPiasters > 0
                    ? `${formatArabicCurrency(totalTaxPiasters)} (مشمولة بالسعر)`
                    : '0.00 ج.م (معفاة/نسبة 0%)'}
                </span>
              </div>
            )}
          </div>

          {/* Customer & Debt Account Selector (Toggled by Feature #105) */}
          {showCredit && (
            <div className="bg-surface p-2.5 rounded border border-line flex flex-col gap-1.5 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-ink flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-brand" />
                  <span>عميل الفاتورة:</span>
                </span>
                {selectedCustomerId && (() => {
                  const cust = customers.find(c => c.id === selectedCustomerId);
                  if (cust && cust.balancePiasters > 0) {
                    return (
                      <span className="text-[10px] text-danger font-mono font-bold bg-danger-soft px-1.5 py-0.5 rounded border border-danger-border">
                        عليه دين: {(cust.balancePiasters / 100).toFixed(2)} ج.م
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="flex gap-1.5">
                <select
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    if (!e.target.value) setPaymentMethod('cash');
                  }}
                  className="flex-1 h-7 px-2 bg-canvas border border-line rounded text-[11px] text-ink focus:outline-none focus:border-brand"
                >
                  <option value="">عميل نقدي عام (بدون حساب)</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''} {c.balancePiasters > 0 ? `[دين: ${(c.balancePiasters / 100).toFixed(0)}]` : ''}
                    </option>
                  ))}
                </select>

                {selectedCustomerId && (
                  <div className="flex bg-surface-2 p-0.5 rounded border border-line text-[11px] shrink-0">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`px-2 py-0.5 rounded font-semibold ${paymentMethod === 'cash' ? 'bg-surface text-ink font-bold shadow-xs' : 'text-ink-muted'}`}
                    >
                      نقدي
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('credit')}
                      className={`px-2 py-0.5 rounded font-semibold ${paymentMethod === 'credit' ? 'bg-danger-soft text-danger font-bold border border-danger-border' : 'text-ink-muted'}`}
                    >
                      آجل
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bottom Section: Hero Grand Total + Action Triggers */}
          <div className="flex flex-col gap-2.5 sm:gap-3">
            {/* Grand Total Solid Dark Bar (#14181A, Egyptian Pound) */}
            <div className="w-full bg-[#14181A] rounded-[6px] border border-[#2D3331] p-2.5 sm:p-3.5 flex flex-col justify-between shadow-sm shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-[12px] font-semibold text-[#8FA69C]">المطلوب سداده</span>
                {totalTaxPiasters > 0 && (
                  <span className="text-[10px] sm:text-[11px] font-medium text-emerald-400">
                    (شامل ضريبة: {formatArabicCurrency(totalTaxPiasters)})
                  </span>
                )}
                <span className="text-[11px] sm:text-[12px] font-medium text-[#DCE1DC]">جنيه مصري</span>
              </div>
              <div className="flex items-baseline justify-end pt-1">
                <span className="text-white text-[24px] sm:text-[32px] leading-tight font-bold font-mono tabular-nums tracking-tight">
                  {formatArabicCurrency(netTotalPiasters)}
                </span>
              </div>
            </div>

            {/* Main Action Buttons Grid */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 shrink-0">
              {paymentMethod === 'credit' ? (
                /* آجل [F9 / F12] */
                <button 
                  type="button"
                  onClick={() => handleOpenCheckout('credit')}
                  disabled={loading || cart.length === 0}
                  className="col-span-2 h-[46px] sm:h-[52px] bg-danger hover:bg-red-700 active:bg-red-800 disabled:bg-surface-2 disabled:text-ink-muted disabled:border disabled:border-line text-white rounded-[6px] px-2.5 sm:px-3 flex items-center justify-between transition-colors shadow-sm"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CreditCard className="w-4 h-4 shrink-0" />
                    <span className="text-xs sm:text-[14px] font-bold truncate">تسجيل بيع آجل (على الحساب)</span>
                  </div>
                  <span className="text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded text-white font-bold shrink-0">
                    F12
                  </span>
                </button>
              ) : (
                <>
                  {/* نقدي [F9] */}
                  <button 
                    type="button"
                    onClick={() => handleOpenCheckout('cash')}
                    disabled={loading || cart.length === 0}
                    className="h-[46px] sm:h-[52px] bg-brand hover:bg-brand-hover active:bg-brand-dark disabled:bg-surface-2 disabled:text-ink-muted disabled:border disabled:border-line text-white rounded-[6px] px-2 sm:px-3 flex items-center justify-between transition-colors shadow-sm"
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <CreditCard className="w-4 h-4 shrink-0" />
                      <span className="text-xs sm:text-[14px] font-bold truncate">دفع نقدي</span>
                    </div>
                    <span className="text-[9px] sm:text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded text-white font-bold shrink-0">
                      F9
                    </span>
                  </button>

                  {/* حفظ وطباعة [F12] */}
                  <button 
                    type="button"
                    onClick={() => handleOpenCheckout('cash')}
                    disabled={loading || cart.length === 0}
                    className="h-[46px] sm:h-[52px] bg-paid hover:bg-[#15633E] active:bg-[#0E492C] disabled:bg-surface-2 disabled:text-ink-muted disabled:border disabled:border-line text-white rounded-[6px] px-2 sm:px-3 flex items-center justify-between transition-colors shadow-sm"
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <Printer className="w-4 h-4 shrink-0" />
                      <span className="text-xs sm:text-[14px] font-bold truncate">حفظ وطباعة</span>
                    </div>
                    <span className="text-[9px] sm:text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded text-white font-bold shrink-0">
                      F12
                    </span>
                  </button>
                </>
              )}
            </div>

            {/* Void / Clear Cart Button & Last Receipt Preview */}
            <div className="flex gap-2">
              <button 
                onClick={requestClearCart}
                disabled={cart.length === 0}
                className="flex-1 h-[36px] bg-surface hover:bg-danger-soft text-danger disabled:text-ink-muted border border-danger disabled:border-line text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>فاتورة جديدة (F7)</span>
              </button>

              {lastCompletedSale && (
                <button 
                  onClick={() => setIsReceiptOpen(true)}
                  className="px-3 h-[36px] bg-surface border border-line hover:bg-surface-2 text-ink text-xs font-semibold rounded flex items-center gap-1 transition-colors"
                  title="معاينة إيصال آخر فاتورة"
                >
                  <Eye className="w-3.5 h-3.5 text-brand" />
                  <span>الإيصال</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ================= REGION C: FAST ITEMS GRID (16% Width - Toggled by Feature #105) ================= */}
        {showFastItems && (
          <section className="w-[16%] min-w-[130px] h-full bg-surface-2 flex flex-col p-2 sm:p-3 select-none overflow-hidden">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-1.5 pb-1 hairline-b shrink-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand" />
                <span className="text-[11px] sm:text-[12px] font-bold text-ink">أصناف سريعة</span>
              </div>
              <button
                onClick={() => setIsQuickItemsManagerOpen(true)}
                className="p-1 hover:bg-surface rounded text-ink-muted hover:text-brand transition-colors"
                title="إدارة وتعديل الأصناف السريعة"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Dynamic Category Tabs */}
            {(() => {
              const categories = Array.from(new Set(quickItems.map((i) => i.categoryName || 'عام')));
              if (categories.length === 0) categories.push('عام');
              return (
                <div className="flex flex-wrap gap-1 bg-surface p-1 rounded border border-line mb-1.5 shrink-0 max-h-20 overflow-y-auto">
                  <button
                    key="__ALL__"
                    onClick={() => setActiveCategory('__ALL__')}
                    className={`h-5 sm:h-6 text-[9px] sm:text-[10px] font-bold rounded transition-colors truncate px-1.5 py-0.5 min-w-[20%] text-center ${
                      activeCategory === '__ALL__' 
                        ? 'bg-brand text-white' 
                        : 'text-ink-muted hover:text-ink hover:bg-surface-2'
                    }`}
                  >
                    الكل ({quickItems.length})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`h-5 sm:h-6 text-[9px] sm:text-[10px] font-bold rounded transition-colors truncate px-1.5 py-0.5 flex-1 min-w-[25%] text-center ${
                        activeCategory === cat 
                          ? 'bg-brand text-white' 
                          : 'text-ink-muted hover:text-ink hover:bg-surface-2'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* List of Quick Items */}
            <div className="flex-1 flex flex-col gap-1 sm:gap-1.5 overflow-y-auto pr-0.5">
              {quickItems
                .filter((i) => activeCategory === '__ALL__' || (i.categoryName || 'عام') === activeCategory)
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((fastItem) => (
                  <button
                    key={fastItem.id}
                    onClick={() => handleFastItemClick(fastItem)}
                    className="w-full bg-surface hover:bg-brand-soft border border-line hover:border-brand text-ink rounded p-1.5 sm:p-2 flex flex-col justify-between text-right transition-colors shadow-none shrink-0 group"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] sm:text-[12px] font-semibold text-ink line-clamp-1 leading-snug group-hover:text-brand">
                        {fastItem.name}
                      </span>
                      {fastItem.isOpenPrice && (
                        <span className="text-[8px] sm:text-[9px] bg-accent-soft text-accent px-1 rounded font-bold">
                          سعر حر
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-mono text-brand font-bold tabular-nums mt-0.5 text-left">
                      {fastItem.isOpenPrice ? 'تحديد عند البيع' : formatArabicCurrency(fastItem.pricePiasters)}
                    </span>
                  </button>
                ))}

              {quickItems.filter((i) => activeCategory === '__ALL__' || (i.categoryName || 'عام') === activeCategory).length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center p-3 text-center text-ink-muted">
                  <Sparkles className="w-6 h-6 mb-1 opacity-30 text-brand" />
                  <p className="text-[11px]">لا توجد أصناف في هذا القسم</p>
                  <button
                    onClick={() => setIsQuickItemsManagerOpen(true)}
                    className="mt-2 text-[10px] text-brand hover:underline font-bold"
                  >
                    + إضافة أصناف الآن
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Quick Items Manage Shortcut */}
            <button
              onClick={() => setIsQuickItemsManagerOpen(true)}
              className="mt-1.5 bg-surface hover:bg-surface-2 p-1.5 rounded border border-line flex items-center justify-between text-[10px] sm:text-[11px] text-ink-muted hover:text-brand transition-colors shrink-0"
            >
              <div className="flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" />
                <span className="font-semibold">تخصيص القائمة</span>
              </div>
              <span className="font-mono text-[9px] sm:text-[10px]">{quickItems.length} صنف</span>
            </button>
          </section>
        )}
      </div>

      {/* 2. BOTTOM KEYBOARD SHORTCUTS STRIP (Task 32-2: F1-F12 Cashier Hotkeys Cheatsheet) */}
      <footer className="h-[36px] w-full bg-surface-2 hairline-t flex items-center justify-between px-3 select-none shrink-0 z-10 text-[11px] text-ink-muted overflow-x-auto">
        <div className="flex items-center gap-2">
          <button 
            type="button"
            onClick={() => setIsHelpModalOpen(true)}
            className="flex items-center gap-1 hover:text-brand transition-colors cursor-pointer"
            title="دليل الاختصارات الكامل"
          >
            <span className="font-mono font-bold text-brand px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F1</span>
            <span className="font-semibold text-ink">مساعدة</span>
          </button>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F2</span>
            <span>بحث</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F3</span>
            <span>كمية (+/-)</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F4</span>
            <span>خصم</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F6</span>
            <span>تعليق/استرجاع</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F7</span>
            <span>سلة جديدة</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F8</span>
            <span>القارئ</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F9</span>
            <span>إعادة الإيصال</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">F10</span>
            <span>آجل/عميل</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-white bg-paid px-1.5 py-0.5 rounded text-[10px]">F12</span>
            <span className="font-bold text-paid">سداد نقدي</span>
          </div>
          <span className="text-line">|</span>
          <div className="flex items-center gap-1">
            <span className="font-mono font-bold text-ink px-1.5 py-0.5 bg-surface border border-line rounded text-[10px]">Esc</span>
            <span>خروج</span>
          </div>
        </div>

        <div className="text-[10px] font-mono text-ink-muted shrink-0 pr-2">
          <span>وضع: </span>
          <span className="text-brand font-bold">100% كيبورد</span>
        </div>
      </footer>

      {/* KEYBOARD SHORTCUTS HELP MODAL (Feature #32 / Task 32-1 & 32-2) */}
      <KeyboardShortcutsModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />

      {/* 3. RECEIPT PREVIEW & PRINT MODAL (80mm) */}
      <ReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        sale={lastCompletedSale}
      />

      {/* 4. CLEAR CART CONFIRMATION MODAL (Feature #112 / Task 112-2) */}
      <ConfirmModal
        isOpen={isClearConfirmOpen}
        title="تأكيد إلغاء الفاتورة الحالية"
        message="هل أنت متأكد من رغبتك في إلغاء الفاتورة ومسح جميع الأصناف من السلة؟"
        consequence={`سيتم حذف ${cart.length} صنف/أصناف مدخلة في السلة والبدء من جديد.`}
        confirmText="نعم، إلغاء الفاتورة"
        cancelText="تراجع ومتابعة البيع"
        isDanger={true}
        onConfirm={confirmClearCart}
        onCancel={() => setIsClearConfirmOpen(false)}
      />

      {/* 5. UNDO REMOVED ITEM TOAST (Feature #112 / Task 112-3) */}
      {undoItem && (
        <UndoToast
          message={`تم حذف الصنف "${undoItem.item.productName}" من السلة.`}
          durationMs={6000}
          onUndo={handleUndoRemove}
          onDismiss={handleDismissUndo}
        />
      )}

      {/* 6. WEIGHT ENTRY NUMPAD MODAL (Feature #19 / Task 19-4) */}
      <WeightInputModal
        isOpen={!!weightModalProduct}
        product={weightModalProduct}
        initialWeightMilli={initialWeightMilli}
        onConfirm={handleConfirmWeight}
        onClose={() => {
          setWeightModalProduct(null);
          barcodeInputRef.current?.focus();
        }}
      />

      {/* 7. QUICK ITEMS MANAGER MODAL (Feature #20 / Task 20-5) */}
      <QuickItemsManagerModal
        isOpen={isQuickItemsManagerOpen}
        onClose={() => {
          setIsQuickItemsManagerOpen(false);
          barcodeInputRef.current?.focus();
        }}
        onItemsChanged={loadQuickItems}
      />

      {/* 9. OPEN PRICE NUMPAD PROMPT MODAL (Feature #20 / Task 20-5) */}
      {openPriceItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg shadow-xl border border-line w-full max-w-sm p-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between mb-4 pb-2 hairline-b">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand" />
                <span>تحديد سعر البيع: {openPriceItem.name}</span>
              </h3>
              <button 
                onClick={() => setOpenPriceItem(null)}
                className="text-ink-muted hover:text-ink p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmOpenPrice}>
              <label className="block text-xs font-bold text-ink-muted mb-1.5">
                أدخل المبلغ بالجنيه (EGP):
              </label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                autoFocus
                placeholder="0.00"
                value={openPriceInputEgp}
                onChange={(e) => setOpenPriceInputEgp(e.target.value)}
                className="w-full text-center text-2xl font-mono font-bold text-brand bg-surface-2 border-2 border-brand rounded p-3 mb-4 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!openPriceInputEgp || parseFloat(openPriceInputEgp) <= 0}
                  className="flex-1 py-2.5 bg-brand hover:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted text-white font-bold rounded transition-colors"
                >
                  تأكيد وإضافة للسلة
                </button>
                <button
                  type="button"
                  onClick={() => setOpenPriceItem(null)}
                  className="px-4 py-2.5 bg-surface-2 hover:bg-line text-ink font-semibold rounded transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. PAYMENT & CHANGE DUE MODAL (Feature #27) */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          barcodeInputRef.current?.focus();
        }}
        subtotalPiasters={subtotalPiasters}
        discountPiasters={discountPiasters}
        netTotalPiasters={netTotalPiasters}
        selectedCustomerId={selectedCustomerId}
        customers={customers}
        onConfirmPayment={handleConfirmPayment}
        loading={loading}
      />

      {/* 11. BARCODE SCANNER SETTINGS & LIVE DIAGNOSTIC MODAL (Feature #131) */}
      <BarcodeScannerSettingsModal
        isOpen={isScannerModalOpen}
        onClose={() => {
          setIsScannerModalOpen(false);
          barcodeInputRef.current?.focus();
        }}
        onSettingsSaved={(newSettings) => setScannerSettings(newSettings)}
      />

      {/* 12. QUICK ADD UNREGISTERED PRODUCT MODAL (Feature #108 / Tasks 108-1 to 108-3) */}
      <QuickAddProductModal
        isOpen={isQuickAddModalOpen}
        barcode={unregisteredBarcode}
        onClose={() => {
          setIsQuickAddModalOpen(false);
          barcodeInputRef.current?.focus();
        }}
        onProductCreated={handleQuickProductCreated}
      />
    </div>
  );
};
