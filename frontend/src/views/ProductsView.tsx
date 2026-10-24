import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { FormEvent } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
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
  Undo2,
  ShieldAlert,
  BookOpen,
  RotateCcw,
  ClipboardCheck,
  BarChart3,
  Printer,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import { openHelpCenter } from '../utils/helpService';
import { rafiqAlert } from '../utils/dialogService';
import type { Product, Category, StockMovement, StockDiscrepancy, ProductUnit, BulkGenerateBarcodesResult, BulkPriceRevertResult, StorageLocation } from '../types/models';
import type { ProductPharmaInfo } from '../types/pharma';
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
import { ControlledDrugsRegisterModal } from '../components/ControlledDrugsRegisterModal';
import { DrugReferenceImportModal } from '../components/DrugReferenceImportModal';
import { ExpiryReturnsModal } from '../components/ExpiryReturnsModal';
import { PharmacyStocktakingModal } from '../components/PharmacyStocktakingModal';
import { SpecializedPharmacyReportsModal } from '../components/SpecializedPharmacyReportsModal';
import { DosageLabelModal } from '../components/DosageLabelModal';
import { useFeatures } from '../context/useFeatures';
import { useAuth } from '../context/useAuth';
import { ProductFormModal } from './products/ProductFormModal';
import { BulkMinStockModal } from './products/BulkMinStockModal';
import { StockMovementsTab } from './products/StockMovementsTab';
import { BatchesTab } from './products/BatchesTab';
import { ProductsTable } from './products/ProductsTable';
import { BulkPriceAdjustmentModal } from './products/BulkPriceAdjustmentModal';
import { StorageLocationsModal } from './products/StorageLocationsModal';

export interface ProductsViewProps {
  isActive?: boolean;
  subView?: 'catalog' | 'movements' | 'batches';
  onSubViewChange?: (view: 'catalog' | 'movements' | 'batches') => void;
  initialFilter?: 'all' | 'lowStock' | 'outOfStock';
  onResetFilter?: () => void;
  initialProductIdToEdit?: string | null;
  onClearInitialProductIdToEdit?: () => void;
}

