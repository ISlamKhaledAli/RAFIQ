import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { FormEvent } from 'react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import { extractProducts, type Product, type ProductBatch, type Sale, type Customer, type QuickItem, type SalePayment, type ProductUnit, type HeldSale, type Category, type DigitalAccount, type Shift } from '../types/models';
import { 
  formatArabicCurrency, 
  calculateLineTotal, 
  calculateTaxPiasters 
} from '../utils/money';
import { ReceiptModal } from '../components/ReceiptModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { UndoToast } from '../components/UndoToast';
import { WeightInputModal } from '../components/WeightInputModal';
import { QuickItemsManagerModal } from '../components/QuickItemsManagerModal';
import { QuickFastItemModal } from '../components/QuickFastItemModal';
import { PaymentModal } from '../components/PaymentModal';
import { DigitalPaymentModal } from '../components/DigitalPaymentModal';
import { BarcodeScannerSettingsModal } from '../components/BarcodeScannerSettingsModal';
import { QuickAddProductModal } from '../components/QuickAddProductModal';
import { KeyboardShortcutsModal } from '../components/KeyboardShortcutsModal';
import { ItemDiscountModal } from '../components/ItemDiscountModal';
import { SupervisorPromptModal } from '../components/SupervisorPromptModal';
import { HeldSalesModal } from '../components/HeldSalesModal';
import { ReturnModal } from '../components/ReturnModal';
import { ProductVariantPickerModal } from '../components/ProductVariantPickerModal';
import { ProductVariantMatrixModal } from '../components/ProductVariantMatrixModal';
import { ProductUnitPickerModal } from '../components/ProductUnitPickerModal';
import { ExpenseModal } from '../components/ExpenseModal';
import { 
  convertArabicLayoutToBarcode,
  loadScannerSettings,
  type BarcodeScannerSettings, 
  DEFAULT_SCANNER_SETTINGS 
} from '../utils/barcodeReader';
import { parseScaleBarcode } from '../utils/scaleBarcode';
import { useFeatures } from '../context/useFeatures';
import { useAuth } from '../context/useAuth';

// Modular POS Subcomponents & Hooks
import type { CartItem } from './pos/types';
import { PosBarcodeBar } from './pos/PosBarcodeBar';
import { PosCartTable } from './pos/PosCartTable';
import { PosCatalogPanel } from './pos/PosCatalogPanel';
import { PosCartCheckoutBar } from './pos/PosCartCheckoutBar';
import { PosCategoriesPanel } from './pos/PosCategoriesPanel';
import { OpenPriceModal } from './pos/OpenPriceModal';
import { PosQuantityModal } from './pos/PosQuantityModal';
import { PosInvoiceDiscountModal } from './pos/PosInvoiceDiscountModal';
import { BatchSelectionModal } from './pos/BatchSelectionModal';
import { usePosCatalog } from './pos/usePosCatalog';
import { usePosShortcuts } from './pos/usePosShortcuts';
import { QuickShortageModal } from '../components/QuickShortageModal';
import { DrugAlternativesDrawer } from './pos/DrugAlternativesDrawer';
import { ControlledDrugDispenseModal } from './pos/ControlledDrugDispenseModal';
import type { ControlledDrugDispense, DrugReferenceItem, CartInteractionCheckResult } from '../types/pharma';
import { InsurancePrescriptionModal } from './pos/InsurancePrescriptionModal';
import type { InsuranceClaimLine } from '../types/insurance';
import { ShieldAlert } from 'lucide-react';
import { PosChronicDispenseModal } from './pos/PosChronicDispenseModal';
import { ClinicalAllergyAlertModal } from './pos/ClinicalAllergyAlertModal';
import type { AllergyCheckResult } from '../types/patient';
import { DosageLabelModal } from '../components/DosageLabelModal';
import { DrugInteractionAlertModal } from './pos/DrugInteractionAlertModal';
import { DrugInteractionManagerModal } from '../components/DrugInteractionManagerModal';
import { PosOrderModeBar } from './pos/PosOrderModeBar';
import { FloorTablesModal } from './pos/FloorTablesModal';
import { ItemModifiersModal } from './pos/ItemModifiersModal';
import { DeliveryCommandModal } from './pos/DeliveryCommandModal';
import type {
  OrderMode,
  RestaurantTable,
  ModifierGroup,
  SaleItemModifier,
  DeliveryOrderCreateInfo,
} from '../types/cafe';

export interface PosViewProps {
  isActive?: boolean;
  onNavigateToEpay?: () => void;
  onNavigateToWallets?: (subTab?: 'accounts' | 'transact') => void;
}

