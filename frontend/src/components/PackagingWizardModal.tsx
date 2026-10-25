import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Boxes,
  Layers,
  AlertTriangle,
  RefreshCw,
  Plus,
  Trash2,
  X,
  Sparkles,
  Barcode as BarcodeIcon,
  Check,
  Info,
} from 'lucide-react';
import type { Product, ProductUnit } from '../types/models';
import { CustomSelect } from './CustomSelect';
import { MoneyInput } from './MoneyInput';
import { ToggleSwitch } from './ToggleSwitch';
import { formatArabicCurrency, normalizeArabicNumerals } from '../utils/money';
import { invoke } from '../bridge/ipc';
import { rafiqAlert, rafiqConfirm } from '../utils/dialogService';
import { getStoreTerminology } from '../utils/storeTerminology';

export interface PackagingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  basePricePiasters: number;
  baseCostPiasters: number;
  currentUnits: ProductUnit[];
  initialIsLooseSellable?: boolean;
  initialDefaultSaleUnitId?: string | null;
  storeType?: string;
  onApply: (config: {
    units: ProductUnit[];
    defaultSaleUnitId: string | null;
    defaultPurchaseUnitId: string | null;
    displayUnitId: string | null;
    isLooseSellable: boolean;
    updatedStockQuantityMilli?: number;
  }) => void;
}

interface WizardLevelRow {
  id: string; // Stable key
  name: string;
  ratioToNext: number;
  conversionFactor: number;
  sellPricePiasters: number;
  costPricePiasters: number;
  barcode: string;
  isBase: boolean;
}

const applyPriceRounding = (piasters: number, roundTo: number, premiumBps: number): number => {
  let price = piasters;
  if (premiumBps > 0) {
    price = Math.round(price * (1 + premiumBps / 10000));
  }
  if (roundTo <= 0) return price;
  return Math.ceil(price / roundTo) * roundTo;
};

const normalizeUnitName = (u?: string | null): string => {
  if (!u) return '';
  const trimmed = u.trim().toLowerCase();
  if (trimmed === 'piece' || trimmed === 'pieces' || trimmed === 'قطعة') return 'piece';
  if (trimmed === 'kg' || trimmed === 'kilogram' || trimmed === 'كيلو' || trimmed === 'كجم') return 'kg';
  return trimmed;
};