export const ProductsView: React.FC<ProductsViewProps> = ({ 
  isActive = true,
  subView, 
  onSubViewChange,
  initialFilter = 'all', 
  onResetFilter,
  initialProductIdToEdit,
  onClearInitialProductIdToEdit
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
  const [bulkPriceUndoBatchId, setBulkPriceUndoBatchId] = useState<string | null>(null);
  const [isRevertingBulkPrice, setIsRevertingBulkPrice] = useState(false);
  const [showVariantMatrixModal, setShowVariantMatrixModal] = useState(false);
  const [matrixParentProduct, setMatrixParentProduct] = useState<Product | null>(null);
  const [selectedParentForVariants, setSelectedParentForVariants] = useState<Product | null>(null);
  const [batchesInitialSearch, setBatchesInitialSearch] = useState<string>('');
  const { isEnabled } = useFeatures();
  const { hasPermission } = useAuth();

  // Barcode Label Printing Modal State (Feature #57 / Tasks 57-1 to 57-4)
  const [showBarcodeLabelModal, setShowBarcodeLabelModal] = useState(false);
  const [labelModalProduct, setLabelModalProduct] = useState<Product | null>(null);
  const [showControlledRegisterModal, setShowControlledRegisterModal] = useState(false);
  const [showDrugReferenceModal, setShowDrugReferenceModal] = useState(false);
  const [showExpiryReturnsModal, setShowExpiryReturnsModal] = useState(false);
  const [showPharmaStocktakingModal, setShowPharmaStocktakingModal] = useState(false);
  const [showPharmaReportsModal, setShowPharmaReportsModal] = useState(false);
  const [showDosageLabelModal, setShowDosageLabelModal] = useState(false);

  // Bulk Price Adjustment Modal State (Story 106 - Feature #116)
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);

  // Data Quality Health Audit Modal State (Story 107 - Feature #117)
  const [showDataQualityModal, setShowDataQualityModal] = useState(false);

  // Packaging & Loose Selling State (Feature #183)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isLooseSellable, setIsLooseSellable] = useState<boolean>(false);
  const [defaultSaleUnitId, setDefaultSaleUnitId] = useState<string | null>(null);
  const [defaultPurchaseUnitId, setDefaultPurchaseUnitId] = useState<string | null>(null);

  // Storage Locations & Cold Chain State (Feature #185 / Story 128)
  const [locationId, setLocationId] = useState<string>('');
  const [isColdChain, setIsColdChain] = useState<boolean>(false);
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>([]);
  const [showStorageLocationsModal, setShowStorageLocationsModal] = useState<boolean>(false);

  // Pharmacy Module State (Feature #187 / Story 130)
  const initialPharmaInfo: ProductPharmaInfo = useMemo(() => ({
    productId: '',
    scientificName: '',
    dosageFormId: null,
    dosageFormName: null,
    manufacturerId: null,
    manufacturerName: null,
    therapeuticClassId: null,
    therapeuticClassName: null,
    routeOfAdministration: 'oral',
    isPrescriptionOnly: false,
    isAntibiotic: false,
    isRefrigerated: false,
    pregnancyCategory: '',
    storageConditions: '',
    dosageInstructions: '',
    ingredients: [],
  }), []);
  const [pharmaInfo, setPharmaInfo] = useState<ProductPharmaInfo>(initialPharmaInfo);

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
      const timeoutMs = bulkPriceUndoBatchId ? 10000 : 3500;
      const timer = setTimeout(() => {
        setImportSuccessAlert(null);
        setBulkPriceUndoBatchId(null);
      }, timeoutMs);
      return () => clearTimeout(timer);
    }
  }, [importSuccessAlert, bulkPriceUndoBatchId]);

  const handleUndoBulkPrice = async () => {
    if (!bulkPriceUndoBatchId) return;
    setIsRevertingBulkPrice(true);
    try {
      const res = await invoke<BulkPriceRevertResult>('products:revertBulkPriceAdjustment', {
        batchId: bulkPriceUndoBatchId,
      });
      if (res.success) {
        setBulkPriceUndoBatchId(null);
        setImportSuccessAlert(res.message || 'تم التراجع عن تعديل الأسعار بنجاح وإعادة الأصناف لأسعارها السابقة');
        void loadProducts(searchQuery, currentPage, pageSize, stockStatusFilter, selectedCategoryFilter);
      } else {
        await rafiqAlert({ message: res.message || 'فشل التراجع عن التعديل', title: 'تنبيه', variant: 'warning' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await rafiqAlert({ message: `فشل التراجع عن التعديل: ${msg}`, title: 'خطأ', variant: 'error' });
    } finally {
      setIsRevertingBulkPrice(false);
    }
  };

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

  const fetchStorageLocations = useCallback(async () => {
    try {
      const res = await invoke<StorageLocation[]>('locations:list', { onlyActive: false });
      if (Array.isArray(res)) {
        setStorageLocations(res);
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

  useDataSubscription(['products', 'all'], () => {
    void fetchStorageLocations();
  });

  useEffect(() => {
    if (isActive !== false) {
      void loadProducts();
      void fetchCategoriesList();
      void fetchStorageLocations();
    }
  }, [isActive, loadProducts, fetchCategoriesList, fetchStorageLocations]);

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
    setEditingProduct(null);
    setIsLooseSellable(false);
    setDefaultSaleUnitId(null);
    setDefaultPurchaseUnitId(null);
    setLocationId('');
    setIsColdChain(false);
    setPharmaInfo(initialPharmaInfo);
    setFormError('');
    setSimilarWarning(null);
    setBelowCostWarning(null);
    setShowModal(true);
  };

  const openEditModal = (prod: Product) => {
    setEditingId(prod.id);
    setEditingProduct(prod);
    setIsLooseSellable(prod.isLooseSellable ?? false);
    setDefaultSaleUnitId(prod.defaultSaleUnitId ?? null);
    setDefaultPurchaseUnitId(prod.defaultPurchaseUnitId ?? null);
    setLocationId(prod.locationId || '');
    setIsColdChain(Boolean(prod.isColdChain));
    setPharmaInfo(initialPharmaInfo);
    if (isEnabled('feature_pharmacy')) {
      void invoke<ProductPharmaInfo>('pharma:getInfo', { productId: prod.id }).then((pInfo) => {
        if (pInfo && pInfo.productId) {
          setPharmaInfo(pInfo);
        }
      }).catch(() => null);
    }
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
    if (prod.units && prod.units.length > 1) {
      setProductUnits(prod.units);
    } else {
      setProductUnits(prod.units && prod.units.length === 1 ? prod.units : [{
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
          setEditingProduct(prev => prev ? { ...prev, units } : prev);
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

  // Open edit modal if navigated with a specific product ID (e.g. from Dead Stock Radar)
  useEffect(() => {
    if (!initialProductIdToEdit) return;
    const found = products.find(p => p.id === initialProductIdToEdit);
    if (found) {
      openEditModal(found);
      onClearInitialProductIdToEdit?.();
    } else {
      void invoke<Product>('products:getById', { id: initialProductIdToEdit }).then((prod) => {
        if (prod && prod.id) {
          openEditModal(prod);
        }
        onClearInitialProductIdToEdit?.();
      }).catch(() => {
        onClearInitialProductIdToEdit?.();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductIdToEdit, products, onClearInitialProductIdToEdit]);

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
          title: 'الباركودات تمام',
          message: 'كل بضاعة وأصناف المحل ليها باركود متسجل بالفعل ومافيش نواقص.',
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
          title: 'تم عمل الباركودات بنجاح',
          message: `تم بنجاح عمل وتثبيت باركود داخلي قياسي (EAN-13) لـ ${res.count} صنف! تقدر دلوقتي تطبع استيكرات الباركود ليهم من زرار طباعة الاستيكرات (F8).`,
          variant: 'success'
        });
      } else {
        await rafiqAlert({
          title: 'تنبيه',
          message: res?.message || 'فشلت عملية عمل الباركودات الجماعية.',
          variant: 'warning'
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await rafiqAlert({
        title: 'خطأ في العملية',
        message: `حصل خطأ أثناء عمل الباركودات: ${msg}`,
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
      const cleanPrimary = barcode.trim();
      const extraBarcodes = Array.from(new Set(
        additionalBarcodes
          .map(b => b.trim())
          .filter(b => b && b !== cleanPrimary)
      ));
      const primaryBarcode = cleanPrimary || (extraBarcodes.length > 0 ? extraBarcodes[0] : null);
      const remainingExtra = primaryBarcode ? extraBarcodes.filter(b => b !== primaryBarcode) : extraBarcodes;

      const parsedStock = parseFloat(normalizeArabicNumerals(stockInput)) || 0;
      const stockQuantityMilli = Math.round(parsedStock * 1000);
      const parsedMinStock = parseFloat(normalizeArabicNumerals(minStockInput)) || 0;
      const minStockQuantityMilli = Math.round(parsedMinStock * 1000);

      const synchronizedUnits = productUnits.map(u => {
        if (u.isBaseUnit) {
          const keepExistingPrice = productUnits.length > 1 && u.sellPricePiasters > 0;
          return {
            ...u,
            sellPricePiasters: keepExistingPrice ? u.sellPricePiasters : pricePiasters,
            costPricePiasters: keepExistingPrice ? u.costPricePiasters : costPiasters,
            barcode: primaryBarcode,
            unitName: u.unitName.trim() || (unit === 'kg' ? 'كيلو' : 'قطعة'),
            isDivisible: unit === 'kg' || u.isDivisible
          };
        }
        return u;
      });

      const productPayload: Partial<Product> & { confirmSimilarName?: boolean; confirmBelowCost?: boolean } = {
        name: name.trim(),
        barcode: primaryBarcode,
        barcodes: remainingExtra,
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
        isLooseSellable,
        defaultSaleUnitId: defaultSaleUnitId || null,
        defaultPurchaseUnitId: defaultPurchaseUnitId || null,
        locationId: locationId || null,
        isColdChain: Boolean(isColdChain),
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
      if (saved && isEnabled('feature_pharmacy')) {
        await invoke('pharma:saveInfo', {
          ...pharmaInfo,
          productId: saved.id,
        }).catch(() => null);
      }
      if (saved) {
        setProducts(prev => prev.map(p => p.id === saved.id ? { ...p, ...saved } : p));
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
    <div className="flex flex-col h-full bg-canvas dark:bg-canvas-dark p-3.5 gap-3 overflow-hidden select-none">
      {/* 1. Header Toolbar (Title, Count Badge, Search, Add Button) */}
      <div className="min-h-[58px] py-2 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl px-4 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          {activeSubView === 'catalog' ? (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center border border-brand/20 shadow-2xs">
                <Package className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-ink dark:text-ink-dark leading-tight">أصناف وبضاعة المحل</h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark font-bold border border-line dark:border-line-dark tabular-nums">
                    {totalCount.toLocaleString('en-US')} صنف
                  </span>
                </div>
                <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted">أسعار البضاعة، الباركود، رصيد المخزن، وتنبيهات النواقص</p>
              </div>
            </div>
          ) : activeSubView === 'movements' ? (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center border border-brand/20 shadow-2xs">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-ink dark:text-ink-dark leading-tight">دفتر حركة وجرد بضاعة المخزن</h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-surface-2 dark:bg-surface-dark-2 text-ink dark:text-ink-dark font-bold border border-line dark:border-line-dark tabular-nums">
                    {allMovements.length} حركة
                  </span>
                  {discrepancies.length > 0 && (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright animate-pulse">
                      {discrepancies.length} صنف محتاج مطابقة وعدّ في المخزن
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted">سجل الوارد والمبيعات والمرتجعات وتسويات وعدّ بضاعة المحل</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright flex items-center justify-center border border-warn/20 dark:border-warn-bright/30 shadow-2xs">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-ink dark:text-ink-dark leading-tight">تواريخ الصلاحية والتشغيلات</h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-bold border border-paid/20 dark:border-paid/40">
                    اللي قرب ينتهي يتباع الأول
                  </span>
                </div>
                <p className="text-[11px] text-ink-muted dark:text-ink-dark-muted">متابعة صلاحية البضاعة، تنبيهات قرب الانتهاء، وتوالف الصلاحية</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Search Input & Action Toolbar */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {activeSubView === 'catalog' ? (
            <>
              <form onSubmit={handleSearch} className="flex items-center gap-1.5">
                <div className="relative w-48 sm:w-60 h-9 flex items-center bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-2.5 focus-within:border-brand dark:focus-within:border-brand-bright focus-within:ring-2 focus-within:ring-brand/20 focus-within:bg-surface dark:focus-within:bg-surface-dark transition-all">
                  <Search className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted ml-2 shrink-0 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="اكتب اسم الصنف أو اضرب الباركود..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(normalizeArabicNumerals(e.target.value))}
                    className="w-full bg-transparent border-none text-xs text-ink dark:text-ink-dark placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted focus:outline-none"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setCurrentPage(1);
                        void loadProducts('', 1, pageSize);
                      }}
                      className="text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark text-xs cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="h-9 px-3 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold transition-colors shadow-2xs cursor-pointer"
                >
                  بحث
                </button>
              </form>

              {/* Senior Tools & Operations Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsToolsDropdownOpen((prev) => !prev)}
                  className={`h-9 px-3 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border text-ink dark:text-ink-dark rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer ${
                    isToolsDropdownOpen ? 'border-brand dark:border-brand-bright ring-2 ring-brand/20 bg-surface-2 dark:bg-surface-dark-2' : 'border-line dark:border-line-dark'
                  }`}
                  title="العمليات المتقدمة، الاستيراد والتصدير، والباركود"
                >
                  <Tag className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>أدوات وبضاعة المحل</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted transition-transform duration-150 ${isToolsDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isToolsDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsToolsDropdownOpen(false)} 
                    />
                    <div className="absolute left-0 top-full mt-1.5 w-64 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-card py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          setShowExcelImportModal(true);
                        }}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-brand dark:text-brand-bright" />
                        <span>استيراد بضاعة من شيت إكسل</span>
                      </button>

                      {isEnabled('feature_drug_reference') && hasPermission('pharma.drug_reference.import') && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsDropdownOpen(false);
                            setShowDrugReferenceModal(true);
                          }}
                          className="w-full px-3 py-2 text-right text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 flex items-center gap-2.5 transition-colors cursor-pointer text-emerald-800 dark:text-emerald-300"
                        >
                          <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>دليل الأدوية المرجعي الخارجي</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          void handleExportProductsToExcel();
                        }}
                        disabled={isExportingExcel}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-4 h-4 text-brand dark:text-brand-bright" />
                        <span>تصدير كل البضاعة لملف إكسل</span>
                      </button>

                      <div className="h-px bg-line dark:bg-line-dark my-1" />

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          setLabelModalProduct(null);
                          setShowBarcodeLabelModal(true);
                        }}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Tag className="w-4 h-4 text-brand dark:text-brand-bright" />
                        <span>طباعة استيكرات الباركود والأسعار (F8)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          void handleStartBulkBarcodeGeneration();
                        }}
                        disabled={isGeneratingBarcodes || loading}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 flex items-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Barcode className="w-4 h-4 text-brand dark:text-brand-bright" />
                        <span>عمل باركود تلقائي للأصناف اللي من غير كود</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          setShowBulkPriceModal(true);
                        }}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <TrendingUp className="w-4 h-4 text-brand dark:text-brand-bright" />
                        <span>تعديل أسعار وتكلفة البضاعة بالجملة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          setShowVariantMatrixModal(true);
                        }}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
                        <span>جدول المقاسات والألوان (الأصناف المتفرعة)</span>
                      </button>

                      {isEnabled('feature_shelf_locations') && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsDropdownOpen(false);
                            setShowStorageLocationsModal(true);
                          }}
                          className="w-full px-3 py-2 text-right text-xs font-bold text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
                          <span>إدارة مواقع التخزين والرفوف والأدراج</span>
                        </button>
                      )}

                      {isEnabled('feature_pharmacy') && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsDropdownOpen(false);
                            setShowControlledRegisterModal(true);
                          }}
                          className="w-full px-3 py-2 text-right text-xs font-bold text-warn hover:bg-warn-soft/20 flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <ShieldAlert className="w-4 h-4 text-warn" />
                          <span>دفتر أدوية الجدول والتفتيش الصيدلي</span>
                        </button>
                      )}

                      {isEnabled('feature_expiry_returns') && hasPermission('pharma.expiry_returns.manage') && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsDropdownOpen(false);
                            setShowExpiryReturnsModal(true);
                          }}
                          className="w-full px-3 py-2 text-right text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-500/10 flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          <span>مرتجعات الصلاحية ومحاضر الإعدام</span>
                        </button>
                      )}

                      {isEnabled('feature_pharmacy') && hasPermission('pharma.stocktaking.manage') && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsDropdownOpen(false);
                            setShowPharmaStocktakingModal(true);
                          }}
                          className="w-full px-3 py-2 text-right text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/10 flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <ClipboardCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>الجرد الصيدلي المتقدم وحصر الفروقات</span>
                        </button>
                      )}

                      {isEnabled('feature_pharmacy') && hasPermission('reports.pharma.view') && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsDropdownOpen(false);
                            setShowPharmaReportsModal(true);
                          }}
                          className="w-full px-3 py-2 text-right text-xs font-bold text-brand dark:text-brand-bright hover:bg-brand-soft/30 flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <BarChart3 className="w-4 h-4 text-brand dark:text-brand-bright" />
                          <span>خريطة الصلاحيات والتقارير الصيدلية</span>
                        </button>
                      )}

                      {isEnabled('feature_pharmacy') && hasPermission('pharma.dosage_labels.print') && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsToolsDropdownOpen(false);
                            setShowDosageLabelModal(true);
                          }}
                          className="w-full px-3 py-2 text-right text-xs font-bold text-teal-800 dark:text-teal-300 hover:bg-teal-500/10 flex items-center gap-2.5 transition-colors cursor-pointer"
                        >
                          <Printer className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                          <span>طباعة ملصق جرعة حراري (استيكر صيدلي)</span>
                        </button>
                      )}

                      <div className="h-px bg-line dark:bg-line-dark my-1" />

                      <button
                        type="button"
                        onClick={() => {
                          setIsToolsDropdownOpen(false);
                          setShowDataQualityModal(true);
                        }}
                        className="w-full px-3 py-2 text-right text-xs font-bold text-paid dark:text-paid-bright hover:bg-paid-soft dark:hover:bg-paid-dark-soft flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4 text-paid dark:text-paid-bright" />
                        <span>فحص وتدقيق بيانات وأسعار الأصناف</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => openHelpCenter('products')}
                className="h-9 w-9 flex items-center justify-center bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-paid dark:text-paid-bright rounded-xl transition-colors shadow-2xs cursor-pointer shrink-0"
                title="شرح ودليل إدارة الأصناف والمخزون والباركود (F1)"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              {isEnabled('feature_matrix_variants') && (
                <button
                  type="button"
                  onClick={() => setShowVariantMatrixModal(true)}
                  className="h-9 px-3 bg-brand-soft dark:bg-brand-soft/20 hover:bg-emerald-100 dark:hover:bg-brand-soft/30 text-brand dark:text-brand-bright border border-brand/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-[0.98] shrink-0"
                  title="إنشاء صنف أب مع جدول تركيبات المقاسات والألوان والباركود"
                >
                  <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>مقاسات وألوان</span>
                </button>
              )}

              {isEnabled('feature_shelf_locations') && (
                <button
                  type="button"
                  onClick={() => setShowStorageLocationsModal(true)}
                  className="h-9 px-3 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-[0.98] shrink-0"
                  title="إدارة مواقع التخزين والرفوف والأدراج وسلسلة التبريد"
                >
                  <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>الرفوف والمواقع</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowCategoryModal(true)}
                className="h-9 px-3 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer active:scale-[0.98] shrink-0"
                title="إضافة وتعديل وأرشفة وترتيب أقسام السلع"
              >
                <Tags className="w-4 h-4 text-brand dark:text-brand-bright" />
                <span>إدارة الأقسام</span>
              </button>

              <button
                onClick={openAddModal}
                className="h-9 px-3.5 bg-brand hover:bg-brand-dark dark:hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-[0.98] shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>صنف جديد</span>
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Success Notification Alert */}
      {importSuccessAlert && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 text-[#006D41] dark:text-paid-bright px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-bold animate-in fade-in shrink-0 shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-[#006D41] dark:text-paid-bright" />
            <span>{importSuccessAlert}</span>
            {bulkPriceUndoBatchId && (
              <button
                type="button"
                onClick={() => void handleUndoBulkPrice()}
                disabled={isRevertingBulkPrice}
                className="mr-3 px-2.5 py-1 rounded-lg bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright hover:bg-warn hover:text-white border border-warn/40 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="تراجع فوري عن تعديل الأسعار الأخير وإعادة الأسعار السابقة"
              >
                <Undo2 className={`w-3.5 h-3.5 ${isRevertingBulkPrice ? 'animate-spin' : ''}`} />
                <span>{isRevertingBulkPrice ? 'جاري التراجع...' : 'تراجع عن تعديل الأسعار الآن'}</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setImportSuccessAlert(null);
              setBulkPriceUndoBatchId(null);
            }}
            className="text-[#006D41] dark:text-paid-bright hover:text-[#00372D] dark:hover:text-white p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {activeSubView === 'catalog' ? (
        <>
          {/* Unified Filter Toolbar (Stock Levels + Categories + Category Management) */}
          <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl p-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0 select-none shadow-xs">
            {/* Quick Stock Level Tabs */}
            <div className="flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 p-1 rounded-xl border border-line dark:border-line-dark">
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
                    ? 'bg-brand dark:bg-brand text-white shadow-xs'
                    : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark'
                }`}
              >
                <span>كل الأصناف</span>
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
                    ? 'bg-warn text-white shadow-xs'
                    : 'text-warn dark:text-warn-bright hover:bg-warn-soft dark:hover:bg-warn-dark-soft'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>نواقص</span>
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
                    ? 'bg-danger text-white shadow-xs'
                    : 'text-danger dark:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft'
                }`}
              >
                <span>خلصان</span>
              </button>
            </div>

            {/* Department / Category Filter */}
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0 justify-end">
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 custom-scrollbar">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryFilter('all');
                    setCurrentPage(1);
                    void loadProducts(searchQuery, 1, pageSize, stockStatusFilter, 'all');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11.5px] font-bold transition-all shrink-0 cursor-pointer ${
                    selectedCategoryFilter === 'all'
                      ? 'bg-brand-dark dark:bg-brand text-white shadow-2xs'
                      : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark hover:text-brand dark:hover:text-brand-bright hover:border-brand dark:hover:border-brand-bright'
                  }`}
                >
                  كل الأقسام
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
                          ? 'bg-brand-dark dark:bg-brand text-white shadow-2xs'
                          : 'bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark hover:text-brand dark:hover:text-brand-bright hover:border-brand dark:hover:border-brand-bright'
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Stock Filter Notification */}
          {stockStatusFilter !== 'all' && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 text-warn dark:text-warn-bright text-xs font-bold shrink-0 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warn dark:text-warn-bright shrink-0" />
                <span>
                  {stockStatusFilter === 'lowStock'
                    ? `تصفية النواقص: الأصناف اللي قربت تخلص في المخزن (${totalCount.toLocaleString('en-US')} صنف)`
                    : `تصفية الخلصان: الأصناف اللي رصيدها صفر وخلصت من المخزن (${totalCount.toLocaleString('en-US')} صنف)`}
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
                className="px-2 py-0.5 rounded bg-white dark:bg-surface-dark hover:bg-warn-soft dark:hover:bg-warn-dark-soft border border-warn/30 dark:border-warn-bright/30 text-warn dark:text-warn-bright text-[11px] font-bold transition-colors cursor-pointer"
              >
                إلغاء التصفية وعرض كل البضاعة
              </button>
            </div>
          )}

          {/* 2. Products Data Table Subcomponent */}
          <ProductsTable
            products={displayedProducts}
            loading={loading}
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
        isLooseSellable={isLooseSellable}
        setIsLooseSellable={setIsLooseSellable}
        defaultSaleUnitId={defaultSaleUnitId}
        setDefaultSaleUnitId={setDefaultSaleUnitId}
        defaultPurchaseUnitId={defaultPurchaseUnitId}
        setDefaultPurchaseUnitId={setDefaultPurchaseUnitId}
        editingProduct={editingProduct}
        initialExpiryDate={initialExpiryDate}
        setInitialExpiryDate={setInitialExpiryDate}
        initialBatchNumber={initialBatchNumber}
        setInitialBatchNumber={setInitialBatchNumber}
        locationId={locationId}
        setLocationId={setLocationId}
        isColdChain={isColdChain}
        setIsColdChain={setIsColdChain}
        storageLocations={storageLocations}
        onOpenStorageLocationsModal={() => setShowStorageLocationsModal(true)}
        pharmaInfo={pharmaInfo}
        setPharmaInfo={setPharmaInfo}
      />

      {/* Confirm Product Delete Modal (Feature #112 / Task 112-2) */}
      <ConfirmModal
        isOpen={!!productToDelete}
        title="مسح صنف من المحل"
        message={`متأكد إنك عايز تمسح الصنف "${productToDelete?.name}" من المحل؟`}
        consequence="الصنف مش هيظهر في شاشة البيع، وفواتيره القديمة هتفضل محفوظة زي ما هي بأمان."
        confirmText="أيوه، امسح الصنف"
        cancelText="إلغاء وتراجع"
        isDanger={true}
        onConfirm={() => void confirmDeleteProduct()}
        onCancel={() => setProductToDelete(null)}
      />

      {/* Confirm Bulk Product Delete Modal */}
      <ConfirmModal
        isOpen={showBulkDeleteConfirm}
        title="مسح الأصناف المحددة دفعة واحدة"
        message={`متأكد إنك عايز تمسح ${selectedProductIds.length} صنف دفعة واحدة من المحل؟`}
        consequence="الأصناف دي مش هتظهر في شاشة البيع، وفواتيرها القديمة هتفضل محفوظة زي ما هي بأمان."
        confirmText={`أيوه، امسح (${selectedProductIds.length}) صنف`}
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
        onClose={() => {
          setShowVariantMatrixModal(false);
          setMatrixParentProduct(null);
        }}
        parentProduct={matrixParentProduct}
        onSuccess={(result) => {
          void rafiqAlert({
            title: 'تم حفظ مصفوفة المقاسات والألوان بنجاح!',
            message: `تم حفظ المنتج الأساسي "${result.parentProduct.name}" مع ${result.totalVariantsCount} تركيبة، بإجمالي رصيد ${result.totalStockMilli / 1000} قطعة.`,
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
          setMatrixParentProduct(selectedParentForVariants);
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
        onSuccess={(msg, batchId) => {
          setImportSuccessAlert(msg);
          if (batchId) setBulkPriceUndoBatchId(batchId);
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
        title="عمل باركود داخلي للأصناف اللي ملهاش كود"
        message={`لقينا ${missingBarcodeCount} صنف شغالين في المحل من غير باركود. تحب نعملهم باركودات داخلية قياسية موحدة (EAN-13 بتبدأ بـ 200) دفعة واحدة عشان تقدر تضربهم بالاسكانر وتطبعلهم استيكرات؟`}
        consequence="السيستم هيعمل كود فريد لكل صنف تلقائياً، وهتقدر تطبع استيكرات الباركود فوراً أول ما يخلص."
        confirmText={`أيوه، اعمل الباركودات (${missingBarcodeCount} صنف)`}
        cancelText="إلغاء وتراجع"
        isDanger={false}
        onConfirm={() => void handleConfirmBulkBarcodeGeneration()}
        onCancel={() => setShowBulkBarcodeConfirm(false)}
      />

      {/* Storage Locations & Cold Chain Management Modal (Feature #185 / Story 128) */}
      <StorageLocationsModal
        isOpen={showStorageLocationsModal}
        onClose={() => setShowStorageLocationsModal(false)}
        onLocationUpdated={() => {
          void fetchStorageLocations();
          void loadProducts(searchQuery, currentPage, pageSize, stockStatusFilter, selectedCategoryFilter);
        }}
      />

      {/* Official Controlled Drugs Register Modal (Story 131 / Feature #188) */}
      <ControlledDrugsRegisterModal
        isOpen={showControlledRegisterModal}
        onClose={() => setShowControlledRegisterModal(false)}
      />

      {/* Drug Reference Directory Modal (Feature #191 / Story 134) */}
      <DrugReferenceImportModal
        isOpen={showDrugReferenceModal}
        onClose={() => setShowDrugReferenceModal(false)}
        onSuccess={(msg) => setImportSuccessAlert(msg)}
      />

      {/* Expiry Returns & Write-offs Modal (Feature #191 / Story 134) */}
      <ExpiryReturnsModal
        isOpen={showExpiryReturnsModal}
        onClose={() => setShowExpiryReturnsModal(false)}
        onSuccess={(msg) => setImportSuccessAlert(msg)}
      />

      {/* Specialized Pharmacy Stocktaking Modal (Feature #192 / Story 135) */}
      <PharmacyStocktakingModal
        isOpen={showPharmaStocktakingModal}
        onClose={() => setShowPharmaStocktakingModal(false)}
        onStocktakingCompleted={() => {
          void loadProducts(searchQuery, currentPage, pageSize, stockStatusFilter, selectedCategoryFilter);
        }}
      />

      {/* Specialized Pharmacy Reports & Expiry Heatmap Modal (Feature #192 / Story 135) */}
      <SpecializedPharmacyReportsModal
        isOpen={showPharmaReportsModal}
        onClose={() => setShowPharmaReportsModal(false)}
      />

      {/* Thermal Dosage Label Modal (Feature #192 / Story 135) */}
      <DosageLabelModal
        isOpen={showDosageLabelModal}
        onClose={() => setShowDosageLabelModal(false)}
      />
    </div>
  );
};
