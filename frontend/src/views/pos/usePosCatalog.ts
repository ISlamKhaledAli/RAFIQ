import { useState, useMemo, useCallback, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { Product, QuickItem, QuickBundleItem, ProductUnit, Category } from '../../types/models';
import type { SmartCatalogItem } from './types';
import { normalizeArabicNumerals, normalizeArabicText } from '../../utils/money';
import { formatUnitArabic } from '../../utils/units';
import { resolveDefaultSaleUnit } from './saleUnit';
import { pickPopularItems } from './popularItems';
import { remoteCatalogKey } from './catalogLoad';

const EMPTY_PRODUCTS: Product[] = [];

interface UsePosCatalogProps {
  catalogProducts: Product[];
  /** Large catalogue only: rows fetched on demand for the current search/section, valid while remoteKey matches. */
  remoteProducts?: Product[];
  remoteKey?: string;
  isCatalogTruncated?: boolean;
  /** Reads real products by id when a bundle needs components the bounded catalogue does not hold. */
  resolveProductsByIds?: (ids: string[]) => Promise<Product[]>;
  quickItems: QuickItem[];
  categories?: Category[];
  addProductToCart: (prod: Product, customWeightMilli?: number, specificUnit?: ProductUnit) => boolean;
  showStatus: (text: string, type?: 'success' | 'error' | 'warning') => void;
  barcodeInputRef: React.RefObject<HTMLInputElement | null>;
  setInitialWeightMilli: React.Dispatch<React.SetStateAction<number>>;
  setWeightModalProduct: React.Dispatch<React.SetStateAction<{
    id?: string;
    name: string;
    pricePiasters: number;
    barcode?: string | null;
    unit?: string;
    editingCartIndex?: number;
  } | null>>;
  setUnitPickerProduct?: React.Dispatch<React.SetStateAction<Product | null>>;
}

export const usePosCatalog = ({
  catalogProducts,
  remoteProducts = EMPTY_PRODUCTS,
  remoteKey = '',
  isCatalogTruncated = false,
  resolveProductsByIds,
  quickItems,
  categories = [],
  addProductToCart,
  showStatus,
  barcodeInputRef,
  setInitialWeightMilli,
  setWeightModalProduct,
}: UsePosCatalogProps) => {
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [activeCatalogTab, setActiveCatalogTab] = useState<string>('__ALL__');
  const [openPriceItem, setOpenPriceItem] = useState<QuickItem | null>(null);
  const [openPriceInputEgp, setOpenPriceInputEgp] = useState<string>('');

  // Clean up any legacy artificial popularity counter from localStorage
  useEffect(() => {
    try {
      localStorage.removeItem('rafiq_pos_item_popularity');
    } catch {
      // ignore
    }
  }, []);

  // Maps products (plus, optionally, quick items without a product) to grid items; shared by the loaded and the on-demand lists
  const buildSmartItems = useCallback((products: Product[], includeQuickOnly: boolean): SmartCatalogItem[] => {
    const list: SmartCatalogItem[] = [];
    const seenProductIds = new Set<string>();

    const quickByProductId = new Map<string, QuickItem>();
    for (const q of quickItems) {
      if (q.productId) quickByProductId.set(q.productId, q);
    }

    const productById = new Map<string, Product>();
    for (const p of products) {
      if (p.id) productById.set(p.id, p);
    }

    const categoryIdToName = new Map<string, string>();
    const categoryNameToId = new Map<string, string>();
    for (const cat of categories) {
      if (cat.id && cat.name) {
        categoryIdToName.set(cat.id, cat.name.trim());
        categoryNameToId.set(cat.name.trim().toLowerCase(), cat.id);
      }
    }

    for (const p of products) {
      const matchedQuick = quickByProductId.get(p.id);
      const isCustom = Boolean(matchedQuick) || Boolean(p.isCustomQuickItem);
      const popScore = p.salesCount || 0;

      let resolvedCategoryName = matchedQuick?.categoryName?.trim() || p.categoryName?.trim();
      let resolvedCategoryId = p.categoryId || null;

      if (!resolvedCategoryName || resolvedCategoryName === 'عام') {
        if (resolvedCategoryId && categoryIdToName.has(resolvedCategoryId)) {
          resolvedCategoryName = categoryIdToName.get(resolvedCategoryId)!;
        } else {
          resolvedCategoryName = 'عام';
        }
      }

      if (!resolvedCategoryId && resolvedCategoryName && resolvedCategoryName !== 'عام') {
        resolvedCategoryId = categoryNameToId.get(resolvedCategoryName.toLowerCase()) || null;
      }

      const defaultUnit = resolveDefaultSaleUnit(p.units, p.defaultSaleUnitId, p.isLooseSellable);
      const baseOrProductPrice = (defaultUnit && defaultUnit.sellPricePiasters > 0)
        ? defaultUnit.sellPricePiasters
        : p.pricePiasters;

      const resolvedName = matchedQuick?.name || p.name;
      const searchTokens: string[] = [
        normalizeArabicText(normalizeArabicNumerals(resolvedName)),
        p.barcode ? p.barcode.toLowerCase() : '',
        p.barcodes ? p.barcodes.map((b) => b.toLowerCase()).join(' ') : '',
        p.units ? p.units.map((u) => `${u.barcode ? u.barcode.toLowerCase() : ''} ${normalizeArabicText(u.unitName || '')}`).join(' ') : '',
        resolvedCategoryName ? normalizeArabicText(resolvedCategoryName) : '',
        p.variantColor ? normalizeArabicText(p.variantColor) : '',
        p.variantSize ? p.variantSize.toLowerCase() : '',
      ];

      list.push({
        id: p.id,
        productId: p.id,
        name: resolvedName,
        pricePiasters: (matchedQuick && matchedQuick.pricePiasters > 0) ? matchedQuick.pricePiasters : baseOrProductPrice,
        isOpenPrice: matchedQuick?.isOpenPrice || Boolean(p.isOpenPrice),
        unit: p.unit || 'piece',
        categoryId: resolvedCategoryId,
        categoryName: resolvedCategoryName,
        stockQuantityMilli: p.stockQuantityMilli,
        consumesIngredientsOnSale: p.consumesIngredientsOnSale,
        barcode: p.barcode,
        barcodes: p.barcodes,
        units: p.units,
        isCustomQuickItem: isCustom,
        salesCount: popScore,
        quickDisplayOrder: matchedQuick?.displayOrder ?? p.quickDisplayOrder ?? 9999,
        productRef: p,
        hasVariants: p.hasVariants,
        variantColor: p.variantColor,
        variantSize: p.variantSize,
        variantsCount: p.variantsCount,
        hasBatches: p.hasBatches,
        nearestExpiryDate: p.nearestExpiryDate,
        isExpired: p.isExpired,
        defaultSaleUnitId: p.defaultSaleUnitId,
        isLooseSellable: p.isLooseSellable,
        isControlled: p.isControlled || Boolean((p.controlledSchedule && p.controlledSchedule !== 'none') || p.rxStatus === 'controlled'),
        controlledSchedule: p.controlledSchedule,
        _normSearchText: searchTokens.filter(Boolean).join(' '),
      });
      seenProductIds.add(p.id);
    }

    for (const q of (includeQuickOnly ? quickItems : [])) {
      if (q.productId && seenProductIds.has(q.productId)) continue;
      const matchedProd = q.productId ? productById.get(q.productId) : null;
      const popScore = matchedProd?.salesCount || 0;
      const qCatName = q.categoryName?.trim() || 'عام';
      const qCatId = categoryNameToId.get(qCatName.toLowerCase()) || null;

      const qSearchTokens: string[] = [
        normalizeArabicText(normalizeArabicNumerals(q.name)),
        qCatName ? normalizeArabicText(qCatName) : '',
      ];

      list.push({
        id: q.id,
        productId: q.productId,
        name: q.name,
        pricePiasters: q.pricePiasters,
        isOpenPrice: Boolean(q.isOpenPrice),
        unit: q.unit || 'piece',
        categoryId: qCatId,
        categoryName: qCatName,
        isCustomQuickItem: true,
        salesCount: popScore,
        quickDisplayOrder: q.displayOrder ?? 0,
        _normSearchText: qSearchTokens.filter(Boolean).join(' '),
      });
    }

    return list;
  }, [quickItems, categories]);

  const smartItems = useMemo<SmartCatalogItem[]>(() => buildSmartItems(catalogProducts, true), [buildSmartItems, catalogProducts]);

  // Large catalogue: rows the host returned for the current search/section that the bounded load does not hold
  const remoteActive = Boolean(isCatalogTruncated) && remoteKey === remoteCatalogKey(activeCatalogTab, catalogSearchQuery);
  const remoteItems = useMemo<SmartCatalogItem[]>(() => {
    if (!remoteActive || remoteProducts.length === 0) return [];
    const loadedIds = new Set<string>();
    for (const p of catalogProducts) loadedIds.add(p.id);
    return buildSmartItems(remoteProducts.filter((p) => !loadedIds.has(p.id)), false);
  }, [remoteActive, remoteProducts, catalogProducts, buildSmartItems]);
  const remoteHitIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    if (remoteActive && catalogSearchQuery.trim()) {
      for (const p of remoteProducts) ids.add(p.id);
    }
    return ids;
  }, [remoteActive, remoteProducts, catalogSearchQuery]);
  const listedItems = useMemo<SmartCatalogItem[]>(
    () => (remoteItems.length > 0 ? smartItems.concat(remoteItems) : smartItems),
    [smartItems, remoteItems]
  );

  const categoryTabs = useMemo(() => {
    const map = new Map<string, number>();
    for (const it of smartItems) {
      const c = it.categoryName?.trim() || 'عام';
      map.set(c, (map.get(c) || 0) + 1);
    }
    const list = Array.from(map.entries()).map(([name, count]) => ({ name, count }));
    if (list.length === 1 && list[0].name === 'عام') {
      return [];
    }
    return list;
  }, [smartItems]);

  const customItemsCount = useMemo(() => {
    return smartItems.filter((i) => i.isCustomQuickItem).length;
  }, [smartItems]);

  const popularSelection = useMemo(() => pickPopularItems(smartItems), [smartItems]);
  const popularItemsCount = popularSelection.items.length;
  const isPopularFallback = popularSelection.isFallback;

  const displayedCatalogItems = useMemo(() => {
    let matchesQuery: (it: SmartCatalogItem) => boolean = () => true;

    const rawQuery = catalogSearchQuery.trim();
    if (rawQuery) {
      const normQuery = normalizeArabicText(normalizeArabicNumerals(rawQuery));
      const lowerRaw = rawQuery.toLowerCase();
      matchesQuery = (it) => {
        // The host already decided these match (name, barcode, internal code, ingredient...)
        if (remoteHitIds.has(it.id)) return true;
        if (it._normSearchText) {
          return it._normSearchText.includes(normQuery) || it._normSearchText.includes(lowerRaw);
        }
        const normName = normalizeArabicText(it.name);
        return normName.includes(normQuery) || (it.barcode ? it.barcode.toLowerCase().includes(lowerRaw) : false);
      };
    }

    // The popular list is fixed first (top N), the search box then narrows what is shown in it
    if (activeCatalogTab === '__POPULAR__') {
      return popularSelection.items.filter(matchesQuery);
    }

    const result = rawQuery ? listedItems.filter(matchesQuery) : listedItems;

    if (activeCatalogTab === '__CUSTOM__') {
      return result
        .filter((it) => it.isCustomQuickItem)
        .sort((a, b) => a.quickDisplayOrder - b.quickDisplayOrder);
    }

    if (activeCatalogTab === '__ALL__') {
      return [...result].sort((a, b) => {
        if (a.isCustomQuickItem !== b.isCustomQuickItem) return a.isCustomQuickItem ? -1 : 1;
        if (b.salesCount !== a.salesCount) return b.salesCount - a.salesCount;
        return a.name.localeCompare(b.name, 'ar');
      });
    }

    const targetCat = categories.find((c) => c.id === activeCatalogTab || c.name === activeCatalogTab);
    const targetId = targetCat?.id || activeCatalogTab;
    const targetName = (targetCat?.name || activeCatalogTab).trim().toLowerCase();
    const targetNorm = normalizeArabicText(targetName);

    return result
      .filter((it) => {
        if (it.categoryId && targetId && it.categoryId === targetId) return true;
        const itCatName = (it.categoryName || 'عام').trim().toLowerCase();
        if (itCatName === targetName) return true;
        if (normalizeArabicText(itCatName) === targetNorm) return true;
        return false;
      })
      .sort((a, b) => {
        if (b.salesCount !== a.salesCount) return b.salesCount - a.salesCount;
        return a.name.localeCompare(b.name, 'ar');
      });
  }, [listedItems, popularSelection, catalogSearchQuery, activeCatalogTab, categories, remoteHitIds]);

  const handleSmartItemClick = useCallback((item: SmartCatalogItem, specificUnit?: ProductUnit) => {
    if (item.isOpenPrice) {
      setOpenPriceItem({
        id: item.id,
        productId: item.productId || item.id,
        name: item.name,
        pricePiasters: item.pricePiasters,
        isOpenPrice: true,
        unit: item.unit,
        categoryName: item.categoryName,
        color: null,
        displayOrder: 0,
        createdAt: '',
        updatedAt: '',
      });
      setOpenPriceInputEgp('');
      return;
    }

    // Check if it's a Bundle / Combo offer (e.g. Ramadan Box)
    const matchedQuickForBundle = quickItems.find((q) => q.id === item.id);
    let bundleList: QuickBundleItem[] | null = null;
    if (matchedQuickForBundle?.bundleItemsJson) {
      try {
        bundleList = JSON.parse(matchedQuickForBundle.bundleItemsJson);
      } catch {
        bundleList = null;
      }
    } else if (matchedQuickForBundle?.bundleItems && matchedQuickForBundle.bundleItems.length > 0) {
      bundleList = matchedQuickForBundle.bundleItems;
    }

    if (bundleList && bundleList.length > 0) {
      const originalLines = bundleList.map((b) => Math.max(1, Math.round((b.originalPricePiasters * b.quantityMilli) / 1000)));
      const totalOrig = originalLines.reduce((sum, v) => sum + v, 0);

      // Allocate target bundle price with remainder exactness (Zero piaster loss)
      let allocatedLines: number[];
      if (totalOrig > 0 && item.pricePiasters > 0) {
        let distributedSum = 0;
        allocatedLines = originalLines.map((orig, idx) => {
          if (idx === bundleList.length - 1) {
            return Math.max(1, item.pricePiasters - distributedSum);
          }
          const alloc = Math.max(1, Math.round((orig * item.pricePiasters) / totalOrig));
          distributedSum += alloc;
          return alloc;
        });
      } else {
        allocatedLines = originalLines;
      }

      const bundle = bundleList;
      const addBundleLines = (knownProducts: Product[]) => {
        for (let idx = 0; idx < bundle.length; idx++) {
          const bItem = bundle[idx];
          const realProd = knownProducts.find((p) => p.id === bItem.productId);
          const allocatedLineTotal = allocatedLines[idx];
          const lineUnitPrice = Math.max(1, Math.round((allocatedLineTotal * 1000) / bItem.quantityMilli));

          const bundleProd: Product = {
            id: bItem.productId,
            name: `${bItem.productName} (ضمن ${item.name})`,
            barcode: bItem.barcode || realProd?.barcode || null,
            pricePiasters: lineUnitPrice,
            costPiasters: realProd ? realProd.costPiasters : 0,
            stockQuantityMilli: realProd && typeof realProd.stockQuantityMilli === 'number' ? realProd.stockQuantityMilli : 100000,
            unit: bItem.unit || realProd?.unit || 'piece',
            units: realProd?.units,
            taxRatePercent: realProd ? realProd.taxRatePercent : 0,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          addProductToCart(bundleProd, bItem.quantityMilli);
        }
        showStatus(`تمت إضافة أصناف "${item.name}" (${bundle.length} أصناف) إلى السلة بسعر العرض!`, 'success');
        barcodeInputRef.current?.focus();
      };

      // A large catalogue is not fully in memory: components it lacks are read by id so cost and stock stay real
      const missingIds = bundle
        .map((b) => b.productId)
        .filter((id) => Boolean(id) && !catalogProducts.some((p) => p.id === id));
      if (missingIds.length > 0 && resolveProductsByIds) {
        resolveProductsByIds(missingIds)
          .then((fetched) => addBundleLines(catalogProducts.concat(fetched)))
          .catch(() => addBundleLines(catalogProducts));
      } else {
        addBundleLines(catalogProducts);
      }
      return;
    }

    if (item.productRef) {
      const defaultUnit = resolveDefaultSaleUnit(item.productRef.units, item.productRef.defaultSaleUnitId, item.productRef.isLooseSellable);
      const targetUnit = specificUnit || defaultUnit || undefined;
      const effectivePrice = (targetUnit && targetUnit.sellPricePiasters > 0)
        ? targetUnit.sellPricePiasters
        : item.pricePiasters;
      const productToAdd = { ...item.productRef, pricePiasters: effectivePrice };

      const added = addProductToCart(productToAdd, undefined, targetUnit);
      if (added && !productToAdd.hasVariants && productToAdd.unit !== 'kg') {
        const unitSuffix = targetUnit ? ` (${formatUnitArabic(targetUnit.unitName)})` : '';
        showStatus(`تمت إضافة: ${item.name}${unitSuffix}`, 'success');
      }
      barcodeInputRef.current?.focus();
      return;
    }

    if (item.hasVariants) {
      const parentDummy: Product = {
        id: item.productId || item.id,
        name: item.name,
        barcode: item.barcode || null,
        barcodes: item.barcodes,
        pricePiasters: item.pricePiasters,
        costPiasters: Math.round(item.pricePiasters * 0.75),
        stockQuantityMilli: typeof item.stockQuantityMilli === 'number' ? item.stockQuantityMilli : 100000,
        unit: item.unit || 'piece',
        taxRatePercent: 0,
        isActive: true,
        hasVariants: true,
        variantColor: item.variantColor,
        variantSize: item.variantSize,
        variantsCount: item.variantsCount,
        units: item.units,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      addProductToCart(parentDummy);
      return;
    }

    if (item.unit === 'kg') {
      setInitialWeightMilli(1000);
      setWeightModalProduct({
        id: item.productId || item.id,
        name: item.name,
        pricePiasters: item.pricePiasters,
        barcode: item.barcode || null,
        unit: 'kg',
      });
      return;
    }

    const dummyProduct: Product = {
      id: item.productId || item.id,
      name: item.name,
      barcode: item.barcode || null,
      barcodes: item.barcodes,
      pricePiasters: item.pricePiasters,
      costPiasters: 0,
      stockQuantityMilli: typeof item.stockQuantityMilli === 'number' ? item.stockQuantityMilli : 100000,
      unit: item.unit || 'piece',
      taxRatePercent: 0,
      isActive: true,
      hasVariants: item.hasVariants,
      variantColor: item.variantColor,
      variantSize: item.variantSize,
      variantsCount: item.variantsCount,
      units: item.units,
      defaultSaleUnitId: item.defaultSaleUnitId,
      isLooseSellable: item.isLooseSellable,
      consumesIngredientsOnSale: item.consumesIngredientsOnSale,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const defaultDummyUnit = resolveDefaultSaleUnit(dummyProduct.units, dummyProduct.defaultSaleUnitId, dummyProduct.isLooseSellable);
    const targetUnit = specificUnit || defaultDummyUnit || undefined;
    const effectiveDummyPrice = (targetUnit && targetUnit.sellPricePiasters > 0)
      ? targetUnit.sellPricePiasters
      : dummyProduct.pricePiasters;
    const added = addProductToCart({ ...dummyProduct, pricePiasters: effectiveDummyPrice }, undefined, targetUnit);
    if (added && !dummyProduct.hasVariants && dummyProduct.unit !== 'kg') {
      const unitSuffix = targetUnit ? ` (${formatUnitArabic(targetUnit.unitName)})` : '';
      showStatus(`تمت إضافة: ${item.name}${unitSuffix}`, 'success');
    }
    barcodeInputRef.current?.focus();
  }, [addProductToCart, showStatus, barcodeInputRef, setInitialWeightMilli, setWeightModalProduct, quickItems, catalogProducts, resolveProductsByIds]);

  const handleConfirmOpenPrice = (e: FormEvent) => {
    e.preventDefault();
    if (!openPriceItem) return;
    const parsedPrice = parseFloat(openPriceInputEgp);
    if (isNaN(parsedPrice) || parsedPrice <= 0) return;

    const pricePiasters = Math.round(parsedPrice * 100);
    const targetProdId = openPriceItem.productId || openPriceItem.id;
    const realProd = catalogProducts.find((p) => p.id === targetProdId);

    const productToAdd: Product = {
      id: targetProdId,
      name: openPriceItem.name,
      barcode: realProd ? realProd.barcode : null,
      pricePiasters: pricePiasters,
      costPiasters: realProd ? realProd.costPiasters : 0,
      stockQuantityMilli: realProd && typeof realProd.stockQuantityMilli === 'number' ? realProd.stockQuantityMilli : 100000,
      unit: openPriceItem.unit || realProd?.unit || 'piece',
      taxRatePercent: realProd ? realProd.taxRatePercent : 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (openPriceItem.unit === 'kg') {
      setInitialWeightMilli(1000);
      setWeightModalProduct({
        id: productToAdd.id,
        name: productToAdd.name,
        pricePiasters: pricePiasters,
        barcode: productToAdd.barcode || null,
        unit: 'kg',
      });
      setOpenPriceItem(null);
      setOpenPriceInputEgp('');
      return;
    }

    const added = addProductToCart(productToAdd);
    if (added) {
      showStatus(`تمت إضافة: ${openPriceItem.name} (${parsedPrice.toFixed(2)} ج.م)`, 'success');
    }
    setOpenPriceItem(null);
    setOpenPriceInputEgp('');
    barcodeInputRef.current?.focus();
  };

  return {
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
  };
};
