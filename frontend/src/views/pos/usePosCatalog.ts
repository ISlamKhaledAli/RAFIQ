import { useState, useMemo, useCallback, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { Product, QuickItem, QuickBundleItem, ProductUnit, Category } from '../../types/models';
import type { SmartCatalogItem } from './types';
import { normalizeArabicNumerals, normalizeArabicText } from '../../utils/money';

interface UsePosCatalogProps {
  catalogProducts: Product[];
  quickItems: QuickItem[];
  categories?: Category[];
  addProductToCart: (prod: Product, customWeightMilli?: number, specificUnit?: ProductUnit) => void;
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
  quickItems,
  categories = [],
  addProductToCart,
  showStatus,
  barcodeInputRef,
  setInitialWeightMilli,
  setWeightModalProduct,
  setUnitPickerProduct,
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

  const smartItems = useMemo<SmartCatalogItem[]>(() => {
    const list: SmartCatalogItem[] = [];
    const seenProductIds = new Set<string>();

    const categoryIdToName = new Map<string, string>();
    const categoryNameToId = new Map<string, string>();
    for (const cat of categories) {
      if (cat.id && cat.name) {
        categoryIdToName.set(cat.id, cat.name.trim());
        categoryNameToId.set(cat.name.trim().toLowerCase(), cat.id);
      }
    }

    for (const p of catalogProducts) {
      const matchedQuick = quickItems.find((q) => q.productId === p.id);
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

      list.push({
        id: p.id,
        productId: p.id,
        name: matchedQuick?.name || p.name,
        pricePiasters: (matchedQuick && matchedQuick.pricePiasters > 0) ? matchedQuick.pricePiasters : p.pricePiasters,
        isOpenPrice: matchedQuick?.isOpenPrice || Boolean(p.isOpenPrice),
        unit: p.unit || 'piece',
        categoryId: resolvedCategoryId,
        categoryName: resolvedCategoryName,
        stockQuantityMilli: p.stockQuantityMilli,
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
      });
      seenProductIds.add(p.id);
    }

    for (const q of quickItems) {
      if (q.productId && seenProductIds.has(q.productId)) continue;
      const matchedProd = q.productId ? catalogProducts.find((p) => p.id === q.productId) : null;
      const popScore = matchedProd?.salesCount || 0;
      const qCatName = q.categoryName?.trim() || 'عام';
      const qCatId = categoryNameToId.get(qCatName.toLowerCase()) || null;

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
      });
    }

    return list;
  }, [catalogProducts, quickItems, categories]);

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

  const popularItemsCount = useMemo(() => {
    const count = smartItems.filter((i) => (i.salesCount || 0) > 0).length;
    return Math.min(count, 100);
  }, [smartItems]);

  const displayedCatalogItems = useMemo(() => {
    let result = smartItems;

    const rawQuery = catalogSearchQuery.trim();
    if (rawQuery) {
      const normQuery = normalizeArabicText(normalizeArabicNumerals(rawQuery));
      const lowerRaw = rawQuery.toLowerCase();
      result = result.filter((it) => {
        const normName = normalizeArabicText(it.name);
        const matchName = normName.includes(normQuery);
        const matchBarcode = it.barcode ? it.barcode.toLowerCase().includes(lowerRaw) : false;
        const matchBarcodes = it.barcodes ? it.barcodes.some((b) => b.toLowerCase().includes(lowerRaw)) : false;
        const matchUnits = it.units ? it.units.some((u) => 
          (u.barcode && u.barcode.toLowerCase().includes(lowerRaw)) || 
          normalizeArabicText(u.unitName).includes(normQuery)
        ) : false;
        const matchCategory = it.categoryName ? normalizeArabicText(it.categoryName).includes(normQuery) : false;
        const matchVariant = (it.variantColor ? normalizeArabicText(it.variantColor).includes(normQuery) : false) ||
                             (it.variantSize ? it.variantSize.toLowerCase().includes(lowerRaw) : false);
        return matchName || matchBarcode || matchBarcodes || matchUnits || matchCategory || matchVariant;
      });
    }

    if (activeCatalogTab === '__POPULAR__') {
      return result
        .filter((it) => (it.salesCount || 0) > 0)
        .sort((a, b) => {
          const countB = b.salesCount || 0;
          const countA = a.salesCount || 0;
          if (countB !== countA) return countB - countA;
          if (a.isCustomQuickItem !== b.isCustomQuickItem) return a.isCustomQuickItem ? -1 : 1;
          return a.name.localeCompare(b.name, 'ar');
        })
        .slice(0, 100);
    }

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
  }, [smartItems, catalogSearchQuery, activeCatalogTab, categories]);

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
      const totalOriginalPiasters = bundleList.reduce((sum, b) => sum + Math.round((b.originalPricePiasters * b.quantityMilli) / 1000), 0);
      const ratio = totalOriginalPiasters > 0 ? (item.pricePiasters / totalOriginalPiasters) : 1;

      for (const bItem of bundleList) {
        const linePrice = Math.max(1, Math.round(bItem.originalPricePiasters * ratio));
        const bundleProd: Product = {
          id: bItem.productId,
          name: `${bItem.productName} (ضمن ${item.name})`,
          barcode: bItem.barcode || null,
          pricePiasters: linePrice,
          costPiasters: Math.round((linePrice * 75) / 100),
          stockQuantityMilli: 100000,
          unit: bItem.unit || 'piece',
          taxRatePercent: 0,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        addProductToCart(bundleProd, bItem.quantityMilli);
      }
      showStatus(`تمت إضافة أصناف "${item.name}" (${bundleList.length} أصناف) إلى السلة بسعر العرض!`, 'success');
      barcodeInputRef.current?.focus();
      return;
    }

    if (item.productRef) {
      const customPrice = item.pricePiasters !== item.productRef.pricePiasters;
      const productToAdd = customPrice ? { ...item.productRef, pricePiasters: item.pricePiasters } : item.productRef;

      // If item has multiple units and no specific unit was chosen, prompt Unit Picker Modal
      if (!specificUnit && productToAdd.units && productToAdd.units.length > 1 && setUnitPickerProduct) {
        setUnitPickerProduct(productToAdd);
        return;
      }

      addProductToCart(productToAdd, undefined, specificUnit);
      if (!productToAdd.hasVariants && productToAdd.unit !== 'kg') {
        const unitSuffix = specificUnit ? ` (${specificUnit.unitName})` : '';
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
      costPiasters: Math.round(item.pricePiasters * 0.75),
      stockQuantityMilli: typeof item.stockQuantityMilli === 'number' ? item.stockQuantityMilli : 100000,
      unit: item.unit || 'piece',
      taxRatePercent: 0,
      isActive: true,
      hasVariants: item.hasVariants,
      variantColor: item.variantColor,
      variantSize: item.variantSize,
      variantsCount: item.variantsCount,
      units: item.units,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!specificUnit && dummyProduct.units && dummyProduct.units.length > 1 && setUnitPickerProduct) {
      setUnitPickerProduct(dummyProduct);
      return;
    }

    addProductToCart(dummyProduct, undefined, specificUnit);
    if (!dummyProduct.hasVariants && dummyProduct.unit !== 'kg') {
      const unitSuffix = specificUnit ? ` (${specificUnit.unitName})` : '';
      showStatus(`تمت إضافة: ${item.name}${unitSuffix}`, 'success');
    }
    barcodeInputRef.current?.focus();
  }, [addProductToCart, showStatus, barcodeInputRef, setInitialWeightMilli, setWeightModalProduct, setUnitPickerProduct, quickItems]);

  const handleConfirmOpenPrice = (e: FormEvent) => {
    e.preventDefault();
    if (!openPriceItem) return;
    const parsedPrice = parseFloat(openPriceInputEgp);
    if (isNaN(parsedPrice) || parsedPrice <= 0) return;

    const pricePiasters = Math.round(parsedPrice * 100);
    const dummyProduct: Product = {
      id: openPriceItem.productId || openPriceItem.id,
      name: openPriceItem.name,
      barcode: null,
      pricePiasters: pricePiasters,
      costPiasters: Math.round(pricePiasters * 0.75),
      stockQuantityMilli: 100000,
      unit: openPriceItem.unit || 'piece',
      taxRatePercent: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    addProductToCart(dummyProduct);
    showStatus(`تمت إضافة: ${openPriceItem.name} (${parsedPrice.toFixed(2)} ج.م)`, 'success');
    setOpenPriceItem(null);
    setOpenPriceInputEgp('');
    barcodeInputRef.current?.focus();
  };

  return {
    smartItems,
    categoryTabs,
    customItemsCount,
    popularItemsCount,
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
