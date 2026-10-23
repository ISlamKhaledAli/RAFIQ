import React, { useState, useEffect } from 'react';
import { 
  Boxes, 
  Sparkles, 
  Trash2, 
  AlertCircle
} from 'lucide-react';
import type { Product, ProductUnit } from '../types/models';
import { PackagingWizardModal } from './PackagingWizardModal';
import { rafiqConfirm } from '../utils/dialogService';
import { invoke } from '../bridge/ipc';

export interface ProductUnitsEditorProps {
  units?: ProductUnit[];
  onChange: (units: ProductUnit[]) => void;
  basePricePiasters: number;
  baseCostPiasters: number;
  baseUnitName: string;
  isWeightItem?: boolean;
  primaryBarcode?: string | null;
  product?: Product | null;
  isLooseSellable?: boolean;
  defaultSaleUnitId?: string | null;
  onPackagingConfigChange?: (config: {
    defaultSaleUnitId: string | null;
    defaultPurchaseUnitId: string | null;
    displayUnitId: string | null;
    isLooseSellable: boolean;
  }) => void;
}

export const ProductUnitsEditor: React.FC<ProductUnitsEditorProps> = ({
  units = [],
  onChange,
  basePricePiasters = 0,
  baseCostPiasters = 0,
  baseUnitName = 'قطعة',
  isWeightItem = false,
  primaryBarcode = '',
  product = null,
  isLooseSellable,
  defaultSaleUnitId,
  onPackagingConfigChange,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);

  // Auto-fetch packaging levels from SQLite if product has an ID and units not fully loaded
  useEffect(() => {
    if (product && product.id && (!units || units.length <= 1)) {
      void invoke<ProductUnit[]>('productUnits:getByProduct', { productId: product.id })
        .then((dbUnits) => {
          if (dbUnits && dbUnits.length > 1) {
            onChange(dbUnits);
          }
        })
        .catch(() => {});
    }
  }, [product, units, onChange]);

  // Safe normalization of incoming units
  const rawList = Array.isArray(units) ? units : [];
  const existingBase = rawList.find(u => u && u.isBaseUnit);

  const currentUnits: ProductUnit[] = existingBase
    ? rawList.map(u => {
        if (!u || !u.isBaseUnit) return u;
        // Do NOT overwrite calculated base price if multiple packaging levels already exist
        const keepCalculatedPrice = rawList.length > 1 && u.sellPricePiasters > 0;
        return {
          ...u,
          unitName: baseUnitName || u.unitName || (isWeightItem ? 'كيلو' : 'قطعة'),
          conversionFactor: 1,
          sellPricePiasters: keepCalculatedPrice ? u.sellPricePiasters : (basePricePiasters || 0),
          costPricePiasters: keepCalculatedPrice ? u.costPricePiasters : (baseCostPiasters || 0),
          barcode: primaryBarcode || u.barcode || '',
          isDivisible: !!isWeightItem
        };
      })
    : [
        {
          unitName: baseUnitName || (isWeightItem ? 'كيلو' : 'قطعة'),
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

    const confirmed = await rafiqConfirm({
      title: 'إلغاء منظومة التعبئة',
      message: 'هل تريد حقاً إلغاء جميع العبوات المجمعة والرجوع للبيع بالقطعة فقط؟',
      confirmText: 'نعم، إلغاء العبوات',
      cancelText: 'تراجع',
      variant: 'warning',
    });

    if (!confirmed) return;

    const baseUnitOnly = currentUnits.filter(u => u.isBaseUnit);
    onChange(baseUnitOnly);
    onPackagingConfigChange?.({
      defaultSaleUnitId: null,
      defaultPurchaseUnitId: null,
      displayUnitId: null,
      isLooseSellable: false,
    });
  };

  return (
    <div className="rounded-xl border border-line dark:border-line-dark bg-surface dark:bg-surface-dark overflow-hidden shrink-0 w-full shadow-2xs">
      {/* Packaging Banner Card */}
      <div className="p-3 flex items-center justify-between gap-3 bg-surface-2/60 dark:bg-surface-dark-2/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-soft dark:bg-brand-soft/20 border border-brand/30 flex items-center justify-center shrink-0 text-brand dark:text-brand-bright">
            <Boxes className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-ink dark:text-ink-dark">
              عبوات وتجزئة الصنف:
            </span>
            {isConfigured ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border border-paid/20">
                مفعل ({additionalUnits.length} عبوة)
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted">
                (قطعة فقط)
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
              className="px-3 py-1.5 rounded-lg border border-line dark:border-line-dark hover:border-danger/50 hover:bg-danger-soft text-ink-muted hover:text-danger text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95"
              title="إلغاء العبوات الإضافية والرجوع للقطعة فقط"
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
            <span>{isConfigured ? 'تعديل العبوات' : 'إضافة عبوات (كرتونة / باكت)'}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-3.5 mt-2.5 p-2 rounded-lg bg-danger-soft border border-danger-border text-danger flex items-center gap-1.5 text-xs font-bold">
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
          onApply={(config) => {
            onChange(config.units);
            onPackagingConfigChange?.(config);
          }}
        />
      )}
    </div>
  );
};
