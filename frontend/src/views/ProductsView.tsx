import React, { useState, useEffect, useCallback } from 'react';
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
  Calendar,
  HelpCircle,
  Layers,
  Tag,
  TrendingUp,
  ShieldCheck,
  Barcode,
  ChevronDown,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import { openHelpCenter } from '../utils/helpService';
import { rafiqAlert } from '../utils/dialogService';
import type { Product, Category, StockMovement, StockDiscrepancy, ProductUnit, BulkGenerateBarcodesResult } from '../types/models';
import { normalizeArabicNumerals } from '../utils/money';
import { exportProductsToExcel } from '../utils/excelImport';
import { ConfirmModal } from '../components/ConfirmModal';
import { PaginationBar } from '../components/PaginationBar';
import { CategoryManagerModal } from '../components/CategoryManagerModal';
import { PriceHistoryModal } from '../components/PriceHistoryModal';
import { ExcelImportModal } from '../components/ExcelImportModal';
import { StockMovementsModal } from '../components/StockMovementsModal';
import { StockAdjustmentModal } from '../components/StockAdjustmentModal';
import { PurchaseEntryModal } from '../components/PurchaseEntryModal';
import { ProductVariantMatrixModal } from '../components/ProductVariantMatrixModal';
import { ProductVariantsListModal } from '../components/ProductVariantsListModal';
import { BarcodeLabelModal } from '../components/BarcodeLabelModal';
import { DataQualityAuditModal } from '../components/DataQualityAuditModal';
import { useFeatures } from '../context/useFeatures';
import { ProductFormModal } from './products/ProductFormModal';
import { BulkMinStockModal } from './products/BulkMinStockModal';
import { StockMovementsTab } from './products/StockMovementsTab';
import { BatchesTab } from './products/BatchesTab';
import { ProductsTable } from './products/ProductsTable';
import { BulkPriceAdjustmentModal } from './products/BulkPriceAdjustmentModal';

