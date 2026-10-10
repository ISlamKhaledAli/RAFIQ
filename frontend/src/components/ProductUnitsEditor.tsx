import React, { useState } from 'react';
import { 
  Boxes, 
  Plus, 
  Trash2, 
  AlertCircle, 
  Barcode as BarcodeIcon, 
  TrendingUp, 
  Sparkles, 
  Check,
  ChevronDown,
  ChevronUp,
  AlertTriangle
} from 'lucide-react';
import { ToggleSwitch } from './ToggleSwitch';
import type { ProductUnit } from '../types/models';
import { MoneyInput } from './MoneyInput';
import { formatArabicCurrency, normalizeArabicNumerals } from '../utils/money';

export interface ProductUnitsEditorProps {
  units?: ProductUnit[];
  onChange: (units: ProductUnit[]) => void;
  basePricePiasters: number;
  baseCostPiasters: number;
  baseUnitName: string;
  isWeightItem?: boolean;
  primaryBarcode?: string | null;
}

interface UnitPreset {
  name: string;
  factor: number;
  label: string;
}

const PIECE_PRESETS: UnitPreset[] = [
  { name: 'دستة', factor: 12, label: 'دستة (12 قطعة)' },
  { name: 'نصف دستة', factor: 6, label: 'نصف دستة (6 قطع)' },
  { name: 'كرتونة', factor: 24, label: 'كرتونة (24 قطعة)' },
  { name: 'علبة', factor: 20, label: 'علبة (20 قطعة)' },
  { name: 'باكت', factor: 10, label: 'باكت (10 قطع)' },
  { name: 'شريط', factor: 10, label: 'شريط (10 قطع)' },
];

const WEIGHT_PRESETS: UnitPreset[] = [
  { name: 'كرتونة', factor: 10, label: 'كرتونة (10 كجم)' },
  { name: 'شوال', factor: 25, label: 'شوال (25 كجم)' },
  { name: 'كيس', factor: 5, label: 'كيس (5 كجم)' },
];

