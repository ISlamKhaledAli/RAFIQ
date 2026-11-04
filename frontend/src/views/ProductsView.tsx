import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Trash2,
  Sliders,
  FlaskConical,
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useDataSubscription } from '../utils/eventBus';
import { openHelpCenter } from '../utils/helpService';
import { rafiqAlert } from '../utils/dialogService';
import type { Product, Category, StockMovement, StockDiscrepancy, ProductUnit, BulkGenerateBarcodesResult, BulkPriceRevertResult, StorageLocation, ProductBatch } from '../types/models';
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
import { DrugInteractionManagerModal } from '../components/DrugInteractionManagerModal';
import { ModifierManagerModal } from '../components/ModifierManagerModal';
import { RecipeManagerModal } from '../components/RecipeManagerModal';
import { useFeatures } from '../context/useFeatures';
import { useAuth } from '../context/useAuth';
import { ProductFormModal } from './products/ProductFormModal';
import { canSaveProductUnits, unitsLoadBlockMessage, type UnitsLoadState } from './products/unitsLoadGuard';
import { BulkMinStockModal } from './products/BulkMinStockModal';
import { StockMovementsTab } from './products/StockMovementsTab';
import { BatchesTab } from './products/BatchesTab';
import { ProductsTable } from './products/ProductsTable';
import { BulkPriceAdjustmentModal } from './products/BulkPriceAdjustmentModal';
import { StorageLocationsModal } from './products/StorageLocationsModal';
import { SegmentedTabs, type SegmentedTabOption } from '../components/SegmentedTabs';
import { CustomSelect } from '../components/CustomSelect';
import { ToolsMenuGroup, ToolsMenuItem, ActiveFilterChip } from './products/ProductsToolbarParts';

type StockStatusFilter = 'all' | 'lowStock' | 'outOfStock';

const STOCK_STATUS_TABS: SegmentedTabOption<StockStatusFilter>[] = [
  { value: 'all', label: 'كل الأصناف' },
  { value: 'lowStock', label: 'نواقص', tone: 'warn' },
  { value: 'outOfStock', label: 'خلصان', tone: 'danger' },
];

