import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShoppingCart,
  Receipt,
  Building2,
  ArrowRight,
  ClipboardList,
  RotateCcw,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import { ConfirmModal } from '../components/ConfirmModal';
import { extractProducts, type Supplier, type Purchase, type PurchaseItem, type Product, type SupplierTransaction } from '../types/models';
import { PurchasesInvoicesTab } from './purchases/PurchasesInvoicesTab';
import { NewPurchaseTab } from './purchases/NewPurchaseTab';
import { SuppliersTab } from './purchases/SuppliersTab';
import { ShortagesTab } from './purchases/ShortagesTab';
import { PurchaseDetailsModal } from './purchases/PurchaseDetailsModal';
import { ProductVariantPickerModal } from '../components/ProductVariantPickerModal';
import { SupplierFormModal, type SupplierFormData } from './purchases/SupplierFormModal';
import { SupplierPaymentModal } from './purchases/SupplierPaymentModal';
import { SupplierStatementModal } from './purchases/SupplierStatementModal';
import { BarcodeLabelModal, type LabelQueueItem } from '../components/BarcodeLabelModal';
import { ExpiryReturnsModal } from '../components/ExpiryReturnsModal';
import { useFeatures } from '../context/useFeatures';
import { useAuth } from '../context/useAuth';
import { type PurchasesSubView, type NewPurchaseLineItem } from './purchases/types';
import { calculateLineTotal, normalizeArabicNumerals } from '../utils/money';

export { type PurchasesSubView } from './purchases/types';