export const PackagingWizardModal: React.FC<PackagingWizardModalProps> = ({
  isOpen,
  onClose,
  product,
  basePricePiasters,
  baseCostPiasters,
  currentUnits,
  initialIsLooseSellable,
  initialDefaultSaleUnitId,
  storeType,
  onApply,
}) => {
  const terminology = getStoreTerminology(storeType);
  const [storeCategoryLabel, setStoreCategoryLabel] = useState<string>(
    terminology.packagingSectionTitle.replace(':', '').trim()
  );
  const [levels, setLevels] = useState<WizardLevelRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);
  const [defaultSaleUnitIndex, setDefaultSaleUnitIndex] = useState<number>(0);

  // Default is STRICTLY false (closed) unless explicitly passed as true
  const [isLooseSellable, setIsLooseSellable] = useState<boolean>(initialIsLooseSellable ?? product?.isLooseSellable ?? false);

  const [roundingRule, setRoundingRule] = useState<number>(25);
  const [marginPremiumBps, setMarginPremiumBps] = useState<number>(0);
  const [isRebasing, setIsRebasing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const initializedRef = useRef<boolean>(false);

  // Helper to generate clean, collision-free unit UUIDs
  const generateUniqueUnitId = useCallback((): string => {
    return 'punit_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }, []);

  // Recalculate prices across current levels when rounding rule or margin premium changes
  const recalculatePrices = useCallback((newRule: number, newMarginBps: number, targetLevels?: WizardLevelRow[]) => {
    const list = targetLevels || levels;
    if (list.length === 0) return;
    const topFactor = list[0].conversionFactor;
    const topSell = list[0].sellPricePiasters > 0 ? list[0].sellPricePiasters : 10000;
    const topCost = list[0].costPricePiasters > 0 ? list[0].costPricePiasters : 7500;

    const updated = list.map((lvl, idx) => {
      if (idx === 0) return lvl;
      const rawSell = Math.round((topSell * lvl.conversionFactor) / topFactor);
      const rawCost = Math.round((topCost * lvl.conversionFactor) / topFactor);
      return {
        ...lvl,
        sellPricePiasters: applyPriceRounding(rawSell, newRule, newMarginBps),
        costPricePiasters: rawCost,
      };
    });
    setLevels(updated);
  }, [levels]);

  // Robust, synchronous row builder from ProductUnit array with auto-healing of inverted/corrupted base prices
  const buildRowsFromUnits = useCallback((unitsList: ProductUnit[]): WizardLevelRow[] => {
    if (unitsList && unitsList.length > 1) {
      // Clean out phantom 'piece' or 'pieces' unit if real Arabic packaging units exist
      let cleaned = unitsList.filter(u => u && u.unitName);
      const hasArabicUnits = cleaned.some(u => {
        const n = u.unitName.trim().toLowerCase();
        return n !== 'piece' && n !== 'pieces';
      });
      if (hasArabicUnits && cleaned.length > 2) {
        cleaned = cleaned.filter(u => {
          const n = u.unitName.trim().toLowerCase();
          return n !== 'piece' && n !== 'pieces';
        });
      }

      const sorted = [...cleaned].sort((a, b) => b.conversionFactor - a.conversionFactor);
      let topUnit = sorted[0];
      let baseUnit = sorted[sorted.length - 1];

      // Self-healing: Detect corrupted multiplier (e.g. factor >= 100 or base price collapsed below 25 piasters)
      const isExtremeCorrupted = topUnit.conversionFactor >= 100 || (topUnit.conversionFactor > 1 && baseUnit.sellPricePiasters < 25 && topUnit.sellPricePiasters >= 500);
      const isCorrupted = isExtremeCorrupted || (topUnit.conversionFactor > 1 && baseUnit.sellPricePiasters >= topUnit.sellPricePiasters);

      if (isExtremeCorrupted && topUnit.sellPricePiasters > 0) {
        const recoveredFactor = topUnit.conversionFactor === 400 ? 20 : (topUnit.conversionFactor >= 100 ? 10 : topUnit.conversionFactor);
        topUnit.conversionFactor = recoveredFactor;
        baseUnit.conversionFactor = 1;
        baseUnit.sellPricePiasters = Math.max(25, Math.round(topUnit.sellPricePiasters / recoveredFactor));
        baseUnit.costPricePiasters = Math.max(20, Math.round(topUnit.costPricePiasters / recoveredFactor));
      }

      return sorted.map((u, i) => {
        const nextFactor = i < sorted.length - 1 ? sorted[i + 1].conversionFactor : 1;
        const ratio = nextFactor > 0 ? Math.round(u.conversionFactor / nextFactor) : u.conversionFactor;
        
        let sellPrice = u.sellPricePiasters;
        let costPrice = u.costPricePiasters;

        if (isCorrupted && i > 0 && !isExtremeCorrupted) {
          sellPrice = Math.max(25, Math.round((topUnit.sellPricePiasters * u.conversionFactor) / topUnit.conversionFactor));
          costPrice = Math.max(25, Math.round((topUnit.costPricePiasters * u.conversionFactor) / topUnit.conversionFactor));
        }

        return {
          id: (u.id && !u.id.startsWith('lvl_')) ? u.id : generateUniqueUnitId(),
          name: u.unitName,
          ratioToNext: Math.max(1, ratio),
          conversionFactor: u.conversionFactor,
          sellPricePiasters: sellPrice,
          costPricePiasters: costPrice,
          barcode: u.barcode || '',
          isBase: u.isBaseUnit || u.conversionFactor === 1 || i === sorted.length - 1,
        };
      });
    }

    // Default 2 rows if brand new product or 1 unit only
    const baseSell = basePricePiasters > 0 ? basePricePiasters : 1000;
    const baseCost = baseCostPiasters > 0 ? baseCostPiasters : 750;
    const baseName = (unitsList && unitsList[0]?.unitName && unitsList[0].unitName !== 'piece')
      ? unitsList[0].unitName
      : (terminology.baseUnitDefaultName || 'قرص');
    const baseBarcode = (unitsList && unitsList[0]?.barcode) || '';
    const topUnitId = generateUniqueUnitId();
    const baseUnitId = (unitsList && unitsList[0]?.id && !unitsList[0].id.startsWith('lvl_')) 
      ? unitsList[0].id 
      : generateUniqueUnitId();
    let topUnitName = terminology.packagingTopUnitDefault || 'علبة';
    if (topUnitName.trim() === baseName.trim()) {
      topUnitName = 'علبة';
    }

    return [
      {
        id: topUnitId,
        name: topUnitName,
        ratioToNext: 10,
        conversionFactor: 10,
        sellPricePiasters: baseSell * 10,
        costPricePiasters: baseCost * 10,
        barcode: '',
        isBase: false,
      },
      {
        id: baseUnitId,
        name: baseName,
        ratioToNext: 1,
        conversionFactor: 1,
        sellPricePiasters: baseSell,
        costPricePiasters: baseCost,
        barcode: baseBarcode,
        isBase: true,
      },
    ];
  }, [basePricePiasters, baseCostPiasters, generateUniqueUnitId, terminology]);

  // Synchronous & infallible levels initialization on modal open (Run ONCE per open)
  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = false;
      return;
    }

    if (initializedRef.current) return;
    initializedRef.current = true;

    const effectiveLoose = initialIsLooseSellable !== undefined 
      ? initialIsLooseSellable 
      : (product?.isLooseSellable ?? false);
    setIsLooseSellable(effectiveLoose);

    const resolveDefaultIndex = (rows: WizardLevelRow[]): number => {
      const targetId = initialDefaultSaleUnitId || product?.defaultSaleUnitId;
      if (targetId) {
        const found = rows.findIndex(r => r.id === targetId);
        if (found !== -1) return found;
      }
      return effectiveLoose ? rows.length - 1 : 0;
    };

    // 1. If currentUnits has multi units from parent, load them immediately
    if (currentUnits && currentUnits.length > 1) {
      const rows = buildRowsFromUnits(currentUnits);
      setLevels(rows);
      setDefaultSaleUnitIndex(resolveDefaultIndex(rows));
      return;
    }

    // 2. If product has an ID, fetch directly from SQLite database to guarantee no units are lost!
    if (product && product.id) {
      void invoke<ProductUnit[]>('productUnits:getByProduct', { productId: product.id })
        .then((dbUnits) => {
          if (dbUnits && dbUnits.length > 1) {
            const rows = buildRowsFromUnits(dbUnits);
            setLevels(rows);
            setDefaultSaleUnitIndex(resolveDefaultIndex(rows));
          } else {
            const rows = buildRowsFromUnits(currentUnits || []);
            setLevels(rows);
            setDefaultSaleUnitIndex(0);
          }
        })
        .catch(() => {
          const rows = buildRowsFromUnits(currentUnits || []);
          setLevels(rows);
          setDefaultSaleUnitIndex(0);
        });
    } else {
      const rows = buildRowsFromUnits(currentUnits || []);
      setLevels(rows);
      setDefaultSaleUnitIndex(0);
    }
  }, [isOpen, currentUnits, product, buildRowsFromUnits, initialIsLooseSellable, initialDefaultSaleUnitId]);

  // Separate store category label fetch (never blocks levels rendering)
  useEffect(() => {
    if (!isOpen) return;
    void invoke<Record<string, string>>('settings:getAll')
      .then((settings) => {
        if (!settings) return;
        const type = (settings.store_type || '').toLowerCase();
        const header = (settings.receipt_header || '').toLowerCase();
        const name = (settings.store_name || '').toLowerCase();
        const combined = `${type} ${header} ${name}`;

        if (combined.includes('pharma') || combined.includes('صيدل') || combined.includes('دواء') || combined.includes('علاج')) {
          setStoreCategoryLabel('صيدلية وأدوية');
        } else if (combined.includes('supermarket') || combined.includes('سوبر') || combined.includes('ماركت') || combined.includes('بقالة') || combined.includes('أغذية')) {
          setStoreCategoryLabel('سوبرماركت وبقالة');
        } else if (combined.includes('stationery') || combined.includes('bookstore') || combined.includes('مكتب') || combined.includes('قرطاس')) {
          setStoreCategoryLabel('مكتبات وقرطاسية');
        } else if (combined.includes('phone') || combined.includes('موبايل') || combined.includes('هاتف') || combined.includes('إلكترون')) {
          setStoreCategoryLabel('هواتف وإلكترونيات');
        }
      })
      .catch(() => {
        // default remains
      });
  }, [isOpen]);

  // Recalculate factors when ratio changes
  const handleRatioChange = (index: number, newRatioStr: string) => {
    const rawVal = parseInt(normalizeArabicNumerals(newRatioStr), 10);
    const newRatio = isNaN(rawVal) || rawVal < 1 ? 1 : rawVal;

    const updated = [...levels];
    updated[index].ratioToNext = newRatio;

    // Recalculate factors from bottom to top
    updated[updated.length - 1].conversionFactor = 1;
    for (let i = updated.length - 2; i >= 0; i--) {
      updated[i].conversionFactor = updated[i + 1].conversionFactor * updated[i].ratioToNext;
    }

    // Cascade prices
    const topFactor = updated[0].conversionFactor;
    const topSell = updated[0].sellPricePiasters > 0 ? updated[0].sellPricePiasters : 10000;
    const topCost = updated[0].costPricePiasters > 0 ? updated[0].costPricePiasters : 7500;

    for (let i = 1; i < updated.length; i++) {
      const rawSell = Math.round((topSell * updated[i].conversionFactor) / topFactor);
      const rawCost = Math.round((topCost * updated[i].conversionFactor) / topFactor);
      updated[i].sellPricePiasters = applyPriceRounding(rawSell, roundingRule, marginPremiumBps);
      updated[i].costPricePiasters = rawCost;
    }

    setLevels(updated);
  };

  const handleNameChange = (index: number, newName: string) => {
    const updated = [...levels];
    updated[index].name = newName;
    setLevels(updated);
  };

  const handlePriceChange = (index: number, newPiasters: number) => {
    const updated = [...levels];
    updated[index].sellPricePiasters = newPiasters;
    setLevels(updated);
  };

  const handleCostChange = (index: number, newCostPiasters: number) => {
    const updated = [...levels];
    updated[index].costPricePiasters = newCostPiasters;
    setLevels(updated);
  };

  const handleBarcodeChange = (index: number, newBarcode: string) => {
    const updated = [...levels];
    updated[index].barcode = normalizeArabicNumerals(newBarcode);
    setLevels(updated);
  };

  const handleGenerateBarcode = (index: number) => {
    const randomEan = '29' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
    handleBarcodeChange(index, randomEan);
  };

  // Re-calculate single row price from base unit
  const handleAutoCalculateRow = (index: number) => {
    if (index === 0 && levels.length > 1) {
      const base = levels[levels.length - 1];
      const factor = levels[0].conversionFactor;
      const calculatedSell = base.sellPricePiasters * factor;
      const calculatedCost = base.costPricePiasters * factor;

      const updated = [...levels];
      updated[0].sellPricePiasters = calculatedSell;
      updated[0].costPricePiasters = calculatedCost;
      setLevels(updated);
    } else {
      const top = levels[0];
      const targetFactor = levels[index].conversionFactor;
      const topFactor = top.conversionFactor;

      const rawSell = Math.round((top.sellPricePiasters * targetFactor) / topFactor);
      const rawCost = Math.round((top.costPricePiasters * targetFactor) / topFactor);

      const updated = [...levels];
      updated[index].sellPricePiasters = applyPriceRounding(rawSell, roundingRule, marginPremiumBps);
      updated[index].costPricePiasters = rawCost;
      setLevels(updated);
    }
  };

  const handleAddLevel = () => {
    if (levels.length >= 4) {
      setErrorMsg('الحد الأقصى المسموح به هو 4 مستويات تعبئة لكل صنف.');
      return;
    }

    if (levels.length === 0) {
      const baseSell = basePricePiasters > 0 ? basePricePiasters : 1000;
      const baseCost = baseCostPiasters > 0 ? baseCostPiasters : 750;
      const rows: WizardLevelRow[] = [
        {
          id: 'lvl_0',
          name: 'كرتونة',
          ratioToNext: 10,
          conversionFactor: 10,
          sellPricePiasters: baseSell * 10,
          costPricePiasters: baseCost * 10,
          barcode: '',
          isBase: false,
        },
        {
          id: 'lvl_1',
          name: 'قطعة',
          ratioToNext: 1,
          conversionFactor: 1,
          sellPricePiasters: baseSell,
          costPricePiasters: baseCost,
          barcode: '',
          isBase: true,
        },
      ];
      setLevels(rows);
      return;
    }

    const insertIdx = levels.length - 1;
    const newLvl: WizardLevelRow = {
      id: generateUniqueUnitId(),
      name: 'وحدة فرعية',
      ratioToNext: 2,
      conversionFactor: 2,
      sellPricePiasters: Math.round(levels[insertIdx].sellPricePiasters * 2),
      costPricePiasters: Math.round(levels[insertIdx].costPricePiasters * 2),
      barcode: '',
      isBase: false,
    };

    const updated = [...levels];
    updated.splice(insertIdx, 0, newLvl);

    updated[updated.length - 1].conversionFactor = 1;
    for (let i = updated.length - 2; i >= 0; i--) {
      updated[i].conversionFactor = updated[i + 1].conversionFactor * updated[i].ratioToNext;
    }

    setLevels(updated);
  };

  const handleRemoveLevel = (index: number) => {
    if (levels.length <= 2) return;
    if (index === levels.length - 1) return;

    const updated = levels.filter((_, idx) => idx !== index);
    updated[updated.length - 1].conversionFactor = 1;
    for (let i = updated.length - 2; i >= 0; i--) {
      updated[i].conversionFactor = updated[i + 1].conversionFactor * updated[i].ratioToNext;
    }

    if (defaultSaleUnitIndex >= updated.length) {
      setDefaultSaleUnitIndex(0);
    }

    setLevels(updated);
  };





  // Pricing warnings check
  const pricingWarnings: string[] = [];
  for (let i = 0; i < levels.length - 1; i++) {
    const parent = levels[i];
    const child = levels[i + 1];
    const childSumSell = child.sellPricePiasters * parent.ratioToNext;

    if (parent.sellPricePiasters > 0 && childSumSell < parent.sellPricePiasters) {
      pricingWarnings.push(
        `تنبيه: سعر بيع أجزاء «${child.name}» إجمالاً (${formatArabicCurrency(childSumSell)}) أقل من سعر العبوة الكاملة «${parent.name}» (${formatArabicCurrency(parent.sellPricePiasters)})!`
      );
    }
  }

  // Pre-check for Rebase:
  const handleSaveAndConfirm = async () => {
    setErrorMsg(null);

    if (levels.length === 0) {
      setErrorMsg('يرجى إضافة مستويات تعبئة للصنف أولاً.');
      return;
    }

    for (let i = 0; i < levels.length; i++) {
      if (!levels[i].name.trim()) {
        setErrorMsg(`اسم المستوى رقم ${i + 1} مطلوب.`);
        return;
      }
      if (levels[i].sellPricePiasters <= 0) {
        setErrorMsg(`سعر بيع '${levels[i].name}' يجب أن يكون أكبر من الصفر.`);
        return;
      }
    }

    const currentBaseUnitNormalized = normalizeUnitName(product?.unit);
    const newBaseUnitRow = levels.length > 0 ? levels[levels.length - 1] : null;
    const newBaseUnitNormalized = normalizeUnitName(newBaseUnitRow?.name);

    // Rebase check: ONLY if warehouse base unit ACTUALLY changed!
    const hasBaseUnitChanged = Boolean(
      product &&
      product.id &&
      product.stockQuantityMilli > 0 &&
      currentBaseUnitNormalized &&
      newBaseUnitNormalized &&
      currentBaseUnitNormalized !== newBaseUnitNormalized
    );

    let multiplyStockByFactor: number | null = null;
    let didRebaseStock = false;

    if (hasBaseUnitChanged && product && product.id) {
      if (product.hasVariants || product.parentId) {
        await rafiqAlert({
          title: 'غير مسموح بإعادة التأسيس للأصناف متفرعة المقاسات',
          message: 'هذا الصنف يحتوي على ألوان ومقاسات متفرعة. لا يمكن إعادة التأسيس الآلي له.',
          variant: 'error',
        });
        return;
      }

      const topRow = levels[0];
      const currentStockUnits = Math.round(product.stockQuantityMilli / 1000);
      const oldUnitName = product.unit || 'وحدة';
      const newUnitName = newBaseUnitRow?.name || 'وحدة';

      // 1. Expanding to smaller unit (e.g. from علبة to برشامه):
      if (levels.length > 1 && topRow && topRow.conversionFactor > 1 && normalizeUnitName(topRow.name) === currentBaseUnitNormalized) {
        const factor = topRow.conversionFactor;
        const convertedStock = currentStockUnits * factor;

        const confirmRebase = await rafiqConfirm({
          title: 'تأكيد احتساب رصيد المخزن للعبوة الجديدة',
          message: `الصنف مسجل حالياً بوحدة «${oldUnitName}» وبرصيد (${currentStockUnits} ${oldUnitName}).\n\nهل تريد تحويل الرصيد تلقائياً ليكون بأصغر وحدة «${newUnitName}» (${convertedStock} ${newUnitName}) لمطابقة منظومة التعبئة وتجزئة البيع؟`,
          confirmText: `نعم، تحويل إلى (${convertedStock} ${newUnitName})`,
          cancelText: `لا، الإبقاء على (${currentStockUnits} ${newUnitName})`,
          variant: 'info',
        });

        if (confirmRebase) {
          multiplyStockByFactor = factor;
          didRebaseStock = true;
        }
      }
      // 2. Collapsing back to larger unit (e.g. from برشامه to علبة):
      else if (levels.length === 1 && currentUnits && currentUnits.length > 1) {
        const oldTop = currentUnits.find(u => !u.isBaseUnit && u.conversionFactor > 1);
        const factor = oldTop ? oldTop.conversionFactor : 1;
        if (factor > 1) {
          const convertedStock = Math.floor(currentStockUnits / factor);
          const confirmCollapse = await rafiqConfirm({
            title: 'تأكيد دمج رصيد المخزن للعبوة الأكبر',
            message: `الصنف مسجل حالياً بوحدة «${oldUnitName}» وبرصيد (${currentStockUnits} ${oldUnitName}).\n\nهل تريد تحويل الرصيد للـ «${newUnitName}» (${convertedStock} ${newUnitName})؟`,
            confirmText: `نعم، تحويل إلى (${convertedStock} ${newUnitName})`,
            cancelText: `لا، الإبقاء على (${currentStockUnits})`,
            variant: 'info',
          });

          if (confirmCollapse) {
            multiplyStockByFactor = -factor;
            didRebaseStock = true;
          }
        }
      }
    }

    // Convert wizard rows to final ProductUnits array
    const finalUnits: ProductUnit[] = levels.map((lvl, idx) => ({
      id: lvl.id,
      productId: product?.id,
      unitName: lvl.name.trim(),
      conversionFactor: lvl.conversionFactor,
      isBaseUnit: lvl.isBase,
      sellPricePiasters: lvl.sellPricePiasters,
      costPricePiasters: lvl.costPricePiasters,
      barcode: lvl.barcode ? lvl.barcode.trim() : null,
      isDivisible: false,
      sortOrder: idx,
    }));

    // Selected Default Sale Unit by the Merchant:
    const chosenSaleUnit = levels[defaultSaleUnitIndex] || levels[0];
    const defPurchaseUnit = levels[0];

    setIsRebasing(true);
    let updatedStockQuantityMilli = product?.stockQuantityMilli;

    // If product exists in database, immediately persist packaging levels directly to SQLite
    if (product && product.id) {
      try {
        const updatedProd = await invoke<Product>('packaging:saveLevels', {
          productId: product.id,
          units: finalUnits,
          defaultSaleUnitId: chosenSaleUnit ? chosenSaleUnit.id : null,
          defaultPurchaseUnitId: defPurchaseUnit ? defPurchaseUnit.id : null,
          displayUnitId: null,
          isLooseSellable,
          multiplyStockByFactor,
        });
        if (updatedProd && typeof updatedProd.stockQuantityMilli === 'number') {
          updatedStockQuantityMilli = updatedProd.stockQuantityMilli;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('Direct packaging save warning:', msg);
        setErrorMsg(msg);
        setIsRebasing(false);
        return;
      }
    } else if (didRebaseStock && multiplyStockByFactor && product) {
      if (multiplyStockByFactor > 1) {
        updatedStockQuantityMilli = product.stockQuantityMilli * multiplyStockByFactor;
      } else if (multiplyStockByFactor < -1) {
        updatedStockQuantityMilli = Math.floor(product.stockQuantityMilli / Math.abs(multiplyStockByFactor));
      }
    }

    setIsRebasing(false);

    onApply({
      units: finalUnits,
      defaultSaleUnitId: chosenSaleUnit ? chosenSaleUnit.id : null,
      defaultPurchaseUnitId: defPurchaseUnit ? defPurchaseUnit.id : null,
      displayUnitId: null,
      isLooseSellable,
      updatedStockQuantityMilli,
    });

    onClose();
  };

  if (!isOpen) return null;

  const currentBaseUnitNormalized = normalizeUnitName(product?.unit);
  const topUnitRow = levels.length > 0 ? levels[0] : null;
  const baseUnitRow = levels.length > 0 ? levels[levels.length - 1] : null;
  const newBaseUnitNormalized = normalizeUnitName(baseUnitRow?.name);

  // Show notice ONLY if base unit actually differs between DB and wizard
  const showStockNotice = Boolean(
    product &&
    product.id &&
    product.stockQuantityMilli > 0 &&
    currentBaseUnitNormalized &&
    newBaseUnitNormalized &&
    currentBaseUnitNormalized !== newBaseUnitNormalized &&
    levels.length > 1 &&
    topUnitRow &&
    topUnitRow.conversionFactor > 1 &&
    normalizeUnitName(topUnitRow.name) === currentBaseUnitNormalized
  );

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      {/* Maximum comfortable, wide desktop layout to completely avoid horizontal or vertical cramping */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-2xl shadow-2xl w-[96vw] max-w-[1360px] max-h-[92vh] flex flex-col overflow-hidden text-right font-sans">
        
        {/* Modal Header */}
        <div className="px-6 py-3.5 border-b border-line dark:border-line-dark flex items-center justify-between shrink-0 bg-surface-2/60 dark:bg-surface-dark-2/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 dark:bg-brand/20 flex items-center justify-center text-brand dark:text-brand-bright shadow-2xs">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink dark:text-ink-dark m-0 flex items-center gap-2 whitespace-nowrap">
                <span>معالج التعبئة وتجزئة العبوات</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-soft dark:bg-brand-soft/30 text-brand-dark dark:text-brand-bright font-bold whitespace-nowrap">
                  {storeCategoryLabel}
                </span>
              </h2>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted m-0 mt-0.5 whitespace-nowrap">
                تحديد أسعار وهوامش العبوات وتعيين الوحدة الافتراضية للكاشير بدقة تامة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-surface dark:hover:bg-surface-dark transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-danger-soft text-danger border border-danger/30 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Rebase Notice Alert: Clean & Simple Egyptian Phrasing */}
          {showStockNotice && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/50 rounded-xl text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-200">
                <RefreshCw className="w-4 h-4 shrink-0 text-amber-600" />
                <span>تنبيه ضبط رصيد المخزن تلقائياً:</span>
              </div>
              <p className="text-amber-700 dark:text-amber-300 m-0 leading-relaxed">
                الصنف مسجل حالياً برصيد ({Math.round(product!.stockQuantityMilli / 1000)}). عند اعتماد التعبئة والتجزئة، سيسألك النظام لتحويل رصيده تلقائياً ليكون بأصغر وحدة «{baseUnitRow?.name || 'قرص'}» ({Math.round(product!.stockQuantityMilli / 1000) * (topUnitRow?.conversionFactor || 1)} {baseUnitRow?.name}) لتطابق الجرد الفعلي.
              </p>
            </div>
          )}


          {/* Pricing Automation Controls & Toggle in One Balanced, Spacious Row */}
          <div className="p-3.5 bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 shadow-2xs">
            {/* Info Tip on the right in RTL */}
            <div className="flex items-center gap-2.5 p-2.5 px-3.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark flex-1">
              <Sparkles className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted leading-relaxed m-0">
                <strong className="text-ink dark:text-ink-dark font-bold">تسعير ذكي وتلقائي:</strong> يتم احتساب تكلفة وسعر بيع كل عبوة آلياً بدقة القروش وبدون كسور عائمة لضمان دقة الأرباح في الكاشير.
              </p>
            </div>

            {/* Controls: Rounding, Premium Margin, Loose toggle */}
            <div className="flex items-center gap-4 shrink-0 flex-wrap justify-end">
              <div className="w-56">
                <label className="block text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted mb-1 whitespace-nowrap">
                  تقريب السعر:
                </label>
                <CustomSelect
                  value={roundingRule.toString()}
                  onChange={(val) => {
                    const num = parseInt(val, 10);
                    setRoundingRule(num);
                    recalculatePrices(num, marginPremiumBps);
                  }}
                  options={[
                    { value: '0', label: 'دقيق بدون تقريب (أقرب قرش)' },
                    { value: '25', label: 'لأقرب ربع جنيه (25 قرش)' },
                    { value: '50', label: 'لأقرب نصف جنيه (50 قرش)' },
                    { value: '100', label: 'لأقرب جنيه كامل (100 قرش)' },
                  ]}
                  size="sm"
                />
              </div>

              <div className="w-56">
                <label className="block text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted mb-1 whitespace-nowrap">
                  هامش بيع التجزئة:
                </label>
                <CustomSelect
                  value={marginPremiumBps.toString()}
                  onChange={(val) => {
                    const num = parseInt(val, 10);
                    setMarginPremiumBps(num);
                    recalculatePrices(roundingRule, num);
                  }}
                  options={[
                    { value: '0', label: 'بدون زيادة (سعر متساوي)' },
                    { value: '500', label: '+5% علاوة بيع مفكوك' },
                    { value: '1000', label: '+10% علاوة بيع مفكوك' },
                    { value: '1500', label: '+15% علاوة بيع مفكوك' },
                  ]}
                  size="sm"
                />
              </div>

              {/* In-Place Loose Toggle */}
              <div className="flex flex-col justify-center border-r border-line dark:border-line-dark pr-4">
                <span className="text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted mb-1 whitespace-nowrap">
                  {terminology.looseSellingLabel}
                </span>
                <div className="flex items-center gap-2 h-[32px] whitespace-nowrap">
                  <ToggleSwitch
                    checked={isLooseSellable}
                    onChange={setIsLooseSellable}
                    size="sm"
                  />
                  <span className={`text-xs font-bold whitespace-nowrap ${isLooseSellable ? 'text-paid' : 'text-ink-muted dark:text-ink-dark-muted'}`}>
                    {isLooseSellable ? 'مسموح' : 'ممنوع'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing Warnings */}
          {pricingWarnings.length > 0 && (
            <div className="p-3 rounded-xl bg-warn/10 border border-warn/30 text-warn-dark dark:text-warn text-xs space-y-1">
              {pricingWarnings.map((warning, wIdx) => (
                <div key={wIdx} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warn" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Packaging Units Table Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
                <span className="text-xs font-bold text-ink dark:text-ink-dark">
                  مستويات التعبئة والأسعار:
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddLevel}
                disabled={levels.length >= 4}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-brand/30 hover:bg-brand-soft text-brand text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{terminology.packagingLevelPlaceholder}</span>
              </button>
            </div>

            {/* Wide, fluid, comfortable table */}
            <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-right text-xs table-fixed">
                <thead>
                  <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold">
                    <th className="py-2.5 px-3 w-[15%] whitespace-nowrap">المستوى والاسم</th>
                    <th className="py-2.5 px-2 text-center w-[18%] whitespace-nowrap">المحتوى والتعبئة</th>
                    <th className="py-2.5 px-2 text-center w-[7%] whitespace-nowrap">المعامل</th>
                    <th className="py-2.5 px-2 w-[16%] whitespace-nowrap">سعر البيع *</th>
                    <th className="py-2.5 px-2 w-[13%] whitespace-nowrap">سعر التكلفة</th>
                    <th className="py-2.5 px-2 w-[14%] whitespace-nowrap">الباركود</th>
                    <th className="py-2.5 px-2 text-center w-[14%] whitespace-nowrap">افتراضية الكاشير</th>
                    <th className="py-2.5 px-1 text-center w-[3%] whitespace-nowrap">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {levels.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-ink-muted dark:text-ink-dark-muted">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Boxes className="w-8 h-8 text-line dark:text-line-dark stroke-[1.5]" />
                          <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">
                            اضغط «إضافة مستوى فرعي» لتحديد وحدات الصنف
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    levels.map((lvl, idx) => {
                    const isBase = idx === levels.length - 1;
                    const nextUnit = !isBase ? levels[idx + 1] : null;
                    const isRowSelected = selectedRowIndex === idx;
                    const isDefaultSale = defaultSaleUnitIndex === idx;

                    return (
                      <tr
                        key={lvl.id}
                        onClick={() => setSelectedRowIndex(idx)}
                        className={`transition-colors duration-100 ${
                          isRowSelected
                            ? 'bg-brand-soft/30 dark:bg-brand-soft/20'
                            : 'hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 bg-surface dark:bg-surface-dark'
                        }`}
                      >
                        {/* Name */}
                        <td className="py-2.5 px-3">
                          <input
                            type="text"
                            value={lvl.name}
                            onChange={(e) => handleNameChange(idx, e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg font-bold text-xs hover:border-line-hover focus:ring-1 focus:ring-brand focus:border-brand"
                            placeholder="اسم الوحدة"
                          />
                        </td>

                        {/* Ratio / Packaging Content */}
                        <td className="py-2.5 px-2 text-center">
                          {!isBase && nextUnit ? (
                            <div className="inline-flex items-center justify-center gap-1.5 bg-surface-2 dark:bg-surface-dark-2 px-3 py-1 rounded-lg border border-line dark:border-line-dark whitespace-nowrap">
                              <span className="text-ink-muted text-xs whitespace-nowrap">تحتوي على</span>
                              <input
                                type="number"
                                min="2"
                                max="1000"
                                value={lvl.ratioToNext}
                                onChange={(e) => handleRatioChange(idx, e.target.value)}
                                className="w-12 h-7 px-1 text-center bg-surface dark:bg-surface-dark border border-line rounded-md font-mono font-bold text-xs focus:ring-1 focus:ring-brand focus:border-brand"
                              />
                              <span className="text-ink dark:text-ink-dark font-bold text-xs truncate max-w-[100px] whitespace-nowrap">
                                {nextUnit.name}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-surface-2 dark:bg-surface-dark-2 text-ink-muted text-xs font-bold border border-line dark:border-line-dark whitespace-nowrap">
                              أصغر وحدة (للمخزن)
                            </span>
                          )}
                        </td>

                        {/* Factor */}
                        <td className="py-2.5 px-2 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded bg-brand-soft/60 dark:bg-brand-soft/20 font-mono font-bold text-brand dark:text-brand-bright text-xs whitespace-nowrap">
                            {lvl.conversionFactor}×
                          </span>
                        </td>

                        {/* Sell Price */}
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-1.5">
                            <MoneyInput
                              valuePiasters={lvl.sellPricePiasters}
                              onChangePiasters={(val) => handlePriceChange(idx, val)}
                              className="h-8 text-xs font-bold text-paid dark:text-paid-bright flex-1"
                            />
                            {!isBase && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAutoCalculateRow(idx);
                                }}
                                title="إعادة الحساب التلقائي للسعر بناءً على المعامل وقاعدة التقريب"
                                className="h-8 px-2 rounded-md bg-brand-soft dark:bg-brand-soft/30 hover:bg-brand hover:text-white text-brand dark:text-brand-bright transition-colors cursor-pointer shrink-0 text-xs font-bold flex items-center justify-center whitespace-nowrap"
                              >
                                <span className="whitespace-nowrap">تلقائي</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Cost Price */}
                        <td className="py-2.5 px-2">
                          <MoneyInput
                            valuePiasters={lvl.costPricePiasters}
                            onChangePiasters={(val) => handleCostChange(idx, val)}
                            className="h-8 text-xs font-mono flex-1 text-ink-muted dark:text-ink-dark-muted"
                          />
                        </td>

                        {/* Barcode */}
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={lvl.barcode}
                              onChange={(e) => handleBarcodeChange(idx, e.target.value)}
                              placeholder="باركود العبوة"
                              className="w-full h-8 px-2.5 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-md font-mono text-xs focus:ring-1 focus:ring-brand"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerateBarcode(idx);
                              }}
                              title="توليد باركود دولي عشوائي لهذه العبوة"
                              className="h-8 w-8 rounded-md bg-surface-2 dark:bg-surface-dark-2 hover:bg-brand hover:text-white text-ink-muted border border-line dark:border-line-dark transition-colors cursor-pointer shrink-0 flex items-center justify-center"
                            >
                              <BarcodeIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* Default Sale Unit Choice for Cashier */}
                        <td className="py-2.5 px-2 text-center">
                          {isDefaultSale ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-paid-soft text-paid dark:bg-paid-dark-soft dark:text-paid-bright font-bold text-xs border border-paid/20 shadow-2xs select-none whitespace-nowrap">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span className="whitespace-nowrap">الافتراضية للبيع</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDefaultSaleUnitIndex(idx);
                              }}
                              className="text-xs font-bold text-ink-muted hover:text-brand px-3 py-1 rounded-lg border border-line dark:border-line-dark hover:border-brand/40 bg-surface dark:bg-surface-dark cursor-pointer transition-colors shadow-2xs active:scale-95 whitespace-nowrap"
                              title="جعل هذه العبوة هي التي تنزل في الفاتورة افتراضياً ويظهر سعرها على كارت الصنف"
                            >
                              <span className="whitespace-nowrap">تعيين كافتراضية</span>
                            </button>
                          )}
                        </td>

                        {/* Delete Row */}
                        <td className="py-2.5 px-1 text-center">
                          {!isBase && levels.length > 2 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveLevel(idx);
                              }}
                              className="p-1.5 rounded-lg text-ink-muted hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer inline-flex items-center justify-center"
                              title="حذف هذا المستوى"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick Guide in Egyptian Vernacular (المختصر المفيد بالمصري) */}
          <div className="p-3.5 bg-surface-2/90 dark:bg-surface-dark-2/90 border border-line dark:border-line-dark rounded-xl flex flex-col gap-2.5 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-ink dark:text-ink-dark">
              <Info className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
              <span>المختصر المفيد لمنظومة التعبئة (على السريع بالمصري):</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-[11px] leading-relaxed">
              <div className="bg-surface dark:bg-surface-dark p-2.5 rounded-lg border border-line dark:border-line-dark shadow-2xs">
                <span className="font-bold text-brand dark:text-brand-bright block mb-1">1. رصيد المخزن دايماً بأصغر وحدة:</span>
                <span className="text-ink-muted dark:text-ink-dark-muted">
                  السيستم بيخزن رصيدك بأصغر وحدة ({levels[levels.length - 1]?.name || terminology.baseUnitDefaultName}) عشان الجرد والعد ميتلخبطش منك أبداً حتى لو بتشتري عبوات مجمعة.
                </span>
              </div>
              <div className="bg-surface dark:bg-surface-dark p-2.5 rounded-lg border border-line dark:border-line-dark shadow-2xs">
                <span className="font-bold text-paid dark:text-paid-bright block mb-1">2. العبوة الافتراضية للكاشير:</span>
                <span className="text-ink-muted dark:text-ink-dark-muted">
                  العبوة المعلمة بالأخضر هي اللي هتنزل تلقائياً للكاشير أول ما يضرب الصنف بالسكانر، وتقدر تبدلها من زرار «تعيين كافتراضية».
                </span>
              </div>
              <div className="bg-surface dark:bg-surface-dark p-2.5 rounded-lg border border-line dark:border-line-dark shadow-2xs">
                <span className="font-bold text-ink dark:text-ink-dark block mb-1">3. {terminology.looseSellingLabel}:</span>
                <span className="text-ink-muted dark:text-ink-dark-muted">
                  لو «مسموح» الكاشير يقدر يفك العبوة ويبيع بالتجزئة (قطاعي)، ولو «ممنوع» مش هيعرف يبيع غير العبوة المقفولة بس.
                </span>
              </div>
              <div className="bg-surface dark:bg-surface-dark p-2.5 rounded-lg border border-line dark:border-line-dark shadow-2xs">
                <span className="font-bold text-warn dark:text-warn-bright block mb-1">4. التسعير والتقريب الذكي:</span>
                <span className="text-ink-muted dark:text-ink-dark-muted">
                  التكلفة بتتقسم بالمليم على الوحدات، وسعر البيع بيتقرب تلقائياً عشان الفكة وكسور القروش متعملش عجز.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-line dark:border-line-dark flex items-center justify-between shrink-0 bg-surface-2/40 dark:bg-surface-dark-2/40">
          <div className="flex items-center gap-2 text-xs text-ink-muted dark:text-ink-dark-muted">
            <span className="w-2 h-2 rounded-full bg-brand inline-block"></span>
            <span>يتم تخزين رصيد المخزن بأصغر وحدة دائماً مع منع الحسابات العشرية العائمة.</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isRebasing}
              className="px-5 py-2 rounded-xl border border-line dark:border-line-dark hover:bg-surface-2 text-ink text-xs font-bold transition-all cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSaveAndConfirm}
              disabled={isRebasing}
              className="px-6 py-2 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {isRebasing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري ترحيل المخزن...</span>
                </>
              ) : (
                <span>اعتماد منظومة التعبئة</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
