import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { FormEvent } from 'react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import type { Product, Sale, Customer, QuickItem, SalePayment, ProductUnit, HeldSale, Category } from '../types/models';
import { 
  formatArabicCurrency, 
  calculateLineTotal, 
  calculateTaxPiasters, 
  distributeInvoiceDiscount
} from '../utils/money';
import { ReceiptModal } from '../components/ReceiptModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { UndoToast } from '../components/UndoToast';
import { WeightInputModal } from '../components/WeightInputModal';
import { QuickItemsManagerModal } from '../components/QuickItemsManagerModal';
import { QuickFastItemModal } from '../components/QuickFastItemModal';
import { CategoryManagerModal } from '../components/CategoryManagerModal';
import { PaymentModal } from '../components/PaymentModal';
import { BarcodeScannerSettingsModal } from '../components/BarcodeScannerSettingsModal';
import { QuickAddProductModal } from '../components/QuickAddProductModal';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal';
import { ItemDiscountModal } from '../components/ItemDiscountModal';
import { SupervisorPromptModal } from '../components/SupervisorPromptModal';
import { HeldSalesModal } from '../components/HeldSalesModal';
import { ReturnModal } from '../components/ReturnModal';
import { ProductVariantPickerModal } from '../components/ProductVariantPickerModal';
import { ProductUnitPickerModal } from '../components/ProductUnitPickerModal';
import { 
  convertArabicLayoutToBarcode,
  loadScannerSettings,
  type BarcodeScannerSettings, 
  DEFAULT_SCANNER_SETTINGS 
} from '../utils/barcodeReader';
import { useFeatures } from '../context/useFeatures';