export const PosView: React.FC<PosViewProps> = ({ isActive = true, onNavigateToEpay, onNavigateToWallets }) => {
  const { hasPermission, isAdmin } = useAuth();
  const { isEnabled } = useFeatures();
  const showFastItems = isEnabled('feature_fast_buttons');
  const showCredit = isEnabled('feature_credit_debts');
  const showTaxes = isEnabled('feature_taxes');
  const isDdiActive = isEnabled('feature_drug_interactions') || isEnabled('feature_pharmacy');
  const showCafeMode = isEnabled('feature_cafe_restaurant');
  const showTableManagement = showCafeMode && isEnabled('feature_table_management');
  const showKitchenPrinter = showCafeMode && isEnabled('feature_kitchen_printer');
  const showItemModifiers = showCafeMode && isEnabled('feature_item_modifiers');
  const showDeliveryManagement = showCafeMode && isEnabled('feature_delivery_management');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [discountPiasters, setDiscountPiasters] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [quickItems, setQuickItems] = useState<QuickItem[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [isQuickItemsManagerOpen, setIsQuickItemsManagerOpen] = useState(false);
  const [isQuickFastItemModalOpen, setIsQuickFastItemModalOpen] = useState(false);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState<number | null>(null);
  const [nextExpectedInvoiceNumber, setNextExpectedInvoiceNumber] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash');
  const [digitalAccounts, setDigitalAccounts] = useState<DigitalAccount[]>([]);
  const [storeInstapayAddress, setStoreInstapayAddress] = useState('');
  const [storeWalletNumber, setStoreWalletNumber] = useState('');
  const [isDigitalPaymentModalOpen, setIsDigitalPaymentModalOpen] = useState(false);
  const [digitalPaymentMethod, setDigitalPaymentMethod] = useState<'instapay' | 'vodafone_cash'>('instapay');
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
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [requireOpenShiftToSell, setRequireOpenShiftToSell] = useState<boolean>(true);
  const [unregisteredBarcode, setUnregisteredBarcode] = useState('');
  const [quickAddInitialName, setQuickAddInitialName] = useState('');
  const [quickAddInitialPrice, setQuickAddInitialPrice] = useState('');
  const [isQuickAddFromDrugRef, setIsQuickAddFromDrugRef] = useState(false);
  const [isQuickShortageOpen, setIsQuickShortageOpen] = useState(false);
  const [shortageInitialName, setShortageInitialName] = useState('');
  const [shortageInitialProductId, setShortageInitialProductId] = useState('');
  const [isAlternativesDrawerOpen, setIsAlternativesDrawerOpen] = useState(false);
  const [alternativesProductId, setAlternativesProductId] = useState<string>('');
  const [alternativesProductName, setAlternativesProductName] = useState<string>('');
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
  const [weightModalProduct, setWeightModalProduct] = useState<{
    id?: string;
    name: string;
    pricePiasters: number;
    barcode?: string | null;
    unit?: string;
    editingCartIndex?: number;
  } | null>(null);
  const [initialWeightMilli, setInitialWeightMilli] = useState<number>(1000);
  const [batchPickerState, setBatchPickerState] = useState<{
    cartIndex: number;
    productId: string;
    productName: string;
    currentBatchId?: string;
  } | null>(null);
  const [controlledDispenseModalItem, setControlledDispenseModalItem] = useState<{
    item: CartItem;
    index: number;
  } | null>(null);
  const [activeInsuranceClaim, setActiveInsuranceClaim] = useState<InsuranceClaimLine | null>(null);
  const [isInsuranceModalOpen, setIsInsuranceModalOpen] = useState(false);
  const [isChronicDispenseOpen, setIsChronicDispenseOpen] = useState(false);
  const [allergyCheckResult, setAllergyCheckResult] = useState<AllergyCheckResult | null>(null);
  const [isAllergyModalOpen, setIsAllergyModalOpen] = useState(false);
  const [dosageLabelTarget, setDosageLabelTarget] = useState<{
    drugName: string;
    patientName?: string;
    doctorName?: string;
    instructions?: string;
    storage?: string;
  } | null>(null);
  const [ddiResult, setDdiResult] = useState<CartInteractionCheckResult | null>(null);
  const [isDdiModalOpen, setIsDdiModalOpen] = useState(false);
  const [isDdiOverridden, setIsDdiOverridden] = useState(false);
  const [isDdiManagerOpen, setIsDdiManagerOpen] = useState(false);

  // Cafe & Restaurant Hospitality POS Suite State (Milestone 14 / Stories 139-143)
  const [orderType, setOrderType] = useState<OrderMode>('takeaway');
  const [activeTable, setActiveTable] = useState<RestaurantTable | null>(null);
  const [occupiedTablesCount, setOccupiedTablesCount] = useState<number>(0);
  const [isFloorModalOpen, setIsFloorModalOpen] = useState(false);
  const [tableSaving, setTableSaving] = useState(false);
  const [kotPrinting, setKotPrinting] = useState(false);
  const [serviceChargePercent, setServiceChargePercent] = useState<number>(0);
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryOrderCreateInfo | null>(null);
  const [activeDeliveryOrdersCount, setActiveDeliveryOrdersCount] = useState<number>(0);
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [deliveryModalTab, setDeliveryModalTab] = useState<'order_setup' | 'active_orders' | 'rider_settlement' | 'zones_riders'>('order_setup');
  const [modifierModalState, setModifierModalState] = useState<{
    isOpen: boolean;
    cartIndex: number;
    productName: string;
    basePricePiasters: number;
    groups: ModifierGroup[];
    initialModifiers?: SaleItemModifier[];
    initialNotes?: string;
  } | null>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Synchronous Mutex & Checkout Idempotency (Anti-Spam / Anti-Race F12 Guard)
  const isCheckingOutRef = useRef(false);
  const supervisorPinRef = useRef<string | null>(null);
  const cartSessionIdRef = useRef<string>('cart_initial_session');
  const addProductToCartRef = useRef<(prod: Product, customWeightMilli?: number, specificUnit?: ProductUnit, isExpiredBypassed?: boolean) => boolean>(() => false);

  const resetCartSession = useCallback(() => {
    cartSessionIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `cart_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    supervisorPinRef.current = null;
    isCheckingOutRef.current = false;
  }, []);

  useEffect(() => {
    resetCartSession();
  }, [resetCartSession]);

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
  const [showVariantMatrixModal, setShowVariantMatrixModal] = useState(false);

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
    setActiveInsuranceClaim(null);
    setAllergyCheckResult(null);
    setIsAllergyModalOpen(false);
    setDdiResult(null);
    setIsDdiOverridden(false);
    setIsDdiModalOpen(false);
    setIsDdiManagerOpen(false);
    try {
      localStorage.removeItem('rafiq_pos_cart_draft');
    } catch {
      // ignore
    }
    showStatus('تم إلغاء الفاتورة ومسح السلة بالكامل', 'success');
    barcodeInputRef.current?.focus();
  };

  const addProductToCart = useCallback((
    prod: Product, 
    customWeightMilli?: number, 
    specificUnit?: ProductUnit, 
    isExpiredBypassed?: boolean
  ): boolean => {
    // If this product has variants (matrix parent), prompt variant picker modal
    if (prod.hasVariants) {
      setVariantPickerParentProduct(prod);
      return false;
    }

    // FEFO / Expiry Check: Block expired products unless supervisor bypasses (Requirement 2)
    if (isEnabled('feature_expiry_dates') && prod.isExpired && !isExpiredBypassed) {
      setSupervisorPrompt({
        isOpen: true,
        title: 'بيع صنف منتهي الصلاحية',
        description: `الصنف "${prod.name}" منتهي الصلاحية بتاريخ (${prod.nearestExpiryDate || 'سابق'}). البيع محظور نظاماً إلا بتخطي واعتماد إداري موثق. هل تريد المتابعة؟`,
        onApproved: () => {
          addProductToCartRef.current(prod, customWeightMilli, specificUnit, true);
        },
      });
      return false;
    }

    if (isEnabled('feature_expiry_dates') && prod.isExpired && isExpiredBypassed) {
      showStatus(`تم اعتماد إضافة الصنف المنتهي "${prod.name}" للسلة بتصريح إداري موثق.`, 'warning');
    }

    let unitToUse = specificUnit;
    if (!unitToUse && prod.units && prod.units.length > 0) {
      if (prod.defaultSaleUnitId) {
        unitToUse = prod.units.find(u => u.id === prod.defaultSaleUnitId);
      }
      if (!unitToUse && prod.isLooseSellable === false && prod.units.length > 1) {
        const nonBase = prod.units.filter(u => !u.isBaseUnit);
        unitToUse = nonBase.sort((a, b) => b.conversionFactor - a.conversionFactor)[0];
      }
      if (!unitToUse) {
        unitToUse = prod.units.find(u => u.isBaseUnit) || prod.units[0];
      }
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
      return false;
    }

    const qtyMilli = customWeightMilli !== undefined ? customWeightMilli : 1000;
    const factor = unitToUse && unitToUse.conversionFactor > 0 ? unitToUse.conversionFactor : 1;
    const baseSellingPrice = (isEnabled('feature_batch_pricing') && prod.suggestedBatchSellPricePiasters && prod.suggestedBatchSellPricePiasters > 0)
      ? prod.suggestedBatchSellPricePiasters
      : prod.pricePiasters;
    const unitPrice = unitToUse 
      ? (unitToUse.sellPricePiasters > 0 ? unitToUse.sellPricePiasters : baseSellingPrice * factor)
      : baseSellingPrice;
    const unitCost = unitToUse 
      ? (unitToUse.costPricePiasters > 0 ? unitToUse.costPricePiasters : prod.costPiasters * factor)
      : prod.costPiasters;
    const unitName = unitToUse ? unitToUse.unitName : prod.unit;
    const unitId = unitToUse ? unitToUse.id : undefined;
    const isDivisible = unitToUse ? unitToUse.isDivisible : (prod.unit === 'kg');

    // Upfront Zero-Stock & Insufficient Stock Prevention against current cart
    const existingBaseMilli = cart.reduce((sum, item) => {
      if (item.productId === prod.id) {
        const itemFactor = item.conversionFactor && item.conversionFactor > 0 ? item.conversionFactor : 1;
        return sum + (item.quantityMilli * itemFactor);
      }
      return sum;
    }, 0);

    const existingIndex = cart.findIndex((item) => 
      item.productId === prod.id && 
      (item.unitId || '') === (unitId || '') &&
      item.unitPricePiasters === unitPrice &&
      item.productName === prod.name
    );

    const currentItemBaseMilli = existingIndex >= 0 
      ? cart[existingIndex].quantityMilli * (cart[existingIndex].conversionFactor || 1)
      : 0;

    const newQty = existingIndex >= 0 
      ? (customWeightMilli !== undefined ? (cart[existingIndex].quantityMilli + customWeightMilli) : (cart[existingIndex].quantityMilli + 1000))
      : qtyMilli;

    const newItemBaseMilli = newQty * factor;
    const totalRequestedBaseMilli = (existingBaseMilli - currentItemBaseMilli) + newItemBaseMilli;
    const availableStockMilli = prod.stockQuantityMilli ?? 0;

    if (!allowNegativeStock) {
      if (availableStockMilli <= 0) {
        if (isEnabled('feature_pharmacy')) {
          showStatus(`الصنف "${prod.name}" رصيده في المخزن 0 (نافد)! تم فتح محرك البدائل المتوفرة لاختيار بديل مناسب.`, 'warning');
          setAlternativesProductId(prod.id);
          setAlternativesProductName(prod.name);
          setIsAlternativesDrawerOpen(true);
        } else {
          showStatus(`الصنف "${prod.name}" رصيده في المخزن 0 (نفد تماماً وغير متوفر للبيع)!`, 'error');
        }
        return false;
      }
      if (totalRequestedBaseMilli > availableStockMilli) {
        const maxRemainingBaseMilli = Math.max(0, availableStockMilli - (existingBaseMilli - currentItemBaseMilli));
        const maxPossibleUnits = Math.floor(maxRemainingBaseMilli / (factor * 1000));
        showStatus(
          `رصيد الصنف "${prod.name}" غير كافٍ في المخزن! المتاح حالياً: ${Math.floor(availableStockMilli / 1000)} قطعة (يمكنك إضافة ${maxPossibleUnits} ${unitName || 'قطعة'} كحد أقصى).`,
          'error'
        );
        return false;
      }
    }

    setCart((prev) => {
      const idx = prev.findIndex((item) => 
        item.productId === prod.id && 
        (item.unitId || '') === (unitId || '') &&
        item.unitPricePiasters === unitPrice &&
        item.productName === prod.name &&
        (item.isExpiredBypass || false) === (!!isExpiredBypassed)
      );

      if (idx >= 0) {
        const updated = [...prev];
        const item = updated[idx];
        const updatedQty = customWeightMilli !== undefined ? (item.quantityMilli + customWeightMilli) : (item.quantityMilli + 1000);
        item.quantityMilli = updatedQty;
        item.unit = unitName;
        item.unitName = unitName;
        item.unitId = unitId;
        item.conversionFactor = factor;
        item.isDivisible = isDivisible;
        item.totalPiasters = calculateLineTotal(item.unitPricePiasters, updatedQty, item.discountPiasters);
        item.taxPiasters = calculateTaxPiasters(item.totalPiasters, item.taxRatePercent || 0, true);
        return updated;
      }

      const totalPiasters = calculateLineTotal(unitPrice, qtyMilli, 0);
      const taxRate = prod.taxRatePercent || 0;
      const isControlled = Boolean(prod.isControlled || (prod.controlledSchedule && prod.controlledSchedule !== 'none') || prod.rxStatus === 'controlled');
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
        isDivisible: isDivisible,
        batchId: prod.suggestedBatchId || undefined,
        batchNumber: prod.suggestedBatchNumber || undefined,
        expiryDate: prod.nearestExpiryDate || undefined,
        isExpiredBypass: !!isExpiredBypassed,
        isColdChain: Boolean(prod.isColdChain),
        locationCode: prod.locationCode || null,
        isControlled,
        controlledSchedule: prod.controlledSchedule || undefined,
      };

      if (isControlled) {
        setTimeout(() => {
          setControlledDispenseModalItem({ item: newItem, index: 0 });
        }, 80);
      }

      return [newItem, ...prev];
    });

    if (showItemModifiers && prod.id) {
      void invoke<ModifierGroup[]>('modifiers:getForProduct', { productId: prod.id })
        .then((groups) => {
          if (Array.isArray(groups) && groups.length > 0) {
            setModifierModalState({
              isOpen: true,
              cartIndex: 0,
              productName: prod.name,
              basePricePiasters: unitPrice,
              groups,
              initialModifiers: [],
              initialNotes: '',
            });
          }
        })
        .catch(() => {
          // non-blocking
        });
    }

    return true;
  }, [cart, allowNegativeStock, showStatus, isEnabled, showItemModifiers]);

  useEffect(() => {
    addProductToCartRef.current = addProductToCart;
  }, [addProductToCart]);

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

  // Feature #183 / Task 183-5: Cycle unit of cart line with shortcut '/'
  const cycleCartItemUnit = useCallback((targetIndex?: number) => {
    if (cart.length === 0) return;
    const idx = targetIndex !== undefined ? targetIndex : cart.length - 1;
    const item = cart[idx];
    if (!item || !item.productUnits || item.productUnits.length <= 1) {
      showStatus('الصنف الحالي لا يحتوي على وحدات تعبئة أخرى', 'warning');
      return;
    }

    if (hasPermission && !hasPermission('pos.change_unit') && !isAdmin) {
      showStatus('ليس لديك صلاحية لتبديل وحدة البيع في الكاشير', 'warning');
      return;
    }

    const units = item.productUnits;
    const currentIdx = units.findIndex(u => (u.id && u.id === item.unitId) || (u.unitName === item.unitName));
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % units.length : 0;
    const nextUnit = units[nextIdx];
    if (nextUnit && nextUnit.id) {
      changeCartItemUnit(idx, nextUnit.id);
      showStatus(`تم تبديل الوحدة إلى: ${nextUnit.unitName} (${(nextUnit.sellPricePiasters / 100).toFixed(2)} ج.م)`, 'success');
    }
  }, [cart, changeCartItemUnit, showStatus, hasPermission, isAdmin]);

  // Task 24-2: Apply discount on specific item
  const handleApplyItemDiscount = useCallback((index: number, itemDiscountPiasters: number, _supervisorApproved = false) => {
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

    showStatus(
      itemDiscountPiasters > 0
        ? `تم تطبيق خصم ${formatArabicCurrency(itemDiscountPiasters)} على الصنف`
        : 'تم إلغاء خصم الصنف',
      'success'
    );
  }, [showStatus]);

  // Task 24-2: Apply invoice discount (F-01 & C3: No item mutation, clean single source of truth)
  const handleApplyInvoiceDiscount = useCallback((totalPiastersToDiscount: number, _supervisorApproved = false) => {
    setDiscountPiasters(totalPiastersToDiscount);

    showStatus(
      totalPiastersToDiscount > 0
        ? `تم تطبيق خصم على الفاتورة بقيمة ${formatArabicCurrency(totalPiastersToDiscount)}`
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
  const totalDiscountPiasters = totalItemDiscountsPiasters + discountPiasters;
  const subtotalPiasters = grossSubtotalPiasters;
  const standardNetTotalPiasters = Math.max(0, grossSubtotalPiasters - totalDiscountPiasters);
  const serviceChargePiasters = (showCafeMode && orderType === 'dine_in' && serviceChargePercent > 0)
    ? Math.round((standardNetTotalPiasters * serviceChargePercent) / 100)
    : 0;
  const deliveryFeePiasters = (showCafeMode && orderType === 'delivery' && deliveryInfo)
    ? (deliveryInfo.deliveryFeePiasters || 0)
    : 0;
  const netTotalPiasters = activeInsuranceClaim
    ? activeInsuranceClaim.patientPiasters
    : (standardNetTotalPiasters + serviceChargePiasters + deliveryFeePiasters);
  const totalItemCount = cart.reduce((count, item) => count + (item.quantityMilli / 1000), 0);
  const totalTaxPiasters = cart.reduce((sum, item) => sum + item.taxPiasters, 0);

  // Cafe & Restaurant Hospitality POS Suite Helpers (Stories 139-143)
  const loadCafeStats = useCallback(async () => {
    if (!showCafeMode) return;
    try {
      if (showTableManagement) {
        const tables = await invoke<RestaurantTable[]>('tables:getAll').catch(() => []);
        if (Array.isArray(tables)) {
          setOccupiedTablesCount(tables.filter((t) => t.status === 'occupied' || t.status === 'bill_printed').length);
        }
      }
      if (showDeliveryManagement) {
        const delivOrders = await invoke<unknown[]>('delivery:getOrders', { status: 'all' }).catch(() => []);
        if (Array.isArray(delivOrders)) {
          const activeCount = delivOrders.filter((o) => {
            const st = (o as { deliveryStatus?: string }).deliveryStatus;
            return st && st !== 'settled' && st !== 'cancelled';
          }).length;
          setActiveDeliveryOrdersCount(activeCount);
        }
      }
    } catch {
      // non-blocking
    }
  }, [showCafeMode, showTableManagement, showDeliveryManagement]);

  useEffect(() => {
    void loadCafeStats();
  }, [loadCafeStats]);

  useDataSubscription(['held_sales', 'sales', 'all'], () => {
    void loadCafeStats();
  });

  const handleOpenItemModifiersForCartIndex = useCallback(async (index: number) => {
    const it = cart[index];
    if (!it) return;
    try {
      const groups = await invoke<ModifierGroup[]>('modifiers:getForProduct', { productId: it.productId }).catch(() => []);
      const existingModsSum = (it.modifiers || []).reduce((s, m) => s + (m.extraPricePiasters || 0), 0);
      const basePrice = Math.max(0, it.unitPricePiasters - existingModsSum);
      setModifierModalState({
        isOpen: true,
        cartIndex: index,
        productName: it.productName,
        basePricePiasters: basePrice,
        groups: Array.isArray(groups) ? groups : [],
        initialModifiers: it.modifiers || [],
        initialNotes: it.notes || '',
      });
    } catch {
      // non-blocking
    }
  }, [cart]);

  const handleConfirmItemModifiers = useCallback((modifiers: SaleItemModifier[], notes: string) => {
    if (!modifierModalState) return;
    const { cartIndex, basePricePiasters } = modifierModalState;
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[cartIndex];
      if (!item) return prev;
      const modsSum = modifiers.reduce((s, m) => s + (m.extraPricePiasters || 0), 0);
      const newUnitPrice = basePricePiasters + modsSum;
      const newTotal = calculateLineTotal(newUnitPrice, item.quantityMilli, item.discountPiasters || 0);
      const newTax = calculateTaxPiasters(newTotal, item.taxRatePercent || 0, true);
      updated[cartIndex] = {
        ...item,
        unitPricePiasters: newUnitPrice,
        totalPiasters: newTotal,
        taxPiasters: newTax,
        modifiers,
        notes: notes || undefined,
      };
      return updated;
    });
    setModifierModalState(null);
    barcodeInputRef.current?.focus();
  }, [modifierModalState]);

  const handleSelectTableFromModal = useCallback((table: RestaurantTable, parsedCart: CartItem[]) => {
    setOrderType('dine_in');
    setActiveTable(table);
    setCart(Array.isArray(parsedCart) ? parsedCart : []);
    setDiscountPiasters(0);
    resetCartSession();
    void loadCafeStats();
    showStatus(`تم تحديد طاولة: ${table.name} (${table.guestsCount || 1} ضيوف)`, 'success');
  }, [resetCartSession, loadCafeStats, showStatus]);

  const handleLoadSplitCartForCheckout = useCallback((sourceTable: RestaurantTable, splitItems: CartItem[]) => {
    setOrderType('dine_in');
    setActiveTable(null);
    setCart(Array.isArray(splitItems) ? splitItems : []);
    setDiscountPiasters(0);
    resetCartSession();
    void loadCafeStats();
    showStatus(`تم تحميل الأصناف المفصولة من طاولة (${sourceTable.name}) للمحاسبة المباشرة`, 'success');
  }, [resetCartSession, loadCafeStats, showStatus]);

  const handleSaveTableOrder = useCallback(async () => {
    if (!activeTable) {
      setIsFloorModalOpen(true);
      return;
    }
    if (cart.length === 0) {
      showStatus('سلة الطلب فارغة! أضف أصنافاً أولاً لحفظ طلب الطاولة.', 'warning');
      return;
    }
    setTableSaving(true);
    try {
      const updatedSale = await invoke<HeldSale>('tables:updateOrder', {
        tableId: activeTable.id,
        cartJson: JSON.stringify(cart),
        subtotalPiasters,
        discountPiasters,
        serviceChargePiasters,
        totalPiasters: netTotalPiasters,
        itemsCount: cart.length,
        guestsCount: activeTable.guestsCount || 1,
        waiterName: activeTable.waiterName || null,
      });
      if (updatedSale && updatedSale.id) {
        setActiveTable((prev) => (prev ? { ...prev, activeHeldSaleId: updatedSale.id, currentTotalPiasters: netTotalPiasters } : null));
      }
      void loadCafeStats();
      showStatus(`تم حفظ وتحديث طلب طاولة (${activeTable.name}) بنجاح!`, 'success');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'تعذر حفظ طلب الطاولة', 'error');
    } finally {
      setTableSaving(false);
    }
  }, [activeTable, cart, subtotalPiasters, discountPiasters, serviceChargePiasters, netTotalPiasters, loadCafeStats, showStatus]);

  const handlePrintTablePreBill = useCallback(async () => {
    if (!activeTable) return;
    try {
      await handleSaveTableOrder();
      await invoke('tables:printPreBill', { tableId: activeTable.id });
      showStatus(`تمت طباعة الشيك المبدئي لطاولة (${activeTable.name})`, 'success');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'تعذر طباعة الشيك المبدئي', 'error');
    }
  }, [activeTable, handleSaveTableOrder, showStatus]);

  const handlePrintKitchenKOT = useCallback(async () => {
    if (cart.length === 0) {
      showStatus('لا توجد أصناف في السلة لإرسالها للمطبخ', 'warning');
      return;
    }
    setKotPrinting(true);
    try {
      let currentHeldId = activeTable?.activeHeldSaleId || null;
      if (orderType === 'dine_in' && activeTable && !currentHeldId) {
        const saved = await invoke<HeldSale>('tables:updateOrder', {
          tableId: activeTable.id,
          cartJson: JSON.stringify(cart),
          subtotalPiasters,
          discountPiasters,
          serviceChargePiasters,
          totalPiasters: netTotalPiasters,
          itemsCount: cart.length,
          guestsCount: activeTable.guestsCount || 1,
          waiterName: activeTable.waiterName || null,
        });
        currentHeldId = saved?.id || null;
        if (currentHeldId) {
          setActiveTable((prev) => (prev ? { ...prev, activeHeldSaleId: currentHeldId } : null));
        }
      }

      const res = await invoke<{ printedCount: number; message: string }>('printer:printKOT', {
        heldSaleId: currentHeldId,
        orderType,
        tableName: activeTable?.name || '',
        waiterName: activeTable?.waiterName || '',
        callNumber: nextExpectedInvoiceNumber ? (nextExpectedInvoiceNumber % 100 || 100) : 1,
        items: cart,
      });

      // Mark items in local cart as kotPrintedQtyMilli = quantityMilli so subsequent KOT only sends delta
      setCart((prev) =>
        prev.map((it) => ({
          ...it,
          kotPrintedQtyMilli: it.quantityMilli,
        }))
      );
      showStatus(res?.message || 'تم إرسال أوردر المطبخ والبار (KOT) بنجاح!', 'success');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'تعذر طباعة تذكرة المطبخ KOT', 'error');
    } finally {
      setKotPrinting(false);
    }
  }, [cart, activeTable, orderType, subtotalPiasters, discountPiasters, serviceChargePiasters, netTotalPiasters, nextExpectedInvoiceNumber, showStatus]);

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
    // Story 131: Disallow holding sales with controlled drugs
    if (cart.some(i => i.isControlled)) {
      showStatus('غير مسموح بتعليق فواتير تحتوي على أدوية جدول أو رقابة صيدلية طبقاً للقانون واللوائح', 'error');
      return;
    }
    try {
      setLoading(true);
      const cust = customers.find(c => c.id === selectedCustomerId);
      await invoke('sales:hold', {
        items: cart,
        cartJson: JSON.stringify(cart),
        itemsCount: cart.length,
        subtotalPiasters,
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
  }, [cart, subtotalPiasters, discountPiasters, selectedCustomerId, customers, netTotalPiasters, loadHeldSalesCount, showStatus]);

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
      // Scenario 1: Refresh prices from catalog if changed while on hold, preserving weights & discounts
      let priceChangedCount = 0;
      const priceChangeNotes: string[] = [];
      const refreshedItems = itemsToRestore.map((it) => {
        const liveProd = catalogProducts.find((p) => p.id === it.productId);
        if (liveProd && liveProd.pricePiasters > 0) {
          let expectedUnitPrice = liveProd.pricePiasters;
          if (it.conversionFactor && it.conversionFactor > 1) {
            expectedUnitPrice = liveProd.pricePiasters * it.conversionFactor;
          }
          if (it.unitPricePiasters !== expectedUnitPrice) {
            priceChangedCount++;
            priceChangeNotes.push(`${it.productName || liveProd.name}: من ${(it.unitPricePiasters / 100).toFixed(2)} إلى ${(expectedUnitPrice / 100).toFixed(2)} ج.م`);
            const newTotal = calculateLineTotal(expectedUnitPrice, it.quantityMilli, it.discountPiasters || 0);
            const newTax = calculateTaxPiasters(newTotal, it.taxRatePercent || 0, true);
            return {
              ...it,
              unitPricePiasters: expectedUnitPrice,
              totalPiasters: newTotal,
              taxPiasters: newTax,
            };
          }
        }
        return it;
      });

      setCart(refreshedItems);
      setDiscountPiasters(heldSale.discountPiasters || 0);
      if (heldSale.customerId) {
        setSelectedCustomerId(heldSale.customerId);
      }
      resetCartSession();
      if (priceChangedCount > 0) {
        showStatus(
          `تم استرجاع الفاتورة المعلقة وتحديث أسعار ${priceChangedCount} صنف لأسعار الكتالوج الحالية (${priceChangeNotes.slice(0, 2).join('، ')})`,
          'warning'
        );
      } else {
        showStatus(`تم استرجاع الفاتورة المعلقة بنجاح (${refreshedItems.length} صنف)`, 'success');
      }
      void loadHeldSalesCount();
      barcodeInputRef.current?.focus();
    }
  }, [catalogProducts, loadHeldSalesCount, resetCartSession, showStatus]);

  // Load customers for selection
  const loadCustomers = useCallback(async () => {
    try {
      const data = await invoke<Customer[]>('customers:getAll', { limit: 100 });
      const map = new Map<string, Customer>();
      for (const c of data || []) {
        if (c && c.id) map.set(c.id, c);
      }
      setCustomers(Array.from(map.values()));
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  // Load Active Shift (Scenario 1 & Story 8)
  const loadActiveShift = useCallback(async () => {
    try {
      const active = await invoke<Shift | null>('shifts:getActive', { posRegisterId: 'default_pos' });
      setCurrentShift(active);
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    void loadActiveShift();

    const handleOpen = () => setIsShiftModalOpen(true);
    const handleClose = () => {
      setIsShiftModalOpen(false);
      barcodeInputRef.current?.focus();
    };
    const handleShiftUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<Shift | null>;
      setCurrentShift(customEvent.detail);
    };

    window.addEventListener('rafiq:open-shift-modal', handleOpen);
    window.addEventListener('rafiq:close-shift-modal', handleClose);
    window.addEventListener('rafiq:shift-updated', handleShiftUpdated as EventListener);

    return () => {
      window.removeEventListener('rafiq:open-shift-modal', handleOpen);
      window.removeEventListener('rafiq:close-shift-modal', handleClose);
      window.removeEventListener('rafiq:shift-updated', handleShiftUpdated as EventListener);
    };
  }, [loadActiveShift]);

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

  // Load Digital Accounts (InstaPay & Wallets) to verify linkage in POS
  const loadDigitalAccounts = useCallback(async () => {
    try {
      const data = await invoke<DigitalAccount[]>('wallets:getAccounts');
      if (Array.isArray(data)) {
        setDigitalAccounts(data);
      }
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    void loadDigitalAccounts();
  }, [loadDigitalAccounts]);

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
  useDataSubscription(['wallets', 'all'], () => {
    void loadDigitalAccounts();
  });

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

  // Feature #131: Load scanner and POS settings on mount
  const loadAppSettings = useCallback(async () => {
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
        if (appSettings.require_open_shift_to_sell !== undefined) {
          setRequireOpenShiftToSell(appSettings.require_open_shift_to_sell === '1' || appSettings.require_open_shift_to_sell.toLowerCase() === 'true');
        }
        if (appSettings.store_instapay_address) setStoreInstapayAddress(appSettings.store_instapay_address);
        if (appSettings.store_wallet_number) setStoreWalletNumber(appSettings.store_wallet_number);
      }
    } catch {
      // non-blocking
    }
  }, []);

  useDataSubscription(['settings', 'all'], loadAppSettings);

  useEffect(() => {
    let active = true;
    void (async () => {
      const s = await loadScannerSettings();
      if (active) setScannerSettings(s);
      void loadAppSettings();
      try {
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
  }, [loadHeldSalesCount, loadAppSettings]);

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

  const handleOpenCheckout = useCallback((forcedMethod?: 'cash' | 'credit' | 'instapay' | 'vodafone_cash') => {
    if (cart.length === 0) {
      showStatus('سلة البيع فارغة! يرجى إضافة أصناف أولاً.', 'error');
      return;
    }
    // Story 131: Validate that all controlled drug items have documented dispenses
    const unDocumentedItem = cart.find(i => i.isControlled && !i.controlledDispense);
    if (unDocumentedItem) {
      showStatus(`الصنف "${unDocumentedItem.productName}" خاضع لجدول الرقابة والتفتيش. يلزم تسجيل بيانات المريض والروشتة أولاً!`, 'error');
      const idx = cart.indexOf(unDocumentedItem);
      setControlledDispenseModalItem({ item: unDocumentedItem, index: idx });
      return;
    }
    // Story 137 / Feature #194: Hard lock checkout when severe DDI is un-overridden
    if (isDdiActive && ddiResult && ddiResult.hasInteractions && ddiResult.maxSeverity === 'severe' && !isDdiOverridden) {
      showStatus('تنبيه سريري حرج: إتمام البيع محظور تلقائياً لوجود تعارض دوائي شديد الخطورة (Severe DDI)! يرجى إزالة الدواء أو إدخال رمز اعتماد المشرف.', 'error');
      setIsDdiModalOpen(true);
      return;
    }
    if (requireOpenShiftToSell && !currentShift) {
      showStatus('لا يمكن إتمام البيع قبل فتح وردية رسمية للكاشير واستلام عهدة الدرج. يرجى فتح وردية جديدة أولاً.', 'error');
      setIsShiftModalOpen(true);
      return;
    }
    if (forcedMethod === 'vodafone_cash' || forcedMethod === 'instapay') {
      setDigitalPaymentMethod(forcedMethod);
      setIsDigitalPaymentModalOpen(true);
      return;
    }
    if (forcedMethod === 'credit') {
      setPaymentMethod('credit');
    } else {
      setPaymentMethod('cash');
    }
    setIsPaymentModalOpen(true);
  }, [cart, currentShift, requireOpenShiftToSell, showStatus, isDdiActive, ddiResult, isDdiOverridden]);

  const handleConfirmPayment = useCallback(async (paymentData: {
    paymentMethod: 'cash' | 'credit' | 'card' | 'multi' | 'instapay' | 'vodafone_cash' | 'insurance';
    paidPiasters: number;
    payments: SalePayment[];
    changeDuePiasters: number;
    customerId?: string | null;
    totalPiastersOverride?: number;
    serviceFeeNote?: string;
    supervisorPin?: string;
  }) => {
    if (isCheckingOutRef.current) return;
    if (requireOpenShiftToSell && !currentShift) {
      showStatus('لا يمكن إتمام البيع قبل فتح وردية رسمية للكاشير واستلام عهدة الدرج. يرجى فتح وردية جديدة أولاً.', 'error');
      setIsShiftModalOpen(true);
      return;
    }
    isCheckingOutRef.current = true;
    setIsPaymentModalOpen(false);
    setLoading(true);
    try {
      const shiftId = currentShift ? (currentShift.id || (currentShift as unknown as { Id?: string }).Id) : undefined;
      const controlledDispenses = cart
        .filter(i => i.isControlled && i.controlledDispense)
        .map(i => i.controlledDispense);

      const salePayload: Partial<Sale> & { idempotencyKey?: string; supervisorPin?: string; controlledDispenses?: ControlledDrugDispense[]; insuranceClaim?: InsuranceClaimLine } = {
        subtotalPiasters,
        discountPiasters,
        taxPiasters: totalTaxPiasters,
        totalPiasters: activeInsuranceClaim ? subtotalPiasters : (paymentData.totalPiastersOverride ?? netTotalPiasters),
        paidPiasters: paymentData.paidPiasters,
        paymentMethod: activeInsuranceClaim ? 'insurance' : paymentData.paymentMethod,
        customerId: paymentData.customerId || selectedCustomerId || undefined,
        shiftId: shiftId || undefined,
        status: 'completed',
        items: cart,
        payments: paymentData.payments,
        notes: paymentData.serviceFeeNote,
        changePiasters: paymentData.changeDuePiasters,
        idempotencyKey: cartSessionIdRef.current,
        controlledDispenses: controlledDispenses.length > 0 ? (controlledDispenses as ControlledDrugDispense[]) : undefined,
        insuranceClaim: activeInsuranceClaim || undefined,
        orderType: showCafeMode ? orderType : 'takeaway',
        tableId: showCafeMode && orderType === 'dine_in' && activeTable ? activeTable.id : null,
        tableName: showCafeMode && orderType === 'dine_in' && activeTable ? activeTable.name : null,
        guestsCount: showCafeMode && orderType === 'dine_in' && activeTable ? (activeTable.guestsCount || 1) : 1,
        waiterName: showCafeMode && orderType === 'dine_in' && activeTable ? (activeTable.waiterName || null) : null,
        serviceChargePiasters,
        deliveryFeePiasters,
        deliveryInfo: showCafeMode && orderType === 'delivery' ? deliveryInfo : null,
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

      if (isEnabled('feature_patient_profiles') && selectedCustomerId) {
        const soldProductIds = cart.map((item) => item.productId).filter(Boolean);
        if (soldProductIds.length > 0) {
          void invoke('patients:recordDispense', {
            customerId: selectedCustomerId,
            productIds: soldProductIds,
          }).catch(() => {
            // Non-blocking
          });
        }
      }

      setCart([]);
      setDiscountPiasters(0);
      setSelectedCustomerId('');
      setPaymentMethod('cash');
      setActiveInsuranceClaim(null);
      setAllergyCheckResult(null);
      setIsAllergyModalOpen(false);
      setDdiResult(null);
      setIsDdiOverridden(false);
      setIsDdiModalOpen(false);
      setActiveTable(null);
      setDeliveryInfo(null);
      resetCartSession();
      void loadSmartCatalog();
      void loadHeldSalesCount();
      void loadCafeStats();
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
      if (friendlyMsg.includes('لا يمكن إتمام البيع') || friendlyMsg.includes('رصيد الصنف') || friendlyMsg.includes('غير كافٍ') || friendlyMsg.includes('غير قابلة للتجزئة') || friendlyMsg.includes('المشرف')) {
        showStatus(friendlyMsg, 'error');
      } else {
        showStatus(`تعذر إتمام الفاتورة: ${friendlyMsg}`, 'error');
      }
    } finally {
      setLoading(false);
      isCheckingOutRef.current = false;
      barcodeInputRef.current?.focus();
    }
  }, [
    subtotalPiasters, 
    discountPiasters, 
    totalTaxPiasters, 
    netTotalPiasters, 
    cart, 
    selectedCustomerId, 
    activeInsuranceClaim,
    showStatus,
    loadSmartCatalog,
    loadHeldSalesCount,
    loadCafeStats,
    resetCartSession,
    currentShift,
    requireOpenShiftToSell,
    isEnabled,
    showCafeMode,
    orderType,
    activeTable,
    serviceChargePiasters,
    deliveryFeePiasters,
    deliveryInfo,
  ]);

  const setDirectQuantity = useCallback((index: number, newQtyPieces: number) => {
    if (newQtyPieces <= 0) {
      setCart((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    setCart((prev) => {
      const item = prev[index];
      if (!item) return prev;
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

      const newQuantityMilli = newQtyPieces * 1000;
      const newTotalPiasters = calculateLineTotal(item.unitPricePiasters, newQuantityMilli, item.discountPiasters);
      const newTaxPiasters = calculateTaxPiasters(newTotalPiasters, item.taxRatePercent || 0, true);

      const updated = [...prev];
      updated[index] = {
        ...item,
        quantityMilli: newQuantityMilli,
        totalPiasters: newTotalPiasters,
        taxPiasters: newTaxPiasters,
      };
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
        const res = await invoke<unknown>('products:search', { query: q, limit: 8 });
        const results = extractProducts(res);
        if (results.length > 0) {
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
      const scaleInfo = isEnabled('feature_scale_weight') ? parseScaleBarcode(scannedBarcode) : null;
      let scaleWeightMilli: number | undefined;

      let res = await invoke<unknown>('products:search', { query: scannedBarcode, limit: 5 });
      let results = extractProducts(res);

      if ((!results || results.length === 0) && scaleInfo) {
        // Try matching: 1) Prefix+PLU (e.g. 2100045, 9900045, 2000045), 2) Trimmed PLU (e.g. 45), 3) 5-digit PLU (e.g. 00045)
        const prefixPlu = `${scaleInfo.prefix}${scaleInfo.itemPlu}`;
        res = await invoke<unknown>('products:search', { query: prefixPlu, limit: 5 });
        results = extractProducts(res);
        if (!results || results.length === 0) {
          res = await invoke<unknown>('products:search', { query: scaleInfo.itemPluTrimmed, limit: 5 });
          results = extractProducts(res);
        }
        if (!results || results.length === 0) {
          res = await invoke<unknown>('products:search', { query: scaleInfo.itemPlu, limit: 5 });
          results = extractProducts(res);
        }
        if ((!results || results.length === 0) && (scaleInfo.prefix === '99' || scaleInfo.prefix === '20')) {
          const altPrefix = scaleInfo.prefix === '99' ? '20' : '99';
          res = await invoke<unknown>('products:search', { query: `${altPrefix}${scaleInfo.itemPlu}`, limit: 5 });
          results = extractProducts(res);
        }
        // In-memory catalog lookup fallback for instant POS response without IPC lag
        if (!results || results.length === 0) {
          const inMemMatch = catalogProducts.find(p => 
            p.barcode === prefixPlu ||
            p.barcode === scaleInfo.itemPlu ||
            p.barcode === scaleInfo.itemPluTrimmed ||
            (p.barcode && p.barcode.endsWith(scaleInfo.itemPluTrimmed)) ||
            (p.barcodes && (
              p.barcodes.includes(prefixPlu) || 
              p.barcodes.includes(scaleInfo.itemPlu) || 
              p.barcodes.includes(scaleInfo.itemPluTrimmed)
            ))
          );
          if (inMemMatch) {
            results = [inMemMatch];
          }
        }
        if (results && results.length > 0) {
          scaleWeightMilli = scaleInfo.weightMilli;
        }
      }

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

        addProductToCart(exactMatch, scaleWeightMilli, matchedUnit);
        setBarcodeQuery('');
        setIsSearchDropdownOpen(false);
        const unitSuffix = matchedUnit ? ` [${matchedUnit.unitName}]` : '';
        const weightDesc = scaleWeightMilli ? ` (${(scaleWeightMilli / 1000.0).toFixed(3)} كجم - ميزان)` : '';
        showStatus(`تم مسح الباركود وإضافة: ${exactMatch.name}${unitSuffix}${weightDesc}`, 'success');
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
  }, [addProductToCart, showStatus, catalogProducts, isEnabled]);

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
      setLiveSearchResults([]);
    }
  };

  const handleBarcodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const query = convertArabicLayoutToBarcode(barcodeQuery.trim());
    if (!query) return;

    // Priority 1: Check liveSearchResults for an exact barcode match (fast in-memory path)
    if (isSearchDropdownOpen && liveSearchResults.length > 0) {
      const exactMatch = liveSearchResults.find((p) => {
        if (p.barcode === query) return true;
        if (p.barcodes && p.barcodes.includes(query)) return true;
        if (p.units && p.units.some((u) => u.barcode === query)) return true;
        return false;
      });

      if (exactMatch) {
        let matchedUnit: ProductUnit | undefined;
        if (exactMatch.units && exactMatch.units.length > 0) {
          matchedUnit = exactMatch.units.find((u) => u.barcode === query);
        }
        const added = addProductToCart(exactMatch, undefined, matchedUnit);
        setBarcodeQuery('');
        setIsSearchDropdownOpen(false);
        setLiveSearchResults([]);
        if (added) {
          showStatus(`تمت إضافة: ${exactMatch.name}`, 'success');
        }
        barcodeInputRef.current?.focus();
        return;
      }
    }

    try {
      setLoading(true);
      const scaleInfo = isEnabled('feature_scale_weight') ? parseScaleBarcode(query) : null;
      let scaleWeightMilli: number | undefined;

      let res = await invoke<unknown>('products:search', { query, limit: 10 });
      let results = extractProducts(res);

      if ((!results || results.length === 0) && scaleInfo) {
        // Try matching: 1) Prefix+PLU (e.g. 2100045, 9900045, 2000045), 2) Trimmed PLU (e.g. 45), 3) 5-digit PLU (e.g. 00045)
        const prefixPlu = `${scaleInfo.prefix}${scaleInfo.itemPlu}`;
        res = await invoke<unknown>('products:search', { query: prefixPlu, limit: 5 });
        results = extractProducts(res);
        if (!results || results.length === 0) {
          res = await invoke<unknown>('products:search', { query: scaleInfo.itemPluTrimmed, limit: 5 });
          results = extractProducts(res);
        }
        if (!results || results.length === 0) {
          res = await invoke<unknown>('products:search', { query: scaleInfo.itemPlu, limit: 5 });
          results = extractProducts(res);
        }
        if ((!results || results.length === 0) && (scaleInfo.prefix === '99' || scaleInfo.prefix === '20')) {
          const altPrefix = scaleInfo.prefix === '99' ? '20' : '99';
          res = await invoke<unknown>('products:search', { query: `${altPrefix}${scaleInfo.itemPlu}`, limit: 5 });
          results = extractProducts(res);
        }
        // In-memory catalog lookup fallback for instant POS response without IPC lag
        if (!results || results.length === 0) {
          const inMemMatch = catalogProducts.find(p => 
            p.barcode === prefixPlu ||
            p.barcode === scaleInfo.itemPlu ||
            p.barcode === scaleInfo.itemPluTrimmed ||
            (p.barcode && p.barcode.endsWith(scaleInfo.itemPluTrimmed)) ||
            (p.barcodes && (
              p.barcodes.includes(prefixPlu) || 
              p.barcodes.includes(scaleInfo.itemPlu) || 
              p.barcodes.includes(scaleInfo.itemPluTrimmed)
            ))
          );
          if (inMemMatch) {
            results = [inMemMatch];
          }
        }
        if (results && results.length > 0) {
          scaleWeightMilli = scaleInfo.weightMilli;
        }
      }

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

        const added = addProductToCart(targetProd, scaleWeightMilli, matchedUnit);
        setBarcodeQuery('');
        setIsSearchDropdownOpen(false);
        if (added) {
          const unitSuffix = matchedUnit ? ` [${matchedUnit.unitName}]` : '';
          const weightDesc = scaleWeightMilli ? ` (${(scaleWeightMilli / 1000.0).toFixed(3)} كجم - ميزان)` : '';
          showStatus(`تمت إضافة: ${targetProd.name}${unitSuffix}${weightDesc}`, 'success');
        }
      } else if (isSearchDropdownOpen && liveSearchResults.length > 0 && liveSearchResults[selectedDropdownIndex]) {
        // Fallback to dropdown selection only if backend exact search returned no matches
        const selected = liveSearchResults[selectedDropdownIndex];
        const added = addProductToCart(selected);
        setBarcodeQuery('');
        setIsSearchDropdownOpen(false);
        if (added) {
          showStatus(`تمت إضافة: ${selected.name}`, 'success');
        }
      } else {
        let matchedDrugRef: DrugReferenceItem | null = null;
        if (isEnabled('feature_drug_reference')) {
          try {
            matchedDrugRef = await invoke<DrugReferenceItem | null>('pharma:checkDrugReference', { barcode: query });
          } catch {
            matchedDrugRef = null;
          }
        }

        if (matchedDrugRef) {
          const formattedName = matchedDrugRef.tradeName + (matchedDrugRef.form ? ` ${matchedDrugRef.form}` : '') + (matchedDrugRef.strength ? ` ${matchedDrugRef.strength}` : '');
          const priceEgp = matchedDrugRef.publicPricePiasters ? (matchedDrugRef.publicPricePiasters / 100.0).toFixed(2) : '';
          setQuickAddInitialName(formattedName);
          setQuickAddInitialPrice(priceEgp);
          setIsQuickAddFromDrugRef(true);
          setUnregisteredBarcode(query);
          setIsQuickAddModalOpen(true);
          showStatus(`تم العثور على الصنف في دليل الأدوية: "${matchedDrugRef.tradeName}"`, 'success');
        } else {
          setQuickAddInitialName('');
          setQuickAddInitialPrice('');
          setIsQuickAddFromDrugRef(false);
          setUnregisteredBarcode(query);
          setIsQuickAddModalOpen(true);
          showStatus(`المنتج غير مسجل: "${query}" - يمكنك إضافته سريعاً الآن`, 'warning');
        }
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
      const foundProd = catalogProducts.find((p) => p.id === weightModalProduct.id || (Boolean(weightModalProduct.barcode) && p.barcode === weightModalProduct.barcode));
      const foundQuick = quickItems.find((q) => q.id === weightModalProduct.id || q.name === weightModalProduct.name);
      const linkedQuickProd = foundQuick?.productId ? catalogProducts.find((p) => p.id === foundQuick.productId) : null;
      const productToAdd: Product = {
        id: dummyId,
        name: weightModalProduct.name,
        barcode: weightModalProduct.barcode || foundProd?.barcode || linkedQuickProd?.barcode || null,
        pricePiasters: weightModalProduct.pricePiasters,
        costPiasters: foundProd ? foundProd.costPiasters : (linkedQuickProd ? linkedQuickProd.costPiasters : 0),
        stockQuantityMilli: foundProd && typeof foundProd.stockQuantityMilli === 'number' ? foundProd.stockQuantityMilli : 100000,
        unit: 'kg',
        taxRatePercent: foundProd ? foundProd.taxRatePercent : (linkedQuickProd ? linkedQuickProd.taxRatePercent : 0),
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
      const item = prev[index];
      if (!item) return prev;
      const currentPieces = Math.round(item.quantityMilli / 1000);
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

      const newQuantityMilli = newPieces * 1000;
      const newTotalPiasters = calculateLineTotal(item.unitPricePiasters, newQuantityMilli, item.discountPiasters);
      const newTaxPiasters = calculateTaxPiasters(newTotalPiasters, item.taxRatePercent || 0, true);

      const updated = [...prev];
      updated[index] = {
        ...item,
        quantityMilli: newQuantityMilli,
        totalPiasters: newTotalPiasters,
        taxPiasters: newTaxPiasters,
      };
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

  const handleSelectBatchForCartItem = useCallback((selectedBatch: ProductBatch) => {
    if (!batchPickerState) return;
    const { cartIndex } = batchPickerState;
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[cartIndex];
      if (!item) return prev;

      const factor = item.conversionFactor && item.conversionFactor > 0 ? item.conversionFactor : 1;
      let newUnitPrice = item.unitPricePiasters;
      if (selectedBatch.sellPricePiasters && selectedBatch.sellPricePiasters > 0) {
        newUnitPrice = selectedBatch.sellPricePiasters * factor;
      }

      item.batchId = selectedBatch.id;
      item.batchNumber = selectedBatch.batchNumber;
      item.expiryDate = selectedBatch.expiryDate || undefined;
      item.unitPricePiasters = newUnitPrice;
      item.totalPiasters = calculateLineTotal(newUnitPrice, item.quantityMilli, item.discountPiasters);
      item.taxPiasters = calculateTaxPiasters(item.totalPiasters, item.taxRatePercent || 0, true);
      return updated;
    });

    showStatus(
      `تم تحديد التشغيلة #${selectedBatch.batchNumber} للصنف بنجاح.`,
      'success'
    );
    setBatchPickerState(null);
  }, [batchPickerState, showStatus]);

  // Story 133 / Feature #190: 1-Click Chronic Medication Dispense
  const handleLoadChronicMedsToCart = useCallback(
    (customer: Customer, medsToLoad: { product: Product; quantityMilli: number }[]) => {
      setSelectedCustomerId(customer.id);
      setCart((prevCart) => {
        const newCart = [...prevCart];
        medsToLoad.forEach(({ product, quantityMilli }) => {
          const existingIndex = newCart.findIndex((item) => item.productId === product.id);
          if (existingIndex >= 0) {
            const existing = newCart[existingIndex];
            const updatedQty = existing.quantityMilli + quantityMilli;
            newCart[existingIndex] = {
              ...existing,
              quantityMilli: updatedQty,
              totalPiasters: calculateLineTotal(existing.unitPricePiasters, updatedQty, existing.discountPiasters),
              taxPiasters: calculateTaxPiasters(
                calculateLineTotal(existing.unitPricePiasters, updatedQty, existing.discountPiasters),
                existing.taxRatePercent || 0,
                true
              ),
            };
          } else {
            const unitPrice = product.pricePiasters;
            const taxRate = product.taxRatePercent || 0;
            const lineTotal = calculateLineTotal(unitPrice, quantityMilli, 0);
            newCart.push({
              productId: product.id,
              productName: product.name,
              barcode: product.barcode,
              unitPricePiasters: unitPrice,
              unitCostPiasters: product.costPiasters || 0,
              quantityMilli,
              unit: product.unit || 'piece',
              discountPiasters: 0,
              totalPiasters: lineTotal,
              taxRatePercent: taxRate,
              taxPiasters: calculateTaxPiasters(lineTotal, taxRate, true),
              isControlled: product.isControlled,
            });
          }
        });
        return newCart;
      });
      showStatus(`تم تحميل ${medsToLoad.length} صنف علاج شهري للمريض: ${customer.name}`, 'success');
      setIsChronicDispenseOpen(false);
      barcodeInputRef.current?.focus();
    },
    [showStatus]
  );

  // Story 133 / Feature #190: Clinical Allergy Checking
  useEffect(() => {
    if (!isEnabled('feature_patient_profiles') || !selectedCustomerId || cart.length === 0) {
      setAllergyCheckResult(null);
      return;
    }

    const productIds = cart.map((i) => i.productId).filter(Boolean);
    if (productIds.length === 0) {
      setAllergyCheckResult(null);
      return;
    }

    let isCurrent = true;
    invoke<AllergyCheckResult>('patients:checkAllergies', {
      customerId: selectedCustomerId,
      productIds,
    })
      .then((result) => {
        if (isCurrent && result && result.hasConflict && result.conflicts.length > 0) {
          setAllergyCheckResult(result);
          setIsAllergyModalOpen(true);
        } else if (isCurrent) {
          setAllergyCheckResult(null);
        }
      })
      .catch(() => {
        if (isCurrent) setAllergyCheckResult(null);
      });

    return () => {
      isCurrent = false;
    };
  }, [isEnabled, selectedCustomerId, cart]);

  const handleRemoveAllergyConflictItem = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
    setAllergyCheckResult((prev) => {
      if (!prev) return null;
      const remainingConflicts = prev.conflicts.filter((c) => c.productId !== productId);
      if (remainingConflicts.length === 0) {
        setIsAllergyModalOpen(false);
        return null;
      }
      return {
        ...prev,
        conflicts: remainingConflicts,
      };
    });
    showStatus('تمت إزالة الصنف المتعارض من السلة بنجاح', 'success');
  }, [showStatus]);

  const handleRemoveAllAllergyConflicts = useCallback(() => {
    if (!allergyCheckResult) return;
    const conflictIds = new Set(allergyCheckResult.conflicts.map((c) => c.productId));
    setCart((prev) => prev.filter((item) => !conflictIds.has(item.productId)));
    setAllergyCheckResult(null);
    setIsAllergyModalOpen(false);
    showStatus('تمت إزالة جميع الأصناف المتعارضة مع الحساسية من السلة', 'success');
  }, [allergyCheckResult, showStatus]);

  // Story 137 / Feature #194: Real-time Drug-Drug Interactions (DDI) cart checking
  useEffect(() => {
    if (!isDdiActive || cart.length < 2) {
      setDdiResult(null);
      setIsDdiOverridden(false);
      return;
    }

    const productIds = Array.from(new Set(cart.map((i) => i.productId).filter(Boolean)));
    if (productIds.length < 2) {
      setDdiResult(null);
      setIsDdiOverridden(false);
      return;
    }

    let isCurrent = true;
    const timer = setTimeout(() => {
      invoke<CartInteractionCheckResult>('ddi:checkCart', { productIds })
        .then((result) => {
          if (!isCurrent) return;
          setDdiResult(result);
          if (result && result.hasInteractions) {
            if (result.maxSeverity === 'severe') {
              setIsDdiOverridden(false);
              setIsDdiModalOpen(true);
            }
          } else {
            setIsDdiOverridden(false);
          }
        })
        .catch((err) => {
          console.error('DDI cart check error:', err);
        });
    }, 200);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [isDdiActive, cart]);

  const handleRemoveDdiConflictProduct = useCallback((productId: string) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
    showStatus('تمت إزالة الصنف المتعارض من السلة بنجاح', 'success');
  }, [showStatus]);

  const handleSupervisorDdiOverride = useCallback(
    async (pin: string, reason: string, conflictProductIds: string[]) => {
      try {
        const res = await invoke<{ success: boolean; message?: string }>('ddi:override', {
          pin,
          reason,
          conflictProductIds,
        });
        if (res && res.success) {
          setIsDdiOverridden(true);
          showStatus('تم اعتماد وتوثيق التخطي الإشرافي للتعارض الدوائي بنجاح.', 'success');
          return true;
        }
        return false;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'فشل اعتماد التخطي الإشرافي للتعارض الدوائي.';
        showStatus(msg, 'error');
        return false;
      }
    },
    [showStatus]
  );

  // Fast cash checkout (F12)
  const handleFastCashCheckout = useCallback(async () => {
    if (isCheckingOutRef.current || loading) return;
    if (cart.length === 0) {
      showStatus('سلة البيع فارغة! أضف أصنافاً أولاً للبيع (F2)', 'warning');
      return;
    }
    // Story 137 / Feature #194: Hard lock fast cash checkout (F12) when severe DDI is un-overridden
    if (isDdiActive && ddiResult && ddiResult.hasInteractions && ddiResult.maxSeverity === 'severe' && !isDdiOverridden) {
      showStatus('تنبيه سريري حرج: إتمام البيع محظور تلقائياً لوجود تعارض دوائي شديد الخطورة (Severe DDI)! يرجى إزالة الدواء أو إدخال رمز اعتماد المشرف.', 'error');
      setIsDdiModalOpen(true);
      return;
    }
    if (!currentShift) {
      showStatus('لا يمكن إتمام البيع قبل فتح وردية رسمية للكاشير واستلام عهدة الدرج. يرجى فتح وردية جديدة أولاً.', 'error');
      setIsShiftModalOpen(true);
      return;
    }
    if (paymentMethod === 'credit' && !selectedCustomerId) {
      showStatus('يرجى تحديد العميل أولاً لإتمام البيع الآجل (F10)', 'error');
      return;
    }
    await handleConfirmPayment({
      paymentMethod: activeInsuranceClaim ? 'insurance' : paymentMethod,
      paidPiasters: paymentMethod === 'cash' || activeInsuranceClaim ? netTotalPiasters : 0,
      payments: paymentMethod === 'cash' || activeInsuranceClaim
        ? [{ method: 'cash', amountPiasters: netTotalPiasters }] 
        : [{ method: 'credit', amountPiasters: 0 }],
      changeDuePiasters: 0,
      customerId: selectedCustomerId || undefined
    });
  }, [loading, cart, paymentMethod, selectedCustomerId, netTotalPiasters, activeInsuranceClaim, handleConfirmPayment, showStatus, currentShift, isDdiActive, ddiResult, isDdiOverridden]);

  // Fast direct digital checkouts (InstaPay & Vodafone Cash)
  const handleInstapayCheckout = useCallback(async () => {
    handleOpenCheckout('instapay');
  }, [handleOpenCheckout]);

  const handleVodafoneCashCheckout = useCallback(async () => {
    handleOpenCheckout('vodafone_cash');
  }, [handleOpenCheckout]);

  const handleOpenAlternatives = useCallback((prodId?: string, prodName?: string) => {
    let targetId = prodId;
    let targetName = prodName;
    if (!targetId && cart.length > 0) {
      const lastItem = cart[cart.length - 1];
      targetId = lastItem.productId;
      targetName = lastItem.productName;
    }
    if (targetId) {
      setAlternativesProductId(targetId);
      setAlternativesProductName(targetName || '');
      setIsAlternativesDrawerOpen(true);
    } else {
      showStatus('يرجى تحديد صنف أو إضافة صنف للسلة أولاً لعرض بدائله (F8)', 'warning');
    }
  }, [cart, showStatus]);

  const handleOpenDdiAlternatives = useCallback((productId: string) => {
    const item = cart.find((i) => i.productId === productId);
    handleOpenAlternatives(productId, item?.productName);
  }, [cart, handleOpenAlternatives]);

  const handleSubstituteCartItem = useCallback((originalProductId: string, replacementProduct: Product) => {
    setCart((prev) => {
      const idx = prev.findIndex((it) => it.productId === originalProductId);
      if (idx === -1) return prev;
      const original = prev[idx];
      const updated = [...prev];
      const unitPrice = replacementProduct.pricePiasters;
      const total = calculateLineTotal(unitPrice, original.quantityMilli, 0);
      const tax = calculateTaxPiasters(total, replacementProduct.taxRatePercent || 0, true);
      updated[idx] = {
        ...original,
        productId: replacementProduct.id,
        productName: replacementProduct.name,
        barcode: replacementProduct.barcode || undefined,
        unitPricePiasters: unitPrice,
        unitCostPiasters: replacementProduct.costPiasters,
        totalPiasters: total,
        taxPiasters: tax,
        taxRatePercent: replacementProduct.taxRatePercent || 0,
        unitName: replacementProduct.unit || 'قطعة',
      };
      return updated;
    });
    showStatus(`تم استبدال الصنف بالبديل: ${replacementProduct.name}`, 'success');
  }, [showStatus]);

  const isAnyModalOpen = Boolean(
    isPaymentModalOpen ||
    isDigitalPaymentModalOpen ||
    isReceiptOpen ||
    isClearConfirmOpen ||
    isScannerModalOpen ||
    isQuickAddModalOpen ||
    isQuickShortageOpen ||
    isAlternativesDrawerOpen ||
    isQuickItemsManagerOpen ||
    isQuickFastItemModalOpen ||
    isHelpModalOpen ||
    isHeldSalesModalOpen ||
    isReturnModalOpen ||
    isShiftModalOpen ||
    isDiscountModalOpen ||
    isExpenseModalOpen ||
    quantityModalItem !== null ||
    weightModalProduct !== null ||
    variantPickerParentProduct !== null ||
    unitPickerProduct !== null ||
    batchPickerState !== null ||
    supervisorPrompt.isOpen ||
    isDdiModalOpen ||
    isDdiManagerOpen ||
    isFloorModalOpen ||
    isDeliveryModalOpen ||
    modifierModalState !== null
  );

  // Hook 2: Cashier Keyboard Shortcuts & Hardware Scanner Listener (F1 to F12)
  usePosShortcuts({
    isActive,
    isAnyModalOpen,
    cart,
    loading,
    lastCompletedSale,
    scannerSettings,
    requestClearCart,
    handleOpenCheckout,
    handleFastCashCheckout,
    handleInstapayCheckout,
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
    cycleCartItemUnit,
    onOpenAlternatives: (isEnabled('feature_pharmacy') && (hasPermission ? hasPermission('pharma.alternatives.view') : false)) ? () => handleOpenAlternatives() : undefined,
    onOpenQuickShortage: () => {
      setShortageInitialName(barcodeQuery);
      setShortageInitialProductId('');
      setIsQuickShortageOpen(true);
    },
    hasPermission,
    isAdmin,
  });

  // Focus Management - Always return focus to barcode/search input when POS is active
  useEffect(() => {
    if (!isActive) return;

    if (!isAnyModalOpen) {
      const timer = setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isAnyModalOpen, isActive]);

  return (
    <div className="flex flex-col h-full w-full bg-canvas dark:bg-canvas-dark overflow-hidden">
      {/* 1. THREE-PANE MAIN WORKSPACE */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* ================= REGION A: BARCODE SEARCH & CART TABLE ================= */}
        <section className={`${showFastItems ? 'flex-1 min-w-[360px]' : 'flex-1'} h-full bg-surface dark:bg-surface-dark hairline-l flex flex-col overflow-hidden`}>
          {showCafeMode && (
            <PosOrderModeBar
              orderType={orderType}
              onOrderTypeChange={(newMode) => {
                setOrderType(newMode);
                if (newMode === 'dine_in' && showTableManagement && !activeTable) {
                  setIsFloorModalOpen(true);
                } else if (newMode === 'delivery' && showDeliveryManagement && !deliveryInfo) {
                  setDeliveryModalTab('order_setup');
                  setIsDeliveryModalOpen(true);
                }
              }}
              showTableManagement={showTableManagement}
              showKitchenPrinter={showKitchenPrinter}
              showDeliveryManagement={showDeliveryManagement}
              activeTable={activeTable}
              occupiedTablesCount={occupiedTablesCount}
              onOpenFloorMap={() => setIsFloorModalOpen(true)}
              onClearActiveTable={() => {
                setActiveTable(null);
                showStatus('تم فك ارتباط الطاولة من الفاتورة الحالية', 'success');
              }}
              onSaveTableOrder={handleSaveTableOrder}
              onPrintPreBill={handlePrintTablePreBill}
              onPrintKot={handlePrintKitchenKOT}
              kotPrinting={kotPrinting}
              tableSaving={tableSaving}
              deliveryInfo={deliveryInfo}
              activeDeliveryOrdersCount={activeDeliveryOrdersCount}
              onOpenDeliveryModal={(tab) => {
                setDeliveryModalTab(tab || 'order_setup');
                setIsDeliveryModalOpen(true);
              }}
              serviceChargePercent={serviceChargePercent}
              onServiceChargePercentChange={setServiceChargePercent}
              cartNotEmpty={cart.length > 0}
            />
          )}
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
              const added = addProductToCart(prod, undefined, specificUnit);
              setBarcodeQuery('');
              setIsSearchDropdownOpen(false);
              setLiveSearchResults([]);
              setSelectedDropdownIndex(0);
              if (added) {
                showStatus(`تمت إضافة: ${prod.name}${specificUnit ? ` (${specificUnit.unitName})` : ''}`, 'success');
              }
              barcodeInputRef.current?.focus();
            }}
            onNavigateToEpay={onNavigateToEpay}
          />

          {/* Story 133: Clinical Allergy Conflict Warning Banner */}
          {allergyCheckResult && allergyCheckResult.hasConflict && allergyCheckResult.conflicts.length > 0 && (
            <div
              onClick={() => setIsAllergyModalOpen(true)}
              className="mx-2 mb-1 p-2 bg-danger-soft dark:bg-danger-dark-soft border border-danger/40 rounded-xl flex items-center justify-between gap-2 text-xs cursor-pointer hover:bg-danger-soft/80 transition-colors animate-pulse"
              role="alert"
              title="انقر لعرض تفاصيل تعارض الحساسية الدوائية"
            >
              <div className="flex items-center gap-2 text-danger dark:text-danger-bright font-bold">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  تحذير سريري خطير: المريض ({allergyCheckResult.patientName || allergyCheckResult.customerName || 'المريض'}) لديه تعارض حساسية مع {allergyCheckResult.conflicts.length} دواء بالسلة!
                </span>
              </div>
              <span className="text-[11px] font-bold underline text-danger dark:text-danger-bright shrink-0">
                مراجعة التعارض
              </span>
            </div>
          )}

          {/* Story 137 / Feature #194: Clinical Drug-Drug Interactions (DDI) Warning Banner */}
          {isDdiActive && ddiResult && ddiResult.hasInteractions && ddiResult.conflicts.length > 0 && (
            <div
              onClick={() => setIsDdiModalOpen(true)}
              className={`mx-2 mb-1 p-2 rounded-xl flex items-center justify-between gap-2 text-xs cursor-pointer transition-colors shadow-2xs ${
                ddiResult.maxSeverity === 'severe'
                  ? 'bg-danger-soft dark:bg-danger-dark-soft border border-danger/40 animate-pulse hover:bg-danger-soft/80'
                  : ddiResult.maxSeverity === 'moderate'
                    ? 'bg-warn-soft dark:bg-warn-dark-soft border border-warn/40 hover:bg-warn-soft/80'
                    : 'bg-brand-soft dark:bg-brand-dark-soft border border-brand/40 hover:bg-brand-soft/80'
              }`}
              role="alert"
              title="انقر لعرض تفاصيل التعارضات الدوائية والتدخل السريري"
            >
              <div className={`flex items-center gap-2 font-bold ${
                ddiResult.maxSeverity === 'severe'
                  ? 'text-danger dark:text-danger-bright'
                  : ddiResult.maxSeverity === 'moderate'
                    ? 'text-warn dark:text-warn-bright'
                    : 'text-brand dark:text-brand-bright'
              }`}>
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  {ddiResult.maxSeverity === 'severe'
                    ? `تحذير سريري حرج: تم اكتشاف ${ddiResult.conflicts.length} تعارض دوائي شديد الخطورة بالسلة! ${isDdiOverridden ? '(تم التخطي باعتماد إشرافي)' : '(إتمام البيع محظور تلقائياً)'}`
                    : ddiResult.maxSeverity === 'moderate'
                      ? `تنبيه سريري: تم اكتشاف ${ddiResult.conflicts.length} تعارض دوائي متوسط الشدة بين الأصناف بالسلة.`
                      : `إرشاد صيدلي: يوجد ${ddiResult.conflicts.length} تداخل دوائي طفيف مسجل بين الأصناف.`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isDdiOverridden && ddiResult.maxSeverity === 'severe' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-paid-soft text-paid border border-paid/30">
                    معتمد إدارياً
                  </span>
                )}
                <span className={`text-[11px] font-bold underline ${
                  ddiResult.maxSeverity === 'severe'
                    ? 'text-danger dark:text-danger-bright'
                    : ddiResult.maxSeverity === 'moderate'
                      ? 'text-warn dark:text-warn-bright'
                      : 'text-brand dark:text-brand-bright'
                }`}>
                  فحص التعارضات
                </span>
              </div>
            </div>
          )}

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
            cycleCartItemUnit={cycleCartItemUnit}
            updateQuantity={updateQuantity}
            setDirectQuantity={setDirectQuantity}
            openWeightEditorForCartItem={openWeightEditorForCartItem}
            onOpenItemDiscount={(index) => {
              setSelectedDiscountItemIndex(index);
              setIsItemDiscountModalOpen(true);
            }}
            removeItem={removeItem}
            canSelectBatch={isEnabled('feature_batch_pricing') && (isAdmin || (hasPermission ? hasPermission('pos.select_batch') : false))}
            onOpenBatchSelection={(index) => {
              const it = cart[index];
              if (!it) return;
              setBatchPickerState({
                cartIndex: index,
                productId: it.productId,
                productName: it.productName,
                currentBatchId: it.batchId,
              });
            }}
            onOpenAlternatives={
              (isEnabled('feature_pharmacy') && (hasPermission ? hasPermission('pharma.alternatives.view') : false))
                ? (index) => {
                    const it = cart[index];
                    if (it) handleOpenAlternatives(it.productId, it.productName);
                  }
                : undefined
            }
            onOpenControlledDispense={(index) => {
              const it = cart[index];
              if (it) {
                setControlledDispenseModalItem({ item: it, index });
              }
            }}
            onPrintDosageLabel={
              isEnabled('feature_pharmacy') && hasPermission('pharma.dosage_labels.print')
                ? (index) => {
                    const it = cart[index];
                    if (it) {
                      setDosageLabelTarget({
                        drugName: it.productName,
                        patientName: it.controlledDispense?.patientName || activeInsuranceClaim?.patientName || '',
                        doctorName: it.controlledDispense?.doctorName || '',
                        instructions: '',
                        storage: it.isColdChain ? 'يحفظ في الثلاجة (2 - 8 مئوية)' : 'يحفظ في مكان جاف وبارد',
                      });
                    }
                  }
                : undefined
            }
            onOpenItemModifiers={showItemModifiers ? handleOpenItemModifiersForCartIndex : undefined}
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
            handleInstapayCheckout={handleInstapayCheckout}
            handleVodafoneCashCheckout={handleVodafoneCashCheckout}
            requestClearCart={requestClearCart}
            handleHoldCurrentSale={handleHoldCurrentSale}
            heldSalesCount={heldSalesCount}
            onOpenHeldSales={() => setIsHeldSalesModalOpen(true)}
            onOpenReturnModal={() => setIsReturnModalOpen(true)}
            onOpenExpenseModal={() => setIsExpenseModalOpen(true)}
            activeInsuranceClaim={activeInsuranceClaim}
            onRemoveInsuranceClaim={() => setActiveInsuranceClaim(null)}
            hasInstapayAccount={digitalAccounts.some((a) => a.accountType === 'instapay' && a.isActive) || Boolean(storeInstapayAddress) || !isEnabled('feature_digital_wallets')}
            hasWalletAccount={digitalAccounts.some((a) => a.accountType === 'wallet' && a.isActive) || Boolean(storeWalletNumber) || !isEnabled('feature_digital_wallets')}
            onNavigateToWallets={isEnabled('feature_digital_wallets') ? onNavigateToWallets : undefined}
            ddiResult={isDdiActive ? ddiResult : null}
            onOpenDdiAlert={() => setIsDdiModalOpen(true)}
            isDdiOverridden={isDdiOverridden}
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
            onOpenVariantMatrixModal={() => setShowVariantMatrixModal(true)}
            onOpenInsuranceModal={(isEnabled('feature_insurance') && (hasPermission ? hasPermission('insurance.sell') : false)) ? () => setIsInsuranceModalOpen(true) : undefined}
            onOpenChronicDispense={
              isEnabled('feature_patient_profiles') && (isAdmin || hasPermission('patients.view'))
                ? () => setIsChronicDispenseOpen(true)
                : undefined
            }
            onOpenQuickShortage={() => {
              setShortageInitialName(barcodeQuery);
              setShortageInitialProductId('');
              setIsQuickShortageOpen(true);
            }}
            onOpenDdiManager={
              isDdiActive && (isAdmin || (hasPermission ? hasPermission('pharma.ddi.manage') : false))
                ? () => setIsDdiManagerOpen(true)
                : undefined
            }
            activeInsuranceClaim={activeInsuranceClaim}
            isCartEmpty={cart.length === 0}
            totalCatalogProductsCount={catalogProducts.length}
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
          />
        )}
      </div>


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
        onOpenVariantMatrixModal={() => setShowVariantMatrixModal(true)}
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

      {/* 10. CASH PAYMENT & CHANGE DUE MODAL (Feature #27 - نقداً / الدرج / الآجل) */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentMethod('cash');
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

      {/* 10.B DIGITAL PAYMENT MODAL (انستاباي ومحافظ الهاتف - مستقلة وبدون آجل) */}
      <DigitalPaymentModal
        isOpen={isDigitalPaymentModalOpen}
        onClose={() => {
          setIsDigitalPaymentModalOpen(false);
          barcodeInputRef.current?.focus();
        }}
        method={digitalPaymentMethod}
        onChangeMethod={setDigitalPaymentMethod}
        invoiceNumber={nextExpectedInvoiceNumber || (lastInvoiceNumber ? lastInvoiceNumber + 1 : 1)}
        itemCount={cart.length}
        totalItemCount={totalItemCount}
        subtotalPiasters={subtotalPiasters}
        discountPiasters={discountPiasters}
        netTotalPiasters={netTotalPiasters}
        selectedCustomerId={selectedCustomerId}
        onCustomerChange={setSelectedCustomerId}
        customers={customers}
        onConfirmPayment={async (paymentData) => {
          setIsDigitalPaymentModalOpen(false);
          await handleConfirmPayment(paymentData);
        }}
        loading={loading}
        onNavigateToWallets={onNavigateToWallets}
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
        initialName={quickAddInitialName}
        initialPriceEgp={quickAddInitialPrice}
        isFromDrugReference={isQuickAddFromDrugRef}
        onClose={() => {
          setIsQuickAddModalOpen(false);
          setUnregisteredBarcode('');
          setQuickAddInitialName('');
          setQuickAddInitialPrice('');
          setIsQuickAddFromDrugRef(false);
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
        onApproved={(supervisorName, verifiedPin) => {
          if (verifiedPin) {
            supervisorPinRef.current = verifiedPin;
          }
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
          void loadHeldSalesCount();
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
          const added = addProductToCart(variantProd);
          if (added) {
            showStatus(`تمت إضافة: ${variantProd.name}`, 'success');
          }
        }}
      />

      {/* 16b. VARIANT MATRIX CREATOR MODAL (Feature #114 / Task 114-4) */}
      <ProductVariantMatrixModal
        isOpen={showVariantMatrixModal}
        onClose={() => {
          setShowVariantMatrixModal(false);
          barcodeInputRef.current?.focus();
        }}
        categories={categories}
        onSuccess={(result) => {
          setShowVariantMatrixModal(false);
          void loadSmartCatalog();
          showStatus(`تم إنشاء مصفوفة المقاسات والألوان بنجاح للصنف "${result.parentProduct.name}"!`, 'success');
          barcodeInputRef.current?.focus();
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
            const added = addProductToCart(unitPickerProduct, undefined, selectedUnit);
            if (added) {
              showStatus(`تمت إضافة: ${unitPickerProduct.name} (${selectedUnit.unitName})`, 'success');
            }
          }
          setUnitPickerProduct(null);
          barcodeInputRef.current?.focus();
        }}
      />



      {/* 19. CASH DRAWER EXPENSE MODAL */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => {
          setIsExpenseModalOpen(false);
          barcodeInputRef.current?.focus();
        }}
        onExpenseAdded={() => {
          showStatus('تم تسجيل المصروف وخصمه من الدرج بنجاح', 'success');
        }}
      />

      {/* 20. BATCH SELECTION MODAL (Feature #184 / Task 184-4) */}
      {batchPickerState && (
        <BatchSelectionModal
          isOpen={batchPickerState !== null}
          onClose={() => {
            setBatchPickerState(null);
            barcodeInputRef.current?.focus();
          }}
          productId={batchPickerState.productId}
          productName={batchPickerState.productName}
          currentBatchId={batchPickerState.currentBatchId}
          onSelectBatch={handleSelectBatchForCartItem}
        />
      )}

      {/* 21. QUICK SHORTAGE MODAL (Feature #186 / Story 129 / Task 186-2) */}
      <QuickShortageModal
        isOpen={isQuickShortageOpen}
        onClose={() => {
          setIsQuickShortageOpen(false);
          barcodeInputRef.current?.focus();
        }}
        initialProductName={shortageInitialName}
        initialProductId={shortageInitialProductId}
        onSuccess={(entry) => {
          showStatus(`تم تسجيل "${entry.productName}" في دفتر النواقص بنجاح`, 'success');
          barcodeInputRef.current?.focus();
        }}
      />

      {/* 22. DRUG ALTERNATIVES DRAWER (Feature #187 / Story 130 / Task 187-5) */}
      <DrugAlternativesDrawer
        isOpen={isAlternativesDrawerOpen}
        onClose={() => {
          setIsAlternativesDrawerOpen(false);
          barcodeInputRef.current?.focus();
        }}
        productId={alternativesProductId}
        productName={alternativesProductName}
        onSubstitute={handleSubstituteCartItem}
        onAddToCart={(prod) => {
          const added = addProductToCart(prod);
          if (added) {
            showStatus(`تمت إضافة البديل: ${prod.name}`, 'success');
          }
        }}
        onOpenShortageModal={(prodId, prodName) => {
          setShortageInitialProductId(prodId || '');
          setShortageInitialName(prodName || '');
          setIsQuickShortageOpen(true);
        }}
      />

      {/* 23. CONTROLLED DRUG DISPENSE MODAL (Story 131 / Feature #188) */}
      {controlledDispenseModalItem && (
        <ControlledDrugDispenseModal
          isOpen={controlledDispenseModalItem !== null}
          item={controlledDispenseModalItem.item}
          onClose={() => {
            setControlledDispenseModalItem(null);
            barcodeInputRef.current?.focus();
          }}
          onSave={(dispense) => {
            setCart((prev) => {
              const updated = [...prev];
              const idx = controlledDispenseModalItem.index;
              if (updated[idx]) {
                updated[idx] = {
                  ...updated[idx],
                  controlledDispense: dispense,
                };
              }
              return updated;
            });
            showStatus(`تم توثيق صرف أدوية الجدول للمريض: ${dispense.patientName}`, 'success');
            setControlledDispenseModalItem(null);
            barcodeInputRef.current?.focus();
          }}
          onRemoveItem={() => {
            removeItem(controlledDispenseModalItem.index);
            setControlledDispenseModalItem(null);
            barcodeInputRef.current?.focus();
          }}
        />
      )}

      {/* 24. INSURANCE PRESCRIPTION MODAL (Story 132 / Feature #189) */}
      {isInsuranceModalOpen && (
        <InsurancePrescriptionModal
          isOpen={isInsuranceModalOpen}
          onClose={() => {
            setIsInsuranceModalOpen(false);
            barcodeInputRef.current?.focus();
          }}
          cart={cart}
          currentClaim={activeInsuranceClaim}
          onApplyClaim={(claim) => {
            setActiveInsuranceClaim(claim);
            showStatus(`تم تطبيق روشتة التأمين: ${claim.companyName} (${claim.contractName}) - حصة المريض: ${formatArabicCurrency(claim.patientPiasters)}`, 'success');
            setIsInsuranceModalOpen(false);
            barcodeInputRef.current?.focus();
          }}
          onRemoveClaim={() => {
            setActiveInsuranceClaim(null);
            showStatus('تم إلغاء روشتة التأمين من الفاتورة', 'success');
            setIsInsuranceModalOpen(false);
            barcodeInputRef.current?.focus();
          }}
        />
      )}

      {/* 25. CHRONIC MEDICATION DISPENSE MODAL (Story 133 / Feature #190) */}
      {isChronicDispenseOpen && (
        <PosChronicDispenseModal
          isOpen={isChronicDispenseOpen}
          onClose={() => {
            setIsChronicDispenseOpen(false);
            barcodeInputRef.current?.focus();
          }}
          customers={customers}
          selectedCustomerId={selectedCustomerId}
          onLoadMedsToCart={handleLoadChronicMedsToCart}
        />
      )}

      {/* 26. CLINICAL ALLERGY ALERT MODAL (Story 133 / Feature #190) */}
      {isAllergyModalOpen && allergyCheckResult && (
        <ClinicalAllergyAlertModal
          isOpen={isAllergyModalOpen}
          onClose={() => setIsAllergyModalOpen(false)}
          alertResult={allergyCheckResult}
          onRemoveItem={handleRemoveAllergyConflictItem}
          onRemoveAllConflicts={handleRemoveAllAllergyConflicts}
        />
      )}

      {/* 27. THERMAL DOSAGE LABEL MODAL (Story 135 / Feature #192) */}
      {dosageLabelTarget && (
        <DosageLabelModal
          isOpen={dosageLabelTarget !== null}
          onClose={() => {
            setDosageLabelTarget(null);
            barcodeInputRef.current?.focus();
          }}
          initialDrugName={dosageLabelTarget.drugName}
          initialPatientName={dosageLabelTarget.patientName}
          initialDoctorName={dosageLabelTarget.doctorName}
          initialInstructions={dosageLabelTarget.instructions}
          initialStorage={dosageLabelTarget.storage}
        />
      )}

      {/* 28. DRUG-DRUG INTERACTIONS (DDI) ALERT MODAL (Story 137 / Feature #194) */}
      {isDdiModalOpen && ddiResult && (
        <DrugInteractionAlertModal
          isOpen={isDdiModalOpen}
          onClose={() => setIsDdiModalOpen(false)}
          result={ddiResult}
          onRemoveProduct={handleRemoveDdiConflictProduct}
          onOpenAlternatives={handleOpenDdiAlternatives}
          onAcknowledgeWarning={() => setIsDdiModalOpen(false)}
          onSupervisorOverride={handleSupervisorDdiOverride}
          canOverrideDirectly={isAdmin}
        />
      )}

      {/* 29. DRUG-DRUG INTERACTIONS (DDI) CLINICAL MANAGER MODAL (Story 137 / Feature #194) */}
      {isDdiManagerOpen && (
        <DrugInteractionManagerModal
          isOpen={isDdiManagerOpen}
          onClose={() => setIsDdiManagerOpen(false)}
          onSuccess={(msg) => showStatus(msg, 'success')}
        />
      )}

      {/* 30. CAFE & RESTAURANT FLOOR TABLES MODAL (Story 139 / Feature #196) */}
      {showTableManagement && (
        <FloorTablesModal
          isOpen={isFloorModalOpen}
          onClose={() => {
            setIsFloorModalOpen(false);
            void loadCafeStats();
            barcodeInputRef.current?.focus();
          }}
          activeTableId={activeTable?.id || null}
          canConfigureFloor={Boolean(isAdmin || (hasPermission && hasPermission('tables.configure_floor')))}
          canTransferMerge={Boolean(isAdmin || (hasPermission && hasPermission('tables.transfer_merge')))}
          canSplitBill={Boolean(isAdmin || (hasPermission && hasPermission('tables.split_bill')))}
          onSelectAndLoadTable={handleSelectTableFromModal}
          onLoadSplitCartForCheckout={handleLoadSplitCartForCheckout}
          onTablesChanged={() => {
            void loadCafeStats();
          }}
        />
      )}

      {/* 31. CAFE & RESTAURANT ITEM MODIFIERS MODAL (Story 140 / Feature #197) */}
      {modifierModalState && (
        <ItemModifiersModal
          isOpen={modifierModalState.isOpen}
          onClose={() => {
            setModifierModalState(null);
            barcodeInputRef.current?.focus();
          }}
          productName={modifierModalState.productName}
          basePricePiasters={modifierModalState.basePricePiasters}
          groups={modifierModalState.groups}
          initialModifiers={modifierModalState.initialModifiers}
          initialNotes={modifierModalState.initialNotes}
          onConfirm={handleConfirmItemModifiers}
        />
      )}

      {/* 32. CAFE & RESTAURANT DELIVERY & RIDERS MODAL (Story 142 / Feature #199) */}
      {showDeliveryManagement && (
        <DeliveryCommandModal
          isOpen={isDeliveryModalOpen}
          onClose={() => {
            setIsDeliveryModalOpen(false);
            void loadCafeStats();
            barcodeInputRef.current?.focus();
          }}
          initialTab={deliveryModalTab}
          currentDeliveryInfo={deliveryInfo}
          customers={customers}
          canManageOrders={Boolean(isAdmin || (hasPermission && hasPermission('delivery.manage_orders')))}
          canSettleRiders={Boolean(isAdmin || (hasPermission && hasPermission('delivery.settle_riders')))}
          canConfigureZonesRiders={Boolean(isAdmin || (hasPermission && hasPermission('delivery.configure_zones_riders')))}
          onApplyDeliveryInfo={(info) => {
            setOrderType('delivery');
            setDeliveryInfo(info);
            showStatus(`تم ربط بيانات التوصيل للعميل: ${info.customerName} (${info.zoneName || 'توصيل'})`, 'success');
          }}
          onOrdersUpdated={() => {
            void loadCafeStats();
          }}
        />
      )}
    </div>
  );
};
