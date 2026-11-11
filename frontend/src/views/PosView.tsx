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
import { useExitValue } from '../hooks/useExitTransition';
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
import { HeldSalePriceReviewModal } from './pos/HeldSalePriceReviewModal';
import { ReturnModal } from '../components/ReturnModal';
import { ProductVariantPickerModal } from '../components/ProductVariantPickerModal';
import { ProductVariantMatrixModal } from '../components/ProductVariantMatrixModal';
import { ProductUnitPickerModal } from '../components/ProductUnitPickerModal';
import { ExpenseModal } from '../components/ExpenseModal';
import { 
  convertArabicLayoutToBarcode,
  loadScannerSettings,
  type BarcodeScannerSettings, 
  DEFAULT_SCANNER_SETTINGS,
  isBarcodeMatch
} from '../utils/barcodeReader';
import { parseScaleBarcode } from '../utils/scaleBarcode';
import { parseInvoiceBarcode, extractLegacyPaddedInvoiceNumber } from '../utils/invoiceBarcode';
import { shouldPrintReceipt } from '../utils/receiptPrintPreference';
import { useFeatures } from '../context/useFeatures';
import { useAuth } from '../context/useAuth';

// Modular POS Subcomponents & Hooks
import type { CartItem } from './pos/types';
import {
  applyCurrentPrices,
  findHeldPriceChanges,
  keepHeldPricesRequiresApproval,
  resolveBaseSellPrice,
  resolveHeldInvoiceDiscount,
  resolveUnitSellPrice,
  serializeHeldCart,
  stripHeldCartMarker,
  type HeldPriceChange,
} from './pos/heldSalePricing';
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
import { enforcesOwnStock } from './pos/stockGuard';
import {
  LIVE_SEARCH_DEBOUNCE_MS,
  LIVE_SEARCH_LIMIT,
  createRequestGate,
  pickDropdownProduct,
  shouldRunLiveSearch,
} from './pos/liveSearch';
import { formatUnitArabic } from '../utils/units';
import { isExactBarcodeCandidate } from './pos/exactBarcode';
import {
  POS_CATALOG_LIMIT,
  applyFreshProductFacts,
  describeRemoteCatalogRequest,
  isCatalogTruncated,
  remoteCatalogKey,
  collectProductIds,
} from './pos/catalogLoad';
import {
  POS_CART_DRAFT_SAVE_DEBOUNCE_MS,
  clearPosCartDraft,
  readPosCartDraftRestore,
  savePosCartDraft,
} from '../utils/posCartDraft';
import { createFingerprintedAttemptKey, isIdempotencyMismatchError } from '../utils/idempotency';

const CATALOG_REFRESH_DEBOUNCE_MS = 400;
// Data-change events raised by this screen's own sale keep being absorbed for this long after the sale call returns
const OWN_SALE_EVENT_WINDOW_MS = 1500;

// Exact barcode scan: indexed equality lookup. An empty answer also covers an older host without the command,
// so the caller then falls back to the regular search.
async function findProductsByExactBarcode(code: string): Promise<Product[]> {
  if (!isExactBarcodeCandidate(code)) return [];
  try {
    return extractProducts(await invoke<unknown>('products:getByExactBarcode', { barcode: code.trim(), limit: 5 }));
  } catch {
    return [];
  }
}
const SHIFT_REQUIRED_MESSAGE = 'لازم تفتح وردية قبل البيع';
const SHIFT_NOTICE_FLASH_MS = 2500;

export interface PosViewProps {
  isActive?: boolean;
  onNavigateToEpay?: () => void;
  onNavigateToWallets?: (subTab?: 'accounts' | 'transact') => void;
}

