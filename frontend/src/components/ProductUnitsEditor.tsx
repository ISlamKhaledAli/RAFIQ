import React, { useState } from 'react';
import { 
  Boxes, 
  Sparkles, 
  Trash2, 
  AlertCircle
} from 'lucide-react';
import type { Product, ProductUnit } from '../types/models';
import { PackagingWizardModal } from './PackagingWizardModal';
import { rafiqConfirm } from '../utils/dialogService';
import { getStoreTerminology } from '../utils/storeTerminology';
import { useFeatures } from '../context/useFeatures';
import { formatUnitArabic } from '../utils/units';

export interface ProductUnitsEditorProps {
  units?: ProductUnit[];
  onChange: (units: ProductUnit[]) => void;
  basePricePiasters?: number;
  baseCostPiasters?: number;
  baseUnitName?: string;
  isWeightItem?: boolean;
  primaryBarcode?: string | null;
  product?: Product | null;
  isLooseSellable?: boolean;
  defaultSaleUnitId?: string | null;
  displayUnitId?: string | null;
  storeType?: string;
  onPackagingConfigChange?: (config: {
    units: ProductUnit[];
    defaultSaleUnitId: string | null;
    defaultPurchaseUnitId: string | null;
    displayUnitId: string | null;
    isLooseSellable: boolean;
    updatedStockQuantityMilli?: number;
  }) => void;
}

