import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShoppingCart,
  Receipt,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import { ConfirmModal } from '../components/ConfirmModal';
import { extractProducts, type Supplier, type Purchase, type PurchaseItem, type Product, type SupplierTransaction } from '../types/models';
import { PurchasesInvoicesTab } from './purchases/PurchasesInvoicesTab';
import { NewPurchaseTab } from './purchases/NewPurchaseTab';
import { SuppliersTab } from './purchases/SuppliersTab';
import { PurchaseDetailsModal } from './purchases/PurchaseDetailsModal';
import { ProductVariantPickerModal } from '../components/ProductVariantPickerModal';
import { SupplierFormModal, type SupplierFormData } from './purchases/SupplierFormModal';
import { SupplierPaymentModal } from './purchases/SupplierPaymentModal';
import { SupplierStatementModal } from './purchases/SupplierStatementModal';
import { type PurchasesSubView, type NewPurchaseLineItem } from './purchases/types';
import { normalizeArabicNumerals } from '../utils/money';

export { type PurchasesSubView } from './purchases/types';

interface PurchasesViewProps {
  subView?: PurchasesSubView;
  onSubViewChange?: (view: PurchasesSubView) => void;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({ subView, onSubViewChange }) => {
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
  const [costingMethod, setCostingMethod] = useState<'LATEST' | 'WEIGHTED_AVERAGE'>('LATEST');
  const [purchaseNotes, setPurchaseNotes] = useState<string>('');
  const [discountPiasters, setDiscountPiasters] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'PAID' | 'CREDIT' | 'PARTIAL'>('PAID');
  const [customPaidAmountPiasters, setCustomPaidAmountPiasters] = useState<number | null>(null);
  const [lineItems, setLineItems] = useState<NewPurchaseLineItem[]>([]);

  // Product Search / Scanner for new purchase
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
          quantityUnits: 0,
          quantityInput: '',
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
          looseInput: '',
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
      const itemsPayload: Partial<PurchaseItem>[] = lineItems.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        barcode: item.barcode,
        quantityMilli: Math.round(item.quantityUnits * 1000),
        unitCostPiasters: item.unitCostPiasters,
        totalCostPiasters: Math.round(item.quantityUnits * item.unitCostPiasters),
        previousCostPiasters: item.currentCostPiasters,
        newSellingPricePiasters: item.newSellingPricePiasters > 0 ? item.newSellingPricePiasters : undefined,
        batchNumber: item.batchNumber?.trim() || undefined,
        expiryDate: item.expiryDate?.trim() || undefined,
        productionDate: item.productionDate?.trim() || undefined,
      }));

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
        loadPurchases();
        loadSuppliers();
        setActiveTab('invoices');
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
      const res = await invoke<Supplier>('suppliers:save', {
        id: supplierForm.id,
        name: supplierForm.name.trim(),
        companyName: supplierForm.companyName.trim() || null,
        phone: supplierForm.phone.trim() || null,
        address: supplierForm.address.trim() || null,
        balancePiasters,
        notes: supplierForm.notes.trim() || null,
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

  const handleConfirmPayment = async (e: React.FormEvent, effectiveAmount?: number, customNotes?: string) => {
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
      });
      showToast('تم تسجيل سداد الدفعة بنجاح وتحديث رصيد المورد');
      setIsPaymentModalOpen(false);
      loadSuppliers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تسجيل السداد';
      showToast(msg, 'error');
    }
  };

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
    <div className="flex-1 flex flex-col h-full bg-canvas overflow-hidden text-ink">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl border font-bold text-xs shadow-md transition-all ${
            notification.type === 'success'
              ? 'bg-paid-soft border-paid/30 text-paid'
              : 'bg-danger-soft border-danger-border text-danger'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Top Header */}
      <header className="h-[52px] bg-surface border-b border-line px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-soft border border-brand/20 flex items-center justify-center text-brand shadow-2xs">
            <ShoppingCart className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-ink leading-tight">إدارة المشتريات والموردين</h1>
            <p className="text-[11px] text-ink-muted hidden sm:block">
              {activeTab === 'invoices' && 'سجل واستعراض فواتير الشراء، متابعة التكاليف، وحالات السداد'}
              {activeTab === 'new_invoice' && 'تسجيل استلام بضائع وتحديث تكلفة الشراء والمخزون الفوري'}
              {activeTab === 'suppliers' && 'دليل الموردين، حسابات المديونية الآجلة، وكشوف الحساب'}
            </p>
          </div>
        </div>

        {/* Header Right Action / Badges */}
        <div className="flex items-center gap-2">
          {activeTab === 'new_invoice' ? (
            <button
              type="button"
              onClick={handleRequestCancelNewPurchase}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-2 border border-line text-xs font-bold text-ink-muted hover:text-ink transition-colors cursor-pointer shadow-2xs"
              title="العودة إلى قائمة الفواتير"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة للفواتير</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-2 border border-line text-xs font-bold text-ink shadow-2xs">
              {activeTab === 'invoices' && (
                <>
                  <Receipt className="w-3.5 h-3.5 text-brand" />
                  <span>فواتير المشتريات</span>
                  <span className="bg-brand-soft text-brand-dark px-1.5 py-0.2 rounded-full text-[11px] font-mono">
                    {purchases.length}
                  </span>
                </>
              )}
              {activeTab === 'suppliers' && (
                <>
                  <Building2 className="w-3.5 h-3.5 text-brand" />
                  <span>دليل الموردين</span>
                  <span className="bg-brand-soft text-brand-dark px-1.5 py-0.2 rounded-full text-[11px] font-mono">
                    {suppliers.length}
                  </span>
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
      />

      {/* Product Variant Picker for Clothing / Colors & Sizes */}
      <ProductVariantPickerModal
        isOpen={variantPickerParentProduct !== null}
        onClose={() => setVariantPickerParentProduct(null)}
        parentProduct={variantPickerParentProduct}
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
    </div>
  );
};