interface PurchasesViewProps {
  isActive?: boolean;
  subView?: PurchasesSubView;
  onSubViewChange?: (view: PurchasesSubView) => void;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({ isActive = true, subView, onSubViewChange }) => {
  const { isEnabled } = useFeatures();
  const { hasPermission } = useAuth();
  const [internalTab, setInternalTab] = useState<PurchasesSubView>('new_invoice');
  const activeTab = subView ?? internalTab;
  const setActiveTab = (view: PurchasesSubView) => {
    if (onSubViewChange) {
      onSubViewChange(view);
    } else {
      setInternalTab(view);
    }
  };

  // Suppliers State
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showArchivedSuppliers, setShowArchivedSuppliers] = useState<boolean>(false);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState<string>('');
  const [selectedSupplierForModal, setSelectedSupplierForModal] = useState<Supplier | null>(null);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState<boolean>(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState<boolean>(false);
  const [isExpiryReturnsModalOpen, setIsExpiryReturnsModalOpen] = useState<boolean>(false);
  const [supplierTransactions, setSupplierTransactions] = useState<SupplierTransaction[]>([]);
  const [paymentAmountPiasters, setPaymentAmountPiasters] = useState<number>(0);
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // Purchases State
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [purchaseSearchQuery, setPurchaseSearchQuery] = useState<string>('');
  const [purchasePaymentFilter, setPurchasePaymentFilter] = useState<string>('all');
  const [selectedPurchaseDetails, setSelectedPurchaseDetails] = useState<Purchase | null>(null);

  // New Purchase Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState<string>('');
  const [costingMethod, setCostingMethod] = useState<'LATEST' | 'WEIGHTED_AVERAGE'>('WEIGHTED_AVERAGE');
  const [purchaseNotes, setPurchaseNotes] = useState<string>('');
  const [discountPiasters, setDiscountPiasters] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'PAID' | 'CREDIT' | 'PARTIAL'>('PAID');
  const [paymentSource, setPaymentSource] = useState<'cash_drawer' | 'external_cash'>('cash_drawer');
  const [customPaidAmountPiasters, setCustomPaidAmountPiasters] = useState<number | null>(null);
  const [lineItems, setLineItems] = useState<NewPurchaseLineItem[]>([]);

  // Product Search / Scanner for new purchase
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Barcode Label Printing from Purchase Invoice
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState<boolean>(false);
  const [barcodeQueueItems, setBarcodeQueueItems] = useState<LabelQueueItem[]>([]);
  const [barcodeSourceTitle, setBarcodeSourceTitle] = useState<string>('');

  // Confirm Modal State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDanger?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Supplier Form State
  const [supplierForm, setSupplierForm] = useState<SupplierFormData>({
    name: '',
    companyName: '',
    phone: '',
    address: '',
    balanceEGP: '0',
    notes: '',
  });

  // Variant Picker State for Clothing/Colors/Sizes
  const [variantPickerParentProduct, setVariantPickerParentProduct] = useState<Product | null>(null);

  // Show temporary toast notification
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  }, []);

  // Fetch Suppliers
  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke<Supplier[]>('suppliers:getAll', { includeInactive: showArchivedSuppliers });
      if (res) {
        setSuppliers(res);
      }
    } catch {
      showToast('تعذر تحميل بيانات الموردين', 'error');
    } finally {
      setLoading(false);
    }
  }, [showArchivedSuppliers, showToast]);

  // Fetch Purchases
  const loadPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoke<Purchase[]>('purchases:getAll', { limit: 150 });
      if (res) {
        setPurchases(res);
      }
    } catch {
      showToast('تعذر تحميل فواتير الشراء', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let isMounted = true;
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const [sups, purs] = await Promise.all([
          invoke<Supplier[]>('suppliers:getAll', { includeInactive: showArchivedSuppliers }),
          invoke<Purchase[]>('purchases:getAll', { limit: 150 }),
        ]);
        if (isMounted) {
          if (sups) setSuppliers(sups);
          if (purs) setPurchases(purs);
        }
      } catch {
        if (isMounted) showToast('تعذر تحميل بيانات المشتريات والموردين', 'error');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    void fetchInitialData();
    return () => {
      isMounted = false;
    };
  }, [showArchivedSuppliers, showToast]);

  useEffect(() => {
    if (isActive) {
      void loadPurchases();
      void loadSuppliers();
    }
  }, [isActive, loadPurchases, loadSuppliers]);

  useDataSubscription(['purchases', 'all'], () => {
    void loadPurchases();
  });

  useDataSubscription(['suppliers', 'all'], () => {
    void loadSuppliers();
  });

  // Search products when query changes
  useEffect(() => {
    const q = productSearchQuery.trim();
    if (!q) {
      setCatalogProducts([]);
      return;
    }
    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsSearchingProduct(true);
      try {
        const res = await invoke<unknown>('products:search', { query: q });
        if (isMounted) {
          const items = extractProducts(res);
          setCatalogProducts(items.slice(0, 10));
        }
      } catch {
        if (isMounted) setCatalogProducts([]);
      } finally {
        if (isMounted) setIsSearchingProduct(false);
      }
    }, 150);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [productSearchQuery]);

  // Add Product to Line Items
  const handleAddProductToPurchase = (prod: Product) => {
    // If product has variants (matrix parent), prompt variant picker modal
    if (prod.hasVariants) {
      setVariantPickerParentProduct(prod);
      return;
    }

    const existingIdx = lineItems.findIndex((item) => item.productId === prod.id);
    if (existingIdx >= 0) {
      const updated = [...lineItems];
      const nextQty = (updated[existingIdx].quantityUnits || 0) + 1;
      updated[existingIdx].quantityUnits = nextQty;
      updated[existingIdx].quantityInput = String(nextQty);
      const p = parseInt(normalizeArabicNumerals(updated[existingIdx].packSizeInput || ''), 10) || 0;
      if (p > 0) {
        const c = Math.floor(nextQty / p);
        const rem = Math.round(nextQty % p);
        updated[existingIdx].cartonsInput = c > 0 ? String(c) : '0';
        updated[existingIdx].looseInput = rem > 0 ? String(rem) : '0';
      } else {
        updated[existingIdx].cartonsInput = '0';
        updated[existingIdx].looseInput = String(nextQty);
      }
      setLineItems(updated);
    } else {
      setLineItems([
        ...lineItems,
        {
          productId: prod.id,
          productName: prod.name,
          barcode: prod.barcode || '',
          currentStockMilli: prod.stockQuantityMilli,
          currentCostPiasters: prod.costPiasters,
          currentPricePiasters: prod.pricePiasters,
          quantityUnits: 1,
          quantityInput: '1',
          unitCostPiasters: prod.costPiasters > 0 ? prod.costPiasters : prod.pricePiasters,
          newSellingPricePiasters: prod.pricePiasters,
          batchNumber: '',
          expiryDate: '',
          productionDate: '',
          variantColor: prod.variantColor || undefined,
          variantSize: prod.variantSize || undefined,
          variantSku: prod.variantSku || undefined,
          unit: prod.unit || 'piece',
          cartonsInput: '',
          packSizeInput: '',
          looseInput: '1',
        },
      ]);
    }
    setProductSearchQuery('');
    setCatalogProducts([]);
  };

  // Calculations for New Purchase
  const totalCostPiasters = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + Math.round(item.quantityUnits * item.unitCostPiasters), 0);
  }, [lineItems]);

  const netCostPiasters = useMemo(() => {
    return Math.max(0, totalCostPiasters - discountPiasters);
  }, [totalCostPiasters, discountPiasters]);

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

  // Save New Purchase Invoice
  const handleSavePurchase = async () => {
    if (lineItems.length === 0) {
      showToast('يرجى إضافة صنف واحد على الأقل لفاتورة الشراء', 'error');
      return;
    }

    if (remainingAmountPiasters > 0 && !selectedSupplierId) {
      showToast('يجب اختيار المورد أولاً لتسجيل الفاتورة الآجلة أو السداد الجزئي', 'error');
      return;
    }

    if (paidAmountPiasters > netCostPiasters && !selectedSupplierId) {
      showToast('يجب اختيار المورد أولاً لتسجيل المبلغ المسدد بالزيادة تحت حسابه', 'error');
      return;
    }

    for (const item of lineItems) {
      if (item.quantityUnits <= 0) {
        showToast(`الكمية للصنف ${item.productName} غير صالحة`, 'error');
        return;
      }
      if (item.unitCostPiasters < 0) {
        showToast(`تكلفة الصنف ${item.productName} لا يمكن أن تكون سالبة`, 'error');
        return;
      }
    }

    try {
      const itemsPayload: Partial<PurchaseItem>[] = lineItems.map((item) => {
        const packSize = parseInt(item.packSizeInput || '', 10) || (item.packSize || 1);
        const cartons = parseInt(item.cartonsInput || '', 10) || (item.cartonsCount || 0);
        const hasCartonData = cartons > 0 && packSize > 1;
        const bonusQty = Math.round((item.bonusQuantityUnits || 0) * 1000);
        const distBps = typeof item.distributorDiscountPercent === 'number' && !isNaN(item.distributorDiscountPercent)
          ? Math.round(item.distributorDiscountPercent * 100)
          : undefined;

        return {
          productId: item.productId,
          productName: item.productName,
          barcode: item.barcode,
          quantityMilli: Math.round(item.quantityUnits * 1000),
          bonusQuantityMilli: bonusQty > 0 ? bonusQty : 0,
          unitCostPiasters: item.unitCostPiasters,
          totalCostPiasters: calculateLineTotal(item.unitCostPiasters, Math.round(item.quantityUnits * 1000)),
          previousCostPiasters: item.currentCostPiasters,
          newSellingPricePiasters: item.newSellingPricePiasters > 0 ? item.newSellingPricePiasters : undefined,
          publicPricePiasters: (item.publicPricePiasters && item.publicPricePiasters > 0) ? item.publicPricePiasters : undefined,
          distributorDiscountBps: distBps,
          batchNumber: item.batchNumber?.trim() || undefined,
          expiryDate: item.expiryDate?.trim() || undefined,
          productionDate: item.productionDate?.trim() || undefined,
          unitId: item.unit,
          unitName: item.unit,
          conversionFactor: hasCartonData ? packSize : 1,
          packageCostPiasters: hasCartonData ? Math.round(item.unitCostPiasters * packSize) : item.unitCostPiasters,
        };
      });

      const payload = {
        purchase: {
          supplierId: selectedSupplierId || null,
          supplierInvoiceNumber: supplierInvoiceNumber.trim() || null,
          invoiceDate: new Date().toISOString(),
          totalCostPiasters,
          discountPiasters,
          netCostPiasters,
          paidAmountPiasters,
          remainingAmountPiasters,
          paymentStatus:
            paidAmountPiasters > netCostPiasters
              ? 'OVERPAID'
              : remainingAmountPiasters === 0
              ? 'PAID'
              : paidAmountPiasters > 0
              ? 'PARTIAL'
              : 'CREDIT',
          paymentSource,
          status: 'COMPLETED',
          notes: purchaseNotes.trim() || null,
          items: itemsPayload,
        },
        costingMethod,
      };

      const result = await invoke<Purchase>('purchases:create', payload);
      if (result) {
        showToast(`تم تسجيل فاتورة الشراء رقم #${result.invoiceNumber} وزيادة المخزون بنجاح!`, 'success');
        // Reset form
        setLineItems([]);
        setSelectedSupplierId('');
        setSupplierInvoiceNumber('');
        setPurchaseNotes('');
        setDiscountPiasters(0);
        setCustomPaidAmountPiasters(null);
        setPaymentMode('PAID');
        setPaymentSource('cash_drawer');
        loadPurchases();
        loadSuppliers();
        setActiveTab('invoices');

        // Prompt to print labels directly for received items
        if (result.items && result.items.length > 0) {
          setConfirmDialog({
            isOpen: true,
            title: 'طباعة ملصقات الباركود للبضاعة المستلمة',
            message: `تم حفظ الفاتورة بنجاح. هل ترغب في فتح مصمم وطباعة ملصقات الباركود للأصناف الواردة بعدد الكميات المشتراة؟`,
            confirmText: 'نعم، طباعة الملصقات',
            onConfirm: () => {
              setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
              void handlePrintInvoiceLabels(result);
            },
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ فاتورة الشراء';
      showToast(msg, 'error');
    }
  };

  const handleOpenAddSupplier = () => {
    setSupplierForm({
      name: '',
      companyName: '',
      phone: '',
      address: '',
      balanceEGP: '0',
      notes: '',
      expiryReturnWindowDays: '30',
      expiryReturnCreditPercent: '100',
    });
    setIsSupplierModalOpen(true);
  };

  const handleOpenEditSupplier = (sup: Supplier) => {
    setSupplierForm({
      id: sup.id,
      name: sup.name,
      companyName: sup.companyName || '',
      phone: sup.phone || '',
      address: sup.address || '',
      balanceEGP: (sup.balancePiasters / 100).toFixed(2),
      notes: sup.notes || '',
      expiryReturnWindowDays: (sup.expiryReturnWindowDays !== undefined && sup.expiryReturnWindowDays !== null) ? String(sup.expiryReturnWindowDays) : '30',
      expiryReturnCreditPercent: (sup.expiryReturnCreditBps !== undefined && sup.expiryReturnCreditBps !== null) ? (sup.expiryReturnCreditBps / 100).toString() : '100',
    });
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) {
      showToast('اسم المورد مطلوب', 'error');
      return;
    }

    try {
      const balancePiasters = Math.round((parseFloat(normalizeArabicNumerals(supplierForm.balanceEGP)) || 0) * 100);
      const windowDays = supplierForm.expiryReturnWindowDays ? parseInt(normalizeArabicNumerals(supplierForm.expiryReturnWindowDays), 10) : 30;
      const creditPercent = supplierForm.expiryReturnCreditPercent ? parseFloat(normalizeArabicNumerals(supplierForm.expiryReturnCreditPercent)) : 100;
      const expiryReturnCreditBps = Math.round(creditPercent * 100);

      const res = await invoke<Supplier>('suppliers:save', {
        id: supplierForm.id,
        name: supplierForm.name.trim(),
        companyName: supplierForm.companyName.trim() || null,
        phone: supplierForm.phone.trim() || null,
        address: supplierForm.address.trim() || null,
        balancePiasters,
        notes: supplierForm.notes.trim() || null,
        expiryReturnWindowDays: isNaN(windowDays) ? 30 : windowDays,
        expiryReturnCreditBps: isNaN(expiryReturnCreditBps) ? 10000 : expiryReturnCreditBps,
      });

      if (res) {
        showToast(supplierForm.id ? 'تم تحديث بيانات المورد بنجاح' : 'تم إضافة المورد الجديد بنجاح');
        setIsSupplierModalOpen(false);
        loadSuppliers();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حفظ بيانات المورد';
      showToast(msg, 'error');
    }
  };

  const handleArchiveSupplier = (sup: Supplier) => {
    setConfirmDialog({
      isOpen: true,
      title: 'أرشفة المورد',
      message: `هل أنت متأكد من رغبتك في أرشفة المورد "${sup.name}"؟`,
      confirmText: 'نعم، أرشف المورد',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        try {
          await invoke('suppliers:archive', { id: sup.id });
          showToast('تم أرشفة المورد بنجاح');
          loadSuppliers();
        } catch {
          showToast('تعذر أرشفة المورد', 'error');
        }
      },
    });
  };

  const handleRestoreSupplier = async (id: string) => {
    try {
      await invoke('suppliers:restore', { id });
      showToast('تم استعادة المورد بنجاح');
      loadSuppliers();
    } catch {
      showToast('تعذر استعادة المورد', 'error');
    }
  };

  const handleOpenPayment = (sup: Supplier) => {
    setSelectedSupplierForModal(sup);
    setPaymentAmountPiasters(sup.balancePiasters > 0 ? sup.balancePiasters : 0);
    setPaymentNotes('');
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = async (
    e: React.FormEvent,
    effectiveAmount?: number,
    customNotes?: string,
    paymentSource: 'cash_drawer' | 'external_cash' = 'cash_drawer'
  ) => {
    e.preventDefault();
    if (!selectedSupplierForModal) return;
    const finalAmount = effectiveAmount !== undefined ? effectiveAmount : paymentAmountPiasters;
    if (finalAmount <= 0) {
      showToast('مبلغ السداد يجب أن يكون أكبر من صفر', 'error');
      return;
    }

    try {
      await invoke('suppliers:recordPayment', {
        supplierId: selectedSupplierForModal.id,
        amountPiasters: finalAmount,
        notes: customNotes || paymentNotes.trim() || 'سداد دفعة نقدية للمورد',
        paymentSource,
      });
      showToast('تم تسجيل سداد الدفعة بنجاح وتحديث رصيد المورد');
      setIsPaymentModalOpen(false);
      loadSuppliers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل السداد';
      showToast(msg, 'error');
    }
  };

  const handlePrintInvoiceLabels = useCallback(async (purchase: Purchase) => {
    let pur = purchase;
    if (!pur.items || pur.items.length === 0) {
      try {
        const full = await invoke<Purchase>('purchases:getById', { id: purchase.id });
        if (full && full.items) {
          pur = full;
        }
      } catch (err) {
        console.error('Failed to load full purchase items for labels:', err);
      }
    }

    if (!pur.items || pur.items.length === 0) {
      showToast('لا توجد أصناف في هذه الفاتورة لطباعة ملصقاتها', 'error');
      return;
    }

    const itemsForLabels: LabelQueueItem[] = (
      await Promise.all(
        pur.items.map(async (item) => {
          let barcode = (item.barcode || '').trim();
          let pricePiasters =
            item.newSellingPricePiasters && item.newSellingPricePiasters > 0
              ? item.newSellingPricePiasters
              : 0;
          let variantInfo = item.batchNumber ? `شحنة: ${item.batchNumber}` : '';
          let stockQuantityMilli: number | undefined;
          let categoryName: string | undefined;

          // If barcode or selling price is missing on the purchase item, fetch from catalog
          if (!barcode || pricePiasters === 0) {
            try {
              const prod = await invoke<Product>('products:getById', { id: item.productId });
              if (prod) {
                if (!barcode && prod.barcode) barcode = prod.barcode.trim();
                if (pricePiasters === 0 && prod.pricePiasters > 0) pricePiasters = prod.pricePiasters;
                if (!variantInfo) {
                  variantInfo =
                    prod.variantColor && prod.variantSize
                      ? `${prod.variantColor} / ${prod.variantSize}`
                      : prod.variantSize || prod.variantColor || '';
                }
                stockQuantityMilli = prod.stockQuantityMilli;
                categoryName = prod.categoryName;
              }
            } catch {
              // fallback gracefully
            }
          }

          if (pricePiasters === 0) {
            pricePiasters = item.unitCostPiasters;
          }

          // احتساب إجمالي المستلم (الكمية المشتراة + بضاعة البونص المجانية)
          const totalReceivedMilli = (item.quantityMilli || 0) + (item.bonusQuantityMilli || 0);
          const copies = Math.max(1, Math.round(totalReceivedMilli / 1000.0));

          return {
            productId: item.productId,
            productName: item.productName || 'صنف',
            barcode,
            pricePiasters,
            variantInfo,
            copies,
            stockQuantityMilli,
            categoryName,
            expiryDate: item.expiryDate || undefined,
          };
        })
      )
    ).filter((item) => item.barcode.length > 0);

    if (itemsForLabels.length === 0) {
      showToast('أصناف هذه الفاتورة ليس لها أرقام باركود مسجلة بالكتالوج', 'error');
      return;
    }

    setBarcodeQueueItems(itemsForLabels);
    setBarcodeSourceTitle(`فاتورة شراء #${pur.invoiceNumber}`);
    setIsBarcodeModalOpen(true);
  }, [showToast]);

  const handleOpenStatement = async (sup: Supplier) => {
    setSelectedSupplierForModal(sup);
    try {
      const txs = await invoke<SupplierTransaction[]>('suppliers:getTransactions', { supplierId: sup.id, limit: 50 });
      setSupplierTransactions(txs || []);
      setIsStatementModalOpen(true);
    } catch {
      showToast('تعذر جلب كشف حساب المورد', 'error');
    }
  };

  const handleRequestCancelNewPurchase = () => {
    if (lineItems.length === 0) {
      setActiveTab('invoices');
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: 'إلغاء الفاتورة',
      message: 'هل تريد إلغاء الفاتورة الحالية ومسح كافة البنود المدخلة؟',
      confirmText: 'نعم، إلغاء الفاتورة',
      isDanger: true,
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        setLineItems([]);
        setActiveTab('invoices');
      },
    });
  };

  const totalSupplierDebtsAmount = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + Math.max(0, s.balancePiasters), 0);
  }, [suppliers]);

  const totalSupplierCreditsAmount = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + (s.balancePiasters < 0 ? Math.abs(s.balancePiasters) : 0), 0);
  }, [suppliers]);

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas dark:bg-canvas-dark overflow-hidden text-ink dark:text-ink-dark">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl border font-bold text-xs shadow-md transition-all ${
            notification.type === 'success'
              ? 'bg-paid-soft dark:bg-paid-dark-soft border-paid/30 dark:border-emerald-800/40 text-paid dark:text-paid-bright'
              : 'bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Top Header */}
      <header className="h-[52px] bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-soft/20 border border-brand/20 dark:border-brand-bright/30 flex items-center justify-center text-brand dark:text-brand-bright shadow-2xs">
            <ShoppingCart className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-ink dark:text-ink-dark leading-tight">إدارة المشتريات والموردين</h1>
            <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted hidden sm:block">
              {activeTab === 'invoices' && 'سجل واستعراض فواتير الشراء، متابعة التكاليف، وحالات السداد'}
              {activeTab === 'new_invoice' && 'تسجيل استلام بضائع وتحديث تكلفة الشراء والمخزون الفوري'}
              {activeTab === 'suppliers' && 'دليل الموردين، حسابات المديونية الآجلة، وكشوف الحساب'}
              {activeTab === 'shortages' && 'دفتر النواقص، طلبات العملاء، ومقترحات طلبيات الموردين التلقائية'}
            </p>
          </div>
        </div>

        {/* Header Right Action / Badges */}
        <div className="flex items-center gap-2">
          {isEnabled('feature_expiry_returns') && hasPermission('pharma.expiry_returns.manage') && (
            <button
              type="button"
              onClick={() => setIsExpiryReturnsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold transition-colors cursor-pointer"
              title="إدارة مرتجعات الصلاحية للموردين ومحاضر الإعدام"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>مرتجعات الصلاحية والإعدام</span>
            </button>
          )}

          {activeTab === 'new_invoice' ? (
            <button
              type="button"
              onClick={handleRequestCancelNewPurchase}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-xs font-bold text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark transition-colors cursor-pointer shadow-2xs"
              title="العودة إلى قائمة الفواتير"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة للفواتير</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-xs font-bold text-ink dark:text-ink-dark shadow-2xs">
              {activeTab === 'invoices' && (
                <>
                  <Receipt className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                  <span>فواتير المشتريات</span>
                </>
              )}
              {activeTab === 'suppliers' && (
                <>
                  <Building2 className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                  <span>دليل الموردين</span>
                </>
              )}
              {activeTab === 'shortages' && (
                <>
                  <ClipboardList className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                  <span>دفتر النواقص والطلبيات</span>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 overflow-hidden p-3 sm:p-3.5 flex flex-col">
        {activeTab === 'invoices' && (
          <PurchasesInvoicesTab
            purchases={purchases}
            loading={loading}
            totalSupplierDebtsAmount={totalSupplierDebtsAmount}
            totalSupplierCreditsAmount={totalSupplierCreditsAmount}
            purchaseSearchQuery={purchaseSearchQuery}
            setPurchaseSearchQuery={setPurchaseSearchQuery}
            purchasePaymentFilter={purchasePaymentFilter}
            setPurchasePaymentFilter={setPurchasePaymentFilter}
            onOpenNewInvoice={() => setActiveTab('new_invoice')}
            onSelectPurchase={async (pur) => {
              try {
                const full = await invoke<Purchase>('purchases:getById', { id: pur.id });
                setSelectedPurchaseDetails(full || pur);
              } catch {
                setSelectedPurchaseDetails(pur);
              }
            }}
            onPrintLabels={handlePrintInvoiceLabels}
          />
        )}

        {activeTab === 'new_invoice' && (
          <NewPurchaseTab
            suppliers={suppliers}
            selectedSupplierId={selectedSupplierId}
            setSelectedSupplierId={setSelectedSupplierId}
            supplierInvoiceNumber={supplierInvoiceNumber}
            setSupplierInvoiceNumber={setSupplierInvoiceNumber}
            costingMethod={costingMethod}
            setCostingMethod={setCostingMethod}
            purchaseNotes={purchaseNotes}
            setPurchaseNotes={setPurchaseNotes}
            discountPiasters={discountPiasters}
            setDiscountPiasters={setDiscountPiasters}
            paymentMode={paymentMode}
            setPaymentMode={setPaymentMode}
            paymentSource={paymentSource}
            setPaymentSource={setPaymentSource}
            customPaidAmountPiasters={customPaidAmountPiasters}
            setCustomPaidAmountPiasters={setCustomPaidAmountPiasters}
            lineItems={lineItems}
            setLineItems={setLineItems}
            productSearchQuery={productSearchQuery}
            setProductSearchQuery={setProductSearchQuery}
            isSearchingProduct={isSearchingProduct}
            catalogProducts={catalogProducts}
            onAddProduct={handleAddProductToPurchase}
            onOpenAddSupplier={handleOpenAddSupplier}
            onSavePurchase={handleSavePurchase}
            onRequestCancel={handleRequestCancelNewPurchase}
          />
        )}

        {activeTab === 'suppliers' && (
          <SuppliersTab
            suppliers={suppliers}
            loading={loading}
            supplierSearchQuery={supplierSearchQuery}
            setSupplierSearchQuery={setSupplierSearchQuery}
            showArchivedSuppliers={showArchivedSuppliers}
            setShowArchivedSuppliers={setShowArchivedSuppliers}
            onOpenAddSupplier={handleOpenAddSupplier}
            onOpenEditSupplier={handleOpenEditSupplier}
            onOpenPayment={handleOpenPayment}
            onOpenStatement={handleOpenStatement}
            onRequestArchiveSupplier={handleArchiveSupplier}
            onRestoreSupplier={handleRestoreSupplier}
          />
        )}

        {activeTab === 'shortages' && (
          <ShortagesTab
            onLoadProposalToNewPurchase={(proposal) => {
              if (proposal.supplierId) {
                setSelectedSupplierId(proposal.supplierId);
              }
              const newLines: NewPurchaseLineItem[] = proposal.items.map((pi) => ({
                productId: pi.productId,
                productName: pi.productName,
                barcode: pi.barcode || '',
                currentStockMilli: 0,
                currentCostPiasters: pi.costPiasters,
                currentPricePiasters: pi.costPiasters,
                quantityUnits: Math.max(1, Math.round(pi.suggestedQuantityMilli / 1000)),
                unitCostPiasters: pi.costPiasters,
                newSellingPricePiasters: pi.costPiasters,
                unit: pi.unit,
              }));
              setLineItems(newLines);
              setActiveTab('new_invoice');
            }}
          />
        )}
      </main>

      {/* Modals */}
      <SupplierFormModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        form={supplierForm}
        setForm={setSupplierForm}
        onSave={handleSaveSupplier}
      />

      <SupplierPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        supplier={selectedSupplierForModal}
        paymentAmountPiasters={paymentAmountPiasters}
        setPaymentAmountPiasters={setPaymentAmountPiasters}
        paymentNotes={paymentNotes}
        setPaymentNotes={setPaymentNotes}
        onConfirmPayment={handleConfirmPayment}
      />

      <SupplierStatementModal
        isOpen={isStatementModalOpen}
        onClose={() => setIsStatementModalOpen(false)}
        supplier={selectedSupplierForModal}
        transactions={supplierTransactions}
      />

      <PurchaseDetailsModal
        purchase={selectedPurchaseDetails}
        onClose={() => setSelectedPurchaseDetails(null)}
        onPrintLabels={handlePrintInvoiceLabels}
      />

      {/* Product Variant Picker for Clothing / Colors & Sizes */}
      <ProductVariantPickerModal
        isOpen={variantPickerParentProduct !== null}
        onClose={() => setVariantPickerParentProduct(null)}
        parentProduct={variantPickerParentProduct}
        mode="purchase"
        onSelectVariant={(variantProd) => {
          handleAddProductToPurchase(variantProd);
          showToast(`تم اختيار وإضافة: ${variantProd.name}`);
        }}
      />

      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        isDanger={confirmDialog.isDanger}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Barcode Label Modal for Purchase Invoices */}
      <BarcodeLabelModal
        isOpen={isBarcodeModalOpen}
        onClose={() => {
          setIsBarcodeModalOpen(false);
          setBarcodeQueueItems([]);
          setBarcodeSourceTitle('');
        }}
        initialQueueItems={barcodeQueueItems}
        sourceTitle={barcodeSourceTitle}
      />

      {/* Expiry Returns & Write-offs Modal */}
      <ExpiryReturnsModal
        isOpen={isExpiryReturnsModalOpen}
        onClose={() => setIsExpiryReturnsModalOpen(false)}
        onSuccess={(msg) => showToast(msg, 'success')}
      />
    </div>
  );
};
