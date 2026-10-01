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
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Supplier, Purchase, PurchaseItem, Product, SupplierTransaction } from '../types/models';

const formatMoney = (piasters: number): string => {
  return `${(piasters / 100).toFixed(2)} ج.م`;
};

type ViewMode = 'invoices' | 'new_invoice' | 'suppliers';

export const PurchasesView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ViewMode>('invoices');

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
    <div className="flex-1 flex flex-col h-full bg-[#f7fafc] overflow-hidden text-[#14181a]">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-lg border font-semibold text-sm shadow-md transition-all ${
            notification.type === 'success'
              ? 'bg-[#e1eae5] border-[#006d41] text-[#00372d]'
              : 'bg-[#ffdad6] border-[#ba1a1a] text-[#93000a]'
          }`}
        >
          {notification.message}
        </div>
      )}

      {/* Top Header & Tab Navigation */}
      <header className="h-[64px] bg-white border-b border-[#dce1dc] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00372d] flex items-center justify-center text-white shadow-2xs">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#14181a] leading-tight">إدارة المشتريات والموردين</h1>
            <p className="text-xs text-[#5b6664]">تسجيل استلام البضائع، تحديث تكلفة الشراء، ومتابعة حسابات الموردين</p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-[#ebeef1] p-1 rounded-xl border border-[#dce1dc]">
          <button
            type="button"
            onClick={() => setActiveTab('invoices')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'invoices' ? 'bg-[#00372d] text-white shadow-2xs' : 'text-[#5b6664] hover:text-[#14181a]'
            }`}
          >
            فواتير المشتريات ({purchases.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('new_invoice')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'new_invoice' ? 'bg-[#00372d] text-white shadow-2xs' : 'text-[#5b6664] hover:text-[#14181a]'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>تسجيل فاتورة شراء جديدة</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('suppliers')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'suppliers' ? 'bg-[#00372d] text-white shadow-2xs' : 'text-[#5b6664] hover:text-[#14181a]'
            }`}
          >
            دليل الموردين ({suppliers.length})
          </button>
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
              <div className="bg-white border border-[#dce1dc] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#5b6664] font-medium block">إجمالي المشتريات المسجلة</span>
                  <span className="text-xl font-bold font-mono text-[#00372d] mt-1 block">
                    {formatMoney(totalPurchasesAmount)}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#e1eae5] flex items-center justify-center text-[#00372d]">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white border border-[#dce1dc] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#5b6664] font-medium block">فواتير آجلة / غير مسددة بالكامل</span>
                  <span className="text-xl font-bold font-mono text-[#ba1a1a] mt-1 block">
                    {totalUnpaidPurchasesCount} فاتورة
                  </span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#ffdad6] flex items-center justify-center text-[#ba1a1a]">
                  <CreditCard className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white border border-[#dce1dc] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-[#5b6664] font-medium block">إجمالي مديونية الموردين الحالية</span>
                  <span className="text-xl font-bold font-mono text-[#462900] mt-1 block">
                    {formatMoney(totalSupplierDebtsAmount)}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#ffddb9] flex items-center justify-center text-[#462900]">
                  <Building2 className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Filter and Actions Bar */}
            <div className="bg-white border border-[#dce1dc] rounded-xl p-3 flex items-center justify-between gap-4 shrink-0">
              <div className="flex-1 flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[#5b6664] absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ابحث برقم الفاتورة أو اسم المورد أو رقم فاتورة المورد..."
                    value={purchaseSearchQuery}
                    onChange={(e) => setPurchaseSearchQuery(e.target.value)}
                    className="w-full h-10 pr-9 pl-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs text-[#14181a] focus:outline-none focus:border-[#00372d]"
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs text-[#5b6664]">
                  <Filter className="w-3.5 h-3.5" />
                  <span>حالة الدفع:</span>
                  <select
                    value={purchasePaymentFilter}
                    onChange={(e) => setPurchasePaymentFilter(e.target.value)}
                    className="h-10 px-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs font-medium text-[#14181a] focus:outline-none"
                  >
                    <option value="all">كافة الفواتير</option>
                    <option value="PAID">مسددة بالكامل (نقدي)</option>
                    <option value="CREDIT">آجلة (على الحساب)</option>
                    <option value="PARTIAL">سداد جزئي</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('new_invoice')}
                className="h-10 px-4 bg-[#00372d] hover:bg-[#0b4f42] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>فاتورة شراء جديدة</span>
              </button>
            </div>

            {/* Invoices Table */}
            <div className="flex-1 bg-white border border-[#dce1dc] rounded-xl overflow-hidden flex flex-col shadow-2xs">
              <div className="h-11 bg-[#ebeef1] border-b border-[#dce1dc] grid grid-cols-12 px-4 items-center text-xs font-bold text-[#5b6664]">
                <div className="col-span-1">رقم الفاتورة</div>
                <div className="col-span-2">تاريخ الاستلام</div>
                <div className="col-span-3">المورد</div>
                <div className="col-span-2 text-center">رقم فاتورة المورد</div>
                <div className="col-span-1 text-center">الصافي</div>
                <div className="col-span-1 text-center">المتبقي</div>
                <div className="col-span-1 text-center">حالة السداد</div>
                <div className="col-span-1 text-left">التفاصيل</div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[#dce1dc]">
                {filteredPurchases.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-[#5b6664] gap-2">
                    <ShoppingCart className="w-8 h-8 opacity-30" />
                    <span className="text-sm font-medium">لا توجد فواتير شراء مسجلة مطابقة للبحث</span>
                  </div>
                ) : (
                  filteredPurchases.map((pur) => (
                    <div
                      key={pur.id}
                      className="h-12 grid grid-cols-12 px-4 items-center text-xs hover:bg-[#f1f4f6] transition-colors"
                    >
                      <div className="col-span-1 font-mono font-bold text-[#00372d]">
                        #{pur.invoiceNumber}
                      </div>
                      <div className="col-span-2 text-[#5b6664]">
                        {new Date(pur.invoiceDate).toLocaleDateString('ar-EG', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </div>
                      <div className="col-span-3 font-semibold text-[#14181a] truncate">
                        {pur.supplierName || 'مورد عام / بدون تحديد'}
                      </div>
                      <div className="col-span-2 text-center font-mono text-[#5b6664]">
                        {pur.supplierInvoiceNumber || '—'}
                      </div>
                      <div className="col-span-1 text-center font-mono font-bold text-[#14181a]">
                        {formatMoney(pur.netCostPiasters)}
                      </div>
                      <div className="col-span-1 text-center font-mono font-semibold">
                        {pur.remainingAmountPiasters > 0 ? (
                          <span className="text-[#ba1a1a]">
                            {formatMoney(pur.remainingAmountPiasters)}
                          </span>
                        ) : (
                          <span className="text-[#006d41]">0.00 ج.م</span>
                        )}
                      </div>
                      <div className="col-span-1 text-center">
                        {pur.paymentStatus === 'PAID' && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#99f2bb] text-[#006d41]">
                            مسددة
                          </span>
                        )}
                        {pur.paymentStatus === 'CREDIT' && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#ffdad6] text-[#ba1a1a]">
                            آجلة
                          </span>
                        )}
                        {pur.paymentStatus === 'PARTIAL' && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#ffddb9] text-[#462900]">
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
                          className="p-1.5 text-[#00372d] hover:bg-[#e1eae5] rounded-md transition-colors"
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
              <div className="bg-white border border-[#dce1dc] rounded-xl p-4 grid grid-cols-12 gap-3 items-center shrink-0">
                <div className="col-span-4">
                  <label className="text-[11px] font-bold text-[#5b6664] block mb-1">
                    المورد <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => setSelectedSupplierId(e.target.value)}
                      className="flex-1 h-9 px-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs font-semibold text-[#14181a] focus:outline-none"
                    >
                      <option value="">-- اختر مورد الفاتورة --</option>
                      {suppliers
                        .filter((s) => s.isActive)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} {s.balancePiasters > 0 ? `(مديونية: ${(s.balancePiasters / 100).toFixed(2)} ج.م)` : ''}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleOpenAddSupplier}
                      className="h-9 px-2.5 bg-[#e1eae5] hover:bg-[#cde0d7] text-[#00372d] rounded-lg text-xs font-bold flex items-center gap-1 shrink-0"
                      title="إضافة مورد جديد سريعاً"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>مورد جديد</span>
                    </button>
                  </div>
                </div>

                <div className="col-span-3">
                  <label className="text-[11px] font-bold text-[#5b6664] block mb-1">
                    رقم فاتورة المورد الورقية
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: INV-8840"
                    value={supplierInvoiceNumber}
                    onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                    className="w-full h-9 px-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs font-mono font-medium text-[#14181a] focus:outline-none"
                  />
                </div>

                <div className="col-span-3">
                  <label className="text-[11px] font-bold text-[#5b6664] block mb-1">
                    طريقة تحديث التكلفة
                  </label>
                  <select
                    value={costingMethod}
                    onChange={(e) => setCostingMethod(e.target.value as 'LATEST' | 'WEIGHTED_AVERAGE')}
                    className="w-full h-9 px-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs font-semibold text-[#14181a] focus:outline-none"
                  >
                    <option value="LATEST">آخر سعر شراء (المعتاد في السوبرماركت)</option>
                    <option value="WEIGHTED_AVERAGE">المتوسط المرجح للتكلفة (محاسبي)</option>
                  </select>
                </div>

                <div className="col-span-2 text-left">
                  <span className="text-[11px] text-[#5b6664] block">تاريخ الفاتورة</span>
                  <span className="text-xs font-bold text-[#14181a]">
                    {new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Barcode & Product Scanner Search Bar */}
              <div className="relative shrink-0">
                <div className="h-12 bg-white border border-[#dce1dc] rounded-xl flex items-center px-3 gap-2 shadow-2xs">
                  <Search className="w-5 h-5 text-[#5b6664]" />
                  <input
                    type="text"
                    placeholder="امسح باركود المنتج (قارئ الباركود) أو اكتب اسم الصنف للإضافة للفاتورة..."
                    value={productSearchQuery}
                    onChange={(e) => setProductSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none text-sm text-[#14181a] focus:outline-none"
                    autoFocus
                  />
                  {isSearchingProduct && (
                    <span className="text-xs text-[#5b6664] animate-pulse">جاري البحث...</span>
                  )}
                </div>

                {/* Dropdown Results */}
                {displayedCatalogProducts.length > 0 && (
                  <div className="absolute top-14 left-0 right-0 z-40 bg-white border border-[#dce1dc] rounded-xl shadow-lg overflow-hidden divide-y divide-[#dce1dc]">
                    {displayedCatalogProducts.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => handleAddProductToPurchase(p)}
                        className="w-full p-3 text-right hover:bg-[#f1f4f6] flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <div>
                          <span className="font-bold text-xs text-[#14181a] block">{p.name}</span>
                          <span className="text-[11px] text-[#5b6664] font-mono">
                            باركود: {p.barcode || 'بدون'} | الرصيد الحالي: {(p.stockQuantityMilli / 1000).toFixed(0)} {p.unit}
                          </span>
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-bold font-mono text-[#006d41] block">
                            سعر البيع: {formatMoney(p.pricePiasters)}
                          </span>
                          <span className="text-[11px] font-mono text-[#5b6664]">
                            التكلفة السابقة: {formatMoney(p.costPiasters)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Line Items Table */}
              <div className="flex-1 bg-white border border-[#dce1dc] rounded-xl overflow-hidden flex flex-col shadow-2xs">
                <div className="h-10 bg-[#ebeef1] border-b border-[#dce1dc] grid grid-cols-12 px-4 items-center text-xs font-bold text-[#5b6664]">
                  <div className="col-span-4">اسم الصنف والباركود</div>
                  <div className="col-span-2 text-center">الكمية المشتراة</div>
                  <div className="col-span-2 text-center">سعر الشراء للوحدة</div>
                  <div className="col-span-2 text-center">الإجمالي</div>
                  <div className="col-span-1 text-center">سعر البيع الجديد</div>
                  <div className="col-span-1 text-left">حذف</div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-[#dce1dc]">
                  {lineItems.length === 0 ? (
                    <div className="h-56 flex flex-col items-center justify-center text-[#5b6664] gap-2">
                      <ShoppingCart className="w-10 h-10 opacity-30" />
                      <span className="text-sm font-semibold">لم تتم إضافة أي أصناف إلى الفاتورة بعد</span>
                      <span className="text-xs text-[#5b6664]">استخدم شريط البحث بالأعلى لإضافة الأصناف بالباركود أو الاسم</span>
                    </div>
                  ) : (
                    lineItems.map((item, idx) => {
                      const lineTotal = Math.round(item.quantityUnits * item.unitCostPiasters);
                      return (
                        <div
                          key={item.productId}
                          className="h-14 grid grid-cols-12 px-4 items-center text-xs hover:bg-[#f7fafc] transition-colors"
                        >
                          <div className="col-span-4">
                            <span className="font-bold text-[#14181a] block truncate">{item.productName}</span>
                            <span className="text-[10px] font-mono text-[#5b6664]">
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
                              className="w-6 h-6 rounded bg-[#ebeef1] hover:bg-[#dce1dc] flex items-center justify-center text-xs font-bold"
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
                              className="w-14 h-7 text-center font-mono font-bold bg-[#f7fafc] border border-[#dce1dc] rounded text-xs focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...lineItems];
                                updated[idx].quantityUnits += 1;
                                setLineItems(updated);
                              }}
                              className="w-6 h-6 rounded bg-[#ebeef1] hover:bg-[#dce1dc] flex items-center justify-center text-xs font-bold"
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
                              className="w-20 h-7 text-center font-mono font-bold bg-[#f7fafc] border border-[#dce1dc] rounded text-xs focus:outline-none"
                            />
                            <span className="text-[10px] text-[#5b6664]">ج.م</span>
                          </div>

                          {/* Line Total */}
                          <div className="col-span-2 text-center font-mono font-bold text-[#00372d]">
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
                              className="w-16 h-7 text-center font-mono text-xs bg-[#f7fafc] border border-[#dce1dc] rounded focus:outline-none"
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
                              className="p-1.5 text-[#ba1a1a] hover:bg-[#ffdad6] rounded-md transition-colors"
                              title="حذف هذا الصنف من الفاتورة"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right: Settlement & Totals Dock (360px) */}
            <div className="w-[360px] bg-white border border-[#dce1dc] rounded-xl p-5 flex flex-col justify-between shrink-0 shadow-2xs">
              <div className="space-y-4">
                <div className="pb-3 border-b border-[#dce1dc]">
                  <h2 className="text-sm font-bold text-[#14181a]">ملخص واعتماد فاتورة الشراء</h2>
                  <span className="text-xs text-[#5b6664]">إجمالي الكميات: {lineItems.length} صنف</span>
                </div>

                {/* Totals Breakdown */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between text-[#5b6664]">
                    <span>إجمالي التكلفة:</span>
                    <span className="font-mono font-bold text-[#14181a]">
                      {formatMoney(totalCostPiasters)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[#5b6664]">
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
                        className="w-20 h-7 text-center font-mono font-bold bg-[#f7fafc] border border-[#dce1dc] rounded text-xs focus:outline-none"
                      />
                      <span>ج.م</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#dce1dc] flex justify-between items-baseline">
                    <span className="font-bold text-sm text-[#14181a]">الصافي المستحق:</span>
                    <span className="text-xl font-bold font-mono text-[#00372d]">
                      {formatMoney(netCostPiasters)}
                    </span>
                  </div>
                </div>

                {/* Payment Options */}
                <div className="pt-3 border-t border-[#dce1dc] space-y-2">
                  <label className="text-xs font-bold text-[#14181a] block">طريقة السداد للمورد</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMode('PAID')}
                      className={`h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-all ${
                        paymentMode === 'PAID'
                          ? 'bg-[#00372d] text-white border-[#00372d]'
                          : 'bg-[#f7fafc] text-[#5b6664] border-[#dce1dc]'
                      }`}
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      <span>مسددة نقداً</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMode('CREDIT')}
                      className={`h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-all ${
                        paymentMode === 'CREDIT'
                          ? 'bg-[#ba1a1a] text-white border-[#ba1a1a]'
                          : 'bg-[#f7fafc] text-[#5b6664] border-[#dce1dc]'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>آجل بالكامل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMode('PARTIAL')}
                      className={`h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-all ${
                        paymentMode === 'PARTIAL'
                          ? 'bg-[#462900] text-white border-[#462900]'
                          : 'bg-[#f7fafc] text-[#5b6664] border-[#dce1dc]'
                      }`}
                    >
                      <span>سداد جزئي</span>
                    </button>
                  </div>

                  {paymentMode === 'PARTIAL' && (
                    <div className="p-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg space-y-2 mt-2">
                      <div className="flex justify-between items-center text-xs">
                        <span>المدفوع نقداً:</span>
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
                            className="w-24 h-7 text-center font-mono font-bold bg-white border border-[#dce1dc] rounded text-xs"
                          />
                          <span>ج.م</span>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-[#ba1a1a] font-bold">
                        <span>المتبقي آجل على المورد:</span>
                        <span className="font-mono">{formatMoney(remainingAmountPiasters)}</span>
                      </div>
                    </div>
                  )}

                  {paymentMode === 'CREDIT' && (
                    <div className="p-2.5 bg-[#ffdad6] text-[#93000a] rounded-lg text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>سيتم إضافة كامل المبلغ إلى حساب مديونية المورد في دفتر الآجل.</span>
                    </div>
                  )}
                </div>

                {/* Notes Input */}
                <div className="pt-2">
                  <label className="text-[11px] font-bold text-[#5b6664] block mb-1">ملاحظات الفاتورة</label>
                  <textarea
                    rows={2}
                    placeholder="ملاحظات أو رقم إذن الاستلام..."
                    value={purchaseNotes}
                    onChange={(e) => setPurchaseNotes(e.target.value)}
                    className="w-full p-2 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs text-[#14181a] focus:outline-none resize-none"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-4 border-t border-[#dce1dc]">
                <button
                  type="button"
                  onClick={handleSavePurchase}
                  disabled={lineItems.length === 0}
                  className="w-full h-11 bg-[#00372d] hover:bg-[#0b4f42] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
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
                  className="w-full h-8 text-xs font-bold text-[#5b6664] hover:text-[#ba1a1a] transition-colors"
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
            <div className="bg-white border border-[#dce1dc] rounded-xl p-3 flex items-center justify-between gap-4 shrink-0">
              <div className="flex-1 flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[#5b6664] absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو الشركة أو رقم الهاتف..."
                    value={supplierSearchQuery}
                    onChange={(e) => setSupplierSearchQuery(e.target.value)}
                    className="w-full h-10 pr-9 pl-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs text-[#14181a] focus:outline-none"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-[#5b6664] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showArchivedSuppliers}
                    onChange={(e) => setShowArchivedSuppliers(e.target.checked)}
                    className="rounded border-[#dce1dc] text-[#00372d]"
                  />
                  <span>عرض الموردين المؤرشفين</span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleOpenAddSupplier}
                className="h-10 px-4 bg-[#00372d] hover:bg-[#0b4f42] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة مورد جديد</span>
              </button>
            </div>

            {/* Suppliers Table */}
            <div className="flex-1 bg-white border border-[#dce1dc] rounded-xl overflow-hidden flex flex-col shadow-2xs">
              <div className="h-11 bg-[#ebeef1] border-b border-[#dce1dc] grid grid-cols-12 px-4 items-center text-xs font-bold text-[#5b6664]">
                <div className="col-span-3">اسم المورد والشركة</div>
                <div className="col-span-2">رقم الهاتف</div>
                <div className="col-span-3">العنوان / الملاحظات</div>
                <div className="col-span-2 text-center">الرصيد المستحق (المديونية)</div>
                <div className="col-span-1 text-center">الحالة</div>
                <div className="col-span-1 text-left">إجراءات</div>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-[#dce1dc]">
                {filteredSuppliers.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-[#5b6664] gap-2">
                    <Building2 className="w-8 h-8 opacity-30" />
                    <span className="text-sm font-medium">لا يوجد موردين مطابقين للبحث</span>
                  </div>
                ) : (
                  filteredSuppliers.map((sup) => (
                    <div
                      key={sup.id}
                      className={`h-14 grid grid-cols-12 px-4 items-center text-xs hover:bg-[#f1f4f6] transition-colors ${
                        !sup.isActive ? 'bg-[#f7fafc] opacity-60' : ''
                      }`}
                    >
                      <div className="col-span-3">
                        <span className="font-bold text-[#14181a] block truncate">{sup.name}</span>
                        {sup.companyName && (
                          <span className="text-[11px] text-[#5b6664] block truncate">{sup.companyName}</span>
                        )}
                      </div>

                      <div className="col-span-2 font-mono text-[#5b6664]">
                        {sup.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span>{sup.phone}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </div>

                      <div className="col-span-3 text-[#5b6664] truncate">
                        {sup.address || sup.notes || '—'}
                      </div>

                      <div className="col-span-2 text-center font-mono font-bold">
                        {sup.balancePiasters > 0 ? (
                          <span className="text-[#ba1a1a]">
                            {formatMoney(sup.balancePiasters)}
                          </span>
                        ) : (
                          <span className="text-[#006d41]">خالص (0.00 ج.م)</span>
                        )}
                      </div>

                      <div className="col-span-1 text-center">
                        {sup.isActive ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#99f2bb] text-[#006d41]">
                            نشط
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#ebeef1] text-[#5b6664]">
                            مؤرشف
                          </span>
                        )}
                      </div>

                      <div className="col-span-1 text-left flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenPayment(sup)}
                          className="p-1 text-[#006d41] hover:bg-[#e1eae5] rounded"
                          title="سداد دفعة للمورد"
                        >
                          <Banknote className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenStatement(sup)}
                          className="p-1 text-[#00372d] hover:bg-[#e1eae5] rounded"
                          title="كشف حساب المورد"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditSupplier(sup)}
                          className="p-1 text-[#5b6664] hover:bg-[#ebeef1] rounded"
                          title="تعديل بيانات المورد"
                        >
                          <Building2 className="w-4 h-4" />
                        </button>
                        {sup.isActive ? (
                          <button
                            type="button"
                            onClick={() => handleArchiveSupplier(sup.id)}
                            className="p-1 text-[#ba1a1a] hover:bg-[#ffdad6] rounded"
                            title="أرشفة المورد"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRestoreSupplier(sup.id)}
                            className="p-1 text-[#006d41] hover:bg-[#99f2bb] rounded"
                            title="استعادة المورد"
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
        <div className="fixed inset-0 z-50 bg-[#14181a]/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#dce1dc] rounded-2xl w-full max-w-md overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="h-14 bg-[#00372d] text-white px-5 flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {supplierForm.id ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-5 space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[#14181a] block mb-1">
                  اسم المورد <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: شركة النيل للمواد الغذائية"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full h-10 px-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs text-[#14181a] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#14181a] block mb-1">اسم الشركة أو التوكيل</label>
                <input
                  type="text"
                  placeholder="مثال: توكيل شيبسي وأغذية"
                  value={supplierForm.companyName}
                  onChange={(e) => setSupplierForm({ ...supplierForm, companyName: e.target.value })}
                  className="w-full h-10 px-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs text-[#14181a] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#14181a] block mb-1">رقم الهاتف</label>
                  <input
                    type="text"
                    placeholder="010XXXXXXXX"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    className="w-full h-10 px-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs font-mono text-[#14181a] focus:outline-none"
                  />
                </div>

                {!supplierForm.id && (
                  <div>
                    <label className="text-xs font-bold text-[#14181a] block mb-1">الرصيد الافتتاحي (ج.م)</label>
                    <input
                      type="number"
                      step="1"
                      value={supplierForm.balanceEGP}
                      onChange={(e) => setSupplierForm({ ...supplierForm, balanceEGP: e.target.value })}
                      className="w-full h-10 px-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs font-mono font-bold text-[#ba1a1a] focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-[#14181a] block mb-1">العنوان أو بيانات الفرع</label>
                <input
                  type="text"
                  placeholder="مثال: المنيا - ملوى"
                  value={supplierForm.address}
                  onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                  className="w-full h-10 px-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs text-[#14181a] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#14181a] block mb-1">ملاحظات إضافية</label>
                <textarea
                  rows={2}
                  placeholder="مواعيد التوريد، أيام الزيارة، إلخ..."
                  value={supplierForm.notes}
                  onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                  className="w-full p-2.5 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs text-[#14181a] focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-[#dce1dc]">
                <button
                  type="submit"
                  className="flex-1 h-10 bg-[#00372d] hover:bg-[#0b4f42] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  حفظ بيانات المورد
                </button>
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 h-10 bg-[#ebeef1] hover:bg-[#dce1dc] text-[#5b6664] rounded-lg text-xs font-bold transition-colors"
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
        <div className="fixed inset-0 z-50 bg-[#14181a]/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#dce1dc] rounded-2xl w-full max-w-sm overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="h-14 bg-[#006d41] text-white px-5 flex items-center justify-between">
              <h3 className="font-bold text-sm">سداد دفعة للمورد</h3>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="p-5 space-y-4">
              <div className="p-3 bg-[#f7fafc] border border-[#dce1dc] rounded-xl">
                <span className="text-xs text-[#5b6664] block">المورد:</span>
                <span className="text-sm font-bold text-[#14181a] block">{selectedSupplierForModal.name}</span>
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#dce1dc] text-xs">
                  <span>المديونية الحالية:</span>
                  <span className="font-mono font-bold text-[#ba1a1a]">
                    {formatMoney(selectedSupplierForModal.balancePiasters)}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#14181a] block mb-1">
                  مبلغ السداد (ج.م) <span className="text-red-500">*</span>
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
                  className="w-full h-11 px-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-sm font-mono font-bold text-[#006d41] focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#14181a] block mb-1">ملاحظات / رقم إذن الصرف</label>
                <input
                  type="text"
                  placeholder="سداد نقدي من الدرج..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full h-10 px-3 bg-[#f7fafc] border border-[#dce1dc] rounded-lg text-xs text-[#14181a] focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-[#dce1dc]">
                <button
                  type="submit"
                  className="flex-1 h-10 bg-[#006d41] hover:bg-[#005230] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  تأكيد سداد المبلغ
                </button>
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 h-10 bg-[#ebeef1] hover:bg-[#dce1dc] text-[#5b6664] rounded-lg text-xs font-bold transition-colors"
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
        <div className="fixed inset-0 z-50 bg-[#14181a]/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#dce1dc] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="h-14 bg-[#00372d] text-white px-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#99f2bb]" />
                <h3 className="font-bold text-sm">
                  كشف حساب المورد: {selectedSupplierForModal.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsStatementModalOpen(false)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-[#f7fafc] border-b border-[#dce1dc] flex items-center justify-between shrink-0">
              <div>
                <span className="text-xs text-[#5b6664] block">الرصيد القائم المستحق للمورد:</span>
                <span className="text-xl font-mono font-bold text-[#ba1a1a]">
                  {formatMoney(selectedSupplierForModal.balancePiasters)}
                </span>
              </div>
              <div className="text-left text-xs text-[#5b6664]">
                <span>عدد الحركات المسجلة: {supplierTransactions.length} حركة</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#dce1dc] p-2">
              {supplierTransactions.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-xs text-[#5b6664]">
                  لا توجد حركات مسجلة في كشف حساب المورد حتى الآن
                </div>
              ) : (
                supplierTransactions.map((tx) => (
                  <div key={tx.id} className="p-3 flex items-center justify-between text-xs hover:bg-[#f7fafc]">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#14181a]">
                          {tx.transactionType === 'OPENING_BALANCE' && 'رصيد افتتاحي'}
                          {tx.transactionType === 'PURCHASE_INVOICE' && 'فاتورة شراء آجل'}
                          {tx.transactionType === 'PAYMENT' && 'سداد دفعة نقدية'}
                        </span>
                        <span className="text-[10px] text-[#5b6664]">
                          {new Date(tx.createdAt).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {tx.notes && <span className="text-[11px] text-[#5b6664] block mt-0.5">{tx.notes}</span>}
                    </div>

                    <div className="font-mono font-bold text-sm">
                      {tx.amountPiasters > 0 ? (
                        <span className="text-[#ba1a1a]">+{formatMoney(tx.amountPiasters)}</span>
                      ) : (
                        <span className="text-[#006d41]">
                          -{formatMoney(Math.abs(tx.amountPiasters))}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 bg-[#ebeef1] border-t border-[#dce1dc] flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsStatementModalOpen(false)}
                className="px-5 h-9 bg-[#00372d] text-white rounded-lg text-xs font-bold"
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
        <div className="fixed inset-0 z-50 bg-[#14181a]/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#dce1dc] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="h-14 bg-[#00372d] text-white px-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#99f2bb]" />
                <h3 className="font-bold text-sm">
                  تفاصيل فاتورة الشراء رقم #{selectedPurchaseDetails.invoiceNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPurchaseDetails(null)}
                className="text-white/80 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Header info */}
            <div className="p-4 bg-[#f7fafc] border-b border-[#dce1dc] grid grid-cols-3 gap-3 text-xs shrink-0">
              <div>
                <span className="text-[#5b6664] block">المورد:</span>
                <span className="font-bold text-[#14181a]">{selectedPurchaseDetails.supplierName || 'بدون مورد'}</span>
              </div>
              <div>
                <span className="text-[#5b6664] block">تاريخ الفاتورة:</span>
                <span className="font-semibold text-[#14181a]">
                  {new Date(selectedPurchaseDetails.invoiceDate).toLocaleDateString('ar-EG', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <div>
                <span className="text-[#5b6664] block">رقم فاتورة المورد الورقية:</span>
                <span className="font-mono font-bold text-[#14181a]">
                  {selectedPurchaseDetails.supplierInvoiceNumber || '—'}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-[#ebeef1] text-[#5b6664] sticky top-0 border-b border-[#dce1dc]">
                  <tr>
                    <th className="p-3">الصنف</th>
                    <th className="p-3 text-center">الكمية</th>
                    <th className="p-3 text-center">تكلفة الشراء</th>
                    <th className="p-3 text-center">الإجمالي</th>
                    <th className="p-3 text-center">التكلفة السابقة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dce1dc]">
                  {selectedPurchaseDetails.items?.map((item) => (
                    <tr key={item.id} className="hover:bg-[#f7fafc]">
                      <td className="p-3 font-semibold text-[#14181a]">
                        {item.productName}
                        {item.barcode && <span className="text-[10px] text-[#5b6664] block font-mono">{item.barcode}</span>}
                      </td>
                      <td className="p-3 text-center font-mono font-bold">
                        {(item.quantityMilli / 1000).toFixed(0)}
                      </td>
                      <td className="p-3 text-center font-mono">
                        {formatMoney(item.unitCostPiasters)}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-[#00372d]">
                        {formatMoney(item.totalCostPiasters)}
                      </td>
                      <td className="p-3 text-center font-mono text-[#5b6664]">
                        {formatMoney(item.previousCostPiasters)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Footer */}
            <div className="p-4 bg-[#f7fafc] border-t border-[#dce1dc] flex items-center justify-between shrink-0 text-xs">
              <div className="space-y-1">
                <div>
                  <span className="text-[#5b6664]">إجمالي التكلفة: </span>
                  <span className="font-mono font-bold">
                    {formatMoney(selectedPurchaseDetails.totalCostPiasters)}
                  </span>
                </div>
                {selectedPurchaseDetails.discountPiasters > 0 && (
                  <div>
                    <span className="text-[#5b6664]">الخصم: </span>
                    <span className="font-mono text-[#006d41]">
                      -{formatMoney(selectedPurchaseDetails.discountPiasters)}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-[#5b6664]">صافي الفاتورة: </span>
                  <span className="font-mono font-bold text-sm text-[#00372d]">
                    {formatMoney(selectedPurchaseDetails.netCostPiasters)}
                  </span>
                </div>
              </div>

              <div className="text-left space-y-1">
                <div>
                  <span className="text-[#5b6664]">حالة السداد: </span>
                  <span className="font-bold">
                    {selectedPurchaseDetails.paymentStatus === 'PAID' && 'مسددة بالكامل'}
                    {selectedPurchaseDetails.paymentStatus === 'CREDIT' && 'آجلة على المورد'}
                    {selectedPurchaseDetails.paymentStatus === 'PARTIAL' && 'سداد جزئي'}
                  </span>
                </div>
                <div>
                  <span className="text-[#5b6664]">المبلغ المتبقي: </span>
                  <span className="font-mono font-bold text-sm text-[#ba1a1a]">
                    {formatMoney(selectedPurchaseDetails.remainingAmountPiasters)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-[#ebeef1] border-t border-[#dce1dc] flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedPurchaseDetails(null)}
                className="px-5 h-9 bg-[#00372d] text-white rounded-lg text-xs font-bold"
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
