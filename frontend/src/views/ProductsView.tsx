import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  RefreshCw, 
  X, 
  Check, 
  AlertCircle,
  AlertTriangle,
  Edit2,
  Trash2,
  Barcode,
  Percent,
  Tags,
  History,
  TrendingUp,
  Scale,
  FileSpreadsheet,
  Boxes,
  RotateCcw,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Download
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { Product, Category, StockMovement, StockDiscrepancy } from '../types/models';
import { formatArabicCurrency, normalizeArabicNumerals } from '../utils/money';
import { exportProductsToExcel } from '../utils/excelImport';
import { MoneyInput } from '../components/MoneyInput';
import { ConfirmModal } from '../components/ConfirmModal';
import { CategoryManagerModal } from '../components/CategoryManagerModal';
import { PriceHistoryModal } from '../components/PriceHistoryModal';
import { ExcelImportModal } from '../components/ExcelImportModal';
import { StockMovementsModal } from '../components/StockMovementsModal';
import { StockAdjustmentModal } from '../components/StockAdjustmentModal';

export interface ProductsViewProps {
  subView?: 'catalog' | 'movements';
}

export const ProductsView: React.FC<ProductsViewProps> = ({ subView }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [internalCode, setInternalCode] = useState('');
  const [taxCategoryCode, setTaxCategoryCode] = useState('');
  const [pricePiasters, setPricePiasters] = useState(0);
  const [costPiasters, setCostPiasters] = useState(0);
  const [unit, setUnit] = useState<'piece' | 'kg'>('piece');
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
        alert(`تعذر تصدير ملف الإكسل: ${res.message || 'خطأ غير معروف'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`خطأ أثناء التصدير: ${msg}`);
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Stock Movements & Inventory state (Stories 38 & 39 / Features #34 & #35)
  const [internalSubView] = useState<'catalog' | 'movements'>('catalog');
  const activeSubView = subView ?? internalSubView;
  const [selectedProdForMovements, setSelectedProdForMovements] = useState<Product | null>(null);
  const [selectedProdForAdjustment, setSelectedProdForAdjustment] = useState<Product | null>(null);
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
      alert('فشلت إعادة حساب المخزون: ' + (err instanceof Error ? err.message : String(err)));
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
      openAddModal();
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

  return (
    <div className="flex flex-col h-full bg-canvas p-4 gap-3 overflow-hidden select-none">
      {/* 1. Header Toolbar (Title, Count Badge, Search, Add Button) */}
      <div className="min-h-[56px] py-2 bg-surface hairline-all rounded-[6px] px-3 sm:px-4 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-brand-soft text-brand flex items-center justify-center font-bold">
            {activeSubView === 'catalog' ? (
              <Package className="w-4 h-4" />
            ) : (
              <Boxes className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-ink leading-tight m-0">
                {activeSubView === 'catalog' ? 'كتالوج الأصناف والأسعار' : 'دفتر حركات وجرد المخزون'}
              </h2>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-surface-2 border border-line text-ink-muted tabular-nums">
                {activeSubView === 'catalog' ? `${products.length} صنف مسجل` : `${allMovements.length} حركة مسجلة`}
              </span>
              {activeSubView === 'movements' && discrepancies.length > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 animate-pulse">
                  {discrepancies.length} صنف بحاجة لمطابقة
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Search Input & Add Button */}
        <div className="flex items-center gap-2">
          {activeSubView === 'catalog' ? (
            <>
              <form onSubmit={handleSearch} className="flex items-center gap-1.5">
                <div className="relative w-64 h-[38px] flex items-center bg-surface-2 border border-line rounded px-2.5 focus-within:border-brand focus-within:bg-surface">
                  <Search className="w-4 h-4 text-ink-muted ml-2 shrink-0 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو الباركود..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(normalizeArabicNumerals(e.target.value))}
                    className="w-full bg-transparent border-none text-[12px] text-ink placeholder:text-ink-muted focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        void loadProducts('');
                      }}
                      className="text-ink-muted hover:text-ink text-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="h-[38px] px-3 bg-surface-2 hover:bg-surface border border-line text-ink rounded text-[12px] font-bold transition-colors"
                >
                  بحث
                </button>
              </form>

              <button
                onClick={() => void loadProducts(searchQuery)}
                disabled={loading}
                className="h-[38px] w-[38px] flex items-center justify-center bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink rounded transition-colors"
                title="تحديث القائمة"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setShowExcelImportModal(true)}
                className="h-[38px] px-3 bg-surface-2 hover:bg-surface border border-line text-ink rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                title="استيراد وتحديث المنتجات من ملف إكسل أو CSV"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>استيراد إكسل</span>
              </button>

              <button
                type="button"
                onClick={() => void handleExportProductsToExcel()}
                disabled={isExportingExcel}
                className="h-[38px] px-3 bg-surface-2 hover:bg-surface border border-line text-ink rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-60"
                title="تصدير كامل كتالوج الأصناف إلى ملف إكسل ملون واحترافي"
              >
                <Download className={`w-4 h-4 text-emerald-700 ${isExportingExcel ? 'animate-bounce' : ''}`} />
                <span>{isExportingExcel ? 'جاري التصدير...' : 'تصدير إكسل'}</span>
              </button>

              <button
                onClick={openAddModal}
                className="h-[38px] px-4 bg-brand hover:bg-brand-hover text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-sm"
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
                className="h-[38px] px-3 bg-surface-2 hover:bg-surface border border-line text-ink rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${movementsLoading ? 'animate-spin' : ''}`} />
                <span>تحديث الحركات</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Success Notification Alert */}
      {importSuccessAlert && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 px-4 py-2.5 rounded-[6px] flex items-center justify-between text-xs font-bold animate-in fade-in shrink-0">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{importSuccessAlert}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportSuccessAlert(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {activeSubView === 'catalog' ? (
        <>
          {/* Category Filter Chips Bar (Feature #16 / Task 16-3) */}
      <div className="bg-surface hairline-all rounded-[6px] px-3 py-2 flex items-center justify-between gap-2 overflow-x-auto shrink-0 select-none">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <button
            type="button"
            onClick={() => setSelectedCategoryFilter('all')}
            className={`px-3 py-1 rounded-full text-[11.5px] font-semibold transition-colors flex items-center gap-1 shrink-0 ${
              selectedCategoryFilter === 'all'
                ? 'bg-brand text-white shadow-xs'
                : 'bg-surface-2 text-ink-muted hover:text-ink hover:bg-surface'
            }`}
          >
            <span>كل الأصناف</span>
            <span className="font-mono text-[10px] opacity-80">({products.length})</span>
          </button>

          {categories.map((cat) => {
            const count = products.filter(p => (p.categoryId || 'cat_general') === cat.id).length;
            const isSelected = selectedCategoryFilter === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryFilter(cat.id)}
                className={`px-3 py-1 rounded-full text-[11.5px] font-semibold transition-colors flex items-center gap-1 shrink-0 ${
                  isSelected
                    ? 'bg-brand text-white shadow-xs'
                    : 'bg-surface-2 text-ink-muted hover:text-ink hover:bg-surface'
                }`}
              >
                <span>{cat.name}</span>
                <span className="font-mono text-[10px] opacity-80">({count})</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowCategoryModal(true)}
          className="shrink-0 px-2.5 py-1 rounded bg-surface-2 hover:bg-surface border border-line text-ink-muted hover:text-ink text-[11.5px] font-bold flex items-center gap-1.5 transition-colors shadow-2xs mr-2"
          title="إضافة وتعديل وأرشفة وترتيب أقسام السلع"
        >
          <Tags className="w-3.5 h-3.5 text-brand" />
          <span>إدارة التصنيفات</span>
        </button>
      </div>

      {/* 2. Products Data Table */}
      <div className="flex-1 bg-surface hairline-all rounded-[6px] flex flex-col overflow-hidden relative">
        {(() => {
          const filteredProducts = products.filter((p) => selectedCategoryFilter === 'all' || (p.categoryId || 'cat_general') === selectedCategoryFilter);

          return (
            <>
              {/* Table Header */}
              <div className="h-[38px] bg-surface-2 hairline-b px-4 grid grid-cols-12 items-center text-[12px] font-bold text-ink-muted shrink-0 select-none">
                <div className="col-span-1 flex items-center justify-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filteredProducts.length > 0 && selectedProductIds.length === filteredProducts.length}
                    onChange={() => toggleSelectAll(filteredProducts)}
                    className="w-3.5 h-3.5 rounded border-line text-brand focus:ring-0 cursor-pointer"
                    title="تحديد كل الأصناف المعروضة"
                  />
                  <span>#</span>
                </div>
                <span className="col-span-2">الباركود</span>
                <span className="col-span-3">اسم الصنف والوصف</span>
                <span className="col-span-2 text-left pl-2">سعر البيع</span>
                <span className="col-span-1 text-left">التكلفة</span>
                <span className="col-span-1 text-center" title="رصيد المخزن الحالي / حد التنبيه بالنواقص">الرصيد / حد النواقص</span>
                <span className="col-span-1 text-center">الحالة</span>
                <span className="col-span-1 text-center">إجراءات</span>
              </div>

              {/* Table Body */}
              <div className="flex-1 overflow-y-auto divide-y divide-line">
                {filteredProducts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2 p-6">
                    <Package className="w-12 h-12 stroke-[1.2] text-ink-muted opacity-50" />
                    <p className="text-[14px] font-semibold text-ink m-0">لا توجد منتجات مسجلة مطابقة للبحث أو للقسم المختار</p>
                    <p className="text-[12px] text-ink-muted m-0">
                      اضغط على زر &quot;إضافة صنف جديد&quot; أعلاه لتسجيل صنف في قاعدة البيانات
                    </p>
                  </div>
                ) : (
                  filteredProducts.map((prod, index) => {
                    const isKg = prod.unit === 'kg';
                    const stockQuantityCurrent = (prod.stockQuantityMilli || 0) / 1000;
                    const minStockQuantityItem = (prod.minStockQuantityMilli ?? 5000) / 1000;
                    
                    const stockDisplay = isKg
                      ? `${stockQuantityCurrent.toFixed(3).replace(/\.?0+$/, '')} كجم`
                      : `${Math.round(stockQuantityCurrent)} ق`;

                    const minStockDisplay = isKg
                      ? `${minStockQuantityItem.toFixed(3).replace(/\.?0+$/, '')}`
                      : `${Math.round(minStockQuantityItem)}`;

                    let stockStatus = { label: 'متوفر', class: 'bg-paid-soft text-paid border-paid-border' };
                    if (stockQuantityCurrent <= 0) {
                      stockStatus = { label: 'نافد', class: 'bg-danger-soft text-danger border-danger-border' };
                    } else if (stockQuantityCurrent <= minStockQuantityItem) {
                      stockStatus = { label: `نقص (${minStockDisplay})`, class: 'bg-warn-soft text-warn border-warn-border' };
                    }

                    const isSelected = selectedProductIds.includes(prod.id);

                    return (
                      <div 
                        key={prod.id} 
                        className={`h-[46px] hairline-b px-4 grid grid-cols-12 items-center text-[13px] hover:bg-surface-2 transition-colors ${
                          isSelected ? 'bg-brand-soft/40' : ''
                        }`}
                      >
                        <div className="col-span-1 flex items-center justify-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectProduct(prod.id)}
                            className="w-3.5 h-3.5 rounded border-line text-brand focus:ring-0 cursor-pointer"
                          />
                          <span className="font-mono text-xs text-ink-muted">{index + 1}</span>
                        </div>
                        
                        <div className="col-span-2 flex items-center gap-1 font-mono text-xs text-ink truncate">
                          <span className="truncate">{prod.barcode || <span className="text-ink-muted">—</span>}</span>
                          {prod.barcodes && prod.barcodes.length > 1 && (
                            <span 
                              className="px-1.5 py-0.5 rounded bg-surface-2 border border-line text-[10px] text-ink-muted shrink-0 font-bold"
                              title={`باركودات إضافية مسجلة للصنف:\n${prod.barcodes.join('\n')}`}
                            >
                              +{prod.barcodes.length - 1}
                            </span>
                          )}
                        </div>

                        <div className="col-span-3 flex items-center gap-1.5 truncate pr-1">
                          <span className="font-semibold text-ink truncate">{prod.name}</span>
                          {isKg && (
                            <span className="shrink-0 px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold rounded flex items-center gap-0.5" title="يباع بالوزن (ميزان)">
                              <Scale className="w-2.5 h-2.5" />
                              <span>وزن</span>
                            </span>
                          )}
                          {prod.taxRatePercent > 0 && (
                            <span className="shrink-0 px-1.5 py-0.5 bg-brand-soft text-brand text-[10px] font-bold rounded">
                              {prod.taxRatePercent}% ضريبة
                            </span>
                          )}
                        </div>

                        <div className="col-span-2 flex items-center justify-start gap-1 font-mono text-left pl-2">
                          <span className="font-bold text-brand tabular-nums text-[13px]">
                            {formatArabicCurrency(prod.pricePiasters)}
                          </span>
                          {isKg && (
                            <span className="text-[10px] text-brand/80 font-normal">/كجم</span>
                          )}
                          {prod.costPiasters > 0 && (
                            prod.pricePiasters < prod.costPiasters ? (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-danger-soft text-danger font-bold shrink-0" title="سعر البيع أقل من التكلفة (خسارة)">
                                خسارة
                              </span>
                            ) : (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-brand-soft text-brand font-bold shrink-0" title="نسبة الربح من التكلفة">
                                +{(((prod.pricePiasters - prod.costPiasters) / prod.costPiasters) * 100).toFixed(0)}%
                              </span>
                            )
                          )}
                        </div>

                        <span className="col-span-1 text-left font-mono text-ink-muted tabular-nums text-[12px]">
                          {formatArabicCurrency(prod.costPiasters)}
                        </span>

                        <div 
                          onClick={() => setSelectedProdForMovements(prod)}
                          className="col-span-1 flex flex-col items-center justify-center font-mono tabular-nums leading-tight cursor-pointer hover:bg-surface-2 rounded py-0.5 group transition-colors"
                          title="انقر لعرض كارت حركات الصنف"
                        >
                          <span className="font-bold text-ink text-[12px] group-hover:text-brand underline decoration-dotted underline-offset-2">{stockDisplay}</span>
                          <span className="text-[9.5px] text-ink-muted" title={`حد الطلب الأدنى: ${minStockDisplay} ${isKg ? 'كجم' : 'قطعة'}`}>
                            حد {minStockDisplay}
                          </span>
                        </div>

                        <div className="col-span-1 flex justify-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${stockStatus.class}`}>
                            {stockStatus.label}
                          </span>
                        </div>

                        {/* Actions: History, Stock Adjust, Edit & Soft Delete */}
                        <div className="col-span-1 flex items-center justify-center gap-1">
                          <button
                            onClick={() => setSelectedProdForMovements(prod)}
                            className="p-1 rounded text-ink-muted hover:text-brand hover:bg-surface transition-colors"
                            title="عرض كارت حركات الصنف"
                          >
                            <Boxes className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setSelectedProdForAdjustment(prod)}
                            className="p-1 rounded text-ink-muted hover:text-amber-600 hover:bg-surface transition-colors"
                            title="تسوية جردية للصنف"
                          >
                            <Scale className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openPriceHistory(prod)}
                            className="p-1 rounded text-ink-muted hover:text-brand hover:bg-surface transition-colors"
                            title="سجل تغيير الأسعار"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditModal(prod)}
                            className="p-1 rounded text-ink-muted hover:text-brand hover:bg-surface transition-colors"
                            title="تعديل الصنف"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setProductToDelete(prod)}
                            className="p-1 rounded text-ink-muted hover:text-danger hover:bg-surface transition-colors"
                            title="حذف الصنف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Floating Bulk Action Bar (Feature #18 / Task 18-2) */}
              {selectedProductIds.length > 0 && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-ink text-surface rounded-full px-5 py-2.5 shadow-2xl flex items-center gap-4 z-30 border border-line text-[12px] font-bold animate-fade-in">
                  <span className="flex items-center gap-1.5 text-white">
                    <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                    <span>تم تحديد {selectedProductIds.length} صنف</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowBulkMinStockModal(true)}
                    className="px-3.5 py-1 bg-brand hover:bg-brand-hover text-white rounded-full text-[11.5px] font-bold flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <span>تعديل حد الطلب جماعياً</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProductIds([])}
                    className="text-ink-muted hover:text-white text-[11px] underline"
                  >
                    إلغاء التحديد
                  </button>
                </div>
              )}
            </>
          );
        })()}

        {/* Table Footer Status */}
        <div className="h-[32px] bg-surface-2 hairline-t px-4 flex items-center justify-between text-[11px] text-ink-muted shrink-0">
          <span>يتم تخزين جميع الأسعار بالقروش وتحديث حركة المخزون في معاملات SQLite فورية.</span>
          <span className="font-mono tabular-nums">{products.length} منتج مسجل</span>
        </div>
      </div>
      </>
      ) : (
        /* Movements & Inventory Audit SubView (Feature #35 & Feature #34) */
        <div className="flex-1 flex flex-col gap-3 overflow-hidden select-none">
          {/* Top Reconciliation Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
            {/* 1. Total Movements Card */}
            <div className="bg-surface p-3.5 rounded-[6px] border border-line flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-brand-soft text-brand flex items-center justify-center font-bold">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] text-ink-muted font-bold">إجمالي الحركات المسجلة</div>
                  <div className="text-[18px] font-mono font-bold text-ink">{allMovements.length} حركة</div>
                </div>
              </div>
              <span className="text-[10px] text-ink-muted bg-surface-2 px-2 py-0.5 rounded border border-line">
                غير قابلة للتعديل
              </span>
            </div>

            {/* 2. Consistency & Discrepancies Card (Task 34-1) */}
            <div className={`p-3.5 rounded-[6px] border flex items-center justify-between ${
              discrepancies.length > 0 
                ? 'bg-amber-500/10 border-amber-500/30' 
                : 'bg-emerald-500/10 border-emerald-500/30'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded flex items-center justify-center font-bold ${
                  discrepancies.length > 0 ? 'bg-amber-500/20 text-amber-700' : 'bg-emerald-500/20 text-emerald-700'
                }`}>
                  {discrepancies.length > 0 ? (
                    <AlertTriangle className="w-5 h-5 text-amber-700" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-ink">مطابقة المخزون الدورية</div>
                  <div className={`text-[13px] font-bold ${discrepancies.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {discrepancies.length > 0 
                      ? `${discrepancies.length} صنف به تفاوت بحاجة لمطابقة` 
                      : 'الأرصدة متطابقة بنسبة 100% مع الحركات'}
                  </div>
                </div>
              </div>
              {discrepancies.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleRecalculateStock()}
                  disabled={recalculating}
                  className="px-3 py-1 rounded bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 transition-colors shadow-xs flex items-center gap-1"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
                  <span>مطابقة الآن</span>
                </button>
              )}
            </div>

            {/* 3. Reconcile Card (Task 34-3) */}
            <div className="bg-surface p-3.5 rounded-[6px] border border-line flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void handleRecalculateStock()}
                disabled={recalculating}
                className="w-full h-10 px-4 bg-surface-2 hover:bg-surface border border-line text-ink rounded text-[12px] font-bold flex items-center justify-center gap-2 transition-colors shadow-2xs"
                title="أداة تدقيق وإعادة حساب المخزون من الحركات لمعالجة أي تفاوت"
              >
                <RotateCcw className={`w-4 h-4 text-brand ${recalculating ? 'animate-spin' : ''}`} />
                <span>{recalculating ? 'جاري مطابقة وحساب الأرصدة...' : 'إعادة مطابقة وحساب رصيد المخزون'}</span>
              </button>
            </div>
          </div>

          {/* Recalculate Feedback Banner (Auto-dismisses in 3.5s) */}
          {recalcSuccessMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 px-4 py-2.5 rounded-[6px] flex items-center justify-between text-xs font-bold animate-fade-in shrink-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{recalcSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setRecalcSuccessMsg(null)}
                className="text-emerald-700 hover:text-emerald-950 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Movements Toolbar & Filters */}
          <div className="bg-surface hairline-all rounded-[6px] px-3 py-2 flex items-center justify-between gap-3 shrink-0">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11.5px]">
              {[
                { id: 'ALL', label: 'كل الحركات' },
                { id: 'INITIAL', label: 'رصيد افتتاحي' },
                { id: 'SALE', label: 'مبيعات' },
                { id: 'PURCHASE', label: 'مشتريات' },
                { id: 'ADJUSTMENT', label: 'تسويات جردية' },
                { id: 'RETURN', label: 'مرتجعات' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setMovementTypeFilter(tab.id);
                    setTimeout(() => void loadMovements(), 50);
                  }}
                  className={`px-3 py-1 rounded-full font-semibold transition-colors shrink-0 ${
                    movementTypeFilter === tab.id
                      ? 'bg-brand text-white shadow-xs'
                      : 'bg-surface-2 text-ink-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input for Movements */}
            <div className="relative w-64 h-[34px] flex items-center bg-surface-2 border border-line rounded px-2.5 focus-within:border-brand focus-within:bg-surface">
              <Search className="w-3.5 h-3.5 text-ink-muted ml-2 shrink-0 pointer-events-none" />
              <input
                type="text"
                placeholder="فلترة الحركات بالصنف..."
                value={movementSearchQuery}
                onChange={(e) => setMovementSearchQuery(normalizeArabicNumerals(e.target.value))}
                className="w-full bg-transparent border-none text-[11.5px] text-ink placeholder:text-ink-muted focus:outline-none"
              />
              {movementSearchQuery && (
                <button
                  type="button"
                  onClick={() => setMovementSearchQuery('')}
                  className="text-ink-muted hover:text-ink text-xs"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Movements Data Table */}
          <div className="flex-1 bg-surface hairline-all rounded-[6px] flex flex-col overflow-hidden relative">
            {/* Table Header */}
            <div className="h-[38px] bg-surface-2 hairline-b px-4 grid grid-cols-12 items-center text-[12px] font-bold text-ink-muted shrink-0 select-none">
              <span className="col-span-2">التاريخ والوقت</span>
              <span className="col-span-3">اسم الصنف والباركود</span>
              <span className="col-span-2 text-center">نوع الحركة</span>
              <span className="col-span-2 text-center">الكمية</span>
              <span className="col-span-1 text-left">التكلفة</span>
              <span className="col-span-2">الملاحظات والسبب</span>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-y-auto divide-y divide-line">
              {movementsLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2 p-6">
                  <RefreshCw className="w-8 h-8 animate-spin text-brand" />
                  <span className="text-[13px]">جاري تحميل سجل حركات المخزون...</span>
                </div>
              ) : allMovements.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-ink-muted gap-2 p-6">
                  <Boxes className="w-12 h-12 stroke-[1.2] text-ink-muted opacity-50" />
                  <p className="text-[14px] font-semibold text-ink m-0">لا توجد حركات مخزون مسجلة مطابقة للفلتر</p>
                  <p className="text-[12px] text-ink-muted m-0">
                    يتم تسجيل الحركات تلقائياً مع البيع وتغيير الأرصدة.
                  </p>
                </div>
              ) : (
                allMovements
                  .filter((m) => {
                    if (!movementSearchQuery.trim()) return true;
                    const q = movementSearchQuery.toLowerCase();
                    return (
                      (m.productName && m.productName.toLowerCase().includes(q)) ||
                      (m.productBarcode && m.productBarcode.toLowerCase().includes(q)) ||
                      (m.note && m.note.toLowerCase().includes(q))
                    );
                  })
                  .map((m) => {
                    const isPositive = m.quantityMilli >= 0;
                    const isKg = m.unit === 'kg';
                    const qtyUnits = Math.abs(m.quantityMilli / 1000);
                    const qtyDisplay = isKg
                      ? `${qtyUnits.toFixed(3).replace(/\.?0+$/, '')} كجم`
                      : `${Math.round(qtyUnits)} ق`;

                    let badgeClass = 'bg-surface-2 text-ink-muted border-line';
                    if (m.movementType === 'INITIAL') badgeClass = 'bg-blue-500/10 text-blue-700 border-blue-500/20';
                    else if (m.movementType === 'SALE') badgeClass = 'bg-red-500/10 text-red-700 border-red-500/20';
                    else if (m.movementType === 'PURCHASE') badgeClass = 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20';
                    else if (m.movementType === 'ADJUSTMENT') badgeClass = 'bg-amber-500/10 text-amber-700 border-amber-500/20';
                    else if (m.movementType === 'RETURN') badgeClass = 'bg-purple-500/10 text-purple-700 border-purple-500/20';

                    const dateFormatted = (() => {
                      try {
                        const d = new Date(m.createdAt);
                        return d.toLocaleDateString('ar-EG', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                      } catch {
                        return m.createdAt;
                      }
                    })();

                    return (
                      <div
                        key={m.id}
                        className="h-[46px] hairline-b px-4 grid grid-cols-12 items-center text-[12px] hover:bg-surface-2 transition-colors"
                      >
                        {/* 1. Date */}
                        <div className="col-span-2 flex items-center gap-1.5 font-mono text-[11.5px] text-ink-muted">
                          <Calendar className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                          <span>{dateFormatted}</span>
                        </div>

                        {/* 2. Product Name & Barcode */}
                        <div className="col-span-3 flex flex-col justify-center truncate pr-1">
                          <span className="font-semibold text-ink truncate text-[12.5px]">{m.productName || 'صنف غير معروف'}</span>
                          {m.productBarcode && (
                            <span className="font-mono text-[10.5px] text-ink-muted">{m.productBarcode}</span>
                          )}
                        </div>

                        {/* 3. Movement Type */}
                        <div className="col-span-2 flex justify-center">
                          <span className={`px-2.5 py-0.5 rounded text-[10.5px] font-bold border ${badgeClass}`}>
                            {m.movementTypeArabic || m.movementType}
                          </span>
                        </div>

                        {/* 4. Signed Quantity */}
                        <div className="col-span-2 flex items-center justify-center font-mono font-bold text-[13px] tabular-nums">
                          <div className={`flex items-center gap-1 ${isPositive ? 'text-paid' : 'text-danger'}`}>
                            {isPositive ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : (
                              <ArrowDownLeft className="w-4 h-4" />
                            )}
                            <span dir="ltr">{isPositive ? `+${qtyDisplay}` : `-${qtyDisplay}`}</span>
                          </div>
                        </div>

                        {/* 5. Unit Cost */}
                        <span className="col-span-1 text-left font-mono text-ink-muted tabular-nums text-[12px]">
                          {formatArabicCurrency(m.unitCostPiasters)}
                        </span>

                        {/* 6. Note */}
                        <div className="col-span-2 truncate text-[11px] text-ink-muted" title={m.note || ''}>
                          {m.note || <span className="opacity-40">—</span>}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Table Footer */}
            <div className="h-[32px] bg-surface-2 hairline-t px-4 flex items-center justify-between text-[11px] text-ink-muted shrink-0">
              <span>جميع الحركات مسجلة بقيود ذرية غير قابلة للحذف لضمان سلامة المخزون.</span>
              <span className="font-mono tabular-nums">{allMovements.length} حركة إجمالية</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Add/Edit Product Modal (Fully Responsive on 1024x768 & 1366x768) */}
      {showModal && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-xl max-h-[92vh] bg-surface rounded-[8px] border-2 border-brand shadow-2xl overflow-hidden flex flex-col select-none animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header (Fixed at top) */}
            <div className="h-[48px] bg-surface-2 hairline-b px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-brand" />
                <h3 className="text-[14px] font-bold text-ink m-0">
                  {editingId ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد للكتالوج'}
                </h3>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setPriceHistoryProdId(editingId);
                      setPriceHistoryProdName(name);
                      setShowPriceHistoryModal(true);
                    }}
                    className="mr-2 px-2 py-0.5 rounded bg-brand-soft hover:bg-brand/20 border border-brand/20 text-brand text-[11px] font-bold flex items-center gap-1 transition-colors"
                    title="عرض تاريخ وتعديلات أسعار هذا الصنف"
                  >
                    <History className="w-3 h-3" />
                    <span>سجل الأسعار</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-ink-muted hover:text-danger p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveProduct} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Scrollable Form Body */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 flex flex-col gap-3 text-[12px]">
              {formError && (
                <div className="p-2.5 rounded bg-danger-soft border border-danger-border text-danger flex items-center gap-2 text-[12px] font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {similarWarning && (
                <div className="p-3 rounded bg-amber-50 border border-amber-300 text-amber-900 flex flex-col gap-2 text-[12px]">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span className="font-semibold leading-relaxed">{similarWarning}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-200">
                    <button
                      type="button"
                      onClick={() => setSimilarWarning(null)}
                      className="px-2.5 py-1 bg-white hover:bg-surface border border-line text-ink rounded text-[11px] font-bold transition-colors"
                    >
                      تعديل الاسم
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveProduct(undefined, true)}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-xs transition-colors"
                    >
                      <span>تجاهل وتأكيد الحفظ</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-ink font-semibold mb-1">اسم الصنف *</label>
                <input
                  type="text"
                  placeholder="مثال: شاي العروسة 250 جم"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
                  autoFocus
                />
              </div>

              {/* Primary Barcode with Auto-Generate button */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-ink font-semibold">الباركود الرئيسي</label>
                  <button
                    type="button"
                    onClick={generateInternalBarcode}
                    className="text-[11px] text-brand hover:underline font-semibold flex items-center gap-1"
                  >
                    <Barcode className="w-3.5 h-3.5" />
                    <span>توليد كود تلقائي</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="امسح الباركود الرئيسي أو اضغط توليد كود تلقائي"
                  value={barcode}
                  onChange={(e) => setBarcode(normalizeArabicNumerals(e.target.value))}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                />
              </div>

              {/* Multiple Additional Barcodes Editor (Feature #15 / Task 15-3) */}
              <div className="p-3 bg-surface-2/60 border border-line rounded flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11.5px] font-semibold text-ink">
                  <span>باركودات إضافية لنفس الصنف (مسح سريع بالقارئ):</span>
                  <span className="text-[10.5px] text-ink-muted font-mono font-normal">
                    {additionalBarcodes.length} باركود إضافي
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="امسح بالباركود واضغط Enter للإضافة..."
                    value={newBarcodeInput}
                    onChange={(e) => setNewBarcodeInput(normalizeArabicNumerals(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddBarcode();
                      }
                    }}
                    className="flex-1 bg-surface border border-line rounded h-[34px] px-3 text-[12px] font-mono text-ink focus:outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    onClick={handleAddBarcode}
                    disabled={!newBarcodeInput.trim()}
                    className="px-3 h-[34px] bg-brand hover:bg-brand-hover disabled:bg-surface disabled:text-ink-muted text-white rounded text-[11.5px] font-bold transition-colors shadow-xs"
                  >
                    + إضافة
                  </button>
                </div>

                {additionalBarcodes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 max-h-24 overflow-y-auto">
                    {additionalBarcodes.map((bc, idx) => (
                      <span
                        key={bc}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-line rounded text-[11px] font-mono text-ink shadow-xs"
                      >
                        <Barcode className="w-3 h-3 text-ink-muted" />
                        <span>{bc}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveBarcode(idx)}
                          className="text-ink-muted hover:text-danger hover:bg-danger-soft rounded p-0.5"
                          title="حذف هذا الباركود"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Unit Selection: Piece vs Weight (Feature #19 / Tasks 19-1 & 19-2) */}
              <div>
                <label className="block text-ink font-semibold mb-1">نوع بيع الصنف (الوحدة) *</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-surface-2 rounded border border-line">
                  <button
                    type="button"
                    onClick={() => setUnit('piece')}
                    className={`py-1.5 px-3 rounded text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      unit === 'piece'
                        ? 'bg-brand text-white shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>بالقطعة / بالعدد (قطعة)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit('kg')}
                    className={`py-1.5 px-3 rounded text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all ${
                      unit === 'kg'
                        ? 'bg-brand text-white shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>بالوزن / ميزان (كيلوجرام)</span>
                  </button>
                </div>
              </div>

              {/* Category Selection Dropdown (Task 16-3) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-ink font-semibold">قسم وتصنيف الصنف</label>
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(true)}
                    className="text-[11px] text-brand hover:underline font-semibold flex items-center gap-1"
                  >
                    <Tags className="w-3.5 h-3.5" />
                    <span>إدارة الأقسام</span>
                  </button>
                </div>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[12.5px] text-ink focus:outline-none focus:border-brand font-sans"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                  {categories.length === 0 && (
                    <option value="cat_general">عام / متنوع</option>
                  )}
                </select>
              </div>

              {/* Selling Price & Cost in Piasters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">
                    {unit === 'kg' ? 'سعر بيع الكيلو للجمهور *' : 'سعر البيع للجمهور (للقطعة) *'}
                  </label>
                  <MoneyInput
                    valuePiasters={pricePiasters}
                    onChangePiasters={setPricePiasters}
                    className="h-[38px] text-[13px] font-bold text-brand"
                  />
                </div>

                <div>
                  <label className="block text-ink font-semibold mb-1">
                    {unit === 'kg' ? 'تكلفة شراء الكيلو من المورد' : 'تكلفة الشراء من المورد (للقطعة)'}
                  </label>
                  <MoneyInput
                    valuePiasters={costPiasters}
                    onChangePiasters={setCostPiasters}
                    className="h-[38px] text-[13px]"
                  />
                </div>
              </div>

              {/* Live Profit Margin Card (Feature #17 / Task 17-2) */}
              {(() => {
                const profitPiasters = pricePiasters - costPiasters;
                const markupPercent = costPiasters > 0 ? ((profitPiasters / costPiasters) * 100) : 0;
                const marginPercent = pricePiasters > 0 ? ((profitPiasters / pricePiasters) * 100) : 0;
                const isLoss = profitPiasters < 0;
                const isBreakEven = profitPiasters === 0;

                if (isLoss) {
                  return (
                    <div className="p-2.5 rounded bg-danger-soft border border-danger/30 text-danger flex flex-col gap-1 text-[11.5px]">
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0" />
                          <span>تنبيه: سعر البيع أقل من التكلفة (بيع بالخسارة)</span>
                        </span>
                        <span className="font-mono text-[12px]">
                          -{formatArabicCurrency(Math.abs(profitPiasters))}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-mono text-[10.5px] text-danger/80">
                        <span>نسبة الخسارة من التكلفة: -{Math.abs(markupPercent).toFixed(1)}%</span>
                        <span>تكلفة: {formatArabicCurrency(costPiasters)} | بيع: {formatArabicCurrency(pricePiasters)}</span>
                      </div>
                    </div>
                  );
                }

                if (isBreakEven) {
                  return (
                    <div className="p-2 rounded bg-surface-2 border border-line text-ink-muted text-[11px] flex items-center justify-between font-mono">
                      <span>هامش الربح: 0.00 ج.م (رأس برأس)</span>
                      <span>سعر البيع يطابق سعر الشراء تماماً</span>
                    </div>
                  );
                }

                return (
                  <div className="p-2.5 rounded bg-brand-soft/80 border border-brand/20 text-brand flex flex-col gap-1 text-[11.5px]">
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-brand shrink-0" />
                        <span>{unit === 'kg' ? 'الربح الصافي للكيلو:' : 'الربح الصافي للقطعة:'}</span>
                      </span>
                      <span className="font-mono text-[12px] font-bold">
                        +{formatArabicCurrency(profitPiasters)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[10.5px] text-brand/80">
                      <span>نسبة الربح من التكلفة (Markup): +{markupPercent.toFixed(1)}%</span>
                      <span>هامش المبيعات (Margin): {marginPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })()}

              {/* Below Cost Warning Modal / Prompt if Loss Detected (Task 17-1) */}
              {belowCostWarning && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded text-amber-800 dark:text-amber-300 flex flex-col gap-2">
                  <div className="flex items-start gap-2 text-[11.5px] font-semibold">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <p>سعر البيع ({formatArabicCurrency(belowCostWarning.pricePiasters)}) أقل من سعر التكلفة ({formatArabicCurrency(belowCostWarning.costPiasters)}).</p>
                      <p className="text-[11px] font-normal text-ink-muted mt-0.5">هل تريد بالتأكيد المتابعة وحفظ المنتج بالخسارة؟</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-amber-500/20">
                    <button
                      type="button"
                      onClick={() => setBelowCostWarning(null)}
                      className="px-2.5 h-6 bg-surface hover:bg-surface-2 border border-line rounded text-[11px] font-semibold text-ink transition-colors"
                    >
                      تعديل الأسعار
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveProduct(undefined, false, true)}
                      className="px-2.5 h-6 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold transition-colors shadow-xs"
                    >
                      نعم، تأكيد الحفظ بالخسارة
                    </button>
                  </div>
                </div>
              )}

              {/* Initial Stock, Min Stock Threshold, & Tax Rate (Feature #18 & #19) */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-ink font-semibold mb-1 text-[12px]">
                    {unit === 'kg' ? 'رصيد المخزن الفعلي (كجم)' : 'رصيد المخزن الفعلي (قطعة)'}
                  </label>
                  <input
                    type="text"
                    value={stockInput}
                    onChange={(e) => setStockInput(normalizeArabicNumerals(e.target.value))}
                    placeholder={unit === 'kg' ? 'مثلاً: 12.5 كجم' : 'مثلاً: 10 قطع'}
                    className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                  />
                  <p className="text-[10px] text-ink-muted mt-1 leading-tight">الكمية المتوفرة حالياً على الرف</p>
                </div>

                <div>
                  <label className="block text-ink font-semibold mb-1 text-[12px]">
                    {unit === 'kg' ? 'حد التنبيه بالنواقص (كجم)' : 'حد التنبيه بالنواقص (قطعة)'}
                  </label>
                  <input
                    type="text"
                    value={minStockInput}
                    onChange={(e) => setMinStockInput(normalizeArabicNumerals(e.target.value))}
                    placeholder={unit === 'kg' ? 'تنبيه عند: 5 كجم' : 'تنبيه عند: 5 قطع'}
                    className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
                  />
                  <p className="text-[10px] text-ink-muted mt-1 leading-tight">ينبهك النظام لشراء بضاعة جديدة</p>
                </div>

                <div>
                  <label className="block text-ink font-semibold mb-1 text-[12px]">نسبة الضريبة (%)</label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={taxRatePercent}
                      onChange={(e) => setTaxRatePercent(parseInt(normalizeArabicNumerals(e.target.value), 10) || 0)}
                      placeholder="0"
                      className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono pl-8"
                    />
                    <Percent className="w-3.5 h-3.5 text-ink-muted absolute left-3 pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-ink-muted mt-1 leading-tight">اكتب 0 للأصناف المعفية</p>
                </div>
              </div>

              {/* Tax & ETA E-Invoicing Readiness (Feature #6) */}
              <div className="grid grid-cols-2 gap-3 bg-canvas/60 p-2.5 rounded border border-line">
                <div>
                  <label className="block text-ink-muted font-semibold mb-1 text-[11px]">
                    كود الصنف الداخلي (SKU)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: ITM-00124"
                    value={internalCode}
                    onChange={(e) => setInternalCode(e.target.value)}
                    className="w-full bg-surface border border-line rounded h-[34px] px-2.5 text-[12px] text-ink focus:outline-none focus:border-brand font-mono"
                  />
                </div>

                <div>
                  <label className="block text-ink-muted font-semibold mb-1 text-[11px]">
                    كود التصنيف الضريبي (GS1 / EGS)
                  </label>
                  <input
                    type="text"
                    placeholder="اختياري - للفاتورة الإلكترونية"
                    value={taxCategoryCode}
                    onChange={(e) => setTaxCategoryCode(e.target.value)}
                    className="w-full bg-surface border border-line rounded h-[34px] px-2.5 text-[12px] text-ink focus:outline-none focus:border-brand font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Footer Actions (Docked and Fixed at bottom) */}
            <div className="h-[52px] bg-surface-2 hairline-t px-4 sm:px-5 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="h-[36px] px-4 bg-surface hover:bg-surface-3 border border-line text-ink rounded text-[12px] font-semibold transition-colors"
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={loading}
                className="h-[36px] px-5 bg-brand hover:bg-brand-hover text-white rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Check className="w-4 h-4" />
                <span>{editingId ? 'حفظ التعديلات' : 'حفظ الصنف في قاعدة البيانات'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

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
      {showBulkMinStockModal && (
        <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4 animate-fade-in select-none">
          <div className="w-full max-w-sm max-h-[90vh] bg-surface rounded-[8px] border border-line p-5 shadow-2xl flex flex-col gap-3.5 overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <h3 className="text-[14px] font-bold text-ink m-0">تعديل حد الطلب جماعياً</h3>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-brand-soft text-brand">
                {selectedProductIds.length} صنف محدد
              </span>
            </div>
            
            <p className="text-[12px] text-ink-muted m-0 leading-relaxed">
              أدخل الحد الأدنى للمخزون بالقطعة لتطبيقه على جميع الأصناف المحددة للتنبيه عند نقص الكمية.
            </p>

            <div>
              <label className="block text-ink font-semibold mb-1 text-[12px]">الحد الأدنى للكمية (بالقطعة)</label>
              <input
                type="text"
                value={bulkMinStockValue}
                onChange={(e) => setBulkMinStockValue(parseInt(normalizeArabicNumerals(e.target.value), 10) || 0)}
                className="w-full bg-surface border border-line rounded h-[38px] px-3 font-mono text-[13px] text-ink focus:outline-none focus:border-brand"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setShowBulkMinStockModal(false)}
                className="px-3.5 h-[34px] rounded border border-line text-[12px] font-semibold text-ink hover:bg-surface-2 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={bulkUpdating}
                onClick={() => void handleBulkUpdateMinStock()}
                className="px-4 h-[34px] bg-brand hover:bg-brand-hover text-white rounded text-[12px] font-bold shadow-xs transition-colors"
              >
                {bulkUpdating ? 'جاري الحفظ...' : 'تطبيق التعديل'}
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
};