const PRODUCTS_PAGE_SIZE_OPTIONS = [50, 100, 250];

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
  const [showModifierManagerModal, setShowModifierManagerModal] = useState(false);
  const [showRecipeManagerModal, setShowRecipeManagerModal] = useState(false);
  const [prevInitialFilter, setPrevInitialFilter] = useState(initialFilter);
  const [stockStatusFilter, setStockStatusFilter] = useState<StockStatusFilter>(initialFilter);

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
  const [unitsLoadState, setUnitsLoadState] = useState<UnitsLoadState>('ready');
  const unitsRequestRef = useRef(0);
  const [stockInput, setStockInput] = useState('10');
  const [stockAdjustReason, setStockAdjustReason] = useState('');
  const [minStockInput, setMinStockInput] = useState('5');
  const [taxRatePercent, setTaxRatePercent] = useState(0);
  const [variantSize, setVariantSize] = useState('');
  const [variantColor, setVariantColor] = useState('');
  const [initialExpiryDate, setInitialExpiryDate] = useState('');
  const [initialBatchNumber, setInitialBatchNumber] = useState('');
  const [existingBatchId, setExistingBatchId] = useState<string | null>(null);
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
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [matrixParentProduct, setMatrixParentProduct] = useState<Product | null>(null);
  const [selectedParentForVariants, setSelectedParentForVariants] = useState<Product | null>(null);
  const [batchesInitialSearch, setBatchesInitialSearch] = useState<string>('');
  const { isEnabled } = useFeatures();
  const { hasPermission, isAdmin, isRoot } = useAuth();

  const canCreateProduct = isRoot || isAdmin || hasPermission('products.create');
  const canEditProduct = isRoot || isAdmin || hasPermission('products.edit');
  const canEditPrice = isRoot || isAdmin || hasPermission('products.edit_price');
  const canDeleteProduct = isRoot || isAdmin || hasPermission('products.archive') || hasPermission('products.clear_all');
  const canManageCategories = isRoot || isAdmin || hasPermission('categories.manage');
  const canImportProducts = isRoot || isAdmin || hasPermission('products.import');
  const canExportProducts = isRoot || isAdmin || hasPermission('products.export');

  const [storeType, setStoreType] = useState<string>(() => {
    try {
      return localStorage.getItem('rafiq_store_type') || localStorage.getItem('rafiq_preferred_store_type') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    void invoke<Record<string, string>>('settings:getAll')
      .then((settings) => {
        if (settings && settings.store_type) {
          setStoreType(settings.store_type);
          try {
            localStorage.setItem('rafiq_store_type', settings.store_type);
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const isPharmacy = storeType === 'pharmacy' || isEnabled('feature_pharmacy');
  const isClothing = !isPharmacy && (storeType === 'clothing_apparel' || (storeType === '' && isEnabled('feature_matrix_variants')));
  const isProduceOrButchery = storeType === 'produce_butchery';

  // Barcode Label Printing Modal State (Feature #57 / Tasks 57-1 to 57-4)
  const [showBarcodeLabelModal, setShowBarcodeLabelModal] = useState(false);
  const [labelModalProduct, setLabelModalProduct] = useState<Product | null>(null);
  const [showControlledRegisterModal, setShowControlledRegisterModal] = useState(false);
  const [showDrugReferenceModal, setShowDrugReferenceModal] = useState(false);
  const [showExpiryReturnsModal, setShowExpiryReturnsModal] = useState(false);
  const [showPharmaStocktakingModal, setShowPharmaStocktakingModal] = useState(false);
  const [showPharmaReportsModal, setShowPharmaReportsModal] = useState(false);
  const [showDosageLabelModal, setShowDosageLabelModal] = useState(false);
  const [showDdiManagerModal, setShowDdiManagerModal] = useState(false);

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
    unitsRequestRef.current++;
    setUnitsLoadState('ready');
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
    setStockAdjustReason('');
    setMinStockInput('0');
    setTaxRatePercent(0);
    setVariantSize('');
    setVariantColor('');
    setInitialExpiryDate('');
    setInitialBatchNumber('');
    setExistingBatchId(null);
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

  const loadEditingProductUnits = (productId: string) => {
    const requestId = ++unitsRequestRef.current;
    setUnitsLoadState('loading');
    void invoke<ProductUnit[]>('productUnits:getByProduct', { productId }).then((units) => {
      if (requestId !== unitsRequestRef.current) return;
      // An empty list means the product has no unit rows yet, so the base placeholder deletes nothing
      if (Array.isArray(units) && units.length > 0) {
        setProductUnits(units);
        setEditingProduct(prev => (prev && prev.id === productId ? { ...prev, units } : prev));
      }
      setUnitsLoadState('ready');
    }).catch(() => {
      if (requestId !== unitsRequestRef.current) return;
      setUnitsLoadState('error');
    });
  };

  const openEditModal = (prod: Product) => {
    if (!canEditProduct) return;
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
    setExistingBatchId(null);

    if (isEnabled('feature_expiry_dates')) {
      void invoke<ProductBatch[]>('batch:listByProduct', { productId: prod.id, activeOnly: false })
        .then((bList) => {
          if (bList && bList.length > 0) {
            const first = bList[0];
            setExistingBatchId(first.id);
            setInitialBatchNumber(first.batchNumber);
            if (first.expiryDate) {
              setInitialExpiryDate(first.expiryDate);
            }
          }
        })
        .catch(() => null);
    }

    const u = prod.unit === 'kg' ? 'kg' : 'piece';
    setUnit(u);

    // Show what the list has, but Save stays blocked until the authoritative units are loaded
    setProductUnits(prod.units && prod.units.length > 0 ? prod.units : [{
      unitName: u === 'kg' ? 'كيلو' : 'قطعة',
      conversionFactor: 1,
      isBaseUnit: true,
      sellPricePiasters: prod.pricePiasters,
      costPricePiasters: prod.costPiasters,
      barcode: prod.barcode || '',
      isDivisible: u === 'kg',
      sortOrder: 0
    }]);
    loadEditingProductUnits(prod.id);

    const sKg = (prod.stockQuantityMilli / 1000).toFixed(3).replace(/\.?0+$/, '');
    setStockInput(sKg || '0');
    setStockAdjustReason('');
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
      const remainingCount = Math.max(0, totalCount - 1);
      const maxPage = Math.max(1, Math.ceil(remainingCount / pageSize));
      const newPage = Math.min(currentPage, maxPage);
      setCurrentPage(newPage);
      await loadProducts(searchQuery, newPage, pageSize);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await rafiqAlert({
        title: 'فشل حذف الصنف',
        message: `تعذر حذف الصنف "${prod.name}": ${msg}`,
        variant: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;
    setShowBulkDeleteConfirm(false);
    try {
      setLoading(true);
      await invoke('products:bulkDelete', { ids: selectedProductIds });
      const deletedLen = selectedProductIds.length;
      setSelectedProductIds([]);
      const remainingCount = Math.max(0, totalCount - deletedLen);
      const maxPage = Math.max(1, Math.ceil(remainingCount / pageSize));
      const newPage = Math.min(currentPage, maxPage);
      setCurrentPage(newPage);
      await loadProducts(searchQuery, newPage, pageSize);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await rafiqAlert({
        title: 'فشل حذف الأصناف',
        message: `تعذر حذف الأصناف المحددة: ${msg}`,
        variant: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllProducts = async () => {
    setShowClearAllConfirm(false);
    try {
      setLoading(true);
      const res = await invoke<{ success: boolean; clearedCount: number }>('products:clearAll');
      setSelectedProductIds([]);
      setCurrentPage(1);
      setImportSuccessAlert(`تم بنجاح تصفير ومسح كافة الأصناف (${res?.clearedCount || 0} صنف).`);
      await loadProducts('', 1, pageSize, 'all', 'all');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await rafiqAlert({
        title: 'فشل تصفير الأصناف',
        message: `تعذر تصفير الأصناف: ${msg}`,
        variant: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProduct = async (e?: FormEvent, forceConfirmSimilar = false, forceConfirmCost = false) => {
    if (e) e.preventDefault();
    if (!canSaveProductUnits(Boolean(editingId), unitsLoadState)) {
      setFormError(unitsLoadBlockMessage(unitsLoadState));
      return;
    }
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
      // A stock change on an existing product is a stock adjustment: permission + documented reason (enforced by the server too)
      const isStockAdjustment = Boolean(editingId && editingProduct && stockQuantityMilli !== editingProduct.stockQuantityMilli);
      if (isStockAdjustment && !hasPermission('stock.adjust')) {
        setFormError('ليس لديك صلاحية تسوية المخزون؛ لا يمكن تغيير الرصيد من بطاقة الصنف. أعد الرصيد كما كان أو اطلب من المدير.');
        return;
      }
      if (isStockAdjustment && !stockAdjustReason.trim()) {
        setFormError('اكتب سبب تعديل الرصيد (مثل: جرد فعلي، تالف، فاقد) قبل الحفظ.');
        return;
      }
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

      const baseUnitObj = synchronizedUnits.find(u => u.isBaseUnit);
      const effectiveProductUnit = (baseUnitObj && baseUnitObj.unitName && baseUnitObj.unitName.trim())
        ? baseUnitObj.unitName.trim()
        : (unit === 'kg' ? 'kg' : 'piece');

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
        originalStockQuantityMilli: editingId && editingProduct ? editingProduct.stockQuantityMilli : undefined,
        stockAdjustReason: isStockAdjustment ? stockAdjustReason.trim() : undefined,
        minStockQuantityMilli,
        unit: effectiveProductUnit as any,
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
        if (!editingId) {
          // صنف جديد: إنشاء أول تشغيلة لرصيد أول المدة
          await invoke('batch:save', {
            productId: saved.id,
            batchNumber: initialBatchNumber.trim() || `B-${Date.now().toString().slice(-6)}`,
            expiryDate: initialExpiryDate.trim(),
            quantityMilli: stockQuantityMilli,
            costPricePiasters: costPiasters,
            status: 'ACTIVE'
          }).catch(() => null);
        } else if (existingBatchId) {
          // صنف قائم مسجل له تشغيلة: تحديث تاريخ الصلاحية للتشغيلة القائمة دون مضاعفة الرصيد أو توليد تشغيلات وهمية
          await invoke('batch:save', {
            id: existingBatchId,
            productId: saved.id,
            batchNumber: initialBatchNumber.trim() || undefined,
            expiryDate: initialExpiryDate.trim(),
            costPricePiasters: costPiasters,
            status: 'ACTIVE'
          }).catch(() => null);
        } else {
          // صنف قديم لم تكن له أي تشغيلة مسجلة من قبل: تسجيل تشغيلته الأولى برصيده الحالي
          await invoke('batch:save', {
            productId: saved.id,
            batchNumber: initialBatchNumber.trim() || `B-${Date.now().toString().slice(-6)}`,
            expiryDate: initialExpiryDate.trim(),
            quantityMilli: stockQuantityMilli,
            costPricePiasters: costPiasters,
            status: 'ACTIVE'
          }).catch(() => null);
        }
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
  const isCatalogFiltered = searchQuery.trim() !== '' || stockStatusFilter !== 'all' || selectedCategoryFilter !== 'all';
  const categoryFilterOptions = useMemo(
    () => [{ value: 'all', label: 'كل الأقسام' }, ...categories.map((cat) => ({ value: cat.id, label: cat.name }))],
    [categories]
  );

  const clearSearchFilter = () => {
    setSearchQuery('');
    setCurrentPage(1);
    void loadProducts('', 1, pageSize);
  };

  const clearStockStatusFilter = () => {
    setStockStatusFilter('all');
    setCurrentPage(1);
    onResetFilter?.();
    void loadProducts(searchQuery, 1, pageSize, 'all');
  };

  const clearCategoryFilter = () => {
    setSelectedCategoryFilter('all');
    setCurrentPage(1);
    void loadProducts(searchQuery, 1, pageSize, stockStatusFilter, 'all');
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setStockStatusFilter('all');
    setSelectedCategoryFilter('all');
    setCurrentPage(1);
    if (stockStatusFilter !== 'all') onResetFilter?.();
    void loadProducts('', 1, pageSize, 'all', 'all');
  };

  return (
    <div className="flex flex-col h-full bg-canvas dark:bg-canvas-dark p-3.5 gap-3 overflow-hidden select-none">
      {/* 1. Header card: row 1 = title + count + actions, row 2 (catalog) = search + filters + active chips */}
      <div className={`bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl px-4 flex flex-col gap-3 shrink-0 shadow-xs ${activeSubView === 'catalog' ? 'py-4' : 'min-h-[58px] py-2 justify-center'}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3">
          {activeSubView === 'catalog' ? (
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center border border-brand/20 dark:border-brand-bright/40 shadow-2xs shrink-0">
                <Package className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h2 className="t-page-title text-ink dark:text-ink-dark leading-tight">أصناف وبضاعة المحل</h2>
                  <span
                    className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-brand-soft dark:bg-brand-dark-soft border border-brand/20 dark:border-brand-bright/40 text-brand dark:text-brand-bright"
                    title={isCatalogFiltered ? 'إجمالي الأصناف المطابقة للبحث أو التصفية الحالية' : 'إجمالي الأصناف في المحل'}
                  >
                    <span className="text-lg font-black tabular-nums leading-none">{totalCount.toLocaleString('en-US')}</span>
                    <span className="text-xs font-bold">{isCatalogFiltered ? 'صنف في نتيجة التصفية' : 'صنف'}</span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted">أسعار البضاعة، الباركود، رصيد المخزن، وتنبيهات النواقص</p>
              </div>
            </div>
          ) : activeSubView === 'movements' ? (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-brand-soft dark:bg-brand-soft/20 text-brand dark:text-brand-bright flex items-center justify-center border border-brand/20 shadow-2xs">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h2 className="t-card-title text-ink dark:text-ink-dark leading-tight">دفتر حركة وجرد بضاعة المخزن</h2>
                <p className="text-micro text-ink-muted dark:text-ink-dark-muted">سجل الوارد والمبيعات والمرتجعات وتسويات وعدّ بضاعة المحل</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright flex items-center justify-center border border-warn/20 dark:border-warn-bright/30 shadow-2xs">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="t-card-title text-ink dark:text-ink-dark leading-tight">تواريخ الصلاحية والتشغيلات</h2>
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright font-bold border border-paid/20 dark:border-paid/40">
                    اللي قرب ينتهي يتباع الأول
                  </span>
                </div>
                <p className="text-micro text-ink-muted dark:text-ink-dark-muted">متابعة صلاحية البضاعة، تنبيهات قرب الانتهاء، وتوالف الصلاحية</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {activeSubView === 'catalog' ? (
            <>
              {/* Senior Tools & Operations Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsToolsDropdownOpen((prev) => !prev)}
                  aria-haspopup="menu"
                  aria-expanded={isToolsDropdownOpen}
                  className={`h-10 px-3.5 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border text-ink dark:text-ink-dark rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-2xs cursor-pointer ${
                    isToolsDropdownOpen ? 'border-brand dark:border-brand-bright ring-2 ring-brand/20 dark:ring-brand-bright/30 bg-surface-2 dark:bg-surface-dark-2' : 'border-line dark:border-line-dark'
                  }`}
                  title="العمليات المتقدمة، الاستيراد والتصدير، والباركود"
                >
                  <Tag className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>{isPharmacy ? 'أدوات وصيدلية المحل' : 'أدوات وبضاعة المحل'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted transition-transform duration-150 ${isToolsDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isToolsDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsToolsDropdownOpen(false)} 
                    />
                    <div role="menu" className="absolute left-0 top-full mt-1.5 w-80 max-w-[calc(100vw-2rem)] max-h-[min(34rem,calc(100vh-11rem))] overflow-y-auto custom-scrollbar bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl shadow-card py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                      {/* Section 1: Excel & Files */}
                      {(canImportProducts || canExportProducts) && (
                        <ToolsMenuGroup title="الاستيراد والتصدير">
                          {canImportProducts && (
                            <ToolsMenuItem
                              icon={FileSpreadsheet}
                              label="استيراد بضاعة من شيت إكسل"
                              onClick={() => {
                                setIsToolsDropdownOpen(false);
                                setShowExcelImportModal(true);
                              }}
                            />
                          )}
                          {canExportProducts && (
                            <ToolsMenuItem
                              icon={Download}
                              label="تصدير كل البضاعة لملف إكسل"
                              disabled={isExportingExcel}
                              onClick={() => {
                                setIsToolsDropdownOpen(false);
                                void handleExportProductsToExcel();
                              }}
                            />
                          )}
                        </ToolsMenuGroup>
                      )}

                      {/* Section 2: Barcodes & Bulk Pricing */}
                      <ToolsMenuGroup title="الباركود والأسعار">
                        <ToolsMenuItem
                          icon={Tag}
                          label="طباعة استيكرات الباركود والأسعار"
                          shortcut="F8"
                          onClick={() => {
                            setIsToolsDropdownOpen(false);
                            setLabelModalProduct(null);
                            setShowBarcodeLabelModal(true);
                          }}
                        />
                        {canEditProduct && (
                          <ToolsMenuItem
                            icon={Barcode}
                            label="عمل باركود تلقائي للأصناف بدون كود"
                            disabled={isGeneratingBarcodes || loading}
                            onClick={() => {
                              setIsToolsDropdownOpen(false);
                              void handleStartBulkBarcodeGeneration();
                            }}
                          />
                        )}
                        {canEditPrice && (
                          <ToolsMenuItem
                            icon={TrendingUp}
                            label="تعديل أسعار وتكلفة البضاعة بالجملة"
                            onClick={() => {
                              setIsToolsDropdownOpen(false);
                              setShowBulkPriceModal(true);
                            }}
                          />
                        )}
                      </ToolsMenuGroup>

                      {/* Section 3: Storage Locations (if enabled and applicable) */}
                      {isEnabled('feature_shelf_locations') && !isProduceOrButchery && (
                        <ToolsMenuGroup title="التخزين">
                          <ToolsMenuItem
                            icon={Layers}
                            label={isPharmacy ? 'أدراج وثلاجة ورفوف الصيدلية' : 'إدارة مواقع التخزين والرفوف والأدراج'}
                            onClick={() => {
                              setIsToolsDropdownOpen(false);
                              setShowStorageLocationsModal(true);
                            }}
                          />
                        </ToolsMenuGroup>
                      )}

                      {/* Section 4b: Cafe & Restaurant Modifiers & Manufacturing Recipes */}
                      {(isEnabled('feature_item_modifiers') || isEnabled('feature_manufacturing_recipes')) && (
                        <ToolsMenuGroup title="أدوات الكافيهات والمطاعم والتصنيع">
                          {isEnabled('feature_item_modifiers') && hasPermission('modifiers.manage') && (
                            <ToolsMenuItem
                              icon={Sliders}
                              label="مجموعات الإضافات وتخصيص الأصناف (Modifiers)"
                              onClick={() => {
                                setIsToolsDropdownOpen(false);
                                setShowModifierManagerModal(true);
                              }}
                            />
                          )}
                          {isEnabled('feature_manufacturing_recipes') && (hasPermission('recipes.manage') || hasPermission('recipes.produce')) && (
                            <ToolsMenuItem
                              icon={FlaskConical}
                              label="الرسبي والتصنيع وخصم الخامات (BOM / Recipes)"
                              onClick={() => {
                                setIsToolsDropdownOpen(false);
                                setShowRecipeManagerModal(true);
                              }}
                            />
                          )}
                        </ToolsMenuGroup>
                      )}

                      {/* Section 5: Pharmacy Specific Tools (Strictly for Pharmacies) */}
                      {isPharmacy && (
                        <ToolsMenuGroup title="أدوات وتقارير الصيدلية">
                          {isEnabled('feature_drug_reference') && hasPermission('pharma.drug_reference.import') && (
                            <ToolsMenuItem
                              icon={BookOpen}
                              label="دليل الأدوية المرجعي الخارجي"
                              onClick={() => {
                                setIsToolsDropdownOpen(false);
                                setShowDrugReferenceModal(true);
                              }}
                            />
                          )}
                          {isEnabled('feature_pharmacy') && (
                            <ToolsMenuItem
                              icon={ShieldAlert}
                              tone="warn"
                              label="دفتر أدوية الجدول والتفتيش الصيدلي"
                              onClick={() => {
                                setIsToolsDropdownOpen(false);
                                setShowControlledRegisterModal(true);
                              }}
                            />
                          )}
                          {isEnabled('feature_expiry_returns') && hasPermission('pharma.expiry_returns.manage') && (
                            <ToolsMenuItem
                              icon={RotateCcw}
                              label="مرتجعات الصلاحية ومحاضر الإعدام"
                              onClick={() => {
                                setIsToolsDropdownOpen(false);
                                setShowExpiryReturnsModal(true);
                              }}
                            />
                          )}
                          {isEnabled('feature_pharmacy') && hasPermission('pharma.stocktaking.manage') && (
                            <ToolsMenuItem
                              icon={ClipboardCheck}
                              label="الجرد الصيدلي المتقدم وحصر الفروقات"
                              onClick={() => {
                                setIsToolsDropdownOpen(false);
                                setShowPharmaStocktakingModal(true);
                              }}
                            />
                          )}
                          {isEnabled('feature_pharmacy') && hasPermission('reports.pharma.view') && (
                            <ToolsMenuItem
                              icon={BarChart3}
                              label="خريطة الصلاحيات والتقارير الصيدلية"
                              onClick={() => {
                                setIsToolsDropdownOpen(false);
                                setShowPharmaReportsModal(true);
                              }}
                            />
                          )}
                          {isEnabled('feature_pharmacy') && hasPermission('pharma.dosage_labels.print') && (
                            <ToolsMenuItem
                              icon={Printer}
                              label="طباعة ملصق جرعة حراري (استيكر صيدلي)"
                              onClick={() => {
                                setIsToolsDropdownOpen(false);
                                setShowDosageLabelModal(true);
                              }}
                            />
                          )}
                          {(isEnabled('feature_drug_interactions') || isEnabled('feature_pharmacy')) && hasPermission('pharma.ddi.manage') && (
                            <ToolsMenuItem
                              icon={ShieldAlert}
                              label="دليل وقواعد التداخلات والتعارضات الدوائية (DDI)"
                              onClick={() => {
                                setIsToolsDropdownOpen(false);
                                setShowDdiManagerModal(true);
                              }}
                            />
                          )}
                        </ToolsMenuGroup>
                      )}

                      {/* Section 6: Data Health & Quality Audit */}
                      <ToolsMenuGroup title="الفحص والصيانة">
                        <ToolsMenuItem
                          icon={ShieldCheck}
                          label="فحص وتدقيق بيانات وأسعار الأصناف"
                          onClick={() => {
                            setIsToolsDropdownOpen(false);
                            setShowDataQualityModal(true);
                          }}
                        />
                        {hasPermission('products.archive') && (
                          <ToolsMenuItem
                            icon={Trash2}
                            tone="danger"
                            label="تصفير ومسح كافة الأصناف الحالية"
                            onClick={() => {
                              setIsToolsDropdownOpen(false);
                              setShowClearAllConfirm(true);
                            }}
                          />
                        )}
                      </ToolsMenuGroup>
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => openHelpCenter('products')}
                className="h-10 w-10 flex items-center justify-center bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-paid dark:text-paid-bright rounded-xl transition-colors shadow-2xs cursor-pointer shrink-0"
                title="شرح ودليل إدارة الأصناف والمخزون والباركود (F1)"
                aria-label="شرح ودليل إدارة الأصناف والمخزون والباركود"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              {isClothing && isEnabled('feature_matrix_variants') && (
                <button
                  type="button"
                  onClick={() => setShowVariantMatrixModal(true)}
                  className="h-10 px-3.5 bg-brand-soft dark:bg-brand-dark-soft hover:bg-brand-soft/60 dark:hover:bg-brand-dark-soft/70 text-brand dark:text-brand-bright border border-brand/30 dark:border-brand-bright/40 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-2xs cursor-pointer active:scale-[0.98] shrink-0"
                  title="إنشاء صنف أب مع جدول تركيبات المقاسات والألوان والباركود"
                >
                  <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>مقاسات وألوان</span>
                </button>
              )}

              {canManageCategories && (
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  className="h-10 px-3.5 bg-surface dark:bg-surface-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-2xs cursor-pointer active:scale-[0.98] shrink-0"
                  title="إضافة وتعديل وأرشفة وترتيب أقسام السلع"
                >
                  <Tags className="w-4 h-4 text-brand dark:text-brand-bright" />
                  <span>إدارة الأقسام</span>
                </button>
              )}

              {canCreateProduct && (
                <button
                  type="button"
                  onClick={openAddModal}
                  className="h-10 px-4 bg-brand hover:bg-brand-dark dark:hover:bg-brand-hover text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer active:scale-[0.98] shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isPharmacy ? 'دواء جديد' : 'صنف جديد'}</span>
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>

      {activeSubView === 'catalog' && (
        <>
          {/* Row 2: search + stock status + category */}
          <div className="flex flex-wrap items-center gap-3">
            <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-[12rem]">
              <div className="relative flex-1 h-11 flex items-center bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl px-3 focus-within:border-brand dark:focus-within:border-brand-bright focus-within:ring-2 focus-within:ring-brand/20 dark:focus-within:ring-brand-bright/30 focus-within:bg-surface dark:focus-within:bg-surface-dark transition-all">
                <Search className="w-4 h-4 text-ink-muted dark:text-ink-dark-muted ml-2.5 shrink-0 pointer-events-none" />
                <input
                  type="text"
                  placeholder="اكتب اسم الصنف أو اضرب الباركود..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(normalizeArabicNumerals(e.target.value))}
                  className="w-full bg-transparent border-none text-sm text-ink dark:text-ink-dark placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={clearSearchFilter}
                    aria-label="مسح نص البحث"
                    title="مسح نص البحث"
                    className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 transition-colors cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="h-11 px-5 bg-brand hover:bg-brand-dark dark:hover:bg-brand-hover text-white rounded-xl text-sm font-bold transition-colors shadow-xs cursor-pointer shrink-0"
              >
                بحث
              </button>
            </form>

            <SegmentedTabs
              ariaLabel="تصفية الأصناف حسب حالة المخزون"
              value={stockStatusFilter}
              onChange={(next) => {
                setStockStatusFilter(next);
                setCurrentPage(1);
                if (next === 'all') onResetFilter?.();
                void loadProducts(searchQuery, 1, pageSize, next, selectedCategoryFilter);
              }}
              options={STOCK_STATUS_TABS}
            />

            <CustomSelect
              value={selectedCategoryFilter}
              onChange={(next) => {
                setSelectedCategoryFilter(next);
                setCurrentPage(1);
                void loadProducts(searchQuery, 1, pageSize, stockStatusFilter, next);
              }}
              options={categoryFilterOptions}
              size="lg"
              searchable={categories.length > 7}
              className="w-44 shrink-0"
            />
          </div>

          {/* Row 3: active filters as removable chips */}
          {isCatalogFiltered && (
            <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-line dark:border-line-dark">
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">الفلاتر المفعّلة:</span>
              {searchQuery.trim() !== '' && (
                <ActiveFilterChip label="بحث" value={searchQuery.trim()} onRemove={clearSearchFilter} />
              )}
              {stockStatusFilter !== 'all' && (
                <ActiveFilterChip
                  label="حالة المخزون"
                  value={stockStatusFilter === 'lowStock' ? 'نواقص' : 'خلصان'}
                  tone={stockStatusFilter === 'lowStock' ? 'warn' : 'danger'}
                  onRemove={clearStockStatusFilter}
                />
              )}
              {selectedCategoryFilter !== 'all' && (
                <ActiveFilterChip
                  label="القسم"
                  value={categories.find((c) => c.id === selectedCategoryFilter)?.name ?? selectedCategoryFilter}
                  onRemove={clearCategoryFilter}
                />
              )}
              <button
                type="button"
                onClick={clearAllFilters}
                className="h-8 px-3 rounded-full text-xs font-bold text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 border border-line dark:border-line-dark transition-colors cursor-pointer"
              >
                مسح الكل
              </button>
            </div>
          )}
        </>
      )}
      </div>

      {/* Success Notification Alert */}
      {importSuccessAlert && (
        <div className="bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid-dark-border text-paid dark:text-paid-bright px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-bold animate-in fade-in shrink-0 shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-paid dark:text-paid-bright" />
            <span>{importSuccessAlert}</span>
            {bulkPriceUndoBatchId && (
              <button
                type="button"
                onClick={() => void handleUndoBulkPrice()}
                disabled={isRevertingBulkPrice}
                className="mr-3 px-2.5 py-1 rounded-lg bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright hover:bg-warn hover:text-white dark:hover:text-white border border-warn/40 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
            className="text-paid dark:text-paid-bright hover:text-paid-hover dark:hover:text-ink-dark p-1 cursor-pointer"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {activeSubView === 'catalog' ? (
        <>
          {/* 2. Products Data Table Subcomponent */}
          <ProductsTable
            products={displayedProducts}
            loading={loading}
            canEdit={canEditProduct}
            canDelete={canDeleteProduct}
            selectedCategoryFilter={selectedCategoryFilter}
            selectedProductIds={selectedProductIds}
            onToggleSelectAll={toggleSelectAll}
            onToggleSelectProduct={toggleSelectProduct}
            onOpenBulkMinStockModal={() => setShowBulkMinStockModal(true)}
            onOpenBulkPriceAdjustment={canEditPrice ? () => setShowBulkPriceModal(true) : undefined}
            onBulkDelete={canDeleteProduct ? () => setShowBulkDeleteConfirm(true) : undefined}
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

          {/* Pagination Bar: only when more than one page is possible (otherwise the header count says it all) */}
          {totalCount > PRODUCTS_PAGE_SIZE_OPTIONS[0] && (
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
              pageSizeOptions={PRODUCTS_PAGE_SIZE_OPTIONS}
              itemLabel="صنف"
            />
          )}
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
        stockAdjustReason={stockAdjustReason}
        setStockAdjustReason={setStockAdjustReason}
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
        unitsLoadState={editingId ? unitsLoadState : 'ready'}
        onRetryLoadUnits={() => {
          if (editingId) loadEditingProductUnits(editingId);
        }}
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

      {/* Confirm Clear All Products Modal */}
      <ConfirmModal
        isOpen={showClearAllConfirm}
        title="تصفير ومسح كافة الأصناف الحالية"
        message={`هل أنت متأكد تماماً من رغبتك في مسح وإخفاء كافة الأصناف (${totalCount} صنف) من المحل؟`}
        consequence="سيتم إخفاء كافة الأصناف الحالية من الكتالوج وشاشة البيع، مع الحفاظ على الفواتير القديمة بأمان تام، ويمكنك استيراد شيت جديد بعد ذلك."
        confirmText="نعم، قم بتصفير كافة الأصناف"
        cancelText="إلغاء وتراجع"
        isDanger={true}
        onConfirm={() => void handleClearAllProducts()}
        onCancel={() => setShowClearAllConfirm(false)}
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
          setSearchQuery('');
          setCurrentPage(1);
          setStockStatusFilter('all');
          setSelectedCategoryFilter('all');
          void loadProducts('', 1, pageSize, 'all', 'all');
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

      {/* Drug Interaction Manager Modal (Feature #194 / Story 137) */}
      <DrugInteractionManagerModal
        isOpen={showDdiManagerModal}
        onClose={() => setShowDdiManagerModal(false)}
        onSuccess={(msg) => setImportSuccessAlert(msg)}
      />

      {/* Item Modifiers Manager Modal (Feature #197 / Story 140) */}
      <ModifierManagerModal
        isOpen={showModifierManagerModal}
        onClose={() => setShowModifierManagerModal(false)}
        products={products}
      />

      {/* Manufacturing Recipes & BOM Manager Modal (Feature #200 / Story 143) */}
      <RecipeManagerModal
        isOpen={showRecipeManagerModal}
        onClose={() => setShowRecipeManagerModal(false)}
        products={products}
        canProduceBatch={hasPermission('recipes.produce')}
        onProductsChanged={() => {
          void loadProducts(searchQuery, currentPage, pageSize, stockStatusFilter, selectedCategoryFilter);
        }}
      />
    </div>
  );
};
