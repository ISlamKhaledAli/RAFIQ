import React, { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  RefreshCw, 
  X, 
  Check, 
  Tags,
  FileSpreadsheet,
  Boxes,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { rafiqAlert } from '../utils/dialogService';
import type { Product, Category, StockMovement, StockDiscrepancy, ProductUnit } from '../types/models';
import { normalizeArabicNumerals } from '../utils/money';
import { exportProductsToExcel } from '../utils/excelImport';
import { ConfirmModal } from '../components/ConfirmModal';
import { CategoryManagerModal } from '../components/CategoryManagerModal';
import { PriceHistoryModal } from '../components/PriceHistoryModal';
import { ExcelImportModal } from '../components/ExcelImportModal';
import { StockMovementsModal } from '../components/StockMovementsModal';
import { StockAdjustmentModal } from '../components/StockAdjustmentModal';
import { PurchaseEntryModal } from '../components/PurchaseEntryModal';
import { ProductFormModal } from './products/ProductFormModal';
import { BulkMinStockModal } from './products/BulkMinStockModal';
import { StockMovementsTab } from './products/StockMovementsTab';
import { ProductsTable } from './products/ProductsTable';

export interface ProductsViewProps {
  subView?: 'catalog' | 'movements';
  onSubViewChange?: (view: 'catalog' | 'movements') => void;
  initialFilter?: 'all' | 'lowStock' | 'outOfStock';
  onResetFilter?: () => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({ 
  subView, 
  initialFilter = 'all', 
  onResetFilter 
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [prevInitialFilter, setPrevInitialFilter] = useState(initialFilter);
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'lowStock' | 'outOfStock'>(initialFilter);

  if (initialFilter !== prevInitialFilter) {
    setPrevInitialFilter(initialFilter);
    setStockStatusFilter(initialFilter);
  }

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [internalCode, setInternalCode] = useState('');
  const [taxCategoryCode, setTaxCategoryCode] = useState('');
  const [pricePiasters, setPricePiasters] = useState(0);
  const [costPiasters, setCostPiasters] = useState(0);
  const [unit, setUnit] = useState<'piece' | 'kg'>('piece');
  const [productUnits, setProductUnits] = useState<ProductUnit[]>([]);
  const [stockInput, setStockInput] = useState('10');
  const [minStockInput, setMinStockInput] = useState('5');
  const [taxRatePercent, setTaxRatePercent] = useState(0);
  const [formError, setFormError] = useState('');
  const [similarWarning, setSimilarWarning] = useState<string | null>(null);
  const [additionalBarcodes, setAdditionalBarcodes] = useState<string[]>([]);
  const [newBarcodeInput, setNewBarcodeInput] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('cat_general');

  // Price & Margin state (Feature #17 / Tasks 17-1, 17-2, 17-3)
  const [belowCostWarning, setBelowCostWarning] = useState<{
    pricePiasters: number;
    costPiasters: number;
    lossPiasters: number;
  } | null>(null);
  const [showPriceHistoryModal, setShowPriceHistoryModal] = useState(false);
  const [priceHistoryProdId, setPriceHistoryProdId] = useState('');
  const [priceHistoryProdName, setPriceHistoryProdName] = useState('');

  // Minimum Stock & Bulk Update state (Feature #18 / Tasks 18-1 & 18-2)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showBulkMinStockModal, setShowBulkMinStockModal] = useState(false);
  const [bulkMinStockValue, setBulkMinStockValue] = useState(5);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Excel Import & Export state (Feature #21 / Story 37)
  const [showExcelImportModal, setShowExcelImportModal] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [importSuccessAlert, setImportSuccessAlert] = useState<string | null>(null);

  const handleExportProductsToExcel = async () => {
    setIsExportingExcel(true);
    try {
      const res = await exportProductsToExcel();
      if (res.success) {
        setImportSuccessAlert(`تم تصدير ${res.count || products.length} صنف إلى ملف إكسل ملون واحترافي بنجاح!`);
      } else {
        void rafiqAlert({
          title: 'فشل تصدير ملف الإكسل',
          message: `تعذر تصدير ملف الإكسل: ${res.message || 'خطأ غير معروف'}`,
          variant: 'error',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({
        title: 'خطأ أثناء التصدير',
        message: `خطأ أثناء التصدير: ${msg}`,
        variant: 'error',
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Stock Movements & Inventory state (Stories 38 & 39 / Features #34 & #35)
  const activeSubView = subView ?? 'catalog';

  const [selectedProdForMovements, setSelectedProdForMovements] = useState<Product | null>(null);
  const [selectedProdForAdjustment, setSelectedProdForAdjustment] = useState<Product | null>(null);
  const [selectedProdForPurchase, setSelectedProdForPurchase] = useState<Product | null>(null);
  const [allMovements, setAllMovements] = useState<StockMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementTypeFilter, setMovementTypeFilter] = useState('ALL');
  const [movementSearchQuery, setMovementSearchQuery] = useState('');
  const [discrepancies, setDiscrepancies] = useState<StockDiscrepancy[]>([]);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcSuccessMsg, setRecalcSuccessMsg] = useState<string | null>(null);

  // Auto-dismiss feedback banners after 3.5 seconds
  useEffect(() => {
    if (recalcSuccessMsg) {
      const timer = setTimeout(() => setRecalcSuccessMsg(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [recalcSuccessMsg]);

  useEffect(() => {
    if (importSuccessAlert) {
      const timer = setTimeout(() => setImportSuccessAlert(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [importSuccessAlert]);

  const loadMovements = async () => {
    setMovementsLoading(true);
    try {
      const res = await invoke<StockMovement[]>('inventory:getMovements', {
        movementType: movementTypeFilter === 'ALL' ? undefined : movementTypeFilter,
        limit: 250,
      });
      setAllMovements(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to load stock movements', err);
    } finally {
      setMovementsLoading(false);
    }
  };

  const checkDiscrepancies = async () => {
    try {
      const res = await invoke<StockDiscrepancy[]>('inventory:getDiscrepancies');
      setDiscrepancies(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to check discrepancies', err);
    }
  };

  useEffect(() => {
    let active = true;
    if (activeSubView === 'movements') {
      void (async () => {
        try {
          const res = await invoke<StockMovement[]>('inventory:getMovements', {
            movementType: movementTypeFilter === 'ALL' ? undefined : movementTypeFilter,
            limit: 250,
          });
          if (active) {
            setAllMovements(Array.isArray(res) ? res : []);
          }
          const discRes = await invoke<StockDiscrepancy[]>('inventory:getDiscrepancies');
          if (active) {
            setDiscrepancies(Array.isArray(discRes) ? discRes : []);
          }
        } catch (err) {
          console.error(err);
        }
      })();
    }
    return () => { active = false; };
  }, [activeSubView, movementTypeFilter]);

  const handleRecalculateStock = async () => {
    setRecalculating(true);
    setRecalcSuccessMsg(null);
    try {
      const res: any = await invoke('inventory:recalculate');
      setRecalcSuccessMsg(res?.message || 'تمت إعادة حساب المخزون ومطابقة الأرصدة بنجاح.');
      await loadProducts(searchQuery);
      await loadMovements();
      await checkDiscrepancies();
    } catch (err) {
      void rafiqAlert({
        title: 'فشلت إعادة حساب المخزون',
        message: 'فشلت إعادة حساب المخزون: ' + (err instanceof Error ? err.message : String(err)),
        variant: 'error',
      });
    } finally {
      setRecalculating(false);
    }
  };

  const openPriceHistory = (prod: Product) => {
    setPriceHistoryProdId(prod.id);
    setPriceHistoryProdName(prod.name);
    setShowPriceHistoryModal(true);
  };

  const toggleSelectAll = (filteredProds: Product[]) => {
    if (selectedProductIds.length === filteredProds.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(filteredProds.map(p => p.id));
    }
  };

  const toggleSelectProduct = (id: string) => {
    if (selectedProductIds.includes(id)) {
      setSelectedProductIds(selectedProductIds.filter(pid => pid !== id));
    } else {
      setSelectedProductIds([...selectedProductIds, id]);
    }
  };

  const handleBulkUpdateMinStock = async () => {
    if (selectedProductIds.length === 0) return;
    try {
      setBulkUpdating(true);
      await invoke('products:bulkUpdateMinStock', {
        productIds: selectedProductIds,
        minStockMilli: bulkMinStockValue * 1000
      });
      setShowBulkMinStockModal(false);
      setSelectedProductIds([]);
      void loadProducts(searchQuery);
    } catch (err) {
      console.error(err);
    } finally {
      setBulkUpdating(false);
    }
  };

  const loadProducts = async (query = '') => {
    setLoading(true);
    try {
      const res = await invoke<Product[]>('products:search', { query });
      setProducts(res || []);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoriesList = async () => {
    try {
      const res = await invoke<Category[]>('categories:getAll', { includeArchived: false });
      if (Array.isArray(res)) {
        setCategories(res);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [prodRes, catRes] = await Promise.all([
          invoke<Product[]>('products:search', { query: '' }),
          invoke<Category[]>('categories:getAll', { includeArchived: false })
        ]);
        if (active) {
          if (Array.isArray(prodRes)) setProducts(prodRes);
          if (Array.isArray(catRes)) setCategories(catRes);
        }
      } catch (err: unknown) {
        console.error(err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    void loadProducts(searchQuery);
  };

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setBarcode('');
    setAdditionalBarcodes([]);
    setNewBarcodeInput('');
    setCategoryId(categories.length > 0 ? categories[0].id : 'cat_general');
    setInternalCode('');
    setTaxCategoryCode('');
    setPricePiasters(0);
    setCostPiasters(0);
    setUnit('piece');
    setProductUnits([{
      unitName: 'قطعة',
      conversionFactor: 1,
      isBaseUnit: true,
      sellPricePiasters: 0,
      costPricePiasters: 0,
      barcode: '',
      isDivisible: false,
      sortOrder: 0
    }]);
    setStockInput('10');
    setMinStockInput('5');
    setTaxRatePercent(0);
    setFormError('');
    setSimilarWarning(null);
    setBelowCostWarning(null);
    setShowModal(true);
  };

  const openEditModal = (prod: Product) => {
    setEditingId(prod.id);
    setName(prod.name);
    setBarcode(prod.barcode || '');
    const extraCodes = (prod.barcodes || []).filter(b => b && b !== prod.barcode);
    setAdditionalBarcodes(extraCodes);
    setNewBarcodeInput('');
    setCategoryId(prod.categoryId || (categories.length > 0 ? categories[0].id : 'cat_general'));
    setInternalCode(prod.internalCode || '');
    setTaxCategoryCode(prod.taxCategoryCode || '');
    setPricePiasters(prod.pricePiasters);
    setCostPiasters(prod.costPiasters);
    const u = prod.unit === 'kg' ? 'kg' : 'piece';
    setUnit(u);

    // Load or initialize units for this product
    if (prod.units && prod.units.length > 0) {
      setProductUnits(prod.units);
    } else {
      setProductUnits([{
        unitName: u === 'kg' ? 'كيلو' : 'قطعة',
        conversionFactor: 1,
        isBaseUnit: true,
        sellPricePiasters: prod.pricePiasters,
        costPricePiasters: prod.costPiasters,
        barcode: prod.barcode || '',
        isDivisible: u === 'kg',
        sortOrder: 0
      }]);
      void invoke<ProductUnit[]>('productUnits:getByProduct', { productId: prod.id }).then((units) => {
        if (units && units.length > 0) {
          setProductUnits(units);
        }
      }).catch(() => {
        // keep default
      });
    }

    const sKg = (prod.stockQuantityMilli / 1000).toFixed(3).replace(/\.?0+$/, '');
    setStockInput(sKg || '0');
    const msKg = ((prod.minStockQuantityMilli ?? 5000) / 1000).toFixed(3).replace(/\.?0+$/, '');
    setMinStockInput(msKg || '5');
    setTaxRatePercent(prod.taxRatePercent || 0);
    setFormError('');
    setSimilarWarning(null);
    setBelowCostWarning(null);
    setShowModal(true);
  };

  const handleAddBarcode = () => {
    const code = newBarcodeInput.trim();
    if (!code) return;
    if (code === barcode.trim() || additionalBarcodes.includes(code)) {
      setFormError('الباركود مضاف بالفعل في هذا المنتج');
      return;
    }
    setAdditionalBarcodes([...additionalBarcodes, code]);
    setNewBarcodeInput('');
    setFormError('');
  };

  const handleRemoveBarcode = (indexToRemove: number) => {
    setAdditionalBarcodes(additionalBarcodes.filter((_, idx) => idx !== indexToRemove));
  };

  const generateInternalBarcode = () => {
    // Generate clean Egyptian internal supermarket barcode with prefix 200
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000);
    setBarcode(`200${randomDigits}`);
  };

  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    const prod = productToDelete;
    setProductToDelete(null);

    try {
      setLoading(true);
      await invoke('products:delete', { id: prod.id });
      void loadProducts(searchQuery);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(`فشل حذف الصنف: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;
    setShowBulkDeleteConfirm(false);
    try {
      setLoading(true);
      await Promise.all(selectedProductIds.map(id => invoke('products:delete', { id })));
      setSelectedProductIds([]);
      await loadProducts(searchQuery);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFormError(`فشل حذف الأصناف المحددة: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProduct = async (e?: FormEvent, forceConfirmSimilar = false, forceConfirmCost = false) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      setFormError('اسم المنتج مطلوب');
      return;
    }

    // Pre-emptive alert if selling price < cost (Feature #17 / Tasks 17-1 & 17-2)
    if (pricePiasters < costPiasters && !forceConfirmCost) {
      setBelowCostWarning({
        pricePiasters,
        costPiasters,
        lossPiasters: costPiasters - pricePiasters
      });
      return;
    }

    try {
      setLoading(true);
      setFormError('');
      const allBarcodes = Array.from(new Set([
        ...(barcode.trim() ? [barcode.trim()] : []),
        ...additionalBarcodes.map(b => b.trim()).filter(Boolean)
      ]));

      const parsedStock = parseFloat(normalizeArabicNumerals(stockInput)) || 0;
      const stockQuantityMilli = Math.round(parsedStock * 1000);
      const parsedMinStock = parseFloat(normalizeArabicNumerals(minStockInput)) || 0;
      const minStockQuantityMilli = Math.round(parsedMinStock * 1000);

      const synchronizedUnits = productUnits.map(u => {
        if (u.isBaseUnit) {
          return {
            ...u,
            sellPricePiasters: pricePiasters,
            costPricePiasters: costPiasters,
            barcode: barcode.trim() || null,
            unitName: u.unitName.trim() || (unit === 'kg' ? 'كيلو' : 'قطعة'),
            isDivisible: unit === 'kg' || u.isDivisible
          };
        }
        return u;
      });

      const productPayload: Partial<Product> & { confirmSimilarName?: boolean; confirmBelowCost?: boolean } = {
        name: name.trim(),
        barcode: barcode.trim() || (allBarcodes.length > 0 ? allBarcodes[0] : null),
        barcodes: allBarcodes,
        categoryId: categoryId || 'cat_general',
        internalCode: internalCode.trim(),
        taxCategoryCode: taxCategoryCode.trim(),
        pricePiasters,
        costPiasters,
        stockQuantityMilli,
        minStockQuantityMilli,
        unit,
        units: synchronizedUnits,
        taxRatePercent,
        isActive: true,
        confirmSimilarName: forceConfirmSimilar,
        confirmBelowCost: forceConfirmCost,
      };

      if (editingId) {
        productPayload.id = editingId;
      }

      await invoke<Product>('products:save', productPayload);
      setSimilarWarning(null);
      setBelowCostWarning(null);
      setShowModal(false);
      setEditingId(null);
      void loadProducts(searchQuery);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('SIMILAR_NAME_WARNING') || msg.includes('مشابه')) {
        setSimilarWarning(msg);
      } else if (msg.includes('BELOW_COST_WARNING') || msg.includes('أقل من سعر التكلفة')) {
        setBelowCostWarning({
          pricePiasters,
          costPiasters,
          lossPiasters: costPiasters - pricePiasters
        });
      } else {
        setFormError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const lowStockCount = products.filter(
    (p) => (p.stockQuantityMilli || 0) <= (p.minStockQuantityMilli ?? 5000)
  ).length;

  const outOfStockCount = products.filter(
    (p) => (p.stockQuantityMilli || 0) <= 0
  ).length;

  const displayedProducts = products.filter((p) => {
    if (stockStatusFilter === 'lowStock') {
      return (p.stockQuantityMilli || 0) <= (p.minStockQuantityMilli ?? 5000);
    }
    if (stockStatusFilter === 'outOfStock') {
      return (p.stockQuantityMilli || 0) <= 0;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] p-3.5 gap-3 overflow-hidden select-none">
      {/* 1. Header Toolbar (Title, Count Badge, Search, Add Button) */}
      <div className="min-h-[58px] py-2 bg-white border border-[#E2E8F0] rounded-2xl px-4 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          {activeSubView === 'catalog' ? (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#006D41] flex items-center justify-center border border-emerald-200/80 shadow-2xs">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-[#0F172A] leading-tight">كتالوج الأصناف والأسعار</h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[#F8FAFC] text-[#0F172A] font-bold border border-[#E2E8F0] tabular-nums">
                    {products.length} صنف
                  </span>
                </div>
                <p className="text-[11px] text-[#52605D]">إدارة المنتجات، الأسعار، الباركود، ومستويات حد الطلب</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#006D41] flex items-center justify-center border border-emerald-200/80 shadow-2xs">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-[#0F172A] leading-tight">دفتر حركات وجرد المخزون</h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-[#F8FAFC] text-[#0F172A] font-bold border border-[#E2E8F0] tabular-nums">
                    {allMovements.length} حركة
                  </span>
                  {discrepancies.length > 0 && (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 animate-pulse">
                      {discrepancies.length} صنف بحاجة لمطابقة
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#52605D]">سجل الوارد والمنصرف، المبيعات، المرتجعات، والتسويات الجردية</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Search Input & Add Button */}
        <div className="flex items-center gap-2">
          {activeSubView === 'catalog' ? (
            <>
              <form onSubmit={handleSearch} className="flex items-center gap-1.5">
                <div className="relative w-64 h-9 flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-2.5 focus-within:border-[#006D41] focus-within:ring-2 focus-within:ring-[#006D41]/20 focus-within:bg-white transition-all">
                  <Search className="w-4 h-4 text-[#52605D] ml-2 shrink-0 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو الباركود..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(normalizeArabicNumerals(e.target.value))}
                    className="w-full bg-transparent border-none text-xs text-[#0F172A] placeholder:text-[#52605D] focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        void loadProducts('');
                      }}
                      className="text-[#52605D] hover:text-[#0F172A] text-xs cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="h-9 px-3.5 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                >
                  بحث
                </button>
              </form>

              <button
                onClick={() => void loadProducts(searchQuery)}
                disabled={loading}
                className="h-9 w-9 flex items-center justify-center bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#52605D] hover:text-[#0F172A] rounded-xl transition-colors shadow-2xs cursor-pointer"
                title="تحديث القائمة"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#006D41]' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setShowExcelImportModal(true)}
                className="h-9 px-3.5 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                title="استيراد وتحديث المنتجات من ملف إكسل أو CSV"
              >
                <FileSpreadsheet className="w-4 h-4 text-[#006D41]" />
                <span>استيراد إكسل</span>
              </button>

              <button
                type="button"
                onClick={() => void handleExportProductsToExcel()}
                disabled={isExportingExcel}
                className="h-9 px-3.5 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-60 cursor-pointer"
                title="تصدير كامل كتالوج الأصناف إلى ملف إكسل ملون واحترافي"
              >
                <Download className={`w-4 h-4 text-[#006D41] ${isExportingExcel ? 'animate-bounce' : ''}`} />
                <span>{isExportingExcel ? 'جاري التصدير...' : 'تصدير إكسل'}</span>
              </button>

              <button
                onClick={openAddModal}
                className="h-9 px-4 bg-[#004D3F] hover:bg-[#00372D] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة صنف جديد</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void loadMovements();
                  void checkDiscrepancies();
                }}
                disabled={movementsLoading}
                className="h-9 px-3.5 bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${movementsLoading ? 'animate-spin text-[#006D41]' : ''}`} />
                <span>تحديث الحركات</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Success Notification Alert */}
      {importSuccessAlert && (
        <div className="bg-emerald-50 border border-emerald-200 text-[#006D41] px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-bold animate-in fade-in shrink-0 shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#006D41]" />
            <span>{importSuccessAlert}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportSuccessAlert(null)}
            className="text-[#006D41] hover:text-[#00372D] p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {activeSubView === 'catalog' ? (
        <>
          {/* Category Filter Chips Bar */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto shrink-0 select-none shadow-xs">
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  selectedCategoryFilter === 'all'
                    ? 'bg-[#00372D] text-white shadow-xs'
                    : 'bg-[#F8FAFC] text-[#52605D] border border-[#E2E8F0] hover:text-[#004D3F] hover:border-[#006D41]'
                }`}
              >
                <span>كل الأصناف</span>
                <span className="font-mono text-[10px] opacity-80 tabular-nums">({products.length})</span>
              </button>

              {categories.map((cat) => {
                const count = products.filter(p => (p.categoryId || 'cat_general') === cat.id).length;
                const isSelected = selectedCategoryFilter === cat.id;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[#00372D] text-white shadow-xs'
                        : 'bg-[#F8FAFC] text-[#52605D] border border-[#E2E8F0] hover:text-[#004D3F] hover:border-[#006D41]'
                    }`}
                  >
                    <span>{cat.name}</span>
                    <span className="font-mono text-[10px] opacity-80 tabular-nums">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Stock Level Tabs (Story 79 / Task 36-2) */}
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 p-1 bg-white border border-[#E2E8F0] rounded-xl shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  setStockStatusFilter('all');
                  onResetFilter?.();
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  stockStatusFilter === 'all'
                    ? 'bg-[#00372D] text-white shadow-xs'
                    : 'text-[#52605D] hover:bg-[#F8FAFC]'
                }`}
              >
                كافة الأصناف ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setStockStatusFilter('lowStock')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  stockStatusFilter === 'lowStock'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-amber-800 hover:bg-amber-50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>النواقص وحد الطلب ({lowStockCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setStockStatusFilter('outOfStock')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  stockStatusFilter === 'outOfStock'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-800 hover:bg-rose-50'
                }`}
              >
                <span>النافد من المخزن ({outOfStockCount})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowCategoryModal(true)}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#52605D] hover:text-[#0F172A] text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="إضافة وتعديل وأرشفة وترتيب أقسام السلع"
            >
              <Tags className="w-3.5 h-3.5 text-[#006D41]" />
              <span>إدارة التصنيفات</span>
            </button>
          </div>

          {/* Active Stock Filter Notification */}
          {stockStatusFilter !== 'all' && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold shrink-0 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {stockStatusFilter === 'lowStock'
                    ? `تصفية النواقص: يتم عرض الأصناف التي كميتها أقل من أو تساوي حد الطلب (${displayedProducts.length} صنف)`
                    : `تصفية النافد: يتم عرض الأصناف التي نفدت تماماً من المخزن (${displayedProducts.length} صنف)`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStockStatusFilter('all');
                  onResetFilter?.();
                }}
                className="px-2 py-0.5 rounded bg-white hover:bg-amber-100 border border-amber-300 text-amber-800 text-[11px] font-bold transition-colors cursor-pointer"
              >
                إلغاء الفلتر وعرض الكل
              </button>
            </div>
          )}

          {/* 2. Products Data Table Subcomponent */}
          <ProductsTable
            products={displayedProducts}
            selectedCategoryFilter={selectedCategoryFilter}
            selectedProductIds={selectedProductIds}
            onToggleSelectAll={toggleSelectAll}
            onToggleSelectProduct={toggleSelectProduct}
            onOpenBulkMinStockModal={() => setShowBulkMinStockModal(true)}
            onBulkDelete={() => setShowBulkDeleteConfirm(true)}
            onClearSelection={() => setSelectedProductIds([])}
            onSelectProdForMovements={(prod) => setSelectedProdForMovements(prod)}
            onSelectProdForAdjustment={(prod) => setSelectedProdForAdjustment(prod)}
            onSelectProdForPurchase={(prod) => setSelectedProdForPurchase(prod)}
            onOpenPriceHistory={(prod) => openPriceHistory(prod)}
            onEditProduct={(prod) => openEditModal(prod)}
            onDeleteProduct={(prod) => setProductToDelete(prod)}
          />
        </>
      ) : (
        /* Movements & Inventory Audit SubView Subcomponent */
        <StockMovementsTab
          allMovements={allMovements}
          discrepancies={discrepancies}
          recalculating={recalculating}
          recalcSuccessMsg={recalcSuccessMsg}
          setRecalcSuccessMsg={setRecalcSuccessMsg}
          movementTypeFilter={movementTypeFilter}
          setMovementTypeFilter={setMovementTypeFilter}
          movementSearchQuery={movementSearchQuery}
          setMovementSearchQuery={setMovementSearchQuery}
          movementsLoading={movementsLoading}
          onRecalculateStock={() => void handleRecalculateStock()}
          onLoadMovements={() => void loadMovements()}
        />
      )}

      {/* 3. Add/Edit Product Modal Subcomponent */}
      <ProductFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        editingId={editingId}
        name={name}
        setName={setName}
        barcode={barcode}
        setBarcode={setBarcode}
        additionalBarcodes={additionalBarcodes}
        newBarcodeInput={newBarcodeInput}
        setNewBarcodeInput={setNewBarcodeInput}
        categoryId={categoryId}
        setCategoryId={setCategoryId}
        categories={categories}
        onOpenCategoryModal={() => setShowCategoryModal(true)}
        pricePiasters={pricePiasters}
        setPricePiasters={setPricePiasters}
        costPiasters={costPiasters}
        setCostPiasters={setCostPiasters}
        unit={unit}
        setUnit={setUnit}
        productUnits={productUnits}
        setProductUnits={setProductUnits}
        stockInput={stockInput}
        setStockInput={setStockInput}
        minStockInput={minStockInput}
        setMinStockInput={setMinStockInput}
        taxRatePercent={taxRatePercent}
        setTaxRatePercent={setTaxRatePercent}
        internalCode={internalCode}
        setInternalCode={setInternalCode}
        taxCategoryCode={taxCategoryCode}
        setTaxCategoryCode={setTaxCategoryCode}
        formError={formError}
        setFormError={setFormError}
        similarWarning={similarWarning}
        setSimilarWarning={setSimilarWarning}
        belowCostWarning={belowCostWarning}
        setBelowCostWarning={setBelowCostWarning}
        loading={loading}
        onSave={(e, forceSimilar, forceCost) => void handleSaveProduct(e, forceSimilar, forceCost)}
        onOpenPriceHistory={() => {
          if (editingId) {
            setPriceHistoryProdId(editingId);
            setPriceHistoryProdName(name);
            setShowPriceHistoryModal(true);
          }
        }}
        onGenerateInternalBarcode={generateInternalBarcode}
        onAddBarcode={handleAddBarcode}
        onRemoveBarcode={handleRemoveBarcode}
      />

      {/* Confirm Product Delete Modal (Feature #112 / Task 112-2) */}
      <ConfirmModal
        isOpen={!!productToDelete}
        title="حذف صنف من الكتالوج"
        message={`هل أنت متأكد من رغبتك في حذف الصنف "${productToDelete?.name}" من الكتالوج؟`}
        consequence="سيتم إيقاف ظهور الصنف في شاشة البيع، مع الاحتفاظ ببيانات الفواتير القديمة بأمان."
        confirmText="نعم، حذف الصنف"
        cancelText="إلغاء وتراجع"
        isDanger={true}
        onConfirm={() => void confirmDeleteProduct()}
        onCancel={() => setProductToDelete(null)}
      />

      {/* Confirm Bulk Product Delete Modal */}
      <ConfirmModal
        isOpen={showBulkDeleteConfirm}
        title="حذف جماعي للأصناف المحددة"
        message={`هل أنت متأكد من رغبتك في حذف ${selectedProductIds.length} صنف دفعة واحدة من الكتالوج؟`}
        consequence="سيتم إيقاف ظهور هذه الأصناف في شاشة البيع، مع الاحتفاظ ببيانات الفواتير القديمة بأمان."
        confirmText={`نعم، حذف (${selectedProductIds.length}) صنف`}
        cancelText="إلغاء وتراجع"
        isDanger={true}
        onConfirm={() => void confirmBulkDelete()}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />

      {/* Category Manager Modal (Feature #16 / Task 16-2) */}
      {showCategoryModal && (
        <CategoryManagerModal
          onClose={() => setShowCategoryModal(false)}
          onCategoriesChanged={() => {
            void fetchCategoriesList();
            void loadProducts(searchQuery);
          }}
        />
      )}

      {/* Price & Cost History Modal (Feature #17 / Task 17-3) */}
      <PriceHistoryModal
        isOpen={showPriceHistoryModal}
        onClose={() => setShowPriceHistoryModal(false)}
        productId={priceHistoryProdId}
        productName={priceHistoryProdName}
      />

      {/* Bulk Min Stock Update Modal (Feature #18 / Task 18-2) */}
      <BulkMinStockModal
        isOpen={showBulkMinStockModal}
        onClose={() => setShowBulkMinStockModal(false)}
        selectedCount={selectedProductIds.length}
        bulkMinStockValue={bulkMinStockValue}
        setBulkMinStockValue={setBulkMinStockValue}
        bulkUpdating={bulkUpdating}
        onConfirm={() => void handleBulkUpdateMinStock()}
      />

      {/* Excel Import Modal (Story 37 - Feature #21) */}
      <ExcelImportModal
        isOpen={showExcelImportModal}
        onClose={() => setShowExcelImportModal(false)}
        onSuccess={(msg) => {
          setImportSuccessAlert(msg);
          void loadProducts('');
        }}
        existingProducts={products}
        categories={categories}
      />

      {/* Stock Movements Ledger Modal (Story 39 - Feature #35 / Task 35-3) */}
      <StockMovementsModal
        isOpen={selectedProdForMovements !== null}
        onClose={() => setSelectedProdForMovements(null)}
        productId={selectedProdForMovements?.id || ''}
        productName={selectedProdForMovements?.name || ''}
        unit={selectedProdForMovements?.unit || 'piece'}
        currentStockMilli={selectedProdForMovements?.stockQuantityMilli || 0}
        onOpenAdjustment={() => {
          if (selectedProdForMovements) {
            setSelectedProdForAdjustment(selectedProdForMovements);
          }
        }}
      />

      {/* Manual Stock Adjustment Modal (Story 39 - Feature #35 / Task 35-2) */}
      <StockAdjustmentModal
        isOpen={selectedProdForAdjustment !== null}
        onClose={() => setSelectedProdForAdjustment(null)}
        product={selectedProdForAdjustment}
        onSuccess={() => {
          void loadProducts(searchQuery);
          void loadMovements();
          void checkDiscrepancies();
        }}
      />

      {/* Multi-Unit Purchase Receiving Modal (Story 74 - Feature #161 / Tasks 161-8 to 161-10) */}
      <PurchaseEntryModal
        key={selectedProdForPurchase?.id || 'none'}
        isOpen={selectedProdForPurchase !== null}
        onClose={() => setSelectedProdForPurchase(null)}
        product={selectedProdForPurchase}
        onSuccess={() => {
          void loadProducts(searchQuery);
          void loadMovements();
          void checkDiscrepancies();
        }}
      />
    </div>
  );
};