export const ProductUnitsEditor: React.FC<ProductUnitsEditorProps> = ({
  units = [],
  onChange,
  basePricePiasters = 0,
  baseCostPiasters = 0,
  baseUnitName = 'قطعة',
  isWeightItem = false,
  primaryBarcode = ''
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const presets = isWeightItem ? WEIGHT_PRESETS : PIECE_PRESETS;

  // Safe normalization of incoming units
  const rawList = Array.isArray(units) ? units : [];
  const existingBase = rawList.find(u => u && u.isBaseUnit);

  const currentUnits: ProductUnit[] = existingBase
    ? rawList.map(u => {
        if (!u || !u.isBaseUnit) return u;
        return {
          ...u,
          unitName: baseUnitName || u.unitName || (isWeightItem ? 'كيلو' : 'قطعة'),
          conversionFactor: 1,
          sellPricePiasters: basePricePiasters || 0,
          costPricePiasters: baseCostPiasters || 0,
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
  const isEnabled = additionalUnits.length > 0;

  // Toggle wholesale packaging on / off
  const handleToggleEnabled = () => {
    setErrorMsg(null);
    if (isEnabled) {
      onChange(currentUnits.filter(u => u.isBaseUnit));
    } else {
      const defaultPreset = presets[0];
      const factor = defaultPreset ? defaultPreset.factor : 12;
      const name = defaultPreset ? defaultPreset.name : 'دستة';
      const newUnit: ProductUnit = {
        unitName: name,
        conversionFactor: factor,
        isBaseUnit: false,
        sellPricePiasters: (basePricePiasters || 0) * factor,
        costPricePiasters: (baseCostPiasters || 0) * factor,
        barcode: '',
        isDivisible: false,
        sortOrder: 1
      };
      onChange([...currentUnits, newUnit]);
    }
  };

  const handleApplyPreset = (addIndex: number, preset: UnitPreset) => {
    setErrorMsg(null);
    handleUpdateAdditionalUnit(addIndex, {
      unitName: preset.name,
      conversionFactor: preset.factor,
      sellPricePiasters: (basePricePiasters || 0) * preset.factor,
      costPricePiasters: (baseCostPiasters || 0) * preset.factor
    });
  };

  const handleUpdateAdditionalUnit = (addIndex: number, updates: Partial<ProductUnit>) => {
    setErrorMsg(null);
    let count = 0;
    const updated = currentUnits.map((u) => {
      if (u.isBaseUnit) return u;
      if (count === addIndex) {
        count++;
        return { ...u, ...updates };
      }
      count++;
      return u;
    });
    onChange(updated);
  };

  const handleDeleteAdditionalUnit = (addIndex: number) => {
    setErrorMsg(null);
    let count = 0;
    const updated = currentUnits.filter((u) => {
      if (u.isBaseUnit) return true;
      const shouldKeep = count !== addIndex;
      count++;
      return shouldKeep;
    });
    onChange(updated);
  };

  const handleAddExtraPackage = () => {
    setErrorMsg(null);
    const factor = 24;
    const newUnit: ProductUnit = {
      unitName: 'كرتونة',
      conversionFactor: factor,
      isBaseUnit: false,
      sellPricePiasters: (basePricePiasters || 0) * factor,
      costPricePiasters: (baseCostPiasters || 0) * factor,
      barcode: '',
      isDivisible: false,
      sortOrder: currentUnits.length
    };
    onChange([...currentUnits, newUnit]);
  };

  const handleAutoCalculatePrices = (addIndex: number) => {
    const target = additionalUnits[addIndex];
    if (!target) return;
    const factor = target.conversionFactor > 0 ? target.conversionFactor : 1;
    handleUpdateAdditionalUnit(addIndex, {
      sellPricePiasters: (basePricePiasters || 0) * factor,
      costPricePiasters: (baseCostPiasters || 0) * factor
    });
  };

  return (
    <div style={{
      borderRadius: 8,
      border: '1.5px solid #006D41',
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      flexShrink: 0,
      width: '100%'
    }}>
      {/* 1. Header Accordion / Toggle Bar */}
      <div 
        onClick={handleToggleEnabled}
        style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
          minHeight: 56,
          flexShrink: 0,
          backgroundColor: isEnabled ? '#E8F5E9' : '#F7F8F6',
          borderBottom: isEnabled ? '1.5px solid #006D41' : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isEnabled ? '#006D41' : '#FFFFFF',
            color: isEnabled ? '#FFFFFF' : '#006D41',
            border: '1.5px solid #006D41',
            flexShrink: 0
          }}>
            <Boxes style={{ width: 22, height: 22 }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 'bold', color: '#0F172A' }}>
                بيع بالجملة / عبوة مجمعة (كرتونة، دستة، باكت...)
              </span>
              {isEnabled ? (
                <span style={{ fontSize: 11, fontWeight: 'bold', padding: '2px 8px', borderRadius: 999, backgroundColor: '#006D41', color: '#FFFFFF' }}>
                  مفعل ({additionalUnits.length} عبوة)
                </span>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 'bold', color: '#006D41', backgroundColor: '#E8F5E9', padding: '2px 8px', borderRadius: 4, border: '1px solid #A5D6A7' }}>
                  اضغط للتفعيل
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: '#52605B', margin: '3px 0 0 0' }}>
              {isEnabled 
                ? 'محدد للبيع بالعبوة أو الكرتونة بجانب البيع بالواحدة مع خصم المخزون تلقائياً'
                : 'تحديد سعر وباركود للكرتونة أو الدستة وتخصيص بيعها بالجملة مع خصم المخزون'
              }
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <ToggleSwitch
            checked={isEnabled}
            onChange={handleToggleEnabled}
          />
          {isEnabled ? (
            <ChevronUp className="w-4 h-4 text-[#006D41]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#64748B]" />
          )}
        </div>
      </div>


      {/* 2. Expanded Packaging Body (Only visible when enabled) */}
      {isEnabled && (
        <div className="p-3.5 bg-surface flex flex-col gap-3.5 shrink-0">
          {errorMsg && (
            <div className="p-2 rounded bg-danger-soft border border-danger-border text-danger flex items-center gap-1.5 text-[11px] font-bold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* List of Packaging Units (Usually exactly 1) */}
          {additionalUnits.map((u, idx) => {
            const factor = u.conversionFactor > 0 ? u.conversionFactor : 1;
            const effectiveCost = u.costPricePiasters > 0 
              ? u.costPricePiasters 
              : (baseCostPiasters * factor);
            const profitPiasters = u.sellPricePiasters - effectiveCost;
            const markupPercent = effectiveCost > 0 ? ((profitPiasters / effectiveCost) * 100) : 0;
            const isLoss = profitPiasters < 0;

            // Customer savings compared to buying individually
            const normalRetailSum = basePricePiasters * factor;
            const customerSavingPiasters = normalRetailSum - u.sellPricePiasters;
            const pieceWholesalePrice = Math.round(u.sellPricePiasters / factor);

            return (
              <div 
                key={u.id || `unit-${idx}`}
                className="p-3 rounded-lg border border-line bg-surface-2/40 flex flex-col gap-3"
              >
                {/* Package Header with Quick Preset Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-line/60">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold text-ink">
                      {additionalUnits.length > 1 ? `العبوة رقم (${idx + 1}):` : 'اختر قالب العبوة أو حددها بنفسك:'}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {presets.map((tpl) => {
                        const isSelected = u.conversionFactor === tpl.factor && u.unitName.trim().toLowerCase() === tpl.name.toLowerCase();
                        return (
                          <button
                            key={tpl.name}
                            type="button"
                            onClick={() => handleApplyPreset(idx, tpl)}
                            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 border ${
                              isSelected
                                ? 'bg-brand text-white border-brand shadow-xs'
                                : 'bg-surface hover:bg-brand-soft text-ink hover:text-brand border-line hover:border-brand/40 shadow-xs'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                            <span>{tpl.name} ({tpl.factor})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {additionalUnits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteAdditionalUnit(idx)}
                      className="text-danger hover:bg-danger-soft p-1 rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
                      title="حذف هذه العبوة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  )}
                </div>

                {/* Direct Inline Inputs Grid */}
                <div className="grid grid-cols-12 gap-3 items-end">
                  {/* 1. Unit Name */}
                  <div className="col-span-12 sm:col-span-3">
                    <label className="block text-[11.5px] font-semibold text-ink mb-1 whitespace-nowrap">
                      اسم العبوة *
                    </label>
                    <input
                      type="text"
                      value={u.unitName}
                      onChange={(e) => handleUpdateAdditionalUnit(idx, { unitName: e.target.value })}
                      placeholder="مثال: كرتونة أو دستة"
                      className="w-full bg-surface border border-line rounded h-[36px] px-3 text-[12.5px] text-ink font-bold focus:outline-none focus:border-brand shadow-xs"
                    />
                  </div>

                  {/* 2. Factor (Quantity inside) */}
                  <div className="col-span-6 sm:col-span-2">
                    <label className="block text-[11.5px] font-semibold text-ink mb-1 whitespace-nowrap truncate" title={`تحتوي على كم ${baseUnitName}؟`}>
                      العدد ({baseUnitName}) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={u.conversionFactor}
                      onChange={(e) => {
                        const val = parseInt(normalizeArabicNumerals(e.target.value), 10);
                        if (!isNaN(val) && val > 0) {
                          handleUpdateAdditionalUnit(idx, { 
                            conversionFactor: val,
                            sellPricePiasters: basePricePiasters * val,
                            costPricePiasters: baseCostPiasters * val
                          });
                        }
                      }}
                      className="w-full bg-surface border border-line rounded h-[36px] px-2 text-[13px] font-mono text-center font-bold text-ink focus:outline-none focus:border-brand shadow-xs"
                    />
                  </div>

                  {/* 3. Sell Price */}
                  <div className="col-span-6 sm:col-span-3">
                    <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
                      <label className="text-[11.5px] font-semibold text-ink whitespace-nowrap">
                        سعر بيع العبوة *
                      </label>
                      <button
                        type="button"
                        onClick={() => handleAutoCalculatePrices(idx)}
                        className="text-[10px] text-brand hover:bg-brand/10 font-bold flex items-center gap-1 bg-brand-soft px-1.5 py-0.5 rounded border border-brand/20 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                        title={`احتساب تلقائي: ضرب سعر ${baseUnitName} (${formatArabicCurrency(basePricePiasters)}) × ${factor} = ${formatArabicCurrency(basePricePiasters * factor)}`}
                      >
                        <Sparkles className="w-2.5 h-2.5 text-brand shrink-0" />
                        <span>تلقائي</span>
                      </button>
                    </div>
                    <MoneyInput
                      valuePiasters={u.sellPricePiasters}
                      onChangePiasters={(p) => handleUpdateAdditionalUnit(idx, { sellPricePiasters: p })}
                      className="h-[36px] text-[13px] font-bold text-brand shadow-xs"
                    />
                  </div>

                  {/* 4. Cost Price */}
                  <div className="col-span-6 sm:col-span-2">
                    <label className="block text-[11.5px] font-semibold text-ink mb-1 whitespace-nowrap">
                      تكلفة العبوة
                    </label>
                    <MoneyInput
                      valuePiasters={u.costPricePiasters}
                      onChangePiasters={(c) => handleUpdateAdditionalUnit(idx, { costPricePiasters: c })}
                      className="h-[36px] text-[12.5px] shadow-xs"
                    />
                  </div>

                  {/* 5. Barcode */}
                  <div className="col-span-6 sm:col-span-2">
                    <label className="block text-[11.5px] font-semibold text-ink mb-1 whitespace-nowrap truncate" title="باركود خاص بالكرتونة لقراءته بالسكانر">
                      باركود العبوة
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={u.barcode || ''}
                        onChange={(e) => handleUpdateAdditionalUnit(idx, { barcode: normalizeArabicNumerals(e.target.value) })}
                        placeholder="امسح الباركود"
                        className="w-full bg-surface border border-line rounded h-[36px] px-2 text-[11.5px] font-mono text-ink focus:outline-none focus:border-brand pl-6 shadow-xs"
                      />
                      <BarcodeIcon className="w-3.5 h-3.5 text-ink-muted absolute left-2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* 3. Live Smart Insights Ribbon */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-surface border border-line/60 text-[11px]">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-ink-muted">
                      سعر {baseUnitName} بالجملة: <strong className="text-ink font-mono">{formatArabicCurrency(pieceWholesalePrice)}</strong>
                    </span>
                    {customerSavingPiasters > 0 && (
                      <span className="text-brand font-bold bg-brand-soft px-1.5 py-0.2 rounded font-mono">
                        توفير للزبون: {formatArabicCurrency(customerSavingPiasters)} عن القطاعي
                      </span>
                    )}
                    <span className="text-ink-muted">•</span>
                    {isLoss ? (
                      <span className="text-danger font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0" />
                        <span>بيع بخسارة ({formatArabicCurrency(profitPiasters)})</span>
                      </span>
                    ) : (
                      <span className="text-brand font-bold flex items-center gap-1 font-mono">
                        <TrendingUp className="w-3 h-3 text-brand" />
                        <span>ربح العبوة: +{formatArabicCurrency(profitPiasters)} ({markupPercent.toFixed(0)}%)</span>
                      </span>
                    )}
                  </div>

                  <label className="flex items-center gap-1.5 cursor-pointer text-ink select-none text-[10.5px]">
                    <input
                      type="checkbox"
                      checked={u.isDivisible}
                      onChange={(e) => handleUpdateAdditionalUnit(idx, { isDivisible: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-line text-brand focus:ring-0 cursor-pointer"
                    />
                    <span>تسمح ببيع أجزاء (مثل 0.5 كرتونة)</span>
                  </label>
                </div>
              </div>
            );
          })}

          {/* Add extra package button (only for advanced cases with > 1 package) */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleAddExtraPackage}
              className="text-[11px] font-bold text-brand hover:underline flex items-center gap-1 py-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة عبوة مجمعة ثانية (مثلاً كرتونة أكبر بعد الدستة)</span>
            </button>
            <span className="text-[10px] text-ink-muted">
              المخزن يُخصم تلقائياً بعدد الـ ({baseUnitName}) عند بيع أي عبوة في الكاشير
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