// Modular POS Subcomponents & Hooks
import type { CartItem } from './pos/types';
import { PosBarcodeBar } from './pos/PosBarcodeBar';
import { PosCartTable } from './pos/PosCartTable';
import { PosCatalogPanel } from './pos/PosCatalogPanel';
import { PosCartCheckoutBar } from './pos/PosCartCheckoutBar';
import { PosCategoriesPanel } from './pos/PosCategoriesPanel';
import { PosFooterBar } from './pos/PosFooterBar';
import { OpenPriceModal } from './pos/OpenPriceModal';
import { PosQuantityModal } from './pos/PosQuantityModal';
import { PosInvoiceDiscountModal } from './pos/PosInvoiceDiscountModal';
import { usePosCatalog } from './pos/usePosCatalog';
import { usePosShortcuts } from './pos/usePosShortcuts';

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
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  const [isQuickItemsManagerOpen, setIsQuickItemsManagerOpen] = useState(false);
  const [isQuickFastItemModalOpen, setIsQuickFastItemModalOpen] = useState(false);
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
  const [heldSalesCount, setHeldSalesCount] = useState<number>(0);
  const [isHeldSalesModalOpen, setIsHeldSalesModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
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

  // Branded Invoice Discount Modal State (Feature #24 / Tasks 24-1 to 24-4)
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [maxDiscountPercentCashier, setMaxDiscountPercentCashier] = useState(10);
  const [maxDiscountAmountCashierPiasters, setMaxDiscountAmountCashierPiasters] = useState(5000); // 50 EGP
  const [currentUserRole, setCurrentUserRole] = useState<string>('cashier');
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);

  // Item-level Discount Modal State (Feature #24 / Task 24-2)
  const [selectedDiscountItemIndex, setSelectedDiscountItemIndex] = useState<number | null>(null);
  const [isItemDiscountModalOpen, setIsItemDiscountModalOpen] = useState(false);

  // Supervisor PIN Prompt for Over-Limit Discounts (Feature #24 / Task 24-4)
  const [supervisorPrompt, setSupervisorPrompt] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    onApproved: (supervisorName?: string) => void;
  }>({
    isOpen: false,
    title: '',
    onApproved: () => {},
  });

  // Branded Quantity Modal State (Replacing raw window.prompt)
  const [quantityModalItem, setQuantityModalItem] = useState<{ index: number; name: string; currentQty: number } | null>(null);
  const [quantityInputVal, setQuantityInputVal] = useState('');

  // Variant Picker Modal State (Feature #114 / Task 114-5)
  const [variantPickerParentProduct, setVariantPickerParentProduct] = useState<Product | null>(null);

  // Unit Picker Modal State (Feature #175 / Task 175-2)
  const [unitPickerProduct, setUnitPickerProduct] = useState<Product | null>(null);

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
    setSelectedCustomerId('');
    try {
      localStorage.removeItem('rafiq_pos_cart_draft');
    } catch {
      // ignore
    }
    showStatus('تم إلغاء الفاتورة ومسح السلة بالكامل', 'success');
    barcodeInputRef.current?.focus();
  };

  const addProductToCart = useCallback((prod: Product, customWeightMilli?: number, specificUnit?: ProductUnit) => {
    // If this product has variants (matrix parent), prompt variant picker modal
    if (prod.hasVariants) {
      setVariantPickerParentProduct(prod);
      return;
    }

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
      // Upfront Zero-Stock & Insufficient Stock Prevention
      const existingBaseMilli = prev.reduce((sum, item) => {
        if (item.productId === prod.id) {
          const itemFactor = item.conversionFactor && item.conversionFactor > 0 ? item.conversionFactor : 1;
          return sum + (item.quantityMilli * itemFactor);
        }
        return sum;
      }, 0);

      const existingIndex = prev.findIndex((item) => 
        item.productId === prod.id && (item.unitId || '') === (unitId || '')
      );

      const currentItemBaseMilli = existingIndex >= 0 
        ? prev[existingIndex].quantityMilli * (prev[existingIndex].conversionFactor || 1)
        : 0;

      const newQty = existingIndex >= 0 
        ? (customWeightMilli !== undefined ? customWeightMilli : (prev[existingIndex].quantityMilli + 1000))
        : qtyMilli;

      const newItemBaseMilli = newQty * factor;
      const totalRequestedBaseMilli = (existingBaseMilli - currentItemBaseMilli) + newItemBaseMilli;
      const availableStockMilli = prod.stockQuantityMilli ?? 0;

      if (!allowNegativeStock) {
        if (availableStockMilli <= 0) {
          showStatus(`الصنف "${prod.name}" رصيده في المخزن 0 (غير متوفر للبيع)!`, 'error');
          return prev;
        }
        if (totalRequestedBaseMilli > availableStockMilli) {
          const maxRemainingBaseMilli = Math.max(0, availableStockMilli - (existingBaseMilli - currentItemBaseMilli));
          const maxPossibleUnits = Math.floor(maxRemainingBaseMilli / (factor * 1000));
          showStatus(
            `رصيد الصنف "${prod.name}" غير كافٍ في المخزن! المتاح حالياً: ${Math.floor(availableStockMilli / 1000)} قطعة (يمكنك إضافة ${maxPossibleUnits} ${unitName || 'قطعة'} كحد أقصى).`,
            'error'
          );
          return prev;
        }
      }

      if (existingIndex >= 0) {
        const updated = [...prev];
        const item = updated[existingIndex];
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
  }, [allowNegativeStock, showStatus]);

  const changeCartItemUnit = useCallback((index: number, newUnitId: string) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item || !item.productUnits) return prev;
      const targetUnit = item.productUnits.find(u => u.id === newUnitId);
      if (!targetUnit) return prev;

      const newFactor = targetUnit.conversionFactor > 0 ? targetUnit.conversionFactor : 1;

      // Upfront Stock Check when changing unit
      if (!allowNegativeStock) {
        const otherCartBaseMilli = prev.reduce((sum, it, i) => {
          if (i !== index && it.productId === item.productId) {
            const itFactor = it.conversionFactor && it.conversionFactor > 0 ? it.conversionFactor : 1;
            return sum + (it.quantityMilli * itFactor);
          }
          return sum;
        }, 0);
        const neededBaseMilli = item.quantityMilli * newFactor;
        const availableStockMilli = item.stockQuantityMilli ?? 0;
        if (otherCartBaseMilli + neededBaseMilli > availableStockMilli) {
          showStatus(
            `لا يمكن التحويل إلى "${targetUnit.unitName}": الكمية المطلوبة تتجاوز رصيد المخزن المتاح (${Math.floor(availableStockMilli / 1000)} قطعة)!`,
            'error'
          );
          return prev;
        }
      }

      const baseUnit = item.productUnits.find(u => u.isBaseUnit);
      const currentFactor = item.conversionFactor && item.conversionFactor > 0 ? item.conversionFactor : 1;
      const basePrice = baseUnit && baseUnit.sellPricePiasters > 0 
        ? baseUnit.sellPricePiasters 
        : Math.round(item.unitPricePiasters / currentFactor);
      const baseCost = baseUnit && baseUnit.costPricePiasters > 0 
        ? baseUnit.costPricePiasters 
        : Math.round(item.unitCostPiasters / currentFactor);

      const newPrice = targetUnit.sellPricePiasters > 0 ? targetUnit.sellPricePiasters : (basePrice * newFactor);
      const newCost = targetUnit.costPricePiasters > 0 ? targetUnit.costPricePiasters : (baseCost * newFactor);

      item.unitId = targetUnit.id;
      item.unitName = targetUnit.unitName;
      item.conversionFactor = newFactor;
      item.unit = targetUnit.unitName;
      item.unitPricePiasters = newPrice;
      item.unitCostPiasters = newCost;
      item.isDivisible = targetUnit.isDivisible;

      if (!targetUnit.isDivisible && (item.quantityMilli % 1000 !== 0)) {
        item.quantityMilli = Math.max(1000, Math.round(item.quantityMilli / 1000) * 1000);
      }

      item.totalPiasters = calculateLineTotal(item.unitPricePiasters, item.quantityMilli, item.discountPiasters);
      item.taxPiasters = calculateTaxPiasters(item.totalPiasters, item.taxRatePercent || 0, true);
      return updated;
    });
  }, [allowNegativeStock, showStatus]);

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

  // Task 24-2: Apply discount on specific item
  const handleApplyItemDiscount = useCallback((index: number, itemDiscountPiasters: number, supervisorApproved = false) => {
    setCart((prev) => {
      const updated = [...prev];
      const it = updated[index];
      if (!it) return prev;
      it.discountPiasters = itemDiscountPiasters;
      it.totalPiasters = calculateLineTotal(it.unitPricePiasters, it.quantityMilli, it.discountPiasters);
      it.taxPiasters = calculateTaxPiasters(it.totalPiasters, it.taxRatePercent || 0, true);

      const sumItemDiscounts = updated.reduce((sum, item) => sum + (item.discountPiasters || 0), 0);
      setDiscountPiasters(sumItemDiscounts);

      return updated;
    });

    if (supervisorApproved) {
      void invoke('auditLogs:create', {
        action: 'DISCOUNT_SUPERVISOR_OVERRIDE',
        entityType: 'sale_item',
        entityId: cart[index]?.productId || '',
        detailsJson: JSON.stringify({
          item: cart[index]?.productName,
          discountPiasters: itemDiscountPiasters,
          approvedBySupervisor: true,
        }),
      }).catch(() => {});
    }

    showStatus(
      itemDiscountPiasters > 0
        ? `تم تطبيق خصم ${(itemDiscountPiasters / 100).toFixed(2)} ج.م على الصنف`
        : 'تم إلغاء خصم الصنف',
      'success'
    );
  }, [cart, showStatus]);

  // Task 24-2: Apply invoice discount proportionally to all items
  const handleApplyInvoiceDiscount = useCallback((totalPiastersToDiscount: number, supervisorApproved = false) => {
    setCart((prev) => {
      if (prev.length === 0) return prev;

      const itemGrossList = prev.map((it) => ({
        grossPiasters: Math.round((it.unitPricePiasters * it.quantityMilli) / 1000),
      }));

      const distributed = distributeInvoiceDiscount(itemGrossList, totalPiastersToDiscount);

      return prev.map((it, idx) => {
        const itemDiscount = distributed[idx] || 0;
        const totalP = calculateLineTotal(it.unitPricePiasters, it.quantityMilli, itemDiscount);
        const taxP = calculateTaxPiasters(totalP, it.taxRatePercent || 0, true);
        return {
          ...it,
          discountPiasters: itemDiscount,
          totalPiasters: totalP,
          taxPiasters: taxP,
        };
      });
    });

    setDiscountPiasters(totalPiastersToDiscount);

    if (supervisorApproved) {
      void invoke('auditLogs:create', {
        action: 'INVOICE_DISCOUNT_SUPERVISOR_OVERRIDE',
        entityType: 'sale',
        entityId: '',
        detailsJson: JSON.stringify({
          discountPiasters: totalPiastersToDiscount,
          approvedBySupervisor: true,
        }),
      }).catch(() => {});
    }

    showStatus(
      totalPiastersToDiscount > 0
        ? `تم تطبيق خصم بقيمة ${(totalPiastersToDiscount / 100).toFixed(2)} ج.م وتوزيعه بالتناسب على الأصناف`
        : 'تم إلغاء خصم الفاتورة',
      'success'
    );
  }, [showStatus]);

  // Integer Piaster Math (Rule 1 & Feature #6)
  const grossSubtotalPiasters = cart.reduce(
    (sum, item) => sum + Math.round((item.unitPricePiasters * item.quantityMilli) / 1000),
    0
  );
  const totalItemDiscountsPiasters = cart.reduce((sum, item) => sum + (item.discountPiasters || 0), 0);
  const effectiveDiscountPiasters = Math.max(discountPiasters, totalItemDiscountsPiasters);
  const subtotalPiasters = grossSubtotalPiasters;
  const netTotalPiasters = Math.max(0, grossSubtotalPiasters - effectiveDiscountPiasters);
  const totalItemCount = cart.reduce((count, item) => count + (item.quantityMilli / 1000), 0);
  const totalTaxPiasters = cart.reduce((sum, item) => sum + item.taxPiasters, 0);

  const loadHeldSalesCount = useCallback(async () => {
    try {
      const list = await invoke<HeldSale[]>('sales:getHeld');
      setHeldSalesCount(Array.isArray(list) ? list.length : 0);
    } catch {
      // non-blocking
    }
  }, []);

  const handleHoldCurrentSale = useCallback(async () => {
    if (cart.length === 0) {
      showStatus('لا توجد أصناف في السلة لتعليقها', 'warning');
      return;
    }
    try {
      setLoading(true);
      const cust = customers.find(c => c.id === selectedCustomerId);
      await invoke('sales:hold', {
        items: cart,
        discountPiasters,
        customerId: selectedCustomerId || undefined,
        customerName: cust?.name,
        totalPiasters: netTotalPiasters,
      });
      setCart([]);
      setDiscountPiasters(0);
      setSelectedCustomerId('');
      try {
        localStorage.removeItem('rafiq_pos_cart_draft');
      } catch {
        // ignore
      }
      await loadHeldSalesCount();
      showStatus('تم تعليق الفاتورة بنجاح في قاعدة البيانات (F6)', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تعليق الفاتورة';
      showStatus(msg, 'error');
    } finally {
      setLoading(false);
      barcodeInputRef.current?.focus();
    }
  }, [cart, discountPiasters, selectedCustomerId, customers, netTotalPiasters, loadHeldSalesCount, showStatus]);

  const handleRecallHeldSale = useCallback((heldSale: HeldSale) => {
    let itemsToRestore: CartItem[] = [];
    if (Array.isArray(heldSale.items) && heldSale.items.length > 0) {
      itemsToRestore = heldSale.items as CartItem[];
    } else if (heldSale.cartJson) {
      try {
        const parsed = JSON.parse(heldSale.cartJson);
        if (Array.isArray(parsed)) itemsToRestore = parsed as CartItem[];
      } catch {
        // ignore
      }
    }
    if (itemsToRestore.length > 0) {
      setCart(itemsToRestore);
      setDiscountPiasters(heldSale.discountPiasters || 0);
      if (heldSale.customerId) {
        setSelectedCustomerId(heldSale.customerId);
      }
      showStatus(`تم استرجاع الفاتورة المعلقة بنجاح (${itemsToRestore.length} صنف)`, 'success');
      void loadHeldSalesCount();
      barcodeInputRef.current?.focus();
    }
  }, [loadHeldSalesCount, showStatus]);

  // Load customers for selection
  const loadCustomers = useCallback(async () => {
    try {
      const data = await invoke<Customer[]>('customers:getAll', { limit: 100 });
      setCustomers(data || []);
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  // Load Categories for POS category panel
  const loadCategories = useCallback(async () => {
    try {
      const data = await invoke<Category[]>('categories:getAll', { includeArchived: false });
      if (Array.isArray(data)) {
        setCategories(data);
      }
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  // Load Quick Items & Inventory Products (Smart Catalog)
  const loadSmartCatalog = useCallback(async () => {
    try {
      const res = await invoke<{ products?: Product[]; customQuickItems?: QuickItem[] }>('products:getSmartCatalog', { limit: 1000 }).catch(() => null);
      if (res && Array.isArray(res.products)) {
        setCatalogProducts(res.products);
        if (Array.isArray(res.customQuickItems)) {
          setQuickItems(res.customQuickItems);
        }
      } else {
        const [pData, qData] = await Promise.all([
          invoke<Product[]>('products:getAll', { limit: 1000 }).catch(() => []),
          invoke<QuickItem[]>('quickItems:getAll').catch(() => [])
        ]);
        if (Array.isArray(pData)) setCatalogProducts(pData);
        if (Array.isArray(qData)) setQuickItems(qData);
      }
    } catch {
      // Offline fallback
    }
  }, []);

  const loadQuickItems = loadSmartCatalog;

  // Automatic real-time subscriptions across all views
  useDataSubscription(['products', 'all'], () => {
    void loadSmartCatalog();
  });
  useDataSubscription(['categories', 'all'], () => {
    void loadCategories();
    void loadSmartCatalog();
  });
  useDataSubscription(['customers', 'all'], () => {
    void loadCustomers();
  });
  useDataSubscription(['held_sales', 'all'], () => {
    void loadHeldSalesCount();
  });

  const [isSeedingCatalog, setIsSeedingCatalog] = useState(false);

  const handleSeedTemplateProducts = async () => {
    setIsSeedingCatalog(true);
    try {
      const res: any = await invoke('templates:seedProducts');
      if (res && res.success) {
        showStatus(`تم تنزيل ${res.seededCount || 168} صنفاً بنجاح!`, 'success');
        await loadSmartCatalog();
      } else {
        showStatus('تعذر تنزيل كتالوج الأصناف', 'error');
      }
    } catch (err: any) {
      showStatus('حدث خطأ أثناء تنزيل الأصناف: ' + (err?.message || ''), 'error');
    } finally {
      setIsSeedingCatalog(false);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await invoke<{ products: Product[]; customQuickItems: QuickItem[] }>('products:getSmartCatalog', { limit: 1000 }).catch(() => null);
        if (!active) return;
        if (res && Array.isArray(res.products)) {
          setCatalogProducts(res.products);
          if (Array.isArray(res.customQuickItems)) {
            setQuickItems(res.customQuickItems);
          }
        } else {
          const [pData, qData] = await Promise.all([
            invoke<Product[]>('products:getAll', { limit: 1000 }).catch(() => []),
            invoke<QuickItem[]>('quickItems:getAll').catch(() => [])
          ]);
          if (!active) return;
          if (Array.isArray(pData)) setCatalogProducts(pData);
          if (Array.isArray(qData)) setQuickItems(qData);
        }
      } catch {
        // Offline fallback
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Feature #131: Load scanner settings on mount
  useEffect(() => {
    let active = true;
    void (async () => {
      const s = await loadScannerSettings();
      if (active) setScannerSettings(s);
      try {
        const appSettings = await invoke<Record<string, string>>('settings:getAll');
        if (appSettings) {
          if (appSettings.printer_auto_print !== undefined) {
            localStorage.setItem('rafiq_pos_printer_auto_print', appSettings.printer_auto_print);
          }
          if (appSettings.max_discount_percent_cashier) {
            setMaxDiscountPercentCashier(parseFloat(appSettings.max_discount_percent_cashier) || 10);
          }
          if (appSettings.max_discount_amount_cashier_piasters) {
            setMaxDiscountAmountCashierPiasters(parseInt(appSettings.max_discount_amount_cashier_piasters, 10) || 5000);
          }
          if (appSettings.allow_negative_stock !== undefined) {
            setAllowNegativeStock(appSettings.allow_negative_stock === '1' || appSettings.allow_negative_stock.toLowerCase() === 'true');
          }
        }
        const cnt = await invoke<{ nextInvoiceNumber: number }>('counters:getNextExpectedInvoiceNumber');
        if (active && cnt && cnt.nextInvoiceNumber) {
          setNextExpectedInvoiceNumber(cnt.nextInvoiceNumber);
        }
        const currentUserData = await invoke<{ role?: string }>('auth:getCurrentUser');
        if (active && currentUserData && currentUserData.role) {
          setCurrentUserRole(currentUserData.role);
        }
        void loadHeldSalesCount();
      } catch {
        // non-blocking
      }
    })();
    return () => { active = false; };
  }, [loadHeldSalesCount]);

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
      void loadSmartCatalog();
      void loadHeldSalesCount();
      try {
        localStorage.removeItem('rafiq_pos_cart_draft');
      } catch {
        // ignore
      }
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('POS Checkout Error:', err);
      let friendlyMsg = rawMsg;
      if (rawMsg.includes('SQL') || rawMsg.includes('SQLite') || rawMsg.includes('table') || rawMsg.includes('column') || rawMsg.includes('INTERNAL_ERROR')) {
        friendlyMsg = 'تعذر حفظ الفاتورة في قاعدة البيانات، يرجى إعادة المحاولة.';
      }
      if (friendlyMsg.includes('لا يمكن إتمام البيع') || friendlyMsg.includes('رصيد الصنف') || friendlyMsg.includes('غير كافٍ') || friendlyMsg.includes('غير قابلة للتجزئة')) {
        showStatus(friendlyMsg, 'error');
      } else {
        showStatus(`تعذر إتمام الفاتورة: ${friendlyMsg}`, 'error');
      }
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
    showStatus,
    loadSmartCatalog,
    loadHeldSalesCount,
  ]);

  const setDirectQuantity = useCallback((index: number, newQtyPieces: number) => {
    if (newQtyPieces <= 0) {
      setCart((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setCart((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        const item = updated[index];
        const factor = item.conversionFactor && item.conversionFactor > 0 ? item.conversionFactor : 1;

        if (!allowNegativeStock) {
          const otherCartBaseMilli = prev.reduce((sum, it, i) => {
            if (i !== index && it.productId === item.productId) {
              const itFactor = it.conversionFactor && it.conversionFactor > 0 ? it.conversionFactor : 1;
              return sum + (it.quantityMilli * itFactor);
            }
            return sum;
          }, 0);

          const neededBaseMilli = newQtyPieces * 1000 * factor;
          const availableStockMilli = item.stockQuantityMilli ?? 0;

          if (otherCartBaseMilli + neededBaseMilli > availableStockMilli) {
            const maxRemainingBaseMilli = Math.max(0, availableStockMilli - otherCartBaseMilli);
            const maxPossibleUnits = Math.floor(maxRemainingBaseMilli / (factor * 1000));
            showStatus(
              `الكمية المطلوبة (${newQtyPieces}) تتجاوز رصيد المخزن المتاح (${maxPossibleUnits} ${item.unitName || 'قطعة'})!`,
              'error'
            );
            return prev;
          }
        }

        item.quantityMilli = newQtyPieces * 1000;
        item.totalPiasters = calculateLineTotal(item.unitPricePiasters, item.quantityMilli, item.discountPiasters);
        item.taxPiasters = calculateTaxPiasters(item.totalPiasters, item.taxRatePercent || 0, true);
      }
      return updated;
    });
  }, [allowNegativeStock, showStatus]);

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  // Debounced Live Search for POS Barcode & Name Box (Task 22-4 & 22-2)
  useEffect(() => {
    const q = barcodeQuery.trim();
    if (!q || q.length < 2) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await invoke<Product[]>('products:search', { query: q, limit: 8 });
        if (Array.isArray(results) && results.length > 0) {
          setLiveSearchResults(results);
          setIsSearchDropdownOpen(true);
          setSelectedDropdownIndex(0);
        } else {
          setLiveSearchResults([]);
          setIsSearchDropdownOpen(false);
        }
      } catch {
        setLiveSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [barcodeQuery]);

  // Close live search dropdown when clicking outside
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
    void loadSmartCatalog();
    barcodeInputRef.current?.focus();
  }, [addProductToCart, showStatus, loadSmartCatalog]);

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

  // Hook 1: Catalog & Fast Items
  const {
    smartItems,
    categoryTabs,
    customItemsCount,
    popularItemsCount,
    displayedCatalogItems,
    catalogSearchQuery,
    setCatalogSearchQuery,
    activeCatalogTab,
    setActiveCatalogTab,
    handleSmartItemClick,
    openPriceItem,
    setOpenPriceItem,
    openPriceInputEgp,
    setOpenPriceInputEgp,
    handleConfirmOpenPrice,
  } = usePosCatalog({
    catalogProducts,
    quickItems,
    categories,
    addProductToCart,
    showStatus,
    barcodeInputRef,
    setInitialWeightMilli,
    setWeightModalProduct,
    setUnitPickerProduct,
  });

  // Dynamic Category Product Counts & Unified Store Categories
  const categoryProductCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    for (const item of smartItems) {
      const cName = item.categoryName?.trim() || 'عام';
      counts[cName] = (counts[cName] || 0) + 1;
      if (item.categoryId) {
        counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
      }
    }
    return counts;
  }, [smartItems]);

  const allPosCategories = useMemo<Category[]>(() => {
    const list = [...categories];
    const existingNames = new Set(list.map((c) => c.name.trim().toLowerCase()));
    for (const tab of categoryTabs) {
      if (tab.name !== 'عام' && !existingNames.has(tab.name.trim().toLowerCase())) {
        list.push({
          id: `cat_${tab.name}`,
          name: tab.name,
          displayOrder: 999,
          isActive: true,
          productCount: tab.count,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        existingNames.add(tab.name.trim().toLowerCase());
      }
    }
    return list;
  }, [categories, categoryTabs]);

  const updateQuantity = useCallback((index: number, deltaPieces: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      if (!item) return prev;
      const currentPieces = item.quantityMilli / 1000;
      const newPieces = Math.max(1, currentPieces + deltaPieces);
      const factor = item.conversionFactor && item.conversionFactor > 0 ? item.conversionFactor : 1;

      if (!allowNegativeStock && deltaPieces > 0) {
        const otherCartBaseMilli = prev.reduce((sum, it, i) => {
          if (i !== index && it.productId === item.productId) {
            const itFactor = it.conversionFactor && it.conversionFactor > 0 ? it.conversionFactor : 1;
            return sum + (it.quantityMilli * itFactor);
          }
          return sum;
        }, 0);

        const neededBaseMilli = newPieces * 1000 * factor;
        const availableStockMilli = item.stockQuantityMilli ?? 0;

        if (otherCartBaseMilli + neededBaseMilli > availableStockMilli) {
          const maxRemainingBaseMilli = Math.max(0, availableStockMilli - otherCartBaseMilli);
          const maxPossibleUnits = Math.floor(maxRemainingBaseMilli / (factor * 1000));
          showStatus(
            `لا يمكن زيادة الكمية: رصيد المخزن المتاح للصنف "${item.productName}" هو ${maxPossibleUnits} ${item.unitName || 'قطعة'} فقط!`,
            'error'
          );
          return prev;
        }
      }

      item.quantityMilli = newPieces * 1000;
      item.totalPiasters = calculateLineTotal(item.unitPricePiasters, item.quantityMilli, item.discountPiasters);
      item.taxPiasters = calculateTaxPiasters(item.totalPiasters, item.taxRatePercent || 0, true);
      return updated;
    });
  }, [allowNegativeStock, showStatus]);

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

  // Fast cash checkout (F12)
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

  // Hook 2: Cashier Keyboard Shortcuts & Hardware Scanner Listener (F1 to F12)
  usePosShortcuts({
    cart,
    loading,
    lastCompletedSale,
    scannerSettings,
    requestClearCart,
    handleFastCashCheckout,
    handleFastBarcodeScan,
    openWeightEditorForCartItem,
    handleHoldCurrentSale,
    setIsHelpModalOpen,
    barcodeInputRef,
    setQuantityModalItem,
    setQuantityInputVal,
    setIsDiscountModalOpen,
    setIsHeldSalesModalOpen,
    setIsScannerModalOpen,
    setIsReceiptOpen,
    setPaymentMethod,
    setIsReturnModalOpen,
    showStatus,
  });

  // Focus Management - Always return focus to barcode/search input
  useEffect(() => {
    const isAnyModalOpen = isPaymentModalOpen || isReceiptOpen || isClearConfirmOpen || 
      isScannerModalOpen || isQuickAddModalOpen || isQuickItemsManagerOpen || 
      isQuickFastItemModalOpen || isHelpModalOpen || isHeldSalesModalOpen || isReturnModalOpen || !!weightModalProduct || !!variantPickerParentProduct || !!unitPickerProduct;

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
    isQuickFastItemModalOpen, 
    isHelpModalOpen, 
    isHeldSalesModalOpen,
    isReturnModalOpen,
    weightModalProduct,
    variantPickerParentProduct,
    unitPickerProduct
  ]);

  return (
    <div className="flex flex-col h-full w-full bg-canvas overflow-hidden">
      {/* 1. THREE-PANE MAIN WORKSPACE */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* ================= REGION A: BARCODE SEARCH & CART TABLE ================= */}
        <section className={`${showFastItems ? 'flex-1 min-w-[360px]' : 'flex-1'} h-full bg-surface hairline-l flex flex-col overflow-hidden`}>
          <PosBarcodeBar
            searchContainerRef={searchContainerRef}
            barcodeInputRef={barcodeInputRef}
            barcodeQuery={barcodeQuery}
            setBarcodeQuery={setBarcodeQuery}
            loading={loading}
            isSearching={isSearching}
            handleBarcodeSubmit={handleBarcodeSubmit}
            handleSearchKeyDown={handleSearchKeyDown}
            onOpenScannerModal={() => setIsScannerModalOpen(true)}
            isSearchDropdownOpen={isSearchDropdownOpen}
            setIsSearchDropdownOpen={setIsSearchDropdownOpen}
            liveSearchResults={liveSearchResults}
            setLiveSearchResults={setLiveSearchResults}
            selectedDropdownIndex={selectedDropdownIndex}
            setSelectedDropdownIndex={setSelectedDropdownIndex}
            onSelectProduct={(prod, specificUnit) => {
              addProductToCart(prod, undefined, specificUnit);
              setBarcodeQuery('');
              setIsSearchDropdownOpen(false);
              showStatus(`تمت إضافة: ${prod.name}${specificUnit ? ` (${specificUnit.unitName})` : ''}`, 'success');
              barcodeInputRef.current?.focus();
            }}
          />

          <PosCartTable
            cart={cart}
            lastInvoiceNumber={lastInvoiceNumber}
            draftPrompt={draftPrompt}
            onRestoreDraft={() => {
              if (draftPrompt) {
                setCart(draftPrompt.items);
                setDiscountPiasters(draftPrompt.discountPiasters || 0);
                if (draftPrompt.customerId) setSelectedCustomerId(draftPrompt.customerId);
                setDraftPrompt(null);
                showStatus('تم استرجاع السلة المفتوحة بنجاح!', 'success');
              }
            }}
            onDiscardDraft={() => {
              localStorage.removeItem('rafiq_pos_cart_draft');
              setDraftPrompt(null);
            }}
            statusMessage={statusMessage}
            editingPriceIndex={editingPriceIndex}
            setEditingPriceIndex={setEditingPriceIndex}
            changeCartItemUnit={changeCartItemUnit}
            updateItemPrice={updateItemPrice}
            updateQuantity={updateQuantity}
            setDirectQuantity={setDirectQuantity}
            openWeightEditorForCartItem={openWeightEditorForCartItem}
            onOpenItemDiscount={(index) => {
              setSelectedDiscountItemIndex(index);
              setIsItemDiscountModalOpen(true);
            }}
            removeItem={removeItem}
          />

          {/* Bottom Grand Total Card & Fast Checkout Action Controls */}
          <PosCartCheckoutBar
            cart={cart}
            nextExpectedInvoiceNumber={nextExpectedInvoiceNumber}
            lastInvoiceNumber={lastInvoiceNumber}
            totalItemCount={totalItemCount}
            subtotalPiasters={subtotalPiasters}
            discountPiasters={discountPiasters}
            totalTaxPiasters={totalTaxPiasters}
            showTaxes={showTaxes}
            selectedCustomerId={selectedCustomerId}
            paymentMethod={paymentMethod}
            customers={customers}
            netTotalPiasters={netTotalPiasters}
            loading={loading}
            handleOpenCheckout={handleOpenCheckout}
            requestClearCart={requestClearCart}
            lastCompletedSale={lastCompletedSale}
            onOpenReceipt={() => setIsReceiptOpen(true)}
            handleHoldCurrentSale={handleHoldCurrentSale}
            heldSalesCount={heldSalesCount}
            onOpenHeldSales={() => setIsHeldSalesModalOpen(true)}
            onOpenReturnModal={() => setIsReturnModalOpen(true)}
          />
        </section>

        {/* ================= REGION B: SMART PRODUCTS & FAST ITEMS GRID ================= */}
        {showFastItems && (
          <PosCatalogPanel
            smartItems={smartItems}
            customItemsCount={customItemsCount}
            popularItemsCount={popularItemsCount}
            catalogSearchQuery={catalogSearchQuery}
            setCatalogSearchQuery={setCatalogSearchQuery}
            activeCatalogTab={activeCatalogTab}
            setActiveCatalogTab={setActiveCatalogTab}
            displayedCatalogItems={displayedCatalogItems}
            handleSmartItemClick={handleSmartItemClick}
            onOpenQuickFastItemModal={() => setIsQuickFastItemModalOpen(true)}
            onOpenQuickItemsManager={() => setIsQuickItemsManagerOpen(true)}
            totalCatalogProductsCount={catalogProducts.length}
            onSeedProducts={handleSeedTemplateProducts}
            isSeedingProducts={isSeedingCatalog}
            categories={allPosCategories}
          />
        )}

        {/* ================= REGION C: STORE CATEGORIES PANEL ================= */}
        {showFastItems && (
          <PosCategoriesPanel
            categories={allPosCategories}
            activeCatalogTab={activeCatalogTab}
            onSelectCategory={setActiveCatalogTab}
            totalProductsCount={smartItems.length}
            popularItemsCount={popularItemsCount}
            customItemsCount={customItemsCount}
            categoryProductCounts={categoryProductCounts}
            onOpenCategoryManager={() => setIsCategoryManagerOpen(true)}
          />
        )}
      </div>

      {/* 2. BOTTOM KEYBOARD & TOUCH ACTION STRIP */}
      <PosFooterBar
        onOpenHelp={() => setIsHelpModalOpen(true)}
        onFocusSearch={() => {
          barcodeInputRef.current?.focus();
          barcodeInputRef.current?.select();
        }}
        onEditLastItemQuantity={() => {
          if (cart.length > 0) {
            const lastIdx = cart.length - 1;
            const lastItem = cart[lastIdx];
            if (lastItem.unit === 'kg') {
              openWeightEditorForCartItem(lastIdx);
            } else {
              setQuantityModalItem({
                index: lastIdx,
                name: lastItem.productName,
                currentQty: lastItem.quantityMilli / 1000
              });
              setQuantityInputVal(String(lastItem.quantityMilli / 1000));
            }
          } else {
            showStatus('السلة فارغة. يرجى إضافة صنف أولاً لتعديل كميته', 'warning');
          }
        }}
        onOpenDiscountModal={() => {
          setIsDiscountModalOpen(true);
        }}
        onHoldOrShowHeld={() => {
          if (cart.length > 0) {
            void handleHoldCurrentSale();
          } else {
            setIsHeldSalesModalOpen(true);
          }
        }}
        heldSalesCount={heldSalesCount}
        onOpenReturnModal={() => setIsReturnModalOpen(true)}
        onRequestClearCart={requestClearCart}
        onOpenScannerModal={() => setIsScannerModalOpen(true)}
        onShowLastReceipt={() => {
          if (lastCompletedSale) {
            setIsReceiptOpen(true);
          } else {
            showStatus('لا توجد فاتورة سابقة لإعادة طباعتها', 'warning');
          }
        }}
        paymentMethod={paymentMethod}
        onToggleCreditPayment={() => {
          setPaymentMethod((prev) => {
            const next = prev === 'cash' ? 'credit' : 'cash';
            showStatus(next === 'credit' ? 'تم التبديل إلى البيع الآجل (F10)' : 'تم التبديل إلى الدفع النقدي (F10)', 'success');
            return next;
          });
        }}
        onFastCashCheckout={() => {
          if (cart.length > 0 && !loading) {
            void handleFastCashCheckout();
          } else if (cart.length === 0) {
            showStatus('السلة فارغة! أضف أصنافاً أولاً للبيع', 'warning');
          }
        }}
      />

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

      {/* 8. QUICK FAST ITEM MODAL (Direct creation without inventory overhead) */}
      <QuickFastItemModal
        isOpen={isQuickFastItemModalOpen}
        onClose={() => {
          setIsQuickFastItemModalOpen(false);
          barcodeInputRef.current?.focus();
        }}
        onItemAdded={(savedItem) => {
          void loadQuickItems();
          setActiveCatalogTab('__CUSTOM__');
          showStatus(`تمت إضافة الصنف السريع "${savedItem.name}" بنجاح!`, 'success');
        }}
        onOpenFullManager={() => setIsQuickItemsManagerOpen(true)}
        existingCategories={categoryTabs.map(c => c.name).filter(n => n && n !== 'الكل' && n !== 'الأكثر طلباً')}
      />

      {/* 9. OPEN PRICE NUMPAD PROMPT MODAL (Feature #20 / Task 20-5) */}
      <OpenPriceModal
        openPriceItem={openPriceItem}
        openPriceInputEgp={openPriceInputEgp}
        setOpenPriceInputEgp={setOpenPriceInputEgp}
        onClose={() => setOpenPriceItem(null)}
        onConfirm={handleConfirmOpenPrice}
      />

      {/* 10. PAYMENT & CHANGE DUE MODAL (Feature #27) */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          barcodeInputRef.current?.focus();
        }}
        invoiceNumber={nextExpectedInvoiceNumber || (lastInvoiceNumber ? lastInvoiceNumber + 1 : 1)}
        itemCount={cart.length}
        totalItemCount={totalItemCount}
        subtotalPiasters={subtotalPiasters}
        discountPiasters={discountPiasters}
        onDiscountChange={setDiscountPiasters}
        netTotalPiasters={netTotalPiasters}
        selectedCustomerId={selectedCustomerId}
        onCustomerChange={(id) => {
          setSelectedCustomerId(id);
          if (!id) setPaymentMethod('cash');
        }}
        showCredit={showCredit}
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

      {/* 12. QUICK ADD UNREGISTERED PRODUCT MODAL (Feature #106 / Task 106-1) */}
      <QuickAddProductModal
        isOpen={isQuickAddModalOpen}
        barcode={unregisteredBarcode}
        onClose={() => {
          setIsQuickAddModalOpen(false);
          setUnregisteredBarcode('');
          barcodeInputRef.current?.focus();
        }}
        onProductCreated={handleQuickProductCreated}
      />

      {/* 13. INVOICE DISCOUNT MODAL */}
      <PosInvoiceDiscountModal
        isOpen={isDiscountModalOpen}
        onClose={() => {
          setIsDiscountModalOpen(false);
          barcodeInputRef.current?.focus();
        }}
        subtotalPiasters={subtotalPiasters}
        currentUserRole={currentUserRole}
        maxDiscountPercentCashier={maxDiscountPercentCashier}
        maxDiscountAmountCashierPiasters={maxDiscountAmountCashierPiasters}
        onApplyDiscount={handleApplyInvoiceDiscount}
        onRequestSupervisor={(title, onApproved) => {
          setSupervisorPrompt({
            isOpen: true,
            title,
            onApproved: () => {
              setSupervisorPrompt((p) => ({ ...p, isOpen: false }));
              onApproved();
            },
          });
        }}
      />

      {/* 14. BRANDED QUANTITY MODAL (Replacing window.prompt for F3) */}
      <PosQuantityModal
        quantityModalItem={quantityModalItem}
        quantityInputVal={quantityInputVal}
        setQuantityInputVal={setQuantityInputVal}
        onClose={() => {
          setQuantityModalItem(null);
          barcodeInputRef.current?.focus();
        }}
        onConfirm={setDirectQuantity}
      />

      {/* Item-level Discount Modal (Feature #24 / Task 24-2) */}
      {isItemDiscountModalOpen && selectedDiscountItemIndex !== null && (
        <ItemDiscountModal
          key={`discount_item_${selectedDiscountItemIndex}`}
          isOpen={isItemDiscountModalOpen}
          item={cart[selectedDiscountItemIndex] || null}
          itemIndex={selectedDiscountItemIndex}
          userRole={currentUserRole}
          maxPercentWithoutPin={maxDiscountPercentCashier}
          maxAmountWithoutPinPiasters={maxDiscountAmountCashierPiasters}
          onClose={() => {
            setIsItemDiscountModalOpen(false);
            setSelectedDiscountItemIndex(null);
            barcodeInputRef.current?.focus();
          }}
          onApply={handleApplyItemDiscount}
          onRequestSupervisor={(actionTitle, onApproved) => {
            setSupervisorPrompt({
              isOpen: true,
              title: 'موافقة المشرف على خصم صنف',
              description: actionTitle,
              onApproved: () => {
                setSupervisorPrompt((p) => ({ ...p, isOpen: false }));
                onApproved();
              },
            });
          }}
        />
      )}

      {/* Supervisor PIN Prompt Modal (Feature #24 / Task 24-4) */}
      <SupervisorPromptModal
        isOpen={supervisorPrompt.isOpen}
        actionTitle={supervisorPrompt.title}
        actionDescription={supervisorPrompt.description}
        onApproved={(supervisorName) => {
          const cb = supervisorPrompt.onApproved;
          setSupervisorPrompt({ isOpen: false, title: '', onApproved: () => {} });
          showStatus(`تم اعتماد العملية بواسطة المشرف: ${supervisorName || 'المشرف'}`, 'success');
          cb(supervisorName);
        }}
        onCancel={() => {
          setSupervisorPrompt({ isOpen: false, title: '', onApproved: () => {} });
        }}
      />

      {/* 14. HELD SALES MODAL (Feature #25 / Tasks 25-1 to 25-5) */}
      <HeldSalesModal
        isOpen={isHeldSalesModalOpen}
        onClose={() => {
          setIsHeldSalesModalOpen(false);
          barcodeInputRef.current?.focus();
        }}
        onRecall={handleRecallHeldSale}
        onHeldSalesChanged={() => {
          void loadHeldSalesCount();
        }}
      />

      {/* 15. SALES RETURN MODAL (Feature #26 / Tasks 26-1 to 26-7) */}
      <ReturnModal
        isOpen={isReturnModalOpen}
        onClose={() => {
          setIsReturnModalOpen(false);
          barcodeInputRef.current?.focus();
        }}
        onReturnCompleted={(ret) => {
          showStatus(`تم تسجيل المرتجع رقم #${ret.returnNumber} بقيمة ${formatArabicCurrency(ret.totalPiasters)}`, 'success');
        }}
      />

      {/* 16. VARIANT PICKER MODAL (Feature #114 / Task 114-5) */}
      <ProductVariantPickerModal
        isOpen={variantPickerParentProduct !== null}
        onClose={() => {
          setVariantPickerParentProduct(null);
          barcodeInputRef.current?.focus();
        }}
        parentProduct={variantPickerParentProduct}
        onSelectVariant={(variantProd) => {
          addProductToCart(variantProd);
          showStatus(`تمت إضافة: ${variantProd.name}`, 'success');
        }}
      />

      {/* 17. UNIT PICKER MODAL (Feature #175 / Task 175-2) */}
      <ProductUnitPickerModal
        isOpen={unitPickerProduct !== null}
        onClose={() => {
          setUnitPickerProduct(null);
          barcodeInputRef.current?.focus();
        }}
        product={unitPickerProduct}
        onSelectUnit={(selectedUnit) => {
          if (unitPickerProduct) {
            addProductToCart(unitPickerProduct, undefined, selectedUnit);
            showStatus(`تمت إضافة: ${unitPickerProduct.name} (${selectedUnit.unitName})`, 'success');
          }
          setUnitPickerProduct(null);
          barcodeInputRef.current?.focus();
        }}
      />

      {/* 18. CATEGORY MANAGER MODAL */}
      {isCategoryManagerOpen && (
        <CategoryManagerModal
          onClose={() => {
            setIsCategoryManagerOpen(false);
            barcodeInputRef.current?.focus();
          }}
          onCategoriesChanged={() => {
            void loadCategories();
            void loadSmartCatalog();
          }}
        />
      )}
    </div>
  );
};
