import { useState, useMemo, useCallback, useEffect } from 'react';
import type { FormEvent } from 'react';
import type { Product, QuickItem } from '../../types/models';
import type { SmartCatalogItem } from './types';

interface UsePosCatalogProps {
  catalogProducts: Product[];
  quickItems: QuickItem[];
  addProductToCart: (prod: Product) => void;
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
}

export const usePosCatalog = ({
  catalogProducts,
  quickItems,
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

  const [localPopularity, setLocalPopularity] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem('rafiq_pos_item_popularity');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('rafiq_pos_item_popularity', JSON.stringify(localPopularity));
    } catch {
      // ignore
    }
  }, [localPopularity]);

  const smartItems = useMemo<SmartCatalogItem[]>(() => {
    const list: SmartCatalogItem[] = [];
    const seenProductIds = new Set<string>();

    for (const p of catalogProducts) {
      const matchedQuick = quickItems.find((q) => q.productId === p.id);
      const isCustom = Boolean(matchedQuick) || Boolean(p.isCustomQuickItem);
      const popScore = (p.salesCount || 0) + (localPopularity[p.id] || 0);

      list.push({
        id: p.id,
        productId: p.id,
        name: p.name,
        pricePiasters: p.pricePiasters,
        isOpenPrice: matchedQuick?.isOpenPrice || Boolean(p.isOpenPrice),
        unit: p.unit || 'piece',
        categoryId: p.categoryId,
        categoryName: p.categoryName || 'عام',
        stockQuantityMilli: p.stockQuantityMilli,
        barcode: p.barcode,
        barcodes: p.barcodes,
        units: p.units,
        isCustomQuickItem: isCustom,
        salesCount: popScore,
        quickDisplayOrder: matchedQuick?.displayOrder ?? p.quickDisplayOrder ?? 9999,
        productRef: p,
      });
      seenProductIds.add(p.id);
    }

    for (const q of quickItems) {
      if (q.productId && seenProductIds.has(q.productId)) continue;
      const popScore = localPopularity[q.id] || 0;
      list.push({
        id: q.id,
        productId: q.productId,
        name: q.name,
        pricePiasters: q.pricePiasters,
        isOpenPrice: Boolean(q.isOpenPrice),
        unit: q.unit || 'piece',
        categoryId: null,
        categoryName: q.categoryName || 'عام',
        isCustomQuickItem: true,
        salesCount: popScore,
        quickDisplayOrder: q.displayOrder ?? 0,
      });
    }

    return list;
  }, [catalogProducts, quickItems, localPopularity]);

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

    const query = catalogSearchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((it) => {
        const matchName = it.name.toLowerCase().includes(query);
        const matchBarcode = it.barcode ? it.barcode.toLowerCase().includes(query) : false;
        return matchName || matchBarcode;
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

    return result
      .filter((it) => (it.categoryName || 'عام') === activeCatalogTab)
      .sort((a, b) => {
        if (b.salesCount !== a.salesCount) return b.salesCount - a.salesCount;
        return a.name.localeCompare(b.name, 'ar');
      });
  }, [smartItems, catalogSearchQuery, activeCatalogTab]);

  const handleSmartItemClick = useCallback((item: SmartCatalogItem) => {
    setLocalPopularity((prev) => ({
      ...prev,
      [item.id]: (prev[item.id] || 0) + 1,
    }));

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

    if (item.productRef) {
      addProductToCart(item.productRef);
      showStatus(`تمت إضافة: ${item.name}`, 'success');
      barcodeInputRef.current?.focus();
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
      pricePiasters: item.pricePiasters,
      costPiasters: Math.round(item.pricePiasters * 0.75),
      stockQuantityMilli: 100000,
      unit: item.unit || 'piece',
      taxRatePercent: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    addProductToCart(dummyProduct);
    showStatus(`تمت إضافة: ${item.name}`, 'success');
    barcodeInputRef.current?.focus();
  }, [addProductToCart, showStatus, barcodeInputRef, setInitialWeightMilli, setWeightModalProduct]);

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