export interface ProductsViewProps {
  isActive?: boolean;
  subView?: 'catalog' | 'movements' | 'batches';
  onSubViewChange?: (view: 'catalog' | 'movements' | 'batches') => void;
  initialFilter?: 'all' | 'lowStock' | 'outOfStock';
  onResetFilter?: () => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({ 
  isActive = true,
  subView, 
  onSubViewChange,
  initialFilter = 'all', 
  onResetFilter 
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const [prevInitialFilter, setPrevInitialFilter] = useState(initialFilter);
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'lowStock' | 'outOfStock'>(initialFilter);

  // Pagination state
  const [totalCount, setTotalCount] = useState(0);
  const [totalLowStockCount, setTotalLowStockCount] = useState(0);
  const [totalOutOfStockCount, setTotalOutOfStockCount] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

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
  const [variantSize, setVariantSize] = useState('');
  const [variantColor, setVariantColor] = useState('');
  const [initialExpiryDate, setInitialExpiryDate] = useState('');
  const [initialBatchNumber, setInitialBatchNumber] = useState('');
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
  const [showVariantMatrixModal, setShowVariantMatrixModal] = useState(false);
  const [selectedParentForVariants, setSelectedParentForVariants] = useState<Product | null>(null);
  const [batchesInitialSearch, setBatchesInitialSearch] = useState<string>('');
  const { isEnabled } = useFeatures();

  // Barcode Label Printing Modal State (Feature #57 / Tasks 57-1 to 57-4)
  const [showBarcodeLabelModal, setShowBarcodeLabelModal] = useState(false);
  const [labelModalProduct, setLabelModalProduct] = useState<Product | null>(null);

  // Bulk Price Adjustment Modal State (Story 106 - Feature #116)
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);

  // Data Quality Health Audit Modal State (Story 107 - Feature #117)
  const [showDataQualityModal, setShowDataQualityModal] = useState(false);

  // F8 Global Shortcut to open Barcode Label Modal
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F8') {
        e.preventDefault();
        setLabelModalProduct(null);
        setShowBarcodeLabelModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

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
  const activeSubView = (!isEnabled('feature_expiry_dates') && subView === 'batches') ? 'catalog' : (subView ?? 'catalog');

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

  const loadProducts = useCallback(async (
    query = searchQuery, 
    page = currentPage, 
    size = pageSize, 
    stockStatus = stockStatusFilter,
    categoryId = selectedCategoryFilter
  ) => {
    setLoading(true);
    try {
      const offset = (page - 1) * size;
      const res = await invoke<{ 
        products: Product[]; 
        totalCount: number; 
        lowStockCount?: number; 
        outOfStockCount?: number; 
        offset: number; 
        limit: number 
      }>('products:search', { query, limit: size, offset, stockStatus, categoryId });
      if (res && Array.isArray(res.products)) {
        setProducts(res.products);
        setTotalCount(res.totalCount || 0);
        if (typeof res.lowStockCount === 'number') setTotalLowStockCount(res.lowStockCount);
        if (typeof res.outOfStockCount === 'number') setTotalOutOfStockCount(res.outOfStockCount);
      } else if (Array.isArray(res)) {
        // Fallback for backward compatibility
        setProducts(res as unknown as Product[]);
      } else {
        setProducts([]);
      }
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, currentPage, pageSize, stockStatusFilter, selectedCategoryFilter]);

  const fetchCategoriesList = useCallback(async () => {
    try {
      const res = await invoke<Category[]>('categories:getAll', { includeArchived: false });
      if (Array.isArray(res)) {
        setCategories(res);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useDataSubscription(['products', 'all'], () => {
    void loadProducts();
  });

  useDataSubscription(['categories', 'all'], () => {
    void fetchCategoriesList();
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [prodRes, catRes] = await Promise.all([
          invoke<{ 
            products: Product[]; 
            totalCount: number; 
            lowStockCount?: number; 
            outOfStockCount?: number; 
            offset: number; 
            limit: number 
          }>('products:search', { 
            query: searchQuery, 
            limit: pageSize, 
            offset: (currentPage - 1) * pageSize, 
            stockStatus: stockStatusFilter, 
            categoryId: selectedCategoryFilter 
          }),
          invoke<Category[]>('categories:getAll', { includeArchived: false })
        ]);
        if (active) {
          if (prodRes && Array.isArray(prodRes.products)) {
            setProducts(prodRes.products);
            setTotalCount(prodRes.totalCount || 0);
            if (typeof prodRes.lowStockCount === 'number') setTotalLowStockCount(prodRes.lowStockCount);
            if (typeof prodRes.outOfStockCount === 'number') setTotalOutOfStockCount(prodRes.outOfStockCount);
          } else if (Array.isArray(prodRes)) {
            setProducts(prodRes as unknown as Product[]);
          }
          if (Array.isArray(catRes)) setCategories(catRes);
        }
      } catch (err: unknown) {
        console.error(err);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockStatusFilter, selectedCategoryFilter]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    void loadProducts(searchQuery, 1, pageSize);
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
    setStockInput('0');
    setMinStockInput('0');
    setTaxRatePercent(0);
    setVariantSize('');
    setVariantColor('');
    setInitialExpiryDate('');
    setInitialBatchNumber('');
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
    setVariantSize(prod.variantSize || '');
    setVariantColor(prod.variantColor || '');
    setInitialExpiryDate(prod.nearestExpiryDate || '');
    setInitialBatchNumber('');
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

  const generateInternalBarcode = async () => {
    try {
      const res = await invoke<{ barcode: string }>('products:generateInternalBarcode');
      if (res && res.barcode) {
        setBarcode(res.barcode);
      }
    } catch {
      // Fallback in case of unexpected bridge error
      const randomDigits = Math.floor(100000000 + Math.random() * 900000000);
      setBarcode(`200${randomDigits}`);
    }
  };

  const [showBulkBarcodeConfirm, setShowBulkBarcodeConfirm] = useState(false);
  const [missingBarcodeCount, setMissingBarcodeCount] = useState(0);
  const [isGeneratingBarcodes, setIsGeneratingBarcodes] = useState(false);

  const handleStartBulkBarcodeGeneration = async () => {
    try {
      setLoading(true);
      const res = await invoke<{ count: number }>('products:getMissingBarcodeCount');
      const count = res?.count ?? 0;
      setMissingBarcodeCount(count);
      if (count === 0) {
        await rafiqAlert({
          title: 'اكتملت الباركودات',
          message: 'جميع الأصناف النشطة في الكتالوج لديها باركود مسجل بالفعل.',
          variant: 'info'
        });
      } else {
        setShowBulkBarcodeConfirm(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await rafiqAlert({
        title: 'خطأ',
        message: `تعذر فحص عدد الأصناف الناقصة: ${msg}`,
        variant: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBulkBarcodeGeneration = async () => {
    setShowBulkBarcodeConfirm(false);
    try {
      setIsGeneratingBarcodes(true);
      const res = await invoke<BulkGenerateBarcodesResult>('products:bulkGenerateInternalBarcodes');
      if (res && res.success) {
        await loadProducts(searchQuery, currentPage, pageSize);
        await rafiqAlert({
          title: 'تم التوليد بنجاح',
          message: `تم بنجاح توليد وتعيين باركود داخلي قياسي (EAN-13) لـ ${res.count} صنف! يمكنك الآن طباعة ملصقات الباركود لها من زر طباعة الملصقات (F8).`,
          variant: 'success'
        });
      } else {
        await rafiqAlert({
          title: 'تنبيه',
          message: res?.message || 'فشلت عملية التوليد الجماعي للباركودات.',
          variant: 'warning'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await rafiqAlert({
        title: 'خطأ في العملية',
        message: `حدث خطأ أثناء التوليد الجماعي: ${msg}`,
        variant: 'error'
      });
    } finally {
      setIsGeneratingBarcodes(false);
    }
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
        variantSize: variantSize.trim() || undefined,
        variantColor: variantColor.trim() || undefined,
        confirmSimilarName: forceConfirmSimilar,
        confirmBelowCost: forceConfirmCost,
      };

      if (editingId) {
        productPayload.id = editingId;
      }

      const saved = await invoke<Product>('products:save', productPayload);
      if (saved && isEnabled('feature_expiry_dates') && initialExpiryDate.trim() && stockQuantityMilli > 0) {
        await invoke('batch:save', {
          productId: saved.id,
          batchNumber: initialBatchNumber.trim() || `B-${Date.now().toString().slice(-6)}`,
          expiryDate: initialExpiryDate.trim(),
          quantityMilli: stockQuantityMilli,
          costPricePiasters: costPiasters,
          status: 'ACTIVE'
        }).catch(() => null);
      }
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

  const displayedProducts = products;

  return (
    <div className="flex flex-col h-full bg-canvas p-3.5 gap-3 overflow-hidden select-none">
      {/* 1. Header Toolbar (Title, Count Badge, Search, Add Button) */}
      <div className="min-h-[58px] py-2 bg-surface border border-line rounded-2xl px-4 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          {activeSubView === 'catalog' ? (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand flex items-center justify-center border border-brand/20 shadow-2xs">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-ink leading-tight">كتالوج الأصناف والأسعار</h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-surface-2 text-ink font-bold border border-line tabular-nums">
                    {totalCount > products.length
                      ? `عرض ${products.length} من ${totalCount.toLocaleString('en-US')} صنف`
                      : `${products.length} صنف`
                    }
                  </span>
                </div>
                <p className="text-[11px] text-ink-muted">إدارة المنتجات، الأسعار، الباركود، ومستويات حد الطلب</p>
              </div>
            </div>
          ) : activeSubView === 'movements' ? (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand flex items-center justify-center border border-brand/20 shadow-2xs">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-ink leading-tight">دفتر حركات وجرد المخزون</h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-surface-2 text-ink font-bold border border-line tabular-nums">
                    {allMovements.length} حركة
                  </span>
                  {discrepancies.length > 0 && (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 animate-pulse">
                      {discrepancies.length} صنف بحاجة لمطابقة
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-muted">سجل الوارد والمنصرف، المبيعات، المرتجعات، والتسويات الجردية</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center border border-amber-200 shadow-2xs">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-ink leading-tight">تواريخ الصلاحية والدفعات</h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-paid-soft text-paid font-bold border border-paid/20">
                    الأقرب انتهاءً يصرف أولاً
                  </span>
                </div>
                <p className="text-[11px] text-ink-muted">مراقبة تواريخ الانتهاء، تنبيهات الهالك الوشيك، وإتلاف الدفعات المنتهية</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Search Input & Action Toolbar */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {activeSubView === 'catalog' ? (
            <>
              <form onSubmit={handleSearch} className="flex items-center gap-1.5">
                <div className="relative w-48 sm:w-60 h-9 flex items-center bg-surface-2 border border-line rounded-xl px-2.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 focus-within:bg-surface transition-all">
                  <Search className="w-4 h-4 text-ink-muted ml-2 shrink-0 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو الباركود..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(normalizeArabicNumerals(e.target.value))}
                    className="w-full bg-transparent border-none text-xs text-ink placeholder:text-ink-muted focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setCurrentPage(1);
                        void loadProducts('', 1, pageSize);
                      }}
                      className="text-ink-muted hover:text-ink text-xs cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="h-9 px-3 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                >
                  بحث
                </button>
              </form>

              <button
                onClick={() => void loadProducts(searchQuery)}
                disabled={loading}
                className="h-9 w-9 flex items-center justify-center bg-surface hover:bg-surface-2 border border-line text-ink-muted hover:text-ink rounded-xl transition-colors shadow-2xs cursor-pointer shrink-0"
                title="تحديث القائمة"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-brand' : ''}`} />
              </button>

              {/* Senior Tools & Operations Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsToolsDropdownOpen((prev) => !prev)}
                  className={`h-9 px-3 bg-surface hover:bg-surface-2 border text-ink rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${
                    isToolsDropdownOpen ? 'border-brand ring-2 ring-brand/20 bg-surface-2' : 'border-line'
                  }`}
                  title="العمليات المتقدمة، الاستيراد والتصدير، والباركود"
                >
                  <Tag className="w-4 h-4 text-brand" />
                  <span>أدوات الكتالوج</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-ink-muted transition-transform duration-150 ${isToolsDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isToolsDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsToolsDropdownOpen(false)} 
                    />
                    <div className="absolute left-0 top-full mt-1.5 w-64 bg-surface border border-line rounded-xl shadow-card py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          setShowExcelImportModal(true);
                        }}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink hover:bg-surface-2 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-brand" />
                        <span>استيراد وتحديث من إكسل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          void handleExportProductsToExcel();
                        }}
                        disabled={isExportingExcel}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink hover:bg-surface-2 flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-4 h-4 text-brand" />
                        <span>تصدير الكتالوج إلى إكسل</span>
                      </button>

                      <div className="h-px bg-line my-1" />

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          setLabelModalProduct(null);
                          setShowBarcodeLabelModal(true);
                        }}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink hover:bg-surface-2 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Tag className="w-4 h-4 text-brand" />
                        <span>طباعة ملصقات الباركود والأسعار (F8)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          void handleStartBulkBarcodeGeneration();
                        }}
                        disabled={isGeneratingBarcodes || loading}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink hover:bg-surface-2 flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Barcode className="w-4 h-4 text-brand" />
                        <span>توليد باركود تلقائي للنواقص</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          setShowBulkPriceModal(true);
                        }}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink hover:bg-surface-2 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <TrendingUp className="w-4 h-4 text-brand" />
                        <span>تعديل الأسعار والتكاليف بالجملة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          setShowVariantMatrixModal(true);
                        }}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink hover:bg-surface-2 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Layers className="w-4 h-4 text-brand" />
                        <span>جدول المقاسات والألوان</span>
                      </button>

                      <div className="h-px bg-line my-1" />

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          setShowDataQualityModal(true);
                        }}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-paid hover:bg-paid-soft flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4 text-paid" />
                        <span>فحص وتدقيق جودة البيانات</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => openHelpCenter('products')}
                className="h-9 w-9 flex items-center justify-center bg-surface hover:bg-surface-2 border border-line text-paid rounded-xl transition-colors shadow-2xs cursor-pointer shrink-0"
                title="شرح ودليل إدارة الأصناف والمخزون والباركود (F1)"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              {isEnabled('feature_matrix_variants') && (
                <button
                  type="button"
                  onClick={() => setShowVariantMatrixModal(true)}
                  className="h-9 px-3 bg-brand-soft hover:bg-emerald-100 text-brand border border-brand/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-[0.98] shrink-0"
                  title="إنشاء صنف أب مع جدول تركيبات المقاسات والألوان والباركود"
                >
                  <Layers className="w-4 h-4 text-brand" />
                  <span>مقاسات وألوان</span>
                </button>
              )}

              <button
                onClick={openAddModal}
                className="h-9 px-3.5 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-[0.98] shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة صنف</span>
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
                className="h-9 px-3.5 bg-surface hover:bg-surface-2 border border-line text-ink rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${movementsLoading ? 'animate-spin text-brand' : ''}`} />
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
          {/* Unified Filter Toolbar (Stock Levels + Categories + Category Management) */}
          <div className="bg-surface border border-line rounded-2xl p-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0 select-none shadow-xs">
            {/* Quick Stock Level Tabs */}
            <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-line">
              <button
                type="button"
                onClick={() => {
                  setStockStatusFilter('all');
                  setCurrentPage(1);
                  onResetFilter?.();
                  void loadProducts(searchQuery, 1, pageSize, 'all', selectedCategoryFilter);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  stockStatusFilter === 'all'
                    ? 'bg-brand text-white shadow-xs'
                    : 'text-ink-muted hover:text-ink hover:bg-surface'
                }`}
              >
                <span>كافة الأصناف</span>
                {totalCount > 0 && (
                  <span className="font-mono text-[11px] mr-1.5 opacity-90 tabular-nums">
                    ({totalCount.toLocaleString('en-US')})
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStockStatusFilter('lowStock');
                  setCurrentPage(1);
                  void loadProducts(searchQuery, 1, pageSize, 'lowStock', selectedCategoryFilter);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  stockStatusFilter === 'lowStock'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-amber-800 hover:bg-amber-50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>النواقص وحد الطلب</span>
                <span className="font-mono text-[11px] mr-0.5 opacity-95 tabular-nums">
                  ({totalLowStockCount.toLocaleString('en-US')})
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStockStatusFilter('outOfStock');
                  setCurrentPage(1);
                  void loadProducts(searchQuery, 1, pageSize, 'outOfStock', selectedCategoryFilter);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  stockStatusFilter === 'outOfStock'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-800 hover:bg-rose-50'
                }`}
              >
                <span>النافد من المخزن</span>
                <span className="font-mono text-[11px] mr-0.5 opacity-95 tabular-nums">
                  ({totalOutOfStockCount.toLocaleString('en-US')})
                </span>
              </button>
            </div>

            {/* Department / Category Filter & Management Button */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-[460px] py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryFilter('all');
                    setCurrentPage(1);
                    void loadProducts(searchQuery, 1, pageSize, stockStatusFilter, 'all');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold transition-all shrink-0 cursor-pointer ${
                    selectedCategoryFilter === 'all'
                      ? 'bg-brand-dark text-white shadow-2xs'
                      : 'bg-surface-2 text-ink-muted border border-line hover:text-brand hover:border-brand'
                  }`}
                >
                  جميع الأقسام
                </button>
                {categories.map((cat) => {
                  const isSelected = selectedCategoryFilter === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategoryFilter(cat.id);
                        setCurrentPage(1);
                        void loadProducts(searchQuery, 1, pageSize, stockStatusFilter, cat.id);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold transition-all shrink-0 cursor-pointer ${
                        isSelected
                          ? 'bg-brand-dark text-white shadow-2xs'
                          : 'bg-surface-2 text-ink-muted border border-line hover:text-brand hover:border-brand'
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>

              <div className="h-5 w-[1px] bg-line hidden sm:block" />

              <button
                type="button"
                onClick={() => setShowCategoryModal(true)}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-2 border border-line text-ink-muted hover:text-ink text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                title="إضافة وتعديل وأرشفة وترتيب أقسام السلع"
              >
                <Tags className="w-3.5 h-3.5 text-brand" />
                <span>إدارة التصنيفات</span>
              </button>
            </div>
          </div>

          {/* Active Stock Filter Notification */}
          {stockStatusFilter !== 'all' && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold shrink-0 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {stockStatusFilter === 'lowStock'
                    ? `تصفية النواقص: يتم عرض الأصناف التي كميتها أقل من أو تساوي حد الطلب (${totalCount.toLocaleString('en-US')} صنف)`
                    : `تصفية النافد: يتم عرض الأصناف التي نفدت تماماً من المخزن (${totalCount.toLocaleString('en-US')} صنف)`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStockStatusFilter('all');
                  setCurrentPage(1);
                  onResetFilter?.();
                  void loadProducts(searchQuery, 1, pageSize, 'all');
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
            onOpenBulkPriceAdjustment={() => setShowBulkPriceModal(true)}
            onBulkDelete={() => setShowBulkDeleteConfirm(true)}
            onBulkPrintLabels={() => {
              setLabelModalProduct(null);
              setShowBarcodeLabelModal(true);
            }}
            onClearSelection={() => setSelectedProductIds([])}
            onSelectProdForMovements={(prod) => setSelectedProdForMovements(prod)}
            onSelectProdForAdjustment={(prod) => setSelectedProdForAdjustment(prod)}
            onSelectProdForPurchase={(prod) => setSelectedProdForPurchase(prod)}
            onOpenPriceHistory={(prod) => openPriceHistory(prod)}
            onEditProduct={(prod) => openEditModal(prod)}
            onDeleteProduct={(prod) => setProductToDelete(prod)}
            onPrintLabel={(prod) => {
              setLabelModalProduct(prod);
              setShowBarcodeLabelModal(true);
            }}
            onViewVariants={(prod) => setSelectedParentForVariants(prod)}
            onNavigateToBatches={isEnabled('feature_expiry_dates') ? (prodName) => {
              setBatchesInitialSearch(prodName);
              if (onSubViewChange) {
                onSubViewChange('batches');
              }
            } : undefined}
          />

          {/* Pagination Bar */}
          <PaginationBar
            currentPage={currentPage}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={(page) => {
              setCurrentPage(page);
              void loadProducts(searchQuery, page, pageSize);
            }}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
              void loadProducts(searchQuery, 1, size);
            }}
            pageSizeOptions={[50, 100, 250]}
            itemLabel="صنف"
          />
        </>
      ) : activeSubView === 'movements' ? (
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
      ) : (
        /* Batches & Expiry Dates Tab (Story 93 / Feature #60) */
        <BatchesTab 
          onBatchChanged={() => void loadProducts(searchQuery)} 
          initialSearchQuery={batchesInitialSearch}
        />
      )}

      {/* 3. Add/Edit Product Modal Subcomponent */}
      <ProductFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        editingId={editingId}
        name={name}
        setName={setName}
        onOpenVariantMatrix={() => {
          setShowModal(false);
          setShowVariantMatrixModal(true);
        }}
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
        variantSize={variantSize}
        setVariantSize={setVariantSize}
        variantColor={variantColor}
        setVariantColor={setVariantColor}
        initialExpiryDate={initialExpiryDate}
        setInitialExpiryDate={setInitialExpiryDate}
        initialBatchNumber={initialBatchNumber}
        setInitialBatchNumber={setInitialBatchNumber}
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

      {/* Product Variant Matrix Modal (Story 104 - Feature #114) */}
      <ProductVariantMatrixModal
        isOpen={showVariantMatrixModal}
        onClose={() => setShowVariantMatrixModal(false)}
        onSuccess={(result) => {
          void rafiqAlert({
            title: 'تم إنشاء مصفوفة المقاسات والألوان بنجاح!',
            message: `تم إنشاء المنتج الأساسي "${result.parentProduct.name}" مع ${result.totalVariantsCount} تركيبة، بإجمالي رصيد ${result.totalStockMilli / 1000} قطعة.`,
            variant: 'info'
          });
          void loadProducts('');
        }}
        categories={categories}
      />

      {/* Product Variants List Details Modal */}
      <ProductVariantsListModal
        isOpen={selectedParentForVariants !== null}
        onClose={() => setSelectedParentForVariants(null)}
        parentProduct={selectedParentForVariants}
        onOpenMatrixModal={() => {
          setShowVariantMatrixModal(true);
        }}
        onPrintVariantLabel={(v) => {
          if (selectedParentForVariants) {
            setLabelModalProduct({
              id: v.variantProductId,
              name: `${selectedParentForVariants.name} - ${v.color} - ${v.size}`,
              barcode: v.barcode,
              pricePiasters: v.pricePiasters,
              costPiasters: v.costPiasters,
              stockQuantityMilli: v.stockQuantityMilli,
              unit: 'piece',
              taxRatePercent: selectedParentForVariants.taxRatePercent || 0,
              isActive: true,
              categoryId: selectedParentForVariants.categoryId,
              createdAt: v.createdAt,
              updatedAt: v.updatedAt,
            });
            setShowBarcodeLabelModal(true);
          }
        }}
      />

      {/* Barcode Label Printing Modal (Story 105 - Feature #57) */}
      <BarcodeLabelModal
        isOpen={showBarcodeLabelModal}
        onClose={() => {
          setShowBarcodeLabelModal(false);
          setLabelModalProduct(null);
        }}
        preselectedProduct={labelModalProduct}
      />

      {/* Bulk Price Adjustment Modal (Story 106 - Feature #116) */}
      <BulkPriceAdjustmentModal
        isOpen={showBulkPriceModal}
        onClose={() => setShowBulkPriceModal(false)}
        categories={categories}
        selectedProductIds={selectedProductIds}
        onSuccess={(msg) => {
          setImportSuccessAlert(msg);
          void loadProducts(searchQuery, currentPage, pageSize, stockStatusFilter, selectedCategoryFilter);
        }}
      />

      {/* Data Quality Health Audit Modal (Story 107 - Feature #117) */}
      <DataQualityAuditModal
        isOpen={showDataQualityModal}
        onClose={() => setShowDataQualityModal(false)}
        onProductUpdated={() => void loadProducts(searchQuery, currentPage, pageSize)}
        onFixProduct={(productId) => {
          setShowDataQualityModal(false);
          const found = products.find(p => p.id === productId);
          if (found) {
            openEditModal(found);
          } else {
            void invoke<Product>('products:getById', { id: productId }).then(p => {
              if (p) openEditModal(p);
            });
          }
        }}
      />

      {/* Confirm Bulk Barcode Generation Modal (Feature #119 / Story 108) */}
      <ConfirmModal
        isOpen={showBulkBarcodeConfirm}
        title="توليد باركود داخلي قياسي للأصناف الناقصة"
        message={`تم العثور على ${missingBarcodeCount} صنف نشط بدون باركود في الكتالوج. هل تريد توليد باركودات داخلية قياسية موحدة (EAN-13 مع بادئة 200) لها جميعاً دفعة واحدة؟`}
        consequence="سيتم تعيين باركود فريد لكل صنف تلقائياً، ويمكنك طباعة ملصقات الباركود فور الانتهاء."
        confirmText={`توليد الباركودات (${missingBarcodeCount} صنف)`}
        cancelText="إلغاء وتراجع"
        isDanger={false}
        onConfirm={() => void handleConfirmBulkBarcodeGeneration()}
        onCancel={() => setShowBulkBarcodeConfirm(false)}
      />
    </div>
  );
};