export const ProductUnitsEditor: React.FC<ProductUnitsEditorProps> = ({
  units = [],
  onChange,
  basePricePiasters = 0,
  baseCostPiasters = 0,
  baseUnitName = '',
  isWeightItem = false,
  primaryBarcode = '',
  product = null,
  isLooseSellable,
  defaultSaleUnitId,
  displayUnitId,
  storeType,
  onPackagingConfigChange,
}) => {
  const { isEnabled } = useFeatures();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);

  const effectiveStoreType = storeType || (isEnabled('feature_pharmacy') ? 'pharmacy' : isEnabled('feature_matrix_variants') ? 'clothing_apparel' : '');
  const terminology = getStoreTerminology(effectiveStoreType);

  // Safe normalization of incoming units - strictly preserves user's defined unit names
  const rawList = Array.isArray(units) ? units : [];
  const existingBase = rawList.find(u => u && u.isBaseUnit);
  const effectiveBaseUnitName = (existingBase && existingBase.unitName && existingBase.unitName.trim())
    ? formatUnitArabic(existingBase.unitName.trim())
    : formatUnitArabic(baseUnitName || terminology.baseUnitDefaultName || (isWeightItem ? 'كيلو' : 'قطعة'));

  const currentUnits: ProductUnit[] = existingBase
    ? rawList.map(u => {
        if (!u || !u.isBaseUnit) return u;
        const isSingleUnit = rawList.length <= 1;
        return {
          ...u,
          unitName: (u.unitName && u.unitName.trim()) ? u.unitName.trim() : effectiveBaseUnitName,
          conversionFactor: 1,
          sellPricePiasters: (isSingleUnit && basePricePiasters > 0) ? basePricePiasters : (u.sellPricePiasters > 0 ? u.sellPricePiasters : basePricePiasters || 0),
          costPricePiasters: (isSingleUnit && baseCostPiasters > 0) ? baseCostPiasters : (u.costPricePiasters > 0 ? u.costPricePiasters : baseCostPiasters || 0),
          barcode: isSingleUnit ? (primaryBarcode || u.barcode || '') : (u.barcode || ''),
          isDivisible: !!isWeightItem
        };
      })
    : [
        {
          unitName: effectiveBaseUnitName,
          conversionFactor: 1,
          isBaseUnit: true,
          sellPricePiasters: basePricePiasters || 0,
          costPricePiasters: baseCostPiasters || 0,
          barcode: primaryBarcode || '',
          isDivisible: !!isWeightItem,
          sortOrder: 0
        },
        ...rawList
      ];

  const additionalUnits = currentUnits.filter(u => u && !u.isBaseUnit);
  const isConfigured = additionalUnits.length > 0;

  // Handle removing all extra units and resetting to single base unit
  const handleResetPackaging = async () => {
    setErrorMsg(null);
    const hasSoldUnit = additionalUnits.some(u => u.hasSales);
    if (hasSoldUnit) {
      setErrorMsg('لا يمكن إلغاء العبوات لوجود فواتير ومبيعات سابقة مسجلة بها لحماية سجلات وتقارير الجرد.');
      return;
    }

    const displayUnit = displayUnitId ? currentUnits.find(u => u.id === displayUnitId) : null;
    const retailPackUnit = displayUnit
      || (currentUnits.length > 1 ? currentUnits[currentUnits.length - 2] : null)
      || currentUnits.find(u => !u.isBaseUnit && u.conversionFactor > 1)
      || currentUnits[0];
    const baseUnit = currentUnits.find(u => u.isBaseUnit) || currentUnits[currentUnits.length - 1];

    let chosenSingleUnit: ProductUnit;
    let updatedStockMilli: number | undefined = undefined;

    const isRebased = Boolean(retailPackUnit && baseUnit && retailPackUnit.conversionFactor > 1 && retailPackUnit.unitName !== baseUnit.unitName);

    if (isRebased) {
      const currentStockUnits = Math.round((product?.stockQuantityMilli || 0) / 1000);
      const convertedToBoxes = Math.floor(currentStockUnits / retailPackUnit.conversionFactor);

      const returnToBox = await rafiqConfirm({
        title: 'إلغاء منظومة التعبئة وتحديد الوحدة الرئيسية',
        message: `الصنف مسجل حالياً بوحدات تعبئة وتجزئة.\n\nهل تريد الرجوع للبيع بالـ «${formatUnitArabic(retailPackUnit.unitName)}» فقط بسعر (${(retailPackUnit.sellPricePiasters / 100).toFixed(2)} ج.م) وتحويل الرصيد ليكون (${convertedToBoxes} ${formatUnitArabic(retailPackUnit.unitName)})؟`,
        confirmText: `نعم، الرجوع للـ «${formatUnitArabic(retailPackUnit.unitName)}» (${convertedToBoxes} ${formatUnitArabic(retailPackUnit.unitName)})`,
        cancelText: `تراجع وإلغاء العملية`,
        variant: 'warning',
      });

      if (!returnToBox) {
        return; // User canceled or dismissed; do NOT execute anything!
      }

      chosenSingleUnit = {
        ...retailPackUnit,
        conversionFactor: 1,
        isBaseUnit: true,
        sortOrder: 0,
      };
      if (product && product.stockQuantityMilli > 0) {
        updatedStockMilli = convertedToBoxes * 1000;
      }
    } else {
      const confirmed = await rafiqConfirm({
        title: 'إلغاء العبوات الإضافية',
        message: `هل تريد حقاً إلغاء جميع العبوات الإضافية والرجوع للبيع بوحدة (${formatUnitArabic(effectiveBaseUnitName)}) فقط بسعر (${((basePricePiasters || baseUnit.sellPricePiasters) / 100).toFixed(2)} ج.م)؟`,
        confirmText: 'نعم، إلغاء العبوات الإضافية',
        cancelText: 'تراجع',
        variant: 'warning',
      });
      if (!confirmed) return;

      chosenSingleUnit = {
        ...(baseUnit || currentUnits[0]),
        conversionFactor: 1,
        isBaseUnit: true,
        sortOrder: 0,
        sellPricePiasters: basePricePiasters > 0 ? basePricePiasters : (baseUnit ? baseUnit.sellPricePiasters : 0),
        costPricePiasters: baseCostPiasters > 0 ? baseCostPiasters : (baseUnit ? baseUnit.costPricePiasters : 0),
      };
    }

    const finalSingleUnits = [chosenSingleUnit];

    onChange(finalSingleUnits);
    onPackagingConfigChange?.({
      units: finalSingleUnits,
      defaultSaleUnitId: chosenSingleUnit.id || null,
      defaultPurchaseUnitId: chosenSingleUnit.id || null,
      displayUnitId: null,
      isLooseSellable: false,
      updatedStockQuantityMilli: updatedStockMilli,
    });
  };

  return (
    <div className="rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark overflow-hidden shrink-0 w-full shadow-2xs">
      {/* Packaging Banner Card */}
      <div className="p-3 flex items-center justify-between gap-3 bg-surface-2/60 dark:bg-surface-dark-2/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-dark-soft border border-brand/30 flex items-center justify-center shrink-0 text-brand dark:text-brand-bright">
            <Boxes className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-ink dark:text-ink-dark">
              {terminology.packagingSectionTitle}
            </span>
            {isConfigured ? (
              <span className="text-micro font-bold px-2 py-0.5 rounded-full bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20">
                مفعل ({additionalUnits.length} عبوة)
              </span>
            ) : (
              <span className="text-micro font-semibold text-ink-muted dark:text-ink-dark-muted">
                ({effectiveBaseUnitName} فقط)
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {isConfigured && (
            <button
              type="button"
              onClick={handleResetPackaging}
              className="px-3 py-1.5 rounded-lg border border-line dark:border-line-dark hover:border-danger/50 hover:bg-danger-soft dark:hover:bg-danger-dark-soft text-ink-muted dark:text-ink-dark-muted hover:text-danger dark:hover:text-danger-bright text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
              title={`إلغاء العبوات الإضافية والرجوع لـ (${effectiveBaseUnitName}) فقط`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>إلغاء</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsWizardOpen(true)}
            className="px-3.5 py-1.5 bg-brand hover:bg-brand-dark text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-bright" />
            <span>{isConfigured ? 'تعديل العبوات والتجزئة' : terminology.packagingAddAction}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-3.5 mt-2.5 p-2 rounded-lg bg-danger-soft dark:bg-danger-dark-soft border border-danger-border dark:border-danger-bright/30 text-danger dark:text-danger-bright flex items-center gap-1.5 text-xs font-bold">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Packaging Wizard Modal */}
      {isWizardOpen && (
        <PackagingWizardModal
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          product={product}
          basePricePiasters={basePricePiasters}
          baseCostPiasters={baseCostPiasters}
          currentUnits={currentUnits}
          initialIsLooseSellable={isLooseSellable}
          initialDefaultSaleUnitId={defaultSaleUnitId}
          initialDisplayUnitId={displayUnitId || product?.displayUnitId}
          storeType={effectiveStoreType}
          onApply={(config) => {
            onChange(config.units);
            onPackagingConfigChange?.(config);
          }}
        />
      )}
    </div>
  );
};
