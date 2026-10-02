import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  Eye,
  Trash2,
  Building2,
  Phone,
  TrendingUp,
  CreditCard,
  Banknote,
  AlertCircle,
  Archive,
  RotateCcw,
  Receipt,
  X,
  HelpCircle,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { openHelpCenter } from '../utils/helpService';
import { CustomSelect } from '../components/CustomSelect';
import type { Supplier, Purchase, PurchaseItem, Product, SupplierTransaction } from '../types/models';

const formatMoney = (piasters: number): string => {
  return `${(piasters / 100).toFixed(2)} ج.م`;
};

export type PurchasesSubView = 'invoices' | 'new_invoice' | 'suppliers';

interface PurchasesViewProps {
  subView?: PurchasesSubView;
  onSubViewChange?: (view: PurchasesSubView) => void;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({ subView, onSubViewChange }) => {
  const [internalTab, setInternalTab] = useState<PurchasesSubView>('invoices');
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
  const [customPaidAmountPiasters, setCustomPaidAmountPiasters] = useState<number>(0);

  // Line items for the new purchase
  interface NewPurchaseLineItem {
    productId: string;
    productName: string;
    barcode: string;
    currentStockMilli: number;
    currentCostPiasters: number;
    currentPricePiasters: number;
    quantityUnits: number; // in units (converted to milli)
    unitCostPiasters: number;
    newSellingPricePiasters: number;
    batchNumber?: string;
    expiryDate?: string;
    productionDate?: string;
  }
  const [lineItems, setLineItems] = useState<NewPurchaseLineItem[]>([]);

  // Product Search / Scanner for new purchase
  const [productSearchQuery, setProductSearchQuery] = useState<string>('');
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [isSearchingProduct, setIsSearchingProduct] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Show temporary toast notification
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  }, []);

  // Fetch Suppliers
  const loadSuppliers = useCallback(async () => {
    try {
      const res = await invoke<Supplier[]>('suppliers:getAll', { includeInactive: showArchivedSuppliers });
      if (res) {
        setSuppliers(res);
      }
    } catch {
      showToast('تعذر تحميل بيانات الموردين', 'error');
    }
  }, [showArchivedSuppliers, showToast]);

  // Fetch Purchases
  const loadPurchases = useCallback(async () => {
    try {
      const res = await invoke<Purchase[]>('purchases:getAll', { limit: 150 });
      if (res) {
        setPurchases(res);
      }
    } catch {
      showToast('تعذر تحميل فواتير الشراء', 'error');
    }
  }, [showToast]);

  // Initial data loading
  useEffect(() => {
    let isMounted = true;
    const fetchInitialData = async () => {
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
      }
    };
    void fetchInitialData();
    return () => {
      isMounted = false;
    };
  }, [showArchivedSuppliers, showToast]);

  // Search products when query changes
  useEffect(() => {
    if (!productSearchQuery.trim() || productSearchQuery.length < 2) {
      return;
    }
    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsSearchingProduct(true);
      try {
        const res = await invoke<Product[]>('products:search', { query: productSearchQuery.trim() });
        if (isMounted && res) {
          setCatalogProducts(res.slice(0, 8));
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) setIsSearchingProduct(false);
      }
    }, 150);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [productSearchQuery]);

  const displayedCatalogProducts = useMemo(() => {
    if (!productSearchQuery.trim() || productSearchQuery.length < 2) return [];
    return catalogProducts;
  }, [productSearchQuery, catalogProducts]);

  // Add Product to Line Items
  const handleAddProductToPurchase = (prod: Product) => {
    const existingIdx = lineItems.findIndex((item) => item.productId === prod.id);
    if (existingIdx >= 0) {
      const updated = [...lineItems];
      updated[existingIdx].quantityUnits += 1;
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
          unitCostPiasters: prod.costPiasters > 0 ? prod.costPiasters : prod.pricePiasters,
          newSellingPricePiasters: prod.pricePiasters,
          batchNumber: '',
          expiryDate: '',
          productionDate: '',
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
    if (paymentMode === 'PAID') return netCostPiasters;
    if (paymentMode === 'CREDIT') return 0;
    return Math.min(netCostPiasters, Math.max(0, customPaidAmountPiasters));
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
          paymentStatus: remainingAmountPiasters === 0 ? 'PAID' : paidAmountPiasters > 0 ? 'PARTIAL' : 'CREDIT',
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
        setCustomPaidAmountPiasters(0);
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

  // Supplier Form State
  const [supplierForm, setSupplierForm] = useState<{
    id?: string;
    name: string;
    companyName: string;
    phone: string;
    address: string;
    balanceEGP: string;
    notes: string;
  }>({
    name: '',
    companyName: '',
    phone: '',
    address: '',
    balanceEGP: '0',
    notes: '',
  });

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
      const balancePiasters = Math.round((parseFloat(supplierForm.balanceEGP) || 0) * 100);
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

  const handleArchiveSupplier = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في أرشفة هذا المورد؟')) return;
    try {
      await invoke('suppliers:archive', { id });
      showToast('تم أرشفة المورد بنجاح');
      loadSuppliers();
    } catch {
      showToast('تعذر أرشفة المورد', 'error');
    }
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

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierForModal) return;
    if (paymentAmountPiasters <= 0) {
      showToast('مبلغ السداد يجب أن يكون أكبر من صفر', 'error');
      return;
    }

    try {
      await invoke('suppliers:recordPayment', {
        supplierId: selectedSupplierForModal.id,
        amountPiasters: paymentAmountPiasters,
        notes: paymentNotes.trim() || 'سداد دفعة نقدية للمورد',
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

  // Filtered Lists
  const filteredSuppliers = useMemo(() => {
    const q = supplierSearchQuery.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (!showArchivedSuppliers && !s.isActive) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.companyName && s.companyName.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q))
      );
    });
  }, [suppliers, supplierSearchQuery, showArchivedSuppliers]);

  const filteredPurchases = useMemo(() => {
    const q = purchaseSearchQuery.trim().toLowerCase();
    return purchases.filter((p) => {
      if (purchasePaymentFilter !== 'all' && p.paymentStatus !== purchasePaymentFilter) {
        return false;
      }
      if (!q) return true;
      const numMatch = p.invoiceNumber.toString().includes(q);
      const supMatch = p.supplierName && p.supplierName.toLowerCase().includes(q);
      const supInvMatch = p.supplierInvoiceNumber && p.supplierInvoiceNumber.toLowerCase().includes(q);
      return numMatch || supMatch || supInvMatch;
    });
  }, [purchases, purchaseSearchQuery, purchasePaymentFilter]);

  // Aggregate stats
  const totalPurchasesAmount = useMemo(() => {
    return purchases.reduce((sum, p) => sum + p.netCostPiasters, 0);
  }, [purchases]);

  const totalUnpaidPurchasesCount = useMemo(() => {
    return purchases.filter((p) => p.paymentStatus === 'CREDIT' || p.paymentStatus === 'PARTIAL').length;
  }, [purchases]);

  const totalSupplierDebtsAmount = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + Math.max(0, s.balancePiasters), 0);
  }, [suppliers]);

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas overflow-hidden text-ink">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl border font-bold text-xs shadow-md transition-all ${
            notification.type === 'success'
              ? 'bg-paid-soft border-paid/30 text-paid'
              : 'bg-rose-50 border-rose-200 text-danger'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Top Header (View Switcher is now purely in the sidebar tree) */}
      <header className="h-[64px] bg-surface border-b border-line px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-soft border border-brand/20 flex items-center justify-center text-brand shadow-2xs">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink leading-tight">إدارة المشتريات والموردين</h1>
            <p className="text-xs text-ink-muted">
              {activeTab === 'invoices' && 'سجل واستعراض فواتير الشراء، متابعة التكاليف، وحالات السداد'}
              {activeTab === 'new_invoice' && 'تسجيل استلام بضائع وتحديث تكلفة الشراء والمخزون الفوري'}
              {activeTab === 'suppliers' && 'دليل الموردين، حسابات المديونية الآجلة، وكشوف الحساب'}
            </p>
          </div>
        </div>

        {/* Current Sub-View Badge (Informative badge - No duplicate tab buttons) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-surface-2 border border-line text-xs font-bold text-ink shadow-2xs">
            {activeTab === 'invoices' && (
              <>
                <Receipt className="w-4 h-4 text-brand" />
                <span>فواتير المشتريات</span>
                <span className="bg-brand-soft text-brand-dark px-2 py-0.5 rounded-full text-[11px] font-mono">
                  {purchases.length}
                </span>
              </>
            )}
            {activeTab === 'new_invoice' && (
              <>
                <Plus className="w-4 h-4 text-brand" />
                <span>تسجيل فاتورة شراء جديدة</span>
              </>
            )}
            {activeTab === 'suppliers' && (
              <>
                <Building2 className="w-4 h-4 text-brand" />
                <span>دليل الموردين</span>
                <span className="bg-brand-soft text-brand-dark px-2 py-0.5 rounded-full text-[11px] font-mono">
                  {suppliers.length}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 overflow-hidden p-6 flex flex-col">
        {/* ========================================================================= */}
        {/* TAB 1: PURCHASES INVOICES LIST                                           */}
        {/* ========================================================================= */}
        {activeTab === 'invoices' && (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* KPI Cards Strip */}
            <div className="grid grid-cols-3 gap-4 shrink-0">
              <div className="bg-surface border border-line rounded-xl p-4 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-xs text-ink-muted font-medium block">إجمالي المشتريات المسجلة</span>
                  <span className="text-xl font-bold font-mono text-ink mt-1 block">
                    {formatMoney(totalPurchasesAmount)}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center text-brand-dark border border-brand/20 shadow-2xs">
                  <TrendingUp className="w-5 h-5 text-brand" />
                </div>
              </div>

              <div className="bg-surface border border-line rounded-xl p-4 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-xs text-ink-muted font-medium block">فواتير آجلة / غير مسددة بالكامل</span>
                  <span className="text-xl font-bold font-mono text-danger mt-1 block">
                    {totalUnpaidPurchasesCount} فاتورة
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-danger border border-rose-200/60 shadow-2xs">
                  <CreditCard className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-surface border border-line rounded-xl p-4 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-xs text-ink-muted font-medium block">إجمالي مديونية الموردين الحالية</span>
                  <span className="text-xl font-bold font-mono text-warn mt-1 block">
                    {formatMoney(totalSupplierDebtsAmount)}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-warn border border-amber-200/60 shadow-2xs">
                  <Building2 className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Filter and Actions Bar */}
            <div className="bg-surface border border-line rounded-xl p-3 flex items-center justify-between gap-4 shrink-0 shadow-2xs">
              <div className="flex-1 flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ابحث برقم الفاتورة أو اسم المورد أو رقم فاتورة المورد..."
                    value={purchaseSearchQuery}
                    onChange={(e) => setPurchaseSearchQuery(e.target.value)}
                    className="w-full h-10 pr-9 pl-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <Filter className="w-3.5 h-3.5 text-ink-muted" />
                  <span>حالة الدفع:</span>
                  <CustomSelect
                    value={purchasePaymentFilter}
                    onChange={(val) => setPurchasePaymentFilter(val)}
                    options={[
                      { value: 'all', label: 'كافة الفواتير' },
                      { value: 'PAID', label: 'مسددة بالكامل (نقدي)' },
                      { value: 'CREDIT', label: 'آجلة (على الحساب)' },
                      { value: 'PARTIAL', label: 'سداد جزئي' },
                    ]}
                    className="w-44"
                    size="md"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openHelpCenter('purchases')}
                  className="h-10 w-10 flex items-center justify-center bg-surface hover:bg-surface-2 border border-line text-[#006d41] rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                  title="شرح ودليل فواتير المشتريات والموردين (F1)"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('new_invoice')}
                  className="h-10 px-4 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  <span>فاتورة شراء جديدة</span>
                </button>
              </div>
            </div>

            {/* Invoices Table */}
            <div className="flex-1 bg-surface border border-line rounded-xl overflow-hidden flex flex-col shadow-2xs">
              <div className="h-11 bg-surface-2 border-b border-line grid grid-cols-12 px-4 items-center text-xs font-bold text-ink-muted">
                <div className="col-span-1">رقم الفاتورة</div>
                <div className="col-span-2">تاريخ الاستلام</div>
                <div className="col-span-3">المورد</div>
                <div className="col-span-2 text-center">رقم فاتورة المورد</div>
                <div className="col-span-1 text-center">الصافي</div>
                <div className="col-span-1 text-center">المتبقي</div>
                <div className="col-span-1 text-center">حالة السداد</div>
                <div className="col-span-1 text-left">التفاصيل</div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-line">
                {filteredPurchases.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-ink-muted gap-2">
                    <ShoppingCart className="w-8 h-8 opacity-30" />
                    <span className="text-sm font-medium">لا توجد فواتير شراء مسجلة مطابقة للبحث</span>
                  </div>
                ) : (
                  filteredPurchases.map((pur) => (
                    <div
                      key={pur.id}
                      className="h-12 grid grid-cols-12 px-4 items-center text-xs hover:bg-surface-2/60 transition-colors"
                    >
                      <div className="col-span-1 font-mono font-bold text-brand">
                        #{pur.invoiceNumber}
                      </div>
                      <div className="col-span-2 text-ink-muted">
                        {new Date(pur.invoiceDate).toLocaleDateString('ar-EG', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      <div className="col-span-3 font-semibold text-ink truncate">
                        {pur.supplierName || 'مورد عام / بدون تحديد'}
                      </div>
                      <div className="col-span-2 text-center font-mono text-ink-muted">
                        {pur.supplierInvoiceNumber || '—'}
                      </div>
                      <div className="col-span-1 text-center font-mono font-bold text-ink">
                        {formatMoney(pur.netCostPiasters)}
                      </div>
                      <div className="col-span-1 text-center font-mono font-semibold">
                        {pur.remainingAmountPiasters > 0 ? (
                          <span className="text-danger">
                            {formatMoney(pur.remainingAmountPiasters)}
                          </span>
                        ) : (
                          <span className="text-paid font-medium">0.00 ج.م</span>
                        )}
                      </div>
                      <div className="col-span-1 text-center">
                        {pur.paymentStatus === 'PAID' && (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-paid-soft text-paid border border-paid/20">
                            مسددة
                          </span>
                        )}
                        {pur.paymentStatus === 'CREDIT' && (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-danger border border-rose-200">
                            آجلة
                          </span>
                        )}
                        {pur.paymentStatus === 'PARTIAL' && (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-warn border border-amber-200">
                            جزئي
                          </span>
                        )}
                      </div>
                      <div className="col-span-1 text-left">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const full = await invoke<Purchase>('purchases:getById', { id: pur.id });
                              setSelectedPurchaseDetails(full || pur);
                            } catch {
                              setSelectedPurchaseDetails(pur);
                            }
                          }}
                          className="p-1.5 text-brand hover:text-brand-dark hover:bg-brand-soft rounded-lg transition-colors cursor-pointer"
                          title="عرض تفاصيل الفاتورة وبنودها"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: RECORD NEW PURCHASE INVOICE                                        */}
        {/* ========================================================================= */}
        {activeTab === 'new_invoice' && (
          <div className="flex-1 flex gap-6 overflow-hidden">
            {/* Left: Line Items & Search (Canvas) */}
            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
              {/* Invoice Master Header Inputs */}
              <div className="bg-surface border border-line rounded-xl p-4 grid grid-cols-12 gap-3 items-center shrink-0 shadow-2xs">
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
                          }))
                      ]}
                      className="flex-1 min-w-0"
                      size="md"
                      searchable
                    />
                    <button
                      type="button"
                      onClick={handleOpenAddSupplier}
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
                    {new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                        onClick={() => handleAddProductToPurchase(p)}
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

                          {/* Batch & Expiry Input Row (Task 60-3) */}
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

            {/* Right: Settlement & Totals Dock (360px) */}
            <div className="w-[360px] bg-surface border border-line rounded-xl p-5 flex flex-col justify-between shrink-0 shadow-2xs">
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
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
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
                    <div className="p-2.5 bg-rose-50 border border-rose-200 text-danger rounded-xl text-xs flex items-center gap-2">
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
                  onClick={handleSavePurchase}
                  disabled={lineItems.length === 0}
                  className="w-full h-11 bg-paid hover:bg-[#005734] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  <Receipt className="w-4 h-4" />
                  <span>اعتماد الفاتورة وإضافة المخزون</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('هل تريد إلغاء الفاتورة الحالية ومسح البنود؟')) {
                      setLineItems([]);
                      setActiveTab('invoices');
                    }
                  }}
                  className="w-full h-9 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء والتراجع
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: SUPPLIERS DIRECTORY (Feature #39)                                  */}
        {/* ========================================================================= */}
        {activeTab === 'suppliers' && (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Top Toolbar */}
            <div className="bg-surface border border-line rounded-xl p-3 flex items-center justify-between gap-4 shrink-0 shadow-2xs">
              <div className="flex-1 flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو الشركة أو رقم الهاتف..."
                    value={supplierSearchQuery}
                    onChange={(e) => setSupplierSearchQuery(e.target.value)}
                    className="w-full h-10 pr-9 pl-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showArchivedSuppliers}
                    onChange={(e) => setShowArchivedSuppliers(e.target.checked)}
                    className="rounded border-line text-brand focus:ring-brand"
                  />
                  <span>عرض الموردين المؤرشفين</span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleOpenAddSupplier}
                className="h-10 px-4 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة مورد جديد</span>
              </button>
            </div>

            {/* Suppliers Table */}
            <div className="flex-1 bg-surface border border-line rounded-xl overflow-hidden flex flex-col shadow-2xs">
              <div className="h-11 bg-surface-2 border-b border-line grid grid-cols-12 px-4 items-center text-xs font-bold text-ink-muted">
                <div className="col-span-3">اسم المورد والشركة</div>
                <div className="col-span-2">رقم الهاتف</div>
                <div className="col-span-3">العنوان / الملاحظات</div>
                <div className="col-span-2 text-center">الرصيد المستحق (المديونية)</div>
                <div className="col-span-1 text-center">الحالة</div>
                <div className="col-span-1 text-left">إجراءات</div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-line">
                {filteredSuppliers.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-ink-muted gap-2">
                    <Building2 className="w-8 h-8 opacity-30" />
                    <span className="text-sm font-medium">لا يوجد موردين مطابقين للبحث</span>
                  </div>
                ) : (
                  filteredSuppliers.map((sup) => (
                    <div
                      key={sup.id}
                      className={`h-14 grid grid-cols-12 px-4 items-center text-xs hover:bg-surface-2/60 transition-colors ${
                        !sup.isActive ? 'bg-surface-2/50 opacity-60' : ''
                      }`}
                    >
                      <div className="col-span-3">
                        <span className="font-bold text-ink block truncate">{sup.name}</span>
                        {sup.companyName && (
                          <span className="text-[11px] text-ink-muted block truncate">{sup.companyName}</span>
                        )}
                      </div>

                      <div className="col-span-2 font-mono text-ink-muted">
                        {sup.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-ink-muted" />
                            <span>{sup.phone}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </div>

                      <div className="col-span-3 text-ink-muted truncate">
                        {sup.address || sup.notes || '—'}
                      </div>

                      <div className="col-span-2 text-center font-mono font-bold">
                        {sup.balancePiasters > 0 ? (
                          <span className="text-danger">
                            {formatMoney(sup.balancePiasters)}
                          </span>
                        ) : (
                          <span className="text-paid font-medium">خالص (0.00 ج.م)</span>
                        )}
                      </div>

                      <div className="col-span-1 text-center">
                        {sup.isActive ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-paid-soft text-paid border border-paid/20">
                            نشط
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-2 text-ink-muted border border-line">
                            مؤرشف
                          </span>
                        )}
                      </div>

                      <div className="col-span-1 text-left flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenPayment(sup)}
                          className="p-1.5 text-paid hover:bg-paid-soft rounded-lg transition-colors cursor-pointer"
                          title="سداد دفعة للمورد"
                        >
                          <Banknote className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenStatement(sup)}
                          className="p-1.5 text-brand hover:text-brand-dark hover:bg-brand-soft rounded-lg transition-colors cursor-pointer"
                          title="كشف حساب المورد"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditSupplier(sup)}
                          className="p-1.5 text-ink-muted hover:text-ink hover:bg-surface-2 rounded-lg transition-colors cursor-pointer"
                          title="تعديل بيانات المورد"
                        >
                          <Building2 className="w-4 h-4" />
                        </button>
                        {sup.isActive ? (
                          <button
                            type="button"
                            onClick={() => handleArchiveSupplier(sup.id)}
                            className="p-1.5 text-ink-muted hover:text-danger hover:bg-danger-soft rounded-lg transition-colors cursor-pointer"
                            title="أرشفة المورد"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRestoreSupplier(sup.id)}
                            className="p-1.5 text-brand hover:text-brand-dark hover:bg-brand-soft rounded-lg transition-colors cursor-pointer"
                            title="استعادة المورد النشط"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD / EDIT SUPPLIER                                              */}
      {/* ========================================================================= */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="h-14 bg-surface border-b border-line px-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center shadow-2xs">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-ink">
                  {supplierForm.id ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-5 space-y-3.5">
              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  اسم المورد <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: شركة النيل للمواد الغذائية"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">اسم الشركة أو التوكيل</label>
                <input
                  type="text"
                  placeholder="مثال: توكيل شيبسي وأغذية"
                  value={supplierForm.companyName}
                  onChange={(e) => setSupplierForm({ ...supplierForm, companyName: e.target.value })}
                  className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-ink block mb-1">رقم الهاتف</label>
                  <input
                    type="text"
                    placeholder="010XXXXXXXX"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs font-mono text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
                  />
                </div>

                {!supplierForm.id && (
                  <div>
                    <label className="text-xs font-bold text-ink block mb-1">الرصيد الافتتاحي (ج.م)</label>
                    <input
                      type="number"
                      step="1"
                      value={supplierForm.balanceEGP}
                      onChange={(e) => setSupplierForm({ ...supplierForm, balanceEGP: e.target.value })}
                      className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs font-mono font-bold text-danger focus:outline-none focus:border-brand focus:bg-surface transition-colors"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">العنوان أو بيانات الفرع</label>
                <input
                  type="text"
                  placeholder="مثال: المنيا - ملوى"
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  placeholder="مواعيد التوريد، أيام الزيارة، إلخ..."
                  value={supplierForm.notes}
                  onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                  className="w-full p-2.5 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface resize-none transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-line">
                <button
                  type="submit"
                  className="flex-1 h-10 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
                >
                  حفظ بيانات المورد
                </button>
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 h-10 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RECORD SUPPLIER PAYMENT                                          */}
      {/* ========================================================================= */}
      {isPaymentModalOpen && selectedSupplierForModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="h-14 bg-surface border-b border-line px-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-paid-soft text-paid flex items-center justify-center shadow-2xs">
                  <Banknote className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-ink">سداد دفعة للمورد</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="p-5 space-y-4">
              <div className="p-3 bg-surface-2 border border-line rounded-xl">
                <span className="text-xs text-ink-muted block">المورد:</span>
                <span className="text-sm font-bold text-ink block">{selectedSupplierForModal.name}</span>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-line text-xs">
                  <span className="text-ink-muted">المديونية الحالية:</span>
                  <span className="font-mono font-bold text-danger">
                    {formatMoney(selectedSupplierForModal.balancePiasters)}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  مبلغ السداد (ج.م) <span className="text-danger">*</span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  required
                  value={(paymentAmountPiasters / 100).toFixed(2)}
                  onChange={(e) => {
                    const valEGP = parseFloat(e.target.value) || 0;
                    setPaymentAmountPiasters(Math.round(valEGP * 100));
                  }}
                  className="w-full h-11 px-3 bg-surface-2 border-2 border-paid focus:bg-surface rounded-xl text-base font-mono font-bold text-paid focus:outline-none transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">ملاحظات / رقم إذن الصرف</label>
                <input
                  type="text"
                  placeholder="سداد نقدي من الدرج..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-2 border border-line rounded-xl text-xs text-ink focus:outline-none focus:border-brand focus:bg-surface transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-line">
                <button
                  type="submit"
                  className="flex-1 h-10 bg-paid hover:bg-[#005734] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-[0.98]"
                >
                  تأكيد سداد المبلغ
                </button>
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 h-10 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: SUPPLIER STATEMENT (كشف الحساب)                                    */}
      {/* ========================================================================= */}
      {isStatementModalOpen && selectedSupplierForModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="h-14 bg-surface border-b border-line px-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center shadow-2xs">
                  <Receipt className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-ink">
                  كشف حساب المورد: {selectedSupplierForModal.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStatementModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-surface-2 border-b border-line flex items-center justify-between shrink-0">
              <div>
                <span className="text-xs text-ink-muted block">الرصيد القائم المستحق للمورد:</span>
                <span className="text-xl font-mono font-bold text-danger">
                  {formatMoney(selectedSupplierForModal.balancePiasters)}
                </span>
              </div>
              <div className="text-left text-xs text-ink-muted">
                <span>عدد الحركات المسجلة: {supplierTransactions.length} حركة</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-line p-2">
              {supplierTransactions.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-xs text-ink-muted">
                  لا توجد حركات مسجلة في كشف حساب المورد حتى الآن
                </div>
              ) : (
                supplierTransactions.map((tx) => (
                  <div key={tx.id} className="p-3 flex items-center justify-between text-xs hover:bg-surface-2/60 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink">
                          {tx.transactionType === 'OPENING_BALANCE' && 'رصيد افتتاحي'}
                          {tx.transactionType === 'PURCHASE_INVOICE' && 'فاتورة شراء آجل'}
                          {tx.transactionType === 'PAYMENT' && 'سداد دفعة نقدية'}
                        </span>
                        <span className="text-[10px] text-ink-muted">
                          {new Date(tx.createdAt).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {tx.notes && <span className="text-[11px] text-ink-muted block mt-0.5">{tx.notes}</span>}
                    </div>

                    <div className="font-mono font-bold text-sm">
                      {tx.amountPiasters > 0 ? (
                        <span className="text-danger">+{formatMoney(tx.amountPiasters)}</span>
                      ) : (
                        <span className="text-paid">
                          -{formatMoney(Math.abs(tx.amountPiasters))}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3.5 bg-surface border-t border-line flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsStatementModalOpen(false)}
                className="px-5 h-9 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إغلاق كشف الحساب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: INVOICE DETAILS MODAL                                            */}
      {/* ========================================================================= */}
      {selectedPurchaseDetails && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="h-14 bg-surface border-b border-line px-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-soft text-brand flex items-center justify-center shadow-2xs">
                  <Receipt className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-ink">
                  تفاصيل فاتورة الشراء رقم #{selectedPurchaseDetails.invoiceNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPurchaseDetails(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Header info */}
            <div className="p-4 bg-surface-2 border-b border-line grid grid-cols-3 gap-3 text-xs shrink-0">
              <div>
                <span className="text-ink-muted block">المورد:</span>
                <span className="font-bold text-ink">{selectedPurchaseDetails.supplierName || 'بدون مورد'}</span>
              </div>
              <div>
                <span className="text-ink-muted block">تاريخ الفاتورة:</span>
                <span className="font-semibold text-ink">
                  {new Date(selectedPurchaseDetails.invoiceDate).toLocaleDateString('ar-EG', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <div>
                <span className="text-ink-muted block">رقم فاتورة المورد الورقية:</span>
                <span className="font-mono font-bold text-ink">
                  {selectedPurchaseDetails.supplierInvoiceNumber || '—'}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-surface-2 text-ink-muted sticky top-0 border-b border-line">
                  <tr>
                    <th className="p-3">الصنف</th>
                    <th className="p-3 text-center">الكمية</th>
                    <th className="p-3 text-center">تكلفة الشراء</th>
                    <th className="p-3 text-center">الإجمالي</th>
                    <th className="p-3 text-center">التكلفة السابقة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {selectedPurchaseDetails.items?.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-2/60 transition-colors">
                      <td className="p-3 font-semibold text-ink">
                        {item.productName}
                        {item.barcode && <span className="text-[10px] text-ink-muted block font-mono">{item.barcode}</span>}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-ink">
                        {(item.quantityMilli / 1000).toFixed(0)}
                      </td>
                      <td className="p-3 text-center font-mono text-ink">
                        {formatMoney(item.unitCostPiasters)}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-brand">
                        {formatMoney(item.totalCostPiasters)}
                      </td>
                      <td className="p-3 text-center font-mono text-ink-muted">
                        {formatMoney(item.previousCostPiasters)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Footer */}
            <div className="p-4 bg-surface-2 border-t border-line flex items-center justify-between shrink-0 text-xs">
              <div className="space-y-1">
                <div>
                  <span className="text-ink-muted">إجمالي التكلفة: </span>
                  <span className="font-mono font-bold text-ink">
                    {formatMoney(selectedPurchaseDetails.totalCostPiasters)}
                  </span>
                </div>
                {selectedPurchaseDetails.discountPiasters > 0 && (
                  <div>
                    <span className="text-ink-muted">الخصم: </span>
                    <span className="font-mono text-paid">
                      -{formatMoney(selectedPurchaseDetails.discountPiasters)}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-ink-muted">صافي الفاتورة: </span>
                  <span className="font-mono font-bold text-sm text-brand">
                    {formatMoney(selectedPurchaseDetails.netCostPiasters)}
                  </span>
                </div>
              </div>

              <div className="text-left space-y-1">
                <div>
                  <span className="text-ink-muted">حالة السداد: </span>
                  <span className="font-bold text-ink">
                    {selectedPurchaseDetails.paymentStatus === 'PAID' && 'مسددة بالكامل'}
                    {selectedPurchaseDetails.paymentStatus === 'CREDIT' && 'آجلة على المورد'}
                    {selectedPurchaseDetails.paymentStatus === 'PARTIAL' && 'سداد جزئي'}
                  </span>
                </div>
                <div>
                  <span className="text-ink-muted">المبلغ المتبقي: </span>
                  <span className="font-mono font-bold text-sm text-danger">
                    {formatMoney(selectedPurchaseDetails.remainingAmountPiasters)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-surface border-t border-line flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedPurchaseDetails(null)}
                className="px-5 h-9 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
