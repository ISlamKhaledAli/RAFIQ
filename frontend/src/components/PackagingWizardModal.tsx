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
import { RequiredMark } from './RequiredMark';
import { ToggleSwitch } from './ToggleSwitch';
import { formatArabicCurrency, normalizeArabicNumerals } from '../utils/money';
import { invoke } from '../bridge/ipc';
import { rafiqAlert, rafiqConfirm } from '../utils/dialogService';
import { getStoreTerminology } from '../utils/storeTerminology';
import { formatUnitArabic } from '../utils/units';

export interface PackagingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product | null;
  basePricePiasters: number;
  baseCostPiasters: number;
  currentUnits: ProductUnit[];
  initialIsLooseSellable?: boolean;
  initialDefaultSaleUnitId?: string | null;
  initialDisplayUnitId?: string | null;
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
  let trimmed = u.trim().toLowerCase();
  if (trimmed === 'piece' || trimmed === 'pieces' || trimmed === 'قطعة' || trimmed === 'قطعه') return 'piece';
  if (trimmed === 'kg' || trimmed === 'kilogram' || trimmed === 'كيلو' || trimmed === 'كجم') return 'kg';
  trimmed = trimmed
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
  return trimmed;
};

const getDistinctTopUnitName = (base: string, defaultTop?: string): string => {
  const b = (base || '').trim().toLowerCase();
  if (b === 'علبة' || b === 'علبه') return 'كرتونة';
  if (b === 'قطعة' || b === 'قطعه' || b === 'piece') return 'كرتونة';
  if (b === 'قرص') return 'علبة';
  if (b === 'شريط') return 'علبة';
  if (b === 'كيلو' || b === 'كجم') return 'صندوق';
  if (defaultTop && defaultTop.trim().toLowerCase() !== b) return defaultTop;
  return 'كرتونة';
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
  initialDisplayUnitId,
  storeType,
  onApply,
}) => {
  const terminology = getStoreTerminology(storeType);
  const [storeCategoryLabel, setStoreCategoryLabel] = useState<string>(
    terminology.packagingSectionTitle.replace(':', '').trim()
  );
  const [levels, setLevels] = useState<WizardLevelRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);
  const [displayUnitId, setDisplayUnitId] = useState<string>('');
  const [defaultSaleUnitId, setDefaultSaleUnitId] = useState<string>('');

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

  // Recalculate prices across higher packaging levels anchored from the Display Unit
  const recalculatePrices = useCallback((newRule: number, newMarginBps: number, targetLevels?: WizardLevelRow[]) => {
    const list = targetLevels || levels;
    if (list.length === 0) return;
    const foundIdx = list.findIndex(r => r.id === displayUnitId);
    const anchorIdx = foundIdx !== -1 ? foundIdx : Math.max(0, list.length - 1);
    const anchor = list[anchorIdx];
    const anchorSell = anchor.sellPricePiasters > 0 ? anchor.sellPricePiasters : (basePricePiasters > 0 ? basePricePiasters : 1000);
    const anchorCost = anchor.costPricePiasters > 0 ? anchor.costPricePiasters : (baseCostPiasters > 0 ? baseCostPiasters : 750);

    const updated = [...list];
    updated[anchorIdx] = {
      ...anchor,
      sellPricePiasters: anchorSell,
      costPricePiasters: anchorCost,
    };

    // Calculate levels below anchor: DIVIDE downwards
    for (let k = anchorIdx + 1; k < updated.length; k++) {
      const parent = updated[k - 1];
      const r = typeof parent.ratioToNext === 'number' && parent.ratioToNext >= 1 ? parent.ratioToNext : 1;
      const rawSell = r > 0 ? parent.sellPricePiasters / r : parent.sellPricePiasters;
      const rawCost = r > 0 ? parent.costPricePiasters / r : parent.costPricePiasters;
      updated[k] = {
        ...updated[k],
        sellPricePiasters: Math.max(25, applyPriceRounding(rawSell, newRule, 0)),
        costPricePiasters: Math.max(20, Math.round(rawCost)),
      };
    }

    // Calculate levels above anchor: MULTIPLY upwards
    for (let k = anchorIdx - 1; k >= 0; k--) {
      const child = updated[k + 1];
      const r = typeof updated[k].ratioToNext === 'number' && updated[k].ratioToNext >= 1 ? updated[k].ratioToNext : 1;
      const rawSell = child.sellPricePiasters * r;
      const rawCost = child.costPricePiasters * r;
      updated[k] = {
        ...updated[k],
        sellPricePiasters: applyPriceRounding(rawSell, newRule, newMarginBps),
        costPricePiasters: rawCost,
      };
    }

    setLevels(updated);
  }, [levels, displayUnitId, basePricePiasters, baseCostPiasters]);

  // Robust, synchronous row builder from ProductUnit array with base-unit price anchoring
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
      const baseCandidate = sorted.find(u => u.isBaseUnit) || sorted[sorted.length - 1];
      const effectiveBaseSell = baseCandidate.sellPricePiasters > 0 ? baseCandidate.sellPricePiasters : (basePricePiasters > 0 ? basePricePiasters : 1000);
      const effectiveBaseCost = baseCandidate.costPricePiasters > 0 ? baseCandidate.costPricePiasters : (baseCostPiasters > 0 ? baseCostPiasters : 750);

      return sorted.map((u, i) => {
        const isBase = u.isBaseUnit || u.conversionFactor === 1 || i === sorted.length - 1;
        const nextFactor = i < sorted.length - 1 ? sorted[i + 1].conversionFactor : 1;
        const ratio = nextFactor > 0 ? Math.round(u.conversionFactor / nextFactor) : u.conversionFactor;
        
        let sellPrice = u.sellPricePiasters;
        let costPrice = u.costPricePiasters;

        if (!isBase && sellPrice <= 0) {
          sellPrice = effectiveBaseSell * u.conversionFactor;
        }
        if (!isBase && costPrice <= 0) {
          costPrice = effectiveBaseCost * u.conversionFactor;
        }
        if (isBase) {
          sellPrice = effectiveBaseSell;
          costPrice = effectiveBaseCost;
        }

        return {
          id: (u.id && !u.id.startsWith('lvl_')) ? u.id : generateUniqueUnitId(),
          name: formatUnitArabic(u.unitName),
          ratioToNext: isBase ? 1 : Math.max(2, ratio),
          conversionFactor: isBase ? 1 : Math.max(2, u.conversionFactor),
          sellPricePiasters: sellPrice,
          costPricePiasters: costPrice,
          barcode: u.barcode || '',
          isBase: isBase,
        };
      });
    }

    // Exactly 1 row for brand new product or single-unit product!
    const baseSell = basePricePiasters > 0 ? basePricePiasters : 1000;
    const baseCost = baseCostPiasters > 0 ? baseCostPiasters : 750;
    const baseName = (unitsList && unitsList[0]?.unitName && unitsList[0].unitName !== 'piece')
      ? formatUnitArabic(unitsList[0].unitName)
      : (terminology.baseUnitDefaultName || 'علبة');
    const baseBarcode = (unitsList && unitsList[0]?.barcode) || '';
    const baseUnitId = (unitsList && unitsList[0]?.id && !unitsList[0].id.startsWith('lvl_')) 
      ? unitsList[0].id 
      : generateUniqueUnitId();

    return [
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

    // Load rows from currentUnits passed from parent draft
    const rows = buildRowsFromUnits(currentUnits && currentUnits.length > 0 ? currentUnits : []);
    setLevels(rows);

    // Resolve initial displayUnitId (by immutable ID)
    const targetDisplayId = initialDisplayUnitId || product?.displayUnitId;
    const matchingDisplay = targetDisplayId ? rows.find(r => r.id === targetDisplayId) : null;
    
    // Fallback: if not set by ID, find unit matching product?.unit (e.g. 'علبة')
    const matchingProdUnit = !matchingDisplay && product?.unit 
      ? rows.find(r => normalizeUnitName(r.name) === normalizeUnitName(product.unit))
      : null;

    const fallbackDisplay = matchingDisplay 
      ? matchingDisplay.id 
      : (matchingProdUnit 
          ? matchingProdUnit.id 
          : (rows.length > 1 ? rows[rows.length - 2].id : (rows.length > 0 ? rows[0].id : '')));
    
    setDisplayUnitId(fallbackDisplay);

    // Resolve initial defaultSaleUnitId (by immutable ID)
    const targetSaleId = initialDefaultSaleUnitId || product?.defaultSaleUnitId;
    const matchingSale = targetSaleId ? rows.find(r => r.id === targetSaleId) : null;
    setDefaultSaleUnitId(
      matchingSale
        ? matchingSale.id
        : (fallbackDisplay || (rows.length > 0 ? rows[0].id : ''))
    );
  }, [isOpen, currentUnits, buildRowsFromUnits, initialIsLooseSellable, initialDefaultSaleUnitId, initialDisplayUnitId, product]);

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

  // Recalculate factors and prices when ratio changes (anchored to the Display Unit chosen by merchant)
  const handleRatioChange = (index: number, newRatioStr: string) => {
    const digits = normalizeArabicNumerals(newRatioStr).replace(/[^\d]/g, '');
    const updated = [...levels];

    if (digits === '' || digits === '0') {
      updated[index].ratioToNext = '' as any;
      updated[index].conversionFactor = 0;
      updated[index].sellPricePiasters = 0;
      updated[index].costPricePiasters = 0;
      setLevels(updated);
      return;
    }

    const rawVal = parseInt(digits, 10);
    const newRatio = isNaN(rawVal) ? 1 : Math.max(1, rawVal);
    updated[index].ratioToNext = newRatio;

    // Recalculate factors from bottom (base = 1) to top
    updated[updated.length - 1].conversionFactor = 1;
    for (let i = updated.length - 2; i >= 0; i--) {
      const rawR = Number(updated[i].ratioToNext);
      if (!isNaN(rawR) && rawR >= 2 && updated[i + 1].conversionFactor >= 1) {
        updated[i].conversionFactor = updated[i + 1].conversionFactor * rawR;
      } else {
        updated[i].conversionFactor = 0;
      }
    }

    // Anchor to Display Unit (الوحدة المعروضة بالخارج):
    // Units above display unit MULTIPLY UPWARDS (x)
    // Units below display unit DIVIDE DOWNWARDS (/)
    const foundIdx = updated.findIndex(r => r.id === displayUnitId);
    const anchorIdx = foundIdx !== -1 ? foundIdx : Math.max(0, updated.length - 1);
    const anchor = updated[anchorIdx];
    const anchorSell = anchor.sellPricePiasters > 0 ? anchor.sellPricePiasters : (basePricePiasters > 0 ? basePricePiasters : 1000);
    const anchorCost = anchor.costPricePiasters > 0 ? anchor.costPricePiasters : (baseCostPiasters > 0 ? baseCostPiasters : 750);
    updated[anchorIdx].sellPricePiasters = anchorSell;
    updated[anchorIdx].costPricePiasters = anchorCost;

    // Levels below anchor: DIVIDE downwards
    for (let k = anchorIdx + 1; k < updated.length; k++) {
      const parent = updated[k - 1];
      const r = typeof parent.ratioToNext === 'number' && parent.ratioToNext >= 1 ? parent.ratioToNext : 1;
      const rawSell = r > 0 ? parent.sellPricePiasters / r : parent.sellPricePiasters;
      const rawCost = r > 0 ? parent.costPricePiasters / r : parent.costPricePiasters;
      updated[k].sellPricePiasters = Math.max(25, applyPriceRounding(rawSell, roundingRule, 0));
      updated[k].costPricePiasters = Math.max(20, Math.round(rawCost));
    }

    // Levels above anchor: MULTIPLY upwards
    for (let k = anchorIdx - 1; k >= 0; k--) {
      const child = updated[k + 1];
      const r = typeof updated[k].ratioToNext === 'number' && updated[k].ratioToNext >= 1 ? updated[k].ratioToNext : 1;
      const rawSell = child.sellPricePiasters * r;
      const rawCost = child.costPricePiasters * r;
      updated[k].sellPricePiasters = applyPriceRounding(rawSell, roundingRule, marginPremiumBps);
      updated[k].costPricePiasters = rawCost;
    }

    setLevels(updated);
  };

  const handleRatioBlur = (index: number) => {
    const raw = levels[index]?.ratioToNext;
    if (raw === '' as any || raw === 0) {
      return; // Keep empty while user is configuring
    }
    const val = Number(raw);
    if (isNaN(val) || val < 1) {
      handleRatioChange(index, '2');
    }
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

  // Re-calculate single row price anchored to the Display Unit
  const handleAutoCalculateRow = (index: number) => {
    if (levels.length <= 1) return;
    const foundIdx = levels.findIndex(r => r.id === displayUnitId);
    const anchorIdx = foundIdx !== -1 ? foundIdx : Math.max(0, levels.length - 1);
    const updated = [...levels];

    if (index === anchorIdx) {
      // If clicking auto-calc on the anchor itself, re-anchor to base price from outside
      if (basePricePiasters > 0) updated[index].sellPricePiasters = basePricePiasters;
      if (baseCostPiasters > 0) updated[index].costPricePiasters = baseCostPiasters;
    } else if (index > anchorIdx) {
      // Below anchor: divide from parent above it
      const parent = updated[index - 1];
      const r = typeof parent.ratioToNext === 'number' && parent.ratioToNext >= 1 ? parent.ratioToNext : 1;
      const rawSell = r > 0 ? parent.sellPricePiasters / r : parent.sellPricePiasters;
      const rawCost = r > 0 ? parent.costPricePiasters / r : parent.costPricePiasters;
      updated[index].sellPricePiasters = Math.max(25, applyPriceRounding(rawSell, roundingRule, 0));
      updated[index].costPricePiasters = Math.max(20, Math.round(rawCost));
    } else {
      // Above anchor: multiply from child below it
      const child = updated[index + 1];
      const r = typeof updated[index].ratioToNext === 'number' && updated[index].ratioToNext >= 1 ? updated[index].ratioToNext : 1;
      const rawSell = child.sellPricePiasters * r;
      const rawCost = child.costPricePiasters * r;
      updated[index].sellPricePiasters = applyPriceRounding(rawSell, roundingRule, marginPremiumBps);
      updated[index].costPricePiasters = rawCost;
    }
    setLevels(updated);
  };

  // Add larger packaging unit (Carton / Box / Pack) above current top unit
  const handleAddLargerLevel = () => {
    if (levels.length >= 4) {
      setErrorMsg('الحد الأقصى المسموح به هو 4 مستويات تعبئة لكل صنف.');
      return;
    }
    setErrorMsg(null);

    const currentTop = levels[0];
    const topUnitName = getDistinctTopUnitName(currentTop?.name || 'علبة', terminology.packagingTopUnitDefault);
    const newTopRow: WizardLevelRow = {
      id: generateUniqueUnitId(),
      name: topUnitName,
      ratioToNext: '' as any,
      conversionFactor: 0,
      sellPricePiasters: 0,
      costPricePiasters: 0,
      barcode: '',
      isBase: false,
    };

    const updated = [newTopRow, ...levels];
    setLevels(updated);
  };

  // Add smaller sub-unit (Cigarette / Tablet / Strip / Piece) below current bottom unit
  const handleAddSmallerLevel = () => {
    if (levels.length >= 4) {
      setErrorMsg('الحد الأقصى المسموح به هو 4 مستويات تعبئة لكل صنف.');
      return;
    }
    setErrorMsg(null);

    const currentBottom = levels[levels.length - 1];
    const cleanBottomName = (currentBottom?.name || '').toLowerCase().trim();
    const cleanProdName = (product?.name || '').toLowerCase().trim();

    let subUnitName = 'قطعة فرط';
    if (cleanBottomName.includes('سجاير') || cleanBottomName.includes('دخان') || cleanBottomName.includes('كليوباترا') || cleanBottomName.includes('بوكس') || cleanProdName.includes('سجاير') || cleanProdName.includes('كليوباترا')) {
      subUnitName = 'سيجارة';
    } else if (cleanBottomName.includes('بيض') || cleanProdName.includes('بيض')) {
      subUnitName = 'بيضة';
    } else if (cleanBottomName.includes('علب') && (storeType?.includes('pharma') || cleanProdName.includes('دواء') || cleanProdName.includes('علاج'))) {
      subUnitName = 'شريط';
    } else if (cleanBottomName.includes('شريط')) {
      subUnitName = 'قرص';
    } else if (storeType?.includes('pharma')) {
      subUnitName = 'قرص';
    }

    const defaultRatio = subUnitName === 'سيجارة' ? 20 : (subUnitName === 'بيضة' ? 30 : 10);
    const parentSell = currentBottom.sellPricePiasters;
    const parentCost = currentBottom.costPricePiasters;
    const initialSubSell = parentSell > 0 ? Math.ceil((parentSell / defaultRatio) / 25) * 25 : 0;
    const initialSubCost = parentCost > 0 ? Math.round(parentCost / defaultRatio) : 0;

    const updatedBottom: WizardLevelRow = {
      ...currentBottom,
      isBase: false,
      ratioToNext: defaultRatio,
    };

    const newBaseRow: WizardLevelRow = {
      id: generateUniqueUnitId(),
      name: subUnitName,
      ratioToNext: 1,
      conversionFactor: 1,
      sellPricePiasters: initialSubSell,
      costPricePiasters: initialSubCost,
      barcode: '',
      isBase: true,
    };

    const updated = [...levels.slice(0, levels.length - 1), updatedBottom, newBaseRow];
    updated[updated.length - 1].conversionFactor = 1;
    for (let i = updated.length - 2; i >= 0; i--) {
      const rawR = Number(updated[i].ratioToNext);
      if (!isNaN(rawR) && rawR >= 2 && updated[i + 1].conversionFactor >= 1) {
        updated[i].conversionFactor = updated[i + 1].conversionFactor * rawR;
      } else {
        updated[i].conversionFactor = 0;
      }
    }

    setLevels(updated);
    setIsLooseSellable(true);

    // Keep display and default sale unit anchored to the parent unit (e.g. علبة)
    if (!displayUnitId || displayUnitId === currentBottom.id) {
      setDisplayUnitId(currentBottom.id);
    }
    if (!defaultSaleUnitId || defaultSaleUnitId === currentBottom.id) {
      setDefaultSaleUnitId(currentBottom.id);
    }
  };

  const handleRemoveLevel = (index: number) => {
    if (levels.length <= 1) return;
    setErrorMsg(null);

    const removedRow = levels[index];
    const updated = levels.filter((_, idx) => idx !== index);
    const lastIdx = updated.length - 1;
    updated[lastIdx].isBase = true;
    updated[lastIdx].ratioToNext = 1;
    updated[lastIdx].conversionFactor = 1;

    for (let i = lastIdx - 1; i >= 0; i--) {
      const rawR = Number(updated[i].ratioToNext);
      if (!isNaN(rawR) && rawR >= 2 && updated[i + 1].conversionFactor >= 1) {
        updated[i].conversionFactor = updated[i + 1].conversionFactor * rawR;
      } else {
        updated[i].conversionFactor = 0;
      }
    }

    // Stable ID preservation: ONLY fallback if the removed row was the chosen one!
    if (removedRow && removedRow.id === displayUnitId) {
      const fallback = updated[updated.length - 1];
      setDisplayUnitId(fallback ? fallback.id : '');
    }
    if (removedRow && removedRow.id === defaultSaleUnitId) {
      const fallback = updated[0];
      setDefaultSaleUnitId(fallback ? fallback.id : '');
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
      if (!levels[i].isBase) {
        const r = Number(levels[i].ratioToNext);
        if (isNaN(r) || r < 2 || levels[i].conversionFactor < 2) {
          setErrorMsg(`يرجى إدخال سعة '${levels[i].name}' (تحتوي على كم ${levels[i + 1]?.name || 'وحدة'}) بحيث تكون 2 أو أكثر.`);
          return;
        }
      }
      if (levels[i].sellPricePiasters <= 0) {
        setErrorMsg(`سعر بيع '${levels[i].name}' يجب أن يكون أكبر من الصفر.`);
        return;
      }
    }

    // Ensure no two packaging levels share the same non-empty barcode
    const seenCodes = new Set<string>();
    for (const lvl of levels) {
      if (lvl.barcode && lvl.barcode.trim()) {
        const bc = lvl.barcode.trim();
        if (seenCodes.has(bc)) {
          setErrorMsg(`الباركود '${bc}' مكرر على أكثر من عبوة لنفس الصنف.`);
          return;
        }
        seenCodes.add(bc);
      }
    }

    const existingBaseUnit = currentUnits && currentUnits.length > 0
      ? currentUnits.find(u => u && u.isBaseUnit)?.unitName
      : null;
    const currentBaseUnitNormalized = normalizeUnitName(existingBaseUnit || product?.unit);
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
    let updatedStockQuantityMilli: number | undefined = undefined;

    if (hasBaseUnitChanged && product && product.id) {
      if (product.hasVariants || product.parentId) {
        await rafiqAlert({
          title: 'غير مسموح بإعادة التأسيس للأصناف متفرعة المقاسات',
          message: 'هذا الصنف يحتوي على ألوان ومقاسات متفرعة. لا يمكن إعادة التأسيس الآلي له.',
          variant: 'error',
        });
        return;
      }

      const currentStockUnits = Math.round(product.stockQuantityMilli / 1000);
      const oldUnitName = product.unit || 'وحدة';
      const newUnitName = newBaseUnitRow?.name || 'وحدة';

      // Find the row in new levels that corresponds to the product's PREVIOUS base unit in the database
      const prevBaseRow = levels.find(l => normalizeUnitName(l.name) === currentBaseUnitNormalized);

      // If previous product was a single-unit item (!currentUnits || currentUnits.length <= 1)
      // and the merchant is configuring multi-tier packaging (levels.length > 1),
      // the merchant's previous stock was counted in their primary retail/display unit (e.g. 'علبة')!
      const isInitialPackagingSetup = (!currentUnits || currentUnits.length <= 1) && levels.length > 1;
      const targetDisplayLevel = displayUnitId ? levels.find(l => l.id === displayUnitId) : null;
      const expansionRow = prevBaseRow || (
        isInitialPackagingSetup
          ? (targetDisplayLevel || (levels.length > 2 ? levels[levels.length - 2] : levels[0]))
          : null
      );

      // 1. Expanding to smaller unit (e.g. from علبة to سيجارة, supporting multi-tier packaging):
      if (expansionRow && expansionRow.conversionFactor > 1 && currentStockUnits > 0) {
        const factor = expansionRow.conversionFactor;
        const convertedStock = currentStockUnits * factor;
        const fromUnitName = expansionRow.name || oldUnitName;

        const confirmRebase = await rafiqConfirm({
          title: 'تأكيد احتساب رصيد المخزن للوحدة الجديدة',
          message: `الصنف مسجل حالياً بوحدة «${fromUnitName}» ورصيد (${currentStockUnits} ${fromUnitName}).\n\nبناءً على التجزئة الجديدة، كل 1 «${fromUnitName}» يحتوي على (${factor} ${newUnitName}).\n\nهل تريد تحويل الرصيد تلقائياً إلى أصغر وحدة «${newUnitName}» (${convertedStock} ${newUnitName}) لحماية رصيد المخزن الدقيق؟`,
          confirmText: `نعم، تحويل إلى (${convertedStock} ${newUnitName})`,
          cancelText: `لا، الإبقاء على (${currentStockUnits} ${newUnitName})`,
          variant: 'info',
        });

        if (confirmRebase) {
          multiplyStockByFactor = factor;
          didRebaseStock = true;
        }
      }
      // 2. Collapsing back to larger unit (e.g. from سيجارة to علبة, or from قرص to علبة):
      else if (currentUnits && currentUnits.length > 1) {
        // Find which unit in currentUnits corresponds to the new base unit
        const matchingOldUnit = currentUnits.find(u => normalizeUnitName(u.unitName) === newBaseUnitNormalized);
        const fallbackOldUnit = (displayUnitId ? currentUnits.find(u => u.id === displayUnitId) : null)
          || (currentUnits.length > 1 ? currentUnits[currentUnits.length - 2] : null)
          || currentUnits.find(u => !u.isBaseUnit && u.conversionFactor > 1);

        const collapseTargetUnit = matchingOldUnit || fallbackOldUnit;
        const factor = collapseTargetUnit && collapseTargetUnit.conversionFactor > 1
          ? collapseTargetUnit.conversionFactor
          : 1;

        if (factor > 1 && currentStockUnits > 0) {
          const convertedStock = Math.floor(currentStockUnits / factor);
          const collapseTargetName = newUnitName || collapseTargetUnit?.unitName || 'عبوة';
          const confirmCollapse = await rafiqConfirm({
            title: 'تأكيد دمج رصيد المخزن للعبوة الأكبر',
            message: `الصنف مسجل حالياً بوحدة «${oldUnitName}» وبرصيد (${currentStockUnits} ${oldUnitName}).\n\nبناءً على التراجع للعبوة الأكبر «${collapseTargetName}» (التي تحتوي على ${factor} ${oldUnitName})، هل تريد تحويل الرصيد ليكون (${convertedStock} ${collapseTargetName}) لحماية رصيد المخزن الدقيق؟`,
            confirmText: `نعم، تحويل إلى (${convertedStock} ${collapseTargetName})`,
            cancelText: `لا، الإبقاء على (${currentStockUnits} ${collapseTargetName})`,
            variant: 'info',
          });

          if (confirmCollapse) {
            multiplyStockByFactor = -factor;
            didRebaseStock = true;
          }
        }
      }
    } else if (currentUnits && currentUnits.length > 1 && product && product.id) {
      // Find if an existing packaging unit had its conversion factor modified (e.g. from 10 to 20):
      const changedLevel = levels.find(lvl => {
        if (lvl.isBase) return false;
        const matchOld = currentUnits.find(u => 
          (u.id && u.id === lvl.id) || normalizeUnitName(u.unitName) === normalizeUnitName(lvl.name)
        );
        return matchOld && matchOld.conversionFactor > 0 && matchOld.conversionFactor !== lvl.conversionFactor;
      });

      if (changedLevel) {
        const matchOld = currentUnits.find(u => 
          (u.id && u.id === changedLevel.id) || normalizeUnitName(u.unitName) === normalizeUnitName(changedLevel.name)
        );
        const oldFactor = matchOld?.conversionFactor || 1;
        const newFactor = changedLevel.conversionFactor;
        const baseName = newBaseUnitRow?.name || product.unit || 'وحدة';
        const packName = changedLevel.name;
        const currentStockUnits = Math.round(product.stockQuantityMilli / 1000);

        if (currentStockUnits !== 0 && oldFactor > 0) {
          const scaledStock = Math.round(currentStockUnits * (newFactor / oldFactor));
          const confirmAdjust = await rafiqConfirm({
            title: `تأكيد تعديل سعة عبوة «${packName}»`,
            message: `لقد قمت بتعديل سعة عبوة «${packName}» من (${oldFactor}) إلى (${newFactor}) ${baseName}.\n\n` +
              `رصيدك المخزني الحالي هو (${currentStockUnits} ${baseName}).\n\n` +
              `• إذا كان رصيدك السابق مدخلاً بالعبوات بالخطأ وتريد تعديل رصيد المخزن ليطابق السعة الجديدة (${scaledStock} ${baseName}): اضغط «تعديل رصيد المخزن».\n\n` +
              `• إذا كان رصيد المخزن الحالي (${currentStockUnits} ${baseName}) صحيحاً بالفعل وتريد فقط تعديل مواصفات وأسعار العبوة: اضغط «الإبقاء على الرصيد الحالي».`,
            confirmText: `تعديل رصيد المخزن إلى (${scaledStock} ${baseName})`,
            cancelText: `الإبقاء على الرصيد الحالي (${currentStockUnits} ${baseName})`,
            variant: 'info',
          });

          if (confirmAdjust) {
            if (newFactor % oldFactor === 0) {
              multiplyStockByFactor = Math.round(newFactor / oldFactor);
              didRebaseStock = true;
            } else if (oldFactor % newFactor === 0) {
              multiplyStockByFactor = -Math.round(oldFactor / newFactor);
              didRebaseStock = true;
            } else {
              updatedStockQuantityMilli = Math.round(product.stockQuantityMilli * (newFactor / oldFactor));
              didRebaseStock = true;
            }
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

    // Selected Units for Display and Sale (by immutable ID):
    const chosenDisplayUnit = levels.find(r => r.id === displayUnitId) || levels[levels.length - 1];
    const chosenSaleUnit = levels.find(r => r.id === defaultSaleUnitId) || levels[0];
    const defPurchaseUnit = levels[0];

    setIsRebasing(true);

    if (didRebaseStock && product) {
      if (updatedStockQuantityMilli === undefined && multiplyStockByFactor) {
        if (multiplyStockByFactor > 1) {
          updatedStockQuantityMilli = product.stockQuantityMilli * multiplyStockByFactor;
        } else if (multiplyStockByFactor < -1) {
          updatedStockQuantityMilli = Math.floor(product.stockQuantityMilli / Math.abs(multiplyStockByFactor));
        }
      }
    }

    setIsRebasing(false);

    onApply({
      units: finalUnits,
      defaultSaleUnitId: chosenSaleUnit ? chosenSaleUnit.id : null,
      defaultPurchaseUnitId: defPurchaseUnit ? defPurchaseUnit.id : null,
      displayUnitId: chosenDisplayUnit ? chosenDisplayUnit.id : null,
      isLooseSellable,
      updatedStockQuantityMilli,
    });

    onClose();
  };

  if (!isOpen) return null;

  const currentBaseUnitNormalized = normalizeUnitName(product?.unit);
  const baseUnitRow = levels.length > 0 ? levels[levels.length - 1] : null;
  const newBaseUnitNormalized = normalizeUnitName(baseUnitRow?.name);

  const prevBaseRowForNotice = levels.find(l => normalizeUnitName(l.name) === currentBaseUnitNormalized);
  const isInitialPackagingSetupForNotice = (!currentUnits || currentUnits.length <= 1) && levels.length > 1;
  const targetDisplayLevelForNotice = displayUnitId ? levels.find(l => l.id === displayUnitId) : null;
  const expansionNoticeRow = prevBaseRowForNotice || (
    isInitialPackagingSetupForNotice
      ? (targetDisplayLevelForNotice || (levels.length > 2 ? levels[levels.length - 2] : levels[0]))
      : null
  );

  // Show notice ONLY if base unit actually differs between DB and wizard
  const showStockNotice = Boolean(
    product &&
    product.id &&
    product.stockQuantityMilli > 0 &&
    currentBaseUnitNormalized &&
    newBaseUnitNormalized &&
    currentBaseUnitNormalized !== newBaseUnitNormalized &&
    levels.length > 1 &&
    expansionNoticeRow &&
    expansionNoticeRow.conversionFactor > 1
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
              <h2 className="t-modal-title text-ink dark:text-ink-dark m-0 flex items-center gap-2 whitespace-nowrap">
                <span>معالج التعبئة وتجزئة العبوات</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-soft dark:bg-brand-dark-soft text-brand-dark dark:text-brand-bright font-bold whitespace-nowrap">
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
            className="p-2 rounded-xl text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/30 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Rebase Notice Alert: Clean & Simple Egyptian Phrasing */}
          {showStockNotice && (
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/50 rounded-xl text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-200">
                <RefreshCw className="w-4 h-4 shrink-0 text-amber-600 dark:text-warn-bright" />
                <span>تنبيه ضبط رصيد المخزن تلقائياً:</span>
              </div>
              <p className="text-amber-700 dark:text-amber-300 m-0 leading-relaxed">
                الصنف مسجل حالياً برصيد ({Math.round(product!.stockQuantityMilli / 1000)} {expansionNoticeRow?.name || 'عبوة'}). عند اعتماد التعبئة والتجزئة، سيسألك النظام لتحويل رصيده تلقائياً ليكون بأصغر وحدة «{baseUnitRow?.name || 'قرص'}» ({Math.round(product!.stockQuantityMilli / 1000) * (expansionNoticeRow?.conversionFactor || 1)} {baseUnitRow?.name}) لتطابق الجرد الفعلي.
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
                <label className="block text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1 whitespace-nowrap">
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
                <label className="block text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1 whitespace-nowrap">
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
                <span className="text-micro font-bold text-ink-muted dark:text-ink-dark-muted mb-1 whitespace-nowrap">
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
            <div className="p-3 rounded-xl bg-warn/10 border border-warn/30 text-warn-dark dark:text-warn-bright text-xs space-y-1">
              {pricingWarnings.map((warning, wIdx) => (
                <div key={wIdx} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-warn dark:text-warn-bright" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Packaging Units Table Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand dark:text-brand-bright" />
                <span className="text-xs font-bold text-ink dark:text-ink-dark">
                  مستويات التعبئة والأسعار:
                </span>
                <span className="text-micro font-semibold px-2 py-0.5 rounded-full bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark">
                  {levels.length} من 4 مستويات
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddLargerLevel}
                  disabled={levels.length >= 4}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand/30 hover:bg-brand-soft dark:hover:bg-brand-dark-soft text-brand dark:text-brand-bright text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-2xs active:scale-95"
                  title="إضافة عبوة أكبر للبيع بالجملة (مثل كرتونة أو باكت أو قاروصة - يتم ضرب السعر)"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة عبوة أكبر (أعلى)</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddSmallerLevel}
                  disabled={levels.length >= 4}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-paid/30 hover:bg-paid-soft dark:hover:bg-paid-dark-soft text-paid dark:text-paid-bright text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-2xs active:scale-95"
                  title="تجزئة العبوة لوحدة أصغر للبيع فرط (مثل بيع بالسيجارة، بالقرص، بالبيضة - يتم قسمة السعر)"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة وحدة تجزئة أصغر (أسفل)</span>
                </button>
              </div>
            </div>

            {/* Wide, fluid, comfortable table */}
            <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-right text-xs table-fixed">
                <thead>
                  <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted font-bold">
                    <th className="py-2.5 px-2.5 w-[14%] whitespace-nowrap">المستوى والاسم <RequiredMark /></th>
                    <th className="py-2.5 px-2 text-center w-[17%] whitespace-nowrap">المحتوى والتعبئة</th>
                    <th className="py-2.5 px-2 text-center w-[6%] whitespace-nowrap">المعامل</th>
                    <th className="py-2.5 px-2 w-[14%] whitespace-nowrap">سعر البيع <RequiredMark /></th>
                    <th className="py-2.5 px-2 w-[12%] whitespace-nowrap">سعر التكلفة</th>
                    <th className="py-2.5 px-2 w-[12%] whitespace-nowrap">الباركود</th>
                    <th className="py-2.5 px-2 text-center w-[12%] whitespace-nowrap">المعروضة بالخارج</th>
                    <th className="py-2.5 px-2 text-center w-[10%] whitespace-nowrap">افتراضية الكاشير</th>
                    <th className="py-2.5 px-1 text-center w-[3%] whitespace-nowrap">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark">
                  {levels.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-ink-muted dark:text-ink-dark-muted">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Boxes className="w-8 h-8 text-line-hover dark:text-line-dark-strong stroke-[1.5]" />
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
                    const isDefaultSale = lvl.id === defaultSaleUnitId;
                    const isDisplayUnit = lvl.id === displayUnitId;

                    return (
                      <tr
                        key={lvl.id}
                        onClick={() => setSelectedRowIndex(idx)}
                        className={`transition-colors duration-100 ${
                          isRowSelected
                            ? 'bg-brand-soft/30 dark:bg-brand-dark-soft'
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
                              <span className="text-ink-muted dark:text-ink-dark-muted text-xs whitespace-nowrap">تحتوي على</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={lvl.ratioToNext === 0 || (lvl.ratioToNext as any) === '' ? '' : lvl.ratioToNext}
                                onChange={(e) => handleRatioChange(idx, e.target.value)}
                                onBlur={() => handleRatioBlur(idx)}
                                placeholder="0"
                                className="w-14 h-7 px-1 text-center bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-md font-mono font-bold text-xs focus:ring-1 focus:ring-brand focus:border-brand"
                              />
                              <span className="text-ink dark:text-ink-dark font-bold text-xs truncate max-w-[100px] whitespace-nowrap">
                                {nextUnit.name}
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted text-xs font-bold border border-line dark:border-line-dark whitespace-nowrap">
                              أصغر وحدة (للمخزن)
                            </span>
                          )}
                        </td>

                        {/* Factor */}
                        <td className="py-2.5 px-2 text-center">
                          <span className="inline-block px-2.5 py-0.5 rounded bg-brand-soft/60 dark:bg-brand-dark-soft font-mono font-bold text-brand dark:text-brand-bright text-xs whitespace-nowrap">
                            {lvl.conversionFactor > 0 ? `${lvl.conversionFactor}×` : '—'}
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
                                className="h-8 px-2 rounded-md bg-brand-soft dark:bg-brand-dark-soft hover:bg-brand hover:text-white dark:hover:text-white text-brand dark:text-brand-bright transition-colors cursor-pointer shrink-0 text-xs font-bold flex items-center justify-center whitespace-nowrap"
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
                              className="h-8 w-8 rounded-md bg-surface-2 dark:bg-surface-dark-2 hover:bg-brand hover:text-white dark:hover:text-white text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark transition-colors cursor-pointer shrink-0 flex items-center justify-center"
                            >
                              <BarcodeIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* Display Unit Choice (الوحدة المعروضة بالخارج) */}
                        <td className="py-2.5 px-2 text-center">
                          {isDisplayUnit ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-soft text-brand dark:bg-brand-dark-soft dark:text-brand-bright font-bold text-xs border border-brand/30 shadow-2xs select-none whitespace-nowrap">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>المعروضة بالخارج</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDisplayUnitId(lvl.id);
                              }}
                              className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted hover:text-brand dark:hover:text-brand-bright px-2.5 py-1 rounded-lg border border-line dark:border-line-dark hover:border-brand/40 bg-surface dark:bg-surface-dark cursor-pointer transition-colors shadow-2xs active:scale-95 whitespace-nowrap"
                              title="تحديد هذه الوحدة لتظهر في بطاقة الصنف بالخارج وفي الكتالوج"
                            >
                              <span>عرض بالخارج</span>
                            </button>
                          )}
                        </td>

                        {/* Default Sale Unit Choice for Cashier */}
                        <td className="py-2.5 px-2 text-center">
                          {isDefaultSale ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paid-soft text-paid dark:bg-paid-dark-soft dark:text-paid-bright font-bold text-xs border border-paid/20 shadow-2xs select-none whitespace-nowrap">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>الافتراضية للبيع</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDefaultSaleUnitId(lvl.id);
                              }}
                              className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted hover:text-paid dark:hover:text-paid-bright px-2.5 py-1 rounded-lg border border-line dark:border-line-dark hover:border-paid/40 bg-surface dark:bg-surface-dark cursor-pointer transition-colors shadow-2xs active:scale-95 whitespace-nowrap"
                              title="تعيين هذه العبوة لتنزل في الفاتورة افتراضياً عند ضرب الباركود"
                            >
                              <span>تعيين كافتراضية</span>
                            </button>
                          )}
                        </td>

                        {/* Delete Row */}
                        <td className="py-2.5 px-1 text-center">
                          {levels.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveLevel(idx);
                              }}
                              className="p-1.5 rounded-lg text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright hover:bg-danger-soft dark:hover:bg-danger-dark-soft transition-colors cursor-pointer inline-flex items-center justify-center"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-micro leading-relaxed">
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
              className="px-5 py-2 rounded-xl border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-ink dark:text-ink-dark text-xs font-bold transition-all cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSaveAndConfirm}
              disabled={isRebasing}
              className="px-6 py-2 bg-brand hover:bg-brand-dark text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50 dark:disabled:opacity-100 dark:disabled:bg-surface-dark-3 dark:disabled:text-ink-dark-muted dark:disabled:border-line-dark active:scale-95"
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