export const PosView: React.FC<PosViewProps> = ({ isActive = true, onNavigateToEpay, onNavigateToWallets }) => {
  const { hasPermission, isAdmin, currentUser } = useAuth();
  const currentUserId = currentUser ? currentUser.id : null;
  // Mirrors the server-side discount permission checks in SaleService
  const canDiscountInvoice = isAdmin || hasPermission('pos.discount_invoice');
  const canDiscountLine = isAdmin || hasPermission('pos.discount_line');
  // Mirrors the server: admin/root always may sell off-catalog prices, others need pos.price_override
  const canOverridePrice = isAdmin || hasPermission('pos.price_override');
  const { isEnabled } = useFeatures();
  const showFastItems = isEnabled('feature_fast_buttons');
  const showTaxes = isEnabled('feature_taxes');
  const isDdiActive = isEnabled('feature_drug_interactions') || isEnabled('feature_pharmacy');
  const showCafeMode = isEnabled('feature_cafe_restaurant');
  const showTableManagement = showCafeMode && isEnabled('feature_table_management');
  const showKitchenPrinter = showCafeMode && isEnabled('feature_kitchen_printer');
  const showItemModifiers = showCafeMode && isEnabled('feature_item_modifiers');
  const showDeliveryManagement = showCafeMode && isEnabled('feature_delivery_management');

  // A cart saved moments ago (reload/crash) is restored at mount; an older one is only offered through the banner
  const [initialDraftRestore] = useState(() => readPosCartDraftRestore(currentUserId));
  const autoRestoredDraft = initialDraftRestore.mode === 'auto' ? initialDraftRestore.draft : null;
  const [cart, setCart] = useState<CartItem[]>(() => (autoRestoredDraft ? autoRestoredDraft.items : []));
  const [selectedCartIndex, setSelectedCartIndex] = useState<number | null>(() => (autoRestoredDraft ? 0 : null));
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [discountPiasters, setDiscountPiasters] = useState(() => (autoRestoredDraft ? autoRestoredDraft.discountPiasters : 0));
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [quickItems, setQuickItems] = useState<QuickItem[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  // Active products the host holds; larger than catalogProducts.length when only the best sellers were loaded
  const [catalogTotalCount, setCatalogTotalCount] = useState(0);
  const isCatalogLimited = isCatalogTruncated(catalogProducts.length, catalogTotalCount);
  const [remoteCatalog, setRemoteCatalog] = useState<{ key: string; products: Product[]; limited: boolean }>({ key: '', products: [], limited: false });
  const [categories, setCategories] = useState<Category[]>([]);

  const [isQuickItemsManagerOpen, setIsQuickItemsManagerOpen] = useState(false);
  const [isQuickFastItemModalOpen, setIsQuickFastItemModalOpen] = useState(false);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState<number | null>(null);
  const [nextExpectedInvoiceNumber, setNextExpectedInvoiceNumber] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => (autoRestoredDraft && autoRestoredDraft.customerId ? autoRestoredDraft.customerId : ''));
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
  // Bumped when the sections rail is expanded so the catalog opens with it
  const [catalogExpandSignal, setCatalogExpandSignal] = useState(0);
  // Bumped when the catalog is collapsed so the sections rail closes with it
  const [categoriesCollapseSignal, setCategoriesCollapseSignal] = useState(0);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [heldSalesCount, setHeldSalesCount] = useState<number>(0);
  const [isHeldSalesModalOpen, setIsHeldSalesModalOpen] = useState(false);
  const [isRecallReplaceConfirmOpen, setIsRecallReplaceConfirmOpen] = useState(false);
  const [heldPriceReview, setHeldPriceReview] = useState<{
    items: CartItem[];
    changes: HeldPriceChange[];
    invoiceDiscountPiasters: number;
  } | null>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnInitialSale, setReturnInitialSale] = useState<Sale | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isShiftStatusKnown, setIsShiftStatusKnown] = useState(false);
  const [isShiftNoticeFlashing, setIsShiftNoticeFlashing] = useState(false);
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
  } | null>(() => (initialDraftRestore.mode === 'prompt' ? initialDraftRestore.draft : null));
  const [undoItem, setUndoItem] = useState<{ item: CartItem; index: number } | null>(null);
  const undoToast = useExitValue(undoItem);
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
  // The sale key follows the request content: kept for a pure retry of the same cart, rotated when the cart or payments change
  const saleAttemptRef = useRef(createFingerprintedAttemptKey('sale'));
  const addProductToCartRef = useRef<(prod: Product, customWeightMilli?: number, specificUnit?: ProductUnit, isExpiredBypassed?: boolean) => boolean>(() => false);

  const resetCartSession = useCallback(() => {
    saleAttemptRef.current.reset();
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
    onCancelled?: () => void;
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
  // Only the newest live-search request may touch the dropdown; the ref remembers which query the shown results answer
  const liveSearchGate = useMemo(() => createRequestGate(), []);
  const liveSearchResultsQueryRef = useRef('');

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

  const hasOpenShift = Boolean(currentShift) && currentShift?.status !== 'closed';
  const canOpenShift = isAdmin || hasPermission('shifts.open');

  // The shift modal lives in App and listens for this event (the header shift button opens the same modal)
  const openShiftModal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('rafiq:open-shift-modal'));
  }, []);

  const shiftFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyShiftRequired = useCallback(() => {
    showStatus(SHIFT_REQUIRED_MESSAGE, 'warning');
    setIsShiftNoticeFlashing(true);
    if (shiftFlashTimerRef.current) clearTimeout(shiftFlashTimerRef.current);
    shiftFlashTimerRef.current = setTimeout(() => {
      setIsShiftNoticeFlashing(false);
      shiftFlashTimerRef.current = null;
    }, SHIFT_NOTICE_FLASH_MS);
  }, [showStatus]);

  useEffect(() => {
    return () => {
      if (shiftFlashTimerRef.current) clearTimeout(shiftFlashTimerRef.current);
    };
  }, []);

  const requestClearCart = useCallback(() => {
    if (cart.length === 0) return;
    setIsClearConfirmOpen(true);
  }, [cart.length]);

  const confirmClearCart = () => {
    setIsClearConfirmOpen(false);
    setCart([]);
    setSelectedCartIndex(null);
    setDiscountPiasters(0);
    setSelectedCustomerId('');
    setActiveInsuranceClaim(null);
    setAllergyCheckResult(null);
    setIsAllergyModalOpen(false);
    setDdiResult(null);
    setIsDdiOverridden(false);
    setIsDdiModalOpen(false);
    setIsDdiManagerOpen(false);
    resetCartSession();
    clearPosCartDraft();
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
      showStatus(`تم اعتماد إضافة الصنف المنتهي "${prod.name}" بتصريح إداري`, 'warning');
    }

    let unitToUse = specificUnit;
    if (!unitToUse && prod.units && prod.units.length > 0) {
      if (prod.defaultSaleUnitId) {
        unitToUse = prod.units.find(u => u.id === prod.defaultSaleUnitId);
      }
      if (!unitToUse && prod.displayUnitId) {
        unitToUse = prod.units.find(u => u.id === prod.displayUnitId);
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
    const unitPrice = resolveUnitSellPrice(resolveBaseSellPrice(prod, isEnabled('feature_batch_pricing')), unitToUse);
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

    if (enforcesOwnStock(allowNegativeStock, prod)) {
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
          `رصيد الصنف "${prod.name}" غير كافٍ في المخزن! المتاح حالياً: ${Math.floor(availableStockMilli / 1000)} قطعة (يمكنك إضافة ${maxPossibleUnits} ${formatUnitArabic(unitName)} كحد أقصى).`,
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
        const existing = updated[idx];
        const updatedQty = customWeightMilli !== undefined ? (existing.quantityMilli + customWeightMilli) : (existing.quantityMilli + 1000);
        const lineTotal = calculateLineTotal(existing.unitPricePiasters, updatedQty, existing.discountPiasters);
        // A new object per change keeps the updater pure (StrictMode runs it twice)
        updated[idx] = {
          ...existing,
          quantityMilli: updatedQty,
          unit: unitName,
          unitName: unitName,
          unitId: unitId,
          conversionFactor: factor,
          isDivisible: isDivisible,
          totalPiasters: lineTotal,
          taxPiasters: calculateTaxPiasters(lineTotal, existing.taxRatePercent || 0, true),
        };
        setSelectedCartIndex(idx);
        return updated;
      }

      const totalPiasters = calculateLineTotal(unitPrice, qtyMilli, 0);
      const taxRate = showTaxes ? (prod.taxRatePercent || 0) : 0;
      const isControlled = Boolean(prod.isControlled || (prod.controlledSchedule && prod.controlledSchedule !== 'none') || prod.rxStatus === 'controlled');
      const newItem: CartItem = {
        productId: prod.id,
        productName: prod.name,
        barcode: (unitToUse && unitToUse.barcode) || prod.barcode,
        quantityMilli: qtyMilli,
        unitPricePiasters: unitPrice,
        basePricePiasters: resolveBaseSellPrice(prod, isEnabled('feature_batch_pricing')),
        unitCostPiasters: unitCost,
        discountPiasters: 0,
        totalPiasters: totalPiasters,
        taxPiasters: calculateTaxPiasters(totalPiasters, taxRate, true),
        taxRatePercent: taxRate,
        stockQuantityMilli: prod.stockQuantityMilli,
        consumesIngredientsOnSale: prod.consumesIngredientsOnSale,
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

      setSelectedCartIndex(0);
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
  }, [cart, allowNegativeStock, showStatus, isEnabled, showItemModifiers, showTaxes]);

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
      if (enforcesOwnStock(allowNegativeStock, item)) {
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
            `لا يمكن التحويل إلى "${formatUnitArabic(targetUnit.unitName)}": الكمية المطلوبة تتجاوز رصيد المخزن المتاح (${Math.floor(availableStockMilli / 1000)} قطعة)!`,
            'error'
          );
          return prev;
        }
      }

      const baseUnit = item.productUnits.find(u => u.isBaseUnit);
      const currentFactor = item.conversionFactor && item.conversionFactor > 0 ? item.conversionFactor : 1;
      const basePrice = baseUnit && baseUnit.sellPricePiasters > 0 
        ? baseUnit.sellPricePiasters 
        : (item.basePricePiasters && item.basePricePiasters > 0
          ? item.basePricePiasters
          : Math.round(item.unitPricePiasters / currentFactor));
      const baseCost = baseUnit && baseUnit.costPricePiasters > 0 
        ? baseUnit.costPricePiasters 
        : Math.round(item.unitCostPiasters / currentFactor);

      const newPrice = targetUnit.sellPricePiasters > 0 ? targetUnit.sellPricePiasters : (basePrice * newFactor);
      const newCost = targetUnit.costPricePiasters > 0 ? targetUnit.costPricePiasters : (baseCost * newFactor);

      const newQuantityMilli = (!targetUnit.isDivisible && (item.quantityMilli % 1000 !== 0))
        ? Math.max(1000, Math.round(item.quantityMilli / 1000) * 1000)
        : item.quantityMilli;
      const newTotal = calculateLineTotal(newPrice, newQuantityMilli, item.discountPiasters);
      // A new object per change keeps the updater pure (StrictMode runs it twice)
      updated[index] = {
        ...item,
        unitId: targetUnit.id,
        unitName: targetUnit.unitName,
        conversionFactor: newFactor,
        unit: targetUnit.unitName,
        unitPricePiasters: newPrice,
        unitCostPiasters: newCost,
        isDivisible: targetUnit.isDivisible,
        quantityMilli: newQuantityMilli,
        totalPiasters: newTotal,
        taxPiasters: calculateTaxPiasters(newTotal, item.taxRatePercent || 0, true),
      };
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
      const lineTotal = calculateLineTotal(it.unitPricePiasters, it.quantityMilli, itemDiscountPiasters);
      updated[index] = {
        ...it,
        discountPiasters: itemDiscountPiasters,
        totalPiasters: lineTotal,
        taxPiasters: calculateTaxPiasters(lineTotal, it.taxRatePercent || 0, true),
      };
      // Line discounts stay on the item; discountPiasters is the invoice-level discount only
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
    showStatus(`تم تحميل أصناف طاولة ${sourceTable.name}`, 'success');
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
        cartJson: serializeHeldCart(cart),
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
      showStatus(`تم حفظ طلب طاولة ${activeTable.name}`, 'success');
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
          cartJson: serializeHeldCart(cart),
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
      showStatus(res?.message || 'تم إرسال طلب المطبخ والبار', 'success');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'تعذر طباعة تذكرة المطبخ', 'error');
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
        cartJson: serializeHeldCart(cart),
        itemsCount: cart.length,
        subtotalPiasters,
        discountPiasters,
        customerId: selectedCustomerId || undefined,
        customerName: cust?.name,
        totalPiasters: netTotalPiasters,
      });
      setCart([]);
      setSelectedCartIndex(null);
      setDiscountPiasters(0);
      setSelectedCustomerId('');
      resetCartSession();
      clearPosCartDraft();
      await loadHeldSalesCount();
      showStatus('تم تعليق الفاتورة', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تعليق الفاتورة';
      showStatus(msg, 'error');
    } finally {
      setLoading(false);
      barcodeInputRef.current?.focus();
    }
  }, [cart, subtotalPiasters, discountPiasters, selectedCustomerId, customers, netTotalPiasters, loadHeldSalesCount, resetCartSession, showStatus]);

  // Supervisor approvals belong to the original cart session, so a recalled invoice discount is re-approved here
  const applyRecalledInvoiceDiscount = useCallback((items: CartItem[], heldInvoiceDiscount: number) => {
    const heldGross = items.reduce((sum, it) => sum + Math.round((it.unitPricePiasters * it.quantityMilli) / 1000), 0);
    const heldTotalDiscount = heldInvoiceDiscount + items.reduce((sum, it) => sum + (it.discountPiasters || 0), 0);
    const exceedsCashierLimit = currentUserRole === 'cashier' && heldGross > 0 &&
      (heldTotalDiscount * 100 > maxDiscountPercentCashier * heldGross || heldTotalDiscount > maxDiscountAmountCashierPiasters);
    if (heldInvoiceDiscount > 0 && (!canDiscountInvoice || exceedsCashierLimit)) {
      setDiscountPiasters(0);
      setSupervisorPrompt({
        isOpen: true,
        title: 'اعتماد خصم الفاتورة المعلقة',
        description: `الفاتورة المسترجعة عليها خصم ${formatArabicCurrency(heldInvoiceDiscount)} يحتاج اعتماد المشرف مرة أخرى. عند الإلغاء تُسترجع الفاتورة بدون هذا الخصم.`,
        onApproved: () => setDiscountPiasters(heldInvoiceDiscount),
      });
    } else {
      setDiscountPiasters(heldInvoiceDiscount);
    }
  }, [currentUserRole, maxDiscountPercentCashier, maxDiscountAmountCashierPiasters, canDiscountInvoice]);

  // Products by id for price checks and bundle costs: the loaded catalogue first, the host for the rest
  const lookupProductsByIds = useCallback(async (ids: string[]): Promise<Product[]> => {
    const wanted = Array.from(new Set(ids.filter(Boolean)));
    if (wanted.length === 0) return [];
    const loadedById = new Map<string, Product>();
    for (const p of catalogProducts) loadedById.set(p.id, p);
    const found: Product[] = [];
    const missing: string[] = [];
    for (const id of wanted) {
      const loaded = loadedById.get(id);
      if (loaded) found.push(loaded);
      else missing.push(id);
    }
    if (missing.length > 0) {
      try {
        const fetched = await invoke<unknown>('products:getByIds', { ids: missing, limit: missing.length });
        found.push(...extractProducts(fetched));
      } catch {
        // The caller continues with what is known
      }
    }
    return found;
  }, [catalogProducts]);

  const handleRecallHeldSale = useCallback(async (heldSale: HeldSale) => {
    let heldLines: Array<CartItem & { heldFormatVersion?: number }> = [];
    if (Array.isArray(heldSale.items) && heldSale.items.length > 0) {
      heldLines = heldSale.items as CartItem[];
    } else if (heldSale.cartJson) {
      try {
        const parsed = JSON.parse(heldSale.cartJson);
        if (Array.isArray(parsed)) heldLines = parsed as CartItem[];
      } catch {
        // ignore
      }
    }
    if (heldLines.length === 0) return;

    // Owner rule: a recalled sale keeps the prices it was held with; catalog changes are only offered, never applied silently
    const heldInvoiceDiscount = resolveHeldInvoiceDiscount(heldLines, heldSale.discountPiasters);
    const itemsToRestore: CartItem[] = stripHeldCartMarker(heldLines);
    // A large catalogue is not fully loaded: read the held products from the host so no price change is missed
    const pricedProducts = isCatalogLimited
      ? await lookupProductsByIds(collectProductIds(itemsToRestore))
      : catalogProducts;
    const priceChanges = findHeldPriceChanges(itemsToRestore, pricedProducts, isEnabled('feature_batch_pricing'));

    setCart(itemsToRestore);
    setDiscountPiasters(0);
    setSelectedCustomerId(heldSale.customerId || '');
    resetCartSession();
    void loadHeldSalesCount();

    if (priceChanges.length > 0) {
      setHeldPriceReview({ items: itemsToRestore, changes: priceChanges, invoiceDiscountPiasters: heldInvoiceDiscount });
      return;
    }
    applyRecalledInvoiceDiscount(itemsToRestore, heldInvoiceDiscount);
    showStatus(`تم استرجاع الفاتورة المعلقة (${itemsToRestore.length} صنف)`, 'success');
    barcodeInputRef.current?.focus();
  }, [catalogProducts, isCatalogLimited, lookupProductsByIds, isEnabled, loadHeldSalesCount, resetCartSession, showStatus, applyRecalledInvoiceDiscount]);

  const updateRecalledToCurrentPrices = useCallback((review: NonNullable<typeof heldPriceReview>, message: string) => {
    const repriced = applyCurrentPrices(review.items, review.changes);
    setCart(repriced);
    applyRecalledInvoiceDiscount(repriced, review.invoiceDiscountPiasters);
    showStatus(message, 'warning');
    barcodeInputRef.current?.focus();
  }, [applyRecalledInvoiceDiscount, showStatus]);

  const keepRequiresApproval = heldPriceReview !== null &&
    keepHeldPricesRequiresApproval(heldPriceReview.changes, canOverridePrice);

  const handleKeepHeldPrices = useCallback(() => {
    if (!heldPriceReview) return;
    const review = heldPriceReview;
    setHeldPriceReview(null);
    const keepHeld = () => {
      applyRecalledInvoiceDiscount(review.items, review.invoiceDiscountPiasters);
      showStatus('تم استرجاع الفاتورة المعلقة بأسعار التعليق الأصلية', 'success');
      barcodeInputRef.current?.focus();
    };
    if (!keepHeldPricesRequiresApproval(review.changes, canOverridePrice)) {
      keepHeld();
      return;
    }
    // Server price authority accepts non-catalog prices from this user only with the verified supervisor PIN sent at checkout
    setSupervisorPrompt({
      isOpen: true,
      title: 'اعتماد البيع بأسعار الفاتورة المعلقة',
      description: `${review.changes.length} صنف سعره الحالي مختلف عن سعر التعليق. البيع بسعر التعليق يحتاج اعتماد المشرف.`,
      onApproved: keepHeld,
      onCancelled: () => updateRecalledToCurrentPrices(
        review,
        'لم يتم اعتماد أسعار التعليق، فتم تحديث الأصناف للأسعار الحالية في الكتالوج'
      ),
    });
  }, [heldPriceReview, canOverridePrice, applyRecalledInvoiceDiscount, showStatus, updateRecalledToCurrentPrices]);

  const handleUpdateHeldToCurrentPrices = useCallback(() => {
    if (!heldPriceReview) return;
    const review = heldPriceReview;
    setHeldPriceReview(null);
    updateRecalledToCurrentPrices(review, `تم تحديث أسعار ${review.changes.length} صنف للأسعار الحالية بموافقة الكاشير`);
  }, [heldPriceReview, updateRecalledToCurrentPrices]);

  const requestOpenHeldSales = useCallback(() => {
    if (cart.length > 0) {
      setIsRecallReplaceConfirmOpen(true);
      return;
    }
    setIsHeldSalesModalOpen(true);
  }, [cart.length]);

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
    } finally {
      setIsShiftStatusKnown(true);
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
      setIsShiftStatusKnown(true);
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

  // Load Quick Items & Inventory Products (Smart Catalog); only the newest request may apply its answer.
  // Only the best sellers / quick items are loaded (bounded); the rest of a large catalogue is searched on demand.
  const catalogLoadSeqRef = useRef(0);
  const loadSmartCatalog = useCallback(async () => {
    const seq = ++catalogLoadSeqRef.current;
    try {
      const res = await invoke<{ products?: Product[]; customQuickItems?: QuickItem[]; totalCount?: number }>('products:getSmartCatalog', { limit: POS_CATALOG_LIMIT }).catch(() => null);
      if (seq !== catalogLoadSeqRef.current) return;
      if (res && Array.isArray(res.products)) {
        setCatalogProducts(res.products);
        setCatalogTotalCount(typeof res.totalCount === 'number' ? res.totalCount : res.products.length);
        if (Array.isArray(res.customQuickItems)) {
          setQuickItems(res.customQuickItems);
        }
      } else {
        const [pData, qData] = await Promise.all([
          invoke<Product[]>('products:getAll', { limit: POS_CATALOG_LIMIT + 1 }).catch(() => []),
          invoke<QuickItem[]>('quickItems:getAll').catch(() => [])
        ]);
        if (seq !== catalogLoadSeqRef.current) return;
        if (Array.isArray(pData)) {
          // One row more than the bound proves the catalogue is larger than what is shown
          setCatalogProducts(pData.slice(0, POS_CATALOG_LIMIT));
          setCatalogTotalCount(pData.length);
        }
        if (Array.isArray(qData)) setQuickItems(qData);
      }
    } catch {
      // Offline fallback
    }
  }, []);

  useEffect(() => {
    void loadSmartCatalog();
  }, [loadSmartCatalog]);

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

  // The cashier screen stays mounted while hidden. Products/categories changes made elsewhere (import, product card,
  // purchases, a sale) refresh the sections + tiles once, shortly after the last change; while hidden we skip it
  // and reload when the cashier view becomes visible again.
  const isActiveRef = useRef(isActive);
  const catalogRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While this screen's own sale runs, the data-change events it causes must not reload the whole catalogue:
  // the sold products are re-read by id afterwards instead.
  const ownSaleRefreshRef = useRef({ active: false, pending: false });
  const scheduleCatalogRefresh = useCallback(() => {
    if (!isActiveRef.current) return;
    if (ownSaleRefreshRef.current.active) {
      ownSaleRefreshRef.current.pending = true;
      return;
    }
    if (catalogRefreshTimerRef.current) clearTimeout(catalogRefreshTimerRef.current);
    catalogRefreshTimerRef.current = setTimeout(() => {
      catalogRefreshTimerRef.current = null;
      void loadCategories();
      void loadSmartCatalog();
    }, CATALOG_REFRESH_DEBOUNCE_MS);
  }, [loadCategories, loadSmartCatalog]);
  useDataSubscription(['products', 'categories', 'all'], scheduleCatalogRefresh);

  // After a sale only the sold products changed: re-read their stock/price by id instead of reloading the catalogue
  const refreshSoldProducts = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const fresh = extractProducts(await invoke<unknown>('products:getByIds', { ids, limit: ids.length }));
      if (fresh.length > 0) setCatalogProducts((prev) => applyFreshProductFacts(prev, fresh));
    } catch {
      void loadSmartCatalog();
    }
  }, [loadSmartCatalog]);

  useEffect(() => {
    const wasActive = isActiveRef.current;
    isActiveRef.current = isActive;
    if (isActive && !wasActive) {
      void loadCategories();
      void loadSmartCatalog();
    }
  }, [isActive, loadCategories, loadSmartCatalog]);

  useEffect(() => () => {
    if (catalogRefreshTimerRef.current) clearTimeout(catalogRefreshTimerRef.current);
  }, []);

  useDataSubscription(['customers', 'all'], () => {
    void loadCustomers();
  });
  useDataSubscription(['held_sales', 'all'], () => {
    void loadHeldSalesCount();
  });
  useDataSubscription(['wallets', 'all'], () => {
    void loadDigitalAccounts();
  });

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

  // Feature #132: Auto-save draft on cart change (debounced; a reload or crash restores it at the next mount)
  const draftPendingPromptRef = useRef(false);
  const latestDraftRef = useRef({ cart, discountPiasters, customerId: selectedCustomerId, userId: currentUserId });
  useEffect(() => {
    draftPendingPromptRef.current = draftPrompt !== null;
    latestDraftRef.current = { cart, discountPiasters, customerId: selectedCustomerId, userId: currentUserId };
  }, [draftPrompt, cart, discountPiasters, selectedCustomerId, currentUserId]);

  useEffect(() => {
    if (cart.length === 0) {
      // An offered-but-undecided draft stays in storage so a second reload can still offer it
      if (!draftPendingPromptRef.current) clearPosCartDraft();
      return;
    }
    const timer = setTimeout(() => {
      savePosCartDraft(cart, discountPiasters, selectedCustomerId || null, currentUserId);
    }, POS_CART_DRAFT_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [cart, discountPiasters, selectedCustomerId, currentUserId]);

  // A change made inside the debounce window must still survive a reload that happens right after it
  useEffect(() => {
    const flush = () => {
      const latest = latestDraftRef.current;
      if (latest.cart.length === 0) return;
      savePosCartDraft(latest.cart, latest.discountPiasters, latest.customerId || null, latest.userId);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // The restored cart is announced once so the cashier knows the invoice in front of them came back
  useEffect(() => {
    if (autoRestoredDraft) showStatus('تم استرجاع الفاتورة الجارية', 'success');
  }, [autoRestoredDraft, showStatus]);

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
      showStatus('تنبيه سريري حرج: إتمام البيع محظور تلقائياً لوجود تعارض دوائي شديد الخطورة! يرجى إزالة الدواء أو إدخال رمز اعتماد المشرف.', 'error');
      setIsDdiModalOpen(true);
      return;
    }
    if (requireOpenShiftToSell && !hasOpenShift) {
      notifyShiftRequired();
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
  }, [cart, hasOpenShift, requireOpenShiftToSell, showStatus, notifyShiftRequired, isDdiActive, ddiResult, isDdiOverridden]);

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
    if (requireOpenShiftToSell && !hasOpenShift) {
      notifyShiftRequired();
      return;
    }
    isCheckingOutRef.current = true;
    ownSaleRefreshRef.current.active = true;
    ownSaleRefreshRef.current.pending = false;
    let saleSucceeded = false;
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
        idempotencyKey: undefined,
        supervisorPin: paymentData.supervisorPin || supervisorPinRef.current || undefined,
        controlledDispenses: controlledDispenses.length > 0 ? (controlledDispenses as ControlledDrugDispense[]) : undefined,
        insuranceClaim: activeInsuranceClaim || undefined,
        orderType: showCafeMode ? orderType : 'retail',
        tableId: showCafeMode && orderType === 'dine_in' && activeTable ? activeTable.id : null,
        tableName: showCafeMode && orderType === 'dine_in' && activeTable ? activeTable.name : null,
        guestsCount: showCafeMode && orderType === 'dine_in' && activeTable ? (activeTable.guestsCount || 1) : 1,
        waiterName: showCafeMode && orderType === 'dine_in' && activeTable ? (activeTable.waiterName || null) : null,
        serviceChargePiasters,
        deliveryFeePiasters,
        deliveryInfo: showCafeMode && orderType === 'delivery' ? deliveryInfo : null,
      };

      // Same request content keeps the key (safe retry after a timeout); any cart/payment change gets a new key
      salePayload.idempotencyKey = saleAttemptRef.current.keyFor(
        JSON.stringify({ ...salePayload, idempotencyKey: undefined, supervisorPin: undefined })
      );
      const completedSale = await invoke<Sale>('sales:create', salePayload);
      setLastInvoiceNumber(completedSale.invoiceNumber || null);
      if (completedSale.invoiceNumber) {
        setNextExpectedInvoiceNumber(completedSale.invoiceNumber + 1);
      }
      setLastCompletedSale(completedSale);

      // Post-sale print flow: the cashier's print switch decides (falls back to the store setting).
      // Print ON = silent print by sale id, no window; the preview opens only if printing fails so the cashier can retry.
      // Print OFF = no print and no window (reprint stays available from the invoice history).
      setIsReceiptOpen(false);
      if (shouldPrintReceipt()) {
        const reportPrintFailure = (printMsg: string) => {
          showStatus(`تم حفظ الفاتورة #${completedSale.invoiceNumber || ''} لكن فشلت الطباعة: ${printMsg}`, 'warning');
          setIsReceiptOpen(true);
        };
        void invoke<{ success?: boolean; message?: string }>('printer:printReceipt', { saleId: completedSale.id })
          .then((res) => {
            if (res && res.success === false) reportPrintFailure(res.message || 'تعذر إرسال أمر الطباعة');
          })
          .catch((printErr: unknown) => {
            reportPrintFailure(printErr instanceof Error ? printErr.message : 'تعذر إرسال أمر الطباعة');
          });
      }

      if (completedSale.negativeStockWarnings && completedSale.negativeStockWarnings.length > 0) {
        showStatus(`تم حفظ الفاتورة #${completedSale.invoiceNumber || ''} - ${completedSale.negativeStockWarnings[0]}`, 'warning');
      } else {
        showStatus(`تم حفظ الفاتورة #${completedSale.invoiceNumber || ''}`, 'success');
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
      setSelectedCartIndex(null);
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
      saleSucceeded = true;
      void refreshSoldProducts(collectProductIds(cart));
      void loadHeldSalesCount();
      void loadCafeStats();
      clearPosCartDraft();
    } catch (err: unknown) {
      // The server rejected the key for a different request: the next attempt must not reuse it
      if (isIdempotencyMismatchError(err)) saleAttemptRef.current.reset();
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
      // Late data-change events of this sale are absorbed; a failed sale still lets an outside change refresh the catalogue
      setTimeout(() => {
        ownSaleRefreshRef.current.active = false;
        if (ownSaleRefreshRef.current.pending && !saleSucceeded) scheduleCatalogRefresh();
        ownSaleRefreshRef.current.pending = false;
      }, OWN_SALE_EVENT_WINDOW_MS);
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
    refreshSoldProducts,
    scheduleCatalogRefresh,
    loadHeldSalesCount,
    loadCafeStats,
    resetCartSession,
    currentShift,
    hasOpenShift,
    notifyShiftRequired,
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

      if (enforcesOwnStock(allowNegativeStock, item)) {
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
            `الكمية المطلوبة (${newQtyPieces}) تتجاوز رصيد المخزن المتاح (${maxPossibleUnits} ${formatUnitArabic(item.unitName)})!`,
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

  // Debounced live name search. Barcode-like input (scanner bursts) never searches here; Enter resolves it.
  // A response is applied only while it is still the newest request, so a late answer can never reopen the dropdown.
  useEffect(() => {
    const q = barcodeQuery.trim();
    if (!shouldRunLiveSearch(q)) {
      liveSearchGate.invalidate();
      setIsSearching(false);
      setLiveSearchResults((prev) => (prev.length === 0 ? prev : []));
      setIsSearchDropdownOpen(false);
      return;
    }

    const requestId = liveSearchGate.begin();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await invoke<unknown>('products:search', { query: q, limit: LIVE_SEARCH_LIMIT, includeCounts: false });
        if (!liveSearchGate.isCurrent(requestId)) return;
        const results = extractProducts(res);
        liveSearchResultsQueryRef.current = q;
        setLiveSearchResults(results);
        setIsSearchDropdownOpen(results.length > 0);
        setSelectedDropdownIndex(0);
      } catch {
        if (liveSearchGate.isCurrent(requestId)) {
          setLiveSearchResults([]);
          setIsSearchDropdownOpen(false);
        }
      } finally {
        if (liveSearchGate.isCurrent(requestId)) setIsSearching(false);
      }
    }, LIVE_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      liveSearchGate.invalidate();
    };
  }, [barcodeQuery, liveSearchGate]);

  // Close live search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        liveSearchGate.invalidate();
        setIsSearching(false);
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [liveSearchGate]);

  // Drops any pending/in-flight live search and hides the dropdown (used before a barcode is resolved or a modal opens)
  const dismissLiveSearch = useCallback(() => {
    liveSearchGate.invalidate();
    setIsSearching(false);
    setIsSearchDropdownOpen(false);
    setLiveSearchResults([]);
    setSelectedDropdownIndex(0);
  }, [liveSearchGate]);

  const handleQuickProductCreated = useCallback((newProd: Product) => {
    addProductToCart(newProd);
    setBarcodeQuery('');
    dismissLiveSearch();
    showStatus(`تم تسجيل الصنف وإضافته للسلة: ${newProd.name}`, 'success');
    void loadSmartCatalog();
    barcodeInputRef.current?.focus();
  }, [addProductToCart, showStatus, loadSmartCatalog, dismissLiveSearch]);

  const handleOpenScannedInvoice = useCallback(async (invMatch: ReturnType<typeof parseInvoiceBarcode>) => {
    if (!invMatch) return false;
    if (invMatch.type === 'sale') {
      try {
        setLoading(true);
        let sale: Sale | null = null;
        if (invMatch.invoiceNumber) {
          sale = await invoke<Sale>('sales:getByInvoiceNumber', { invoiceNumber: invMatch.invoiceNumber }).catch(() => null);
        } else if (invMatch.rawId) {
          sale = await invoke<Sale>('sales:getById', { id: invMatch.rawId }).catch(() => null);
        }

        if (sale && sale.id) {
          setLastCompletedSale(sale);
          setIsReceiptOpen(true);
          setBarcodeQuery('');
          dismissLiveSearch();
          showStatus(`تم العثور على الفاتورة رقم #${sale.invoiceNumber} وعرض تفاصيلها بنجاح`, 'success');
          return true;
        } else {
          showStatus(`لم يتم العثور على أي فاتورة برقم "${invMatch.invoiceNumber || invMatch.originalQuery}" في قاعدة البيانات`, 'warning');
          setBarcodeQuery('');
          dismissLiveSearch();
          return true;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        showStatus(`تعذر فحص الفاتورة: ${msg}`, 'error');
        setBarcodeQuery('');
        return true;
      } finally {
        setLoading(false);
        barcodeInputRef.current?.focus();
      }
    } else if (invMatch.type === 'return') {
      showStatus(`تم مسح إيصال المرتجع رقم #${invMatch.invoiceNumber}`, 'success');
      setBarcodeQuery('');
      dismissLiveSearch();
      return true;
    }
    return false;
  }, [showStatus, dismissLiveSearch]);

  const handleFastBarcodeScan = useCallback(async (scannedBarcode: string) => {
    if (!scannedBarcode) return;
    const invMatch = parseInvoiceBarcode(scannedBarcode);
    if (invMatch) {
      const handled = await handleOpenScannedInvoice(invMatch);
      if (handled) return;
    }
    dismissLiveSearch();
    try {
      setLoading(true);
      const scaleInfo = isEnabled('feature_scale_weight') ? parseScaleBarcode(scannedBarcode) : null;
      let scaleWeightMilli: number | undefined;

      // Exact barcode first (indexed); the name/LIKE search runs only when nothing matched and the input is not a scale label
      let results = await findProductsByExactBarcode(scannedBarcode);
      let res: unknown;
      if (results.length === 0 && !scaleInfo) {
        res = await invoke<unknown>('products:search', { query: scannedBarcode, limit: 5, includeCounts: false });
        results = extractProducts(res);
      }

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
            const u = p.units.find(unit => isBarcodeMatch(unit.barcode, scannedBarcode));
            if (u) {
              matchedUnit = u;
              return true;
            }
          }
          return isBarcodeMatch(p.barcode, scannedBarcode) || (p.barcodes && p.barcodes.some(bc => isBarcodeMatch(bc, scannedBarcode)));
        }) || results[0];

        if (!matchedUnit && exactMatch.units && exactMatch.units.length > 0) {
          matchedUnit = exactMatch.units.find(u => isBarcodeMatch(u.barcode, scannedBarcode));
        }

        addProductToCart(exactMatch, scaleWeightMilli, matchedUnit);
        setBarcodeQuery('');
        setIsSearchDropdownOpen(false);
        const unitSuffix = matchedUnit ? ` [${formatUnitArabic(matchedUnit.unitName)}]` : '';
        const weightDesc = scaleWeightMilli ? ` (${(scaleWeightMilli / 1000.0).toFixed(3)} كجم - ميزان)` : '';
        showStatus(`تمت إضافة: ${exactMatch.name}${unitSuffix}${weightDesc}`, 'success');
      } else {
        setBarcodeQuery('');
        dismissLiveSearch();
        const legacyInvNum = extractLegacyPaddedInvoiceNumber(scannedBarcode);
        if (legacyInvNum) {
          const legacySale = await invoke<Sale>('sales:getByInvoiceNumber', { invoiceNumber: legacyInvNum }).catch(() => null);
          if (legacySale && legacySale.id) {
            setLastCompletedSale(legacySale);
            setIsReceiptOpen(true);
            showStatus(`تم العثور على الفاتورة رقم #${legacySale.invoiceNumber} وعرض تفاصيلها بنجاح`, 'success');
            return;
          }
        }
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
  }, [addProductToCart, showStatus, catalogProducts, isEnabled, dismissLiveSearch, handleOpenScannedInvoice]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (liveSearchResults.length > 0) {
        e.preventDefault();
        setIsSearchDropdownOpen(true);
        setSelectedDropdownIndex((prev) => (prev + 1) % liveSearchResults.length);
      } else if (cart.length > 0) {
        e.preventDefault();
        setSelectedCartIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, cart.length - 1);
        });
      }
    } else if (e.key === 'ArrowUp') {
      if (liveSearchResults.length > 0) {
        e.preventDefault();
        setIsSearchDropdownOpen(true);
        setSelectedDropdownIndex((prev) => (prev - 1 + liveSearchResults.length) % liveSearchResults.length);
      } else if (cart.length > 0) {
        e.preventDefault();
        setSelectedCartIndex((prev) => {
          if (prev === null) return cart.length - 1;
          return Math.max(prev - 1, 0);
        });
      }
    } else if (e.key === 'Escape') {
      dismissLiveSearch();
    }
  };

  const handleBarcodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const typed = barcodeQuery.trim();
    const query = convertArabicLayoutToBarcode(typed);
    if (!query) return;

    // Distinct Invoice Barcode Instant Auto-Open
    const invMatch = parseInvoiceBarcode(query) || parseInvoiceBarcode(typed);
    if (invMatch) {
      const handled = await handleOpenScannedInvoice(invMatch);
      if (handled) return;
    }

    // Priority 1 (in memory): an exact barcode match in the dropdown always wins over the highlighted row;
    // the highlighted row is used only while the dropdown still answers what is typed now
    const picked = pickDropdownProduct({
      results: liveSearchResults,
      isOpen: isSearchDropdownOpen,
      resultsQuery: liveSearchResultsQueryRef.current,
      currentQuery: typed,
      submitted: query,
      selectedIndex: selectedDropdownIndex,
    });
    if (picked) {
      const added = addProductToCart(picked.product, undefined, picked.unit);
      setBarcodeQuery('');
      dismissLiveSearch();
      if (added) {
        showStatus(`تمت إضافة: ${picked.product.name}`, 'success');
      }
      barcodeInputRef.current?.focus();
      return;
    }

    try {
      setLoading(true);
      const scaleInfo = isEnabled('feature_scale_weight') ? parseScaleBarcode(query) : null;
      let scaleWeightMilli: number | undefined;

      // The layout conversion garbles Arabic names, so a name is searched as typed and only then as a mistyped barcode
      const hasArabicLetters = /[\u0621-\u064A]/.test(typed);
      let results = hasArabicLetters ? [] : await findProductsByExactBarcode(query);
      let res: unknown;
      if (results.length === 0 && (hasArabicLetters || !scaleInfo)) {
        res = await invoke<unknown>('products:search', { query: hasArabicLetters ? typed : query, limit: 10, includeCounts: false });
        results = extractProducts(res);
        if (results.length === 0 && hasArabicLetters && query !== typed) {
          results = await findProductsByExactBarcode(query);
          if (results.length === 0 && !scaleInfo) {
            res = await invoke<unknown>('products:search', { query, limit: 10, includeCounts: false });
            results = extractProducts(res);
          }
        }
      }

      if (results.length === 0) {
        const legacyNum = extractLegacyPaddedInvoiceNumber(query) || extractLegacyPaddedInvoiceNumber(typed);
        if (legacyNum) {
          const legacySale = await invoke<Sale>('sales:getByInvoiceNumber', { invoiceNumber: legacyNum }).catch(() => null);
          if (legacySale && legacySale.id) {
            setLastCompletedSale(legacySale);
            setIsReceiptOpen(true);
            setBarcodeQuery('');
            dismissLiveSearch();
            showStatus(`تم العثور على الفاتورة رقم #${legacySale.invoiceNumber} وعرض تفاصيلها بنجاح`, 'success');
            return;
          }
        }
      }

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
            const u = p.units.find(unit => isBarcodeMatch(unit.barcode, query));
            if (u) {
              matchedUnit = u;
              return true;
            }
          }
          return isBarcodeMatch(p.barcode, query) || (p.barcodes && p.barcodes.some(bc => isBarcodeMatch(bc, query)));
        }) || results[0];

        if (!matchedUnit && targetProd.units && targetProd.units.length > 0) {
          matchedUnit = targetProd.units.find(u => isBarcodeMatch(u.barcode, query));
        }

        const added = addProductToCart(targetProd, scaleWeightMilli, matchedUnit);
        setBarcodeQuery('');
        dismissLiveSearch();
        if (added) {
          const unitSuffix = matchedUnit ? ` [${formatUnitArabic(matchedUnit.unitName)}]` : '';
          const weightDesc = scaleWeightMilli ? ` (${(scaleWeightMilli / 1000.0).toFixed(3)} كجم - ميزان)` : '';
          showStatus(`تمت إضافة: ${targetProd.name}${unitSuffix}${weightDesc}`, 'success');
        }
      } else if (hasArabicLetters) {
        // A name that matches nothing is not a barcode: never open "add product" with a garbled barcode
        showStatus(`لا يوجد صنف باسم "${typed}"`, 'warning');
      } else {
        let matchedDrugRef: DrugReferenceItem | null = null;
        if (isEnabled('feature_drug_reference')) {
          try {
            matchedDrugRef = await invoke<DrugReferenceItem | null>('pharma:checkDrugReference', { barcode: query });
          } catch {
            matchedDrugRef = null;
          }
        }

        // Clear the input first so the unregistered barcode does not linger once the add-product modal closes
        setBarcodeQuery('');
        dismissLiveSearch();

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

  const handleConfirmWeight = async (weightMilli: number) => {
    if (!weightModalProduct) return;

    if (weightModalProduct.editingCartIndex !== undefined) {
      const idx = weightModalProduct.editingCartIndex;
      setCart((prev) => {
        if (!prev[idx]) return prev;
        const updated = [...prev];
        const item = updated[idx];
        const lineTotal = calculateLineTotal(item.unitPricePiasters, weightMilli, item.discountPiasters);
        updated[idx] = {
          ...item,
          quantityMilli: weightMilli,
          totalPiasters: lineTotal,
          taxPiasters: calculateTaxPiasters(lineTotal, item.taxRatePercent || 0, true),
        };
        return updated;
      });
      showStatus(`تم تعديل وزن ${weightModalProduct.name} إلى ${(weightMilli / 1000).toFixed(3)} كجم`, 'success');
    } else {
      const dummyId = weightModalProduct.id || (weightModalProduct.barcode ? `prod_${weightModalProduct.barcode}` : `prod_${weightModalProduct.name.replace(/\s+/g, '_')}`);
      let foundProd = catalogProducts.find((p) => p.id === weightModalProduct.id || (Boolean(weightModalProduct.barcode) && p.barcode === weightModalProduct.barcode));
      if (!foundProd && weightModalProduct.id && isCatalogLimited) {
        // Not among the loaded best sellers: take the real cost, tax and stock from the host instead of defaults
        setWeightModalProduct(null);
        [foundProd] = await lookupProductsByIds([weightModalProduct.id]);
      }
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
    isPopularFallback,
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
    remoteProducts: remoteCatalog.products,
    remoteKey: remoteCatalog.key,
    isCatalogTruncated: isCatalogLimited,
    resolveProductsByIds: lookupProductsByIds,
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
  // A bounded load cannot count a section: the panel then shows the host's own per-section count
  const categoryProductCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    if (isCatalogLimited) return counts;
    for (const item of smartItems) {
      const cName = item.categoryName?.trim() || 'عام';
      counts[cName] = (counts[cName] || 0) + 1;
      if (item.categoryId) {
        counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
      }
    }
    return counts;
  }, [smartItems, isCatalogLimited]);

  // Large catalogue: a search or an opened section is answered by the host (debounced); the loaded best sellers answer the rest
  useEffect(() => {
    const request = describeRemoteCatalogRequest(isCatalogLimited, activeCatalogTab, catalogSearchQuery, categories);
    if (!request) {
      setRemoteCatalog((prev) => (prev.key === '' ? prev : { key: '', products: [], limited: false }));
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await invoke<unknown>('products:search', {
          query: request.query,
          categoryId: request.categoryId,
          limit: request.limit,
          includeCounts: false,
        });
        if (cancelled) return;
        const products = extractProducts(res);
        setRemoteCatalog({ key: request.key, products, limited: products.length >= request.limit });
      } catch {
        // The loaded best sellers stay usable; the cashier can still search by name or scan
      }
    }, request.query ? LIVE_SEARCH_DEBOUNCE_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isCatalogLimited, activeCatalogTab, catalogSearchQuery, categories]);

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

      if (enforcesOwnStock(allowNegativeStock, item) && deltaPieces > 0) {
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
            `لا يمكن زيادة الكمية: رصيد المخزن المتاح للصنف "${item.productName}" هو ${maxPossibleUnits} ${formatUnitArabic(item.unitName)} فقط!`,
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
    setSelectedCartIndex((prev) => {
      const newLen = cart.length - 1;
      if (newLen <= 0) return null;
      if (prev === null) return 0;
      if (prev === index) return Math.min(index, newLen - 1);
      if (prev > index) return prev - 1;
      return prev;
    });
    barcodeInputRef.current?.focus();
  }, [cart.length]);

  const handleSelectCartItem = useCallback((index: number) => {
    setSelectedCartIndex(index);
    barcodeInputRef.current?.focus();
  }, []);

  const onSelectNextCartItem = useCallback(() => {
    if (cart.length === 0) return;
    setSelectedCartIndex((prev) => {
      if (prev === null) return 0;
      return Math.min(prev + 1, cart.length - 1);
    });
  }, [cart.length]);

  const onSelectPrevCartItem = useCallback(() => {
    if (cart.length === 0) return;
    setSelectedCartIndex((prev) => {
      if (prev === null) return cart.length - 1;
      return Math.max(prev - 1, 0);
    });
  }, [cart.length]);

  const handleCartBackspace = useCallback(() => {
    if (cart.length === 0) {
      showStatus('السلة فارغة', 'warning');
      return;
    }

    const targetIndex = (selectedCartIndex !== null && selectedCartIndex >= 0 && selectedCartIndex < cart.length)
      ? selectedCartIndex
      : 0;

    const targetItem = cart[targetIndex];
    if (!targetItem) return;

    const currentPieces = Math.round(targetItem.quantityMilli / 1000);

    if (targetItem.unit === 'kg') {
      if (targetItem.quantityMilli > 1000) {
        const newQtyMilli = targetItem.quantityMilli - 1000;
        setCart((prev) => {
          const updated = [...prev];
          const it = updated[targetIndex];
          if (!it) return prev;
          const newTotal = calculateLineTotal(it.unitPricePiasters, newQtyMilli, it.discountPiasters);
          const newTax = calculateTaxPiasters(newTotal, it.taxRatePercent || 0, true);
          updated[targetIndex] = {
            ...it,
            quantityMilli: newQtyMilli,
            totalPiasters: newTotal,
            taxPiasters: newTax,
          };
          return updated;
        });
        showStatus(`تم إنقاص وزن "${targetItem.productName}" بمقدار 1 كجم`, 'success');
      } else {
        removeItem(targetIndex);
        showStatus(`تم حذف "${targetItem.productName}" من السلة`, 'success');
      }
      return;
    }

    if (currentPieces > 1) {
      updateQuantity(targetIndex, -1);
      showStatus(`تم إنقاص كمية "${targetItem.productName}" إلى ${currentPieces - 1}`, 'success');
    } else {
      removeItem(targetIndex);
      showStatus(`تم حذف "${targetItem.productName}" من السلة`, 'success');
    }
  }, [cart, selectedCartIndex, updateQuantity, removeItem, showStatus]);

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

      const lineTotal = calculateLineTotal(newUnitPrice, item.quantityMilli, item.discountPiasters);
      updated[cartIndex] = {
        ...item,
        batchId: selectedBatch.id,
        batchNumber: selectedBatch.batchNumber,
        expiryDate: selectedBatch.expiryDate || undefined,
        unitPricePiasters: newUnitPrice,
        totalPiasters: lineTotal,
        taxPiasters: calculateTaxPiasters(lineTotal, item.taxRatePercent || 0, true),
      };
      return updated;
    });

    showStatus(
      `تم تحديد التشغيلة #${selectedBatch.batchNumber}`,
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
            const taxRate = showTaxes ? (product.taxRatePercent || 0) : 0;
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
    [showStatus, showTaxes]
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
    showStatus('تمت إزالة الصنف المتعارض', 'success');
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
    showStatus('تمت إزالة الصنف المتعارض', 'success');
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
          showStatus('تم اعتماد التخطي الإشرافي للتعارض الدوائي', 'success');
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
      showStatus('تنبيه سريري حرج: إتمام البيع محظور تلقائياً لوجود تعارض دوائي شديد الخطورة! يرجى إزالة الدواء أو إدخال رمز اعتماد المشرف.', 'error');
      setIsDdiModalOpen(true);
      return;
    }
    if (requireOpenShiftToSell && !hasOpenShift) {
      notifyShiftRequired();
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
  }, [loading, cart, paymentMethod, selectedCustomerId, netTotalPiasters, activeInsuranceClaim, handleConfirmPayment, showStatus, requireOpenShiftToSell, hasOpenShift, notifyShiftRequired, isDdiActive, ddiResult, isDdiOverridden]);

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
    isRecallReplaceConfirmOpen ||
    heldPriceReview !== null ||
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
    selectedCartIndex,
    handleCartBackspace,
    onSelectNextCartItem,
    onSelectPrevCartItem,
  });

  // Focus Management - Keep barcode/search input focused when interacting with non-input POS elements
  useEffect(() => {
    if (!isActive || isAnyModalOpen) return;

    const timer = setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 60);

    const handleWindowClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
      const isModal = Boolean(target.closest('.fixed.inset-0.z-50, [role="dialog"], .modal-backdrop'));
      if (isInput || isModal) return;

      setTimeout(() => {
        const hasOpenModal = Boolean(document.querySelector('.fixed.inset-0.z-50, [role="dialog"], .modal-backdrop'));
        if (!isAnyModalOpen && !hasOpenModal && barcodeInputRef.current && document.activeElement !== barcodeInputRef.current) {
          const currentActive = document.activeElement as HTMLElement | null;
          const currentIsInput = currentActive instanceof HTMLInputElement || currentActive instanceof HTMLTextAreaElement;
          if (!currentIsInput) {
            barcodeInputRef.current.focus();
          }
        }
      }, 50);
    };

    window.addEventListener('click', handleWindowClick);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleWindowClick);
    };
  }, [isAnyModalOpen, isActive]);

  return (
    <div className="flex flex-col h-full w-full bg-canvas dark:bg-canvas-dark overflow-hidden">
      {/* 1. THREE-PANE MAIN WORKSPACE */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* ================= REGION A: BARCODE SEARCH & CART TABLE ================= */}
        <section className={`${showFastItems ? 'flex-1 min-w-[22.5rem]' : 'flex-1'} h-full bg-surface dark:bg-surface-dark hairline-l flex flex-col overflow-hidden`}>
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
            onSelectProduct={(prod) => {
              const added = addProductToCart(prod);
              setBarcodeQuery('');
              dismissLiveSearch();
              if (added) {
                showStatus(`تمت إضافة: ${prod.name}`, 'success');
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
              <span className="text-micro font-bold underline text-danger dark:text-danger-bright shrink-0">
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
                  <span className="text-micro font-bold px-1.5 py-0.5 rounded bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/30 dark:border-paid-bright/30">
                    معتمد إدارياً
                  </span>
                )}
                <span className={`text-micro font-bold underline ${
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
            selectedCartIndex={selectedCartIndex}
            onSelectCartItem={handleSelectCartItem}
            lastInvoiceNumber={lastInvoiceNumber}
            draftPrompt={draftPrompt}
            onRestoreDraft={() => {
              if (draftPrompt) {
                setCart(draftPrompt.items);
                setSelectedCartIndex(0);
                setDiscountPiasters(draftPrompt.discountPiasters || 0);
                if (draftPrompt.customerId) setSelectedCustomerId(draftPrompt.customerId);
                setDraftPrompt(null);
                showStatus('تم استرجاع السلة المفتوحة', 'success');
              }
            }}
            onDiscardDraft={() => {
              clearPosCartDraft();
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
            discountPiasters={totalDiscountPiasters}
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
            onOpenHeldSales={requestOpenHeldSales}
            onOpenReturnModal={() => setIsReturnModalOpen(true)}
            onOpenExpenseModal={hasPermission('expenses.create') ? () => setIsExpenseModalOpen(true) : undefined}
            onOpenInvoiceDiscount={isAdmin || hasPermission('pos.discount_line') || canDiscountInvoice ? () => setIsDiscountModalOpen(true) : undefined}
            activeInsuranceClaim={activeInsuranceClaim}
            onRemoveInsuranceClaim={() => setActiveInsuranceClaim(null)}
            hasInstapayAccount={digitalAccounts.some((a) => a.accountType === 'instapay' && a.isActive) || Boolean(storeInstapayAddress) || !isEnabled('feature_digital_wallets')}
            hasWalletAccount={digitalAccounts.some((a) => a.accountType === 'wallet' && a.isActive) || Boolean(storeWalletNumber) || !isEnabled('feature_digital_wallets')}
            onNavigateToWallets={isEnabled('feature_digital_wallets') ? onNavigateToWallets : undefined}
            ddiResult={isDdiActive ? ddiResult : null}
            shiftBlock={requireOpenShiftToSell && isShiftStatusKnown && !hasOpenShift ? {
              message: SHIFT_REQUIRED_MESSAGE,
              canOpenShift,
              isFlashing: isShiftNoticeFlashing,
              onOpenShift: openShiftModal,
              onBlockedAttempt: notifyShiftRequired,
            } : null}
          />
        </section>

        {/* ================= REGION B: SMART PRODUCTS & FAST ITEMS GRID ================= */}
        {showFastItems && (
          <PosCatalogPanel
            customItemsCount={customItemsCount}
            popularItemsCount={popularItemsCount}
            isPopularFallback={isPopularFallback}
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
            totalCatalogProductsCount={isCatalogLimited ? catalogTotalCount : catalogProducts.length}
            categories={allPosCategories}
            onAfterToggle={() => barcodeInputRef.current?.focus()}
            expandSignal={catalogExpandSignal}
            onCollapse={() => setCategoriesCollapseSignal((n) => n + 1)}
            resultsLimitedHint={isCatalogLimited && remoteCatalog.limited && remoteCatalog.key !== '' && remoteCatalog.key === remoteCatalogKey(activeCatalogTab, catalogSearchQuery)}
          />
        )}

        {/* ================= REGION C: STORE CATEGORIES PANEL ================= */}
        {showFastItems && (
          <PosCategoriesPanel
            categories={allPosCategories}
            activeCatalogTab={activeCatalogTab}
            onSelectCategory={setActiveCatalogTab}
            totalProductsCount={isCatalogLimited ? catalogTotalCount : smartItems.length}
            popularItemsCount={popularItemsCount}
            isPopularFallback={isPopularFallback}
            customItemsCount={customItemsCount}
            categoryProductCounts={categoryProductCounts}
            onExpand={() => setCatalogExpandSignal((n) => n + 1)}
            collapseSignal={categoriesCollapseSignal}
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
        onOpenReturn={(s) => {
          setReturnInitialSale(s);
          setIsReturnModalOpen(true);
        }}
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
      {undoToast.value && (
        <UndoToast
          message={`تم حذف الصنف "${undoToast.value.item.productName}" من السلة.`}
          durationMs={6000}
          exiting={undoToast.exiting}
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
        onItemsChanged={loadSmartCatalog}
      />

      {/* 8. QUICK FAST ITEM MODAL (Direct creation without inventory overhead); mounted only while open so every open starts with a blank form */}
      {isQuickFastItemModalOpen && (
        <QuickFastItemModal
          isOpen
          onClose={() => {
            setIsQuickFastItemModalOpen(false);
            barcodeInputRef.current?.focus();
          }}
          onItemAdded={(savedItem) => {
            void loadSmartCatalog();
            setActiveCatalogTab('__CUSTOM__');
            showStatus(`تمت إضافة الصنف السريع "${savedItem.name}"`, 'success');
          }}
          onOpenFullManager={() => setIsQuickItemsManagerOpen(true)}
          onOpenVariantMatrixModal={() => setShowVariantMatrixModal(true)}
          existingCategories={categoryTabs.map(c => c.name).filter(n => n && n !== 'الكل' && n !== 'الأكثر طلباً')}
        />
      )}

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
        onDiscountChange={canDiscountInvoice ? setDiscountPiasters : undefined}
        netTotalPiasters={netTotalPiasters}
        selectedCustomerId={selectedCustomerId}
        onCustomerChange={(id) => {
          setSelectedCustomerId(id);
          if (!id) setPaymentMethod('cash');
        }}
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
        discountPiasters={totalDiscountPiasters}
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
        canDiscountInvoice={canDiscountInvoice}
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
          canDiscountLine={canDiscountLine}
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
          const onCancelled = supervisorPrompt.onCancelled;
          setSupervisorPrompt({ isOpen: false, title: '', onApproved: () => {} });
          onCancelled?.();
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

      <ConfirmModal
        isOpen={isRecallReplaceConfirmOpen}
        title="السلة الحالية غير فارغة"
        message="استرجاع فاتورة معلقة سيستبدل الأصناف الموجودة في السلة الآن بالكامل."
        consequence={`سيتم فقد ${cart.length} صنف/أصناف من السلة الحالية عند الاسترجاع. لحفظها اضغط تراجع ثم علّقها أولاً (F6).`}
        confirmText="متابعة لاختيار فاتورة معلقة"
        cancelText="تراجع"
        isDanger={true}
        onConfirm={() => {
          setIsRecallReplaceConfirmOpen(false);
          setIsHeldSalesModalOpen(true);
        }}
        onCancel={() => {
          setIsRecallReplaceConfirmOpen(false);
          barcodeInputRef.current?.focus();
        }}
      />

      <HeldSalePriceReviewModal
        changes={heldPriceReview ? heldPriceReview.changes : null}
        keepRequiresApproval={keepRequiresApproval}
        onKeepHeldPrices={handleKeepHeldPrices}
        onUpdateToCurrentPrices={handleUpdateHeldToCurrentPrices}
      />

      {/* 15. SALES RETURN MODAL (Feature #26 / Tasks 26-1 to 26-7) */}
      <ReturnModal
        isOpen={isReturnModalOpen}
        initialSale={returnInitialSale}
        onClose={() => {
          setIsReturnModalOpen(false);
          setReturnInitialSale(null);
          barcodeInputRef.current?.focus();
        }}
        onReturnCompleted={(ret) => {
          showStatus(`تم تسجيل المرتجع رقم #${ret.returnNumber} بقيمة ${formatArabicCurrency(ret.totalPiasters)}`, 'success');
          setReturnInitialSale(null);
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
          showStatus(`تم إنشاء مصفوفة المقاسات والألوان للصنف "${result.parentProduct.name}"`, 'success');
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
              showStatus(`تمت إضافة: ${unitPickerProduct.name} (${formatUnitArabic(selectedUnit.unitName)})`, 'success');
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
          showStatus('تم تسجيل المصروف', 'success');
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
          showStatus(`تم تسجيل "${entry.productName}" في دفتر النواقص`, 'success');
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
          canManageOrders={Boolean(isAdmin || (hasPermission && hasPermission('delivery.orders.manage')))}
          canSettleRiders={Boolean(isAdmin || (hasPermission && hasPermission('delivery.riders.settle')))}
          canConfigureZonesRiders={Boolean(isAdmin || (hasPermission && hasPermission('delivery.zones_riders.configure')))}
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
