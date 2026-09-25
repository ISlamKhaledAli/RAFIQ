import React, { useState } from 'react';
import { 
  Package, 
  Plus, 
  Trash2, 
  AlertCircle, 
  Barcode as BarcodeIcon, 
  TrendingUp, 
  Calculator, 
  Star
} from 'lucide-react';
import type { ProductUnit } from '../types/models';
import { MoneyInput } from './MoneyInput';
import { formatArabicCurrency, normalizeArabicNumerals } from '../utils/money';

export interface ProductUnitsEditorProps {
  units: ProductUnit[];
  onChange: (units: ProductUnit[]) => void;
  basePricePiasters: number;
  baseCostPiasters: number;
  baseUnitName: string;
  primaryBarcode?: string | null;
}

interface UnitTemplate {
  name: string;
  factor: number;
  divisible: boolean;
}

const TEMPLATES: UnitTemplate[] = [
  { name: 'دستة', factor: 12, divisible: false },
  { name: 'نصف دستة', factor: 6, divisible: false },
  { name: 'كرتونة', factor: 24, divisible: false },
  { name: 'باكت', factor: 10, divisible: false },
  { name: 'علبة', factor: 20, divisible: false },
  { name: 'شريط', factor: 10, divisible: false },
];

export const ProductUnitsEditor: React.FC<ProductUnitsEditorProps> = ({
  units,
  onChange,
  basePricePiasters,
  baseCostPiasters,
  baseUnitName,
  primaryBarcode
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Helper to ensure at least one base unit exists
  const ensureBaseUnit = (list: ProductUnit[]): ProductUnit[] => {
    if (list.length === 0) {
      return [{
        unitName: baseUnitName || 'قطعة',
        conversionFactor: 1,
        isBaseUnit: true,
        sellPricePiasters: basePricePiasters,
        costPricePiasters: baseCostPiasters,
        barcode: primaryBarcode || '',
        isDivisible: baseUnitName === 'kg' || baseUnitName === 'كيلو',
        sortOrder: 0
      }];
    }
    const hasBase = list.some(u => u.isBaseUnit);
    if (!hasBase) {
      return list.map((u, i) => i === 0 ? { ...u, isBaseUnit: true, conversionFactor: 1 } : u);
    }
    return list;
  };

  const currentUnits = ensureBaseUnit(units);

  const handleAddTemplate = (tpl: UnitTemplate) => {
    setErrorMsg(null);
    if (currentUnits.some(u => u.unitName.trim().toLowerCase() === tpl.name.toLowerCase())) {
      setErrorMsg(`الوحدة '${tpl.name}' مضافة بالفعل لهذا الصنف`);
      return;
    }

    const calculatedSell = basePricePiasters * tpl.factor;
    const calculatedCost = baseCostPiasters * tpl.factor;

    const newUnit: ProductUnit = {
      unitName: tpl.name,
      conversionFactor: tpl.factor,
      isBaseUnit: false,
      sellPricePiasters: calculatedSell,
      costPricePiasters: calculatedCost,
      barcode: '',
      isDivisible: tpl.divisible,
      sortOrder: currentUnits.length
    };

    onChange([...currentUnits, newUnit]);
  };

  const handleAddCustomUnit = () => {
    setErrorMsg(null);
    const newUnit: ProductUnit = {
      unitName: '',
      conversionFactor: 2,
      isBaseUnit: false,
      sellPricePiasters: basePricePiasters * 2,
      costPricePiasters: baseCostPiasters * 2,
      barcode: '',
      isDivisible: false,
      sortOrder: currentUnits.length
    };
    onChange([...currentUnits, newUnit]);
  };

  const handleSetBase = (index: number) => {
    setErrorMsg(null);
    const updated = currentUnits.map((u, idx) => ({
      ...u,
      isBaseUnit: idx === index,
      conversionFactor: idx === index ? 1 : u.conversionFactor
    }));
    onChange(updated);
  };

  const handleUpdateUnit = (index: number, updates: Partial<ProductUnit>) => {
    setErrorMsg(null);
    const updated = currentUnits.map((u, idx) => {
      if (idx !== index) return u;
      return { ...u, ...updates };
    });
    onChange(updated);
  };

  const handleDeleteUnit = (index: number) => {
    setErrorMsg(null);
    const unitToDelete = currentUnits[index];
    if (unitToDelete.isBaseUnit) {
      setErrorMsg('لا يمكن حذف الوحدة الأساسية. يرجى تعيين وحدة أخرى كأساسية أولاً.');
      return;
    }
    if (currentUnits.length <= 1) {
      setErrorMsg('يجب أن يحتوي المنتج على وحدة بيع واحدة على الأقل.');
      return;
    }
    onChange(currentUnits.filter((_, idx) => idx !== index));
  };

  const handleAutoCalculatePrices = (index: number) => {
    const u = currentUnits[index];
    if (!u) return;
    const calculatedSell = basePricePiasters * u.conversionFactor;
    const calculatedCost = baseCostPiasters * u.conversionFactor;
    handleUpdateUnit(index, {
      sellPricePiasters: calculatedSell,
      costPricePiasters: calculatedCost
    });
  };

  return (
    <div className="flex flex-col gap-3 p-3 bg-surface-2/40 border border-line rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-brand" />
          <h4 className="text-[12.5px] font-bold text-ink m-0">
            وحدات البيع والشراء المتعددة (قطعة، دستة، كرتونة...)
          </h4>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface border border-line text-ink-muted">
            {currentUnits.length} وحدة
          </span>
        </div>

        <button
          type="button"
          onClick={handleAddCustomUnit}
          className="h-[28px] px-2.5 bg-brand hover:bg-brand-hover text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>إضافة وحدة مخصصة</span>
        </button>
      </div>

      {/* Quick Template Buttons */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-line/60">
        <span className="text-[10.5px] font-semibold text-ink-muted ml-1">قوالب سريعة:</span>
        {TEMPLATES.map((tpl) => {
          const isAdded = currentUnits.some(u => u.unitName.trim().toLowerCase() === tpl.name.toLowerCase());
          return (
            <button
              key={tpl.name}
              type="button"
              disabled={isAdded}
              onClick={() => handleAddTemplate(tpl)}
              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all flex items-center gap-1 border ${
                isAdded 
                  ? 'bg-surface-2 text-ink-muted border-line opacity-50 cursor-not-allowed'
                  : 'bg-surface hover:bg-brand-soft text-ink hover:text-brand border-line hover:border-brand/40 shadow-2xs'
              }`}
              title={isAdded ? 'مضافة بالفعل' : `إضافة وحدة ${tpl.name} بمعامل تحويل ${tpl.factor}`}
            >
              <span>+ {tpl.name} ({tpl.factor})</span>
            </button>
          );
        })}
      </div>

      {errorMsg && (
        <div className="p-2 rounded bg-danger-soft border border-danger-border text-danger flex items-center gap-1.5 text-[11px] font-bold">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Units Table / Cards */}
      <div className="flex flex-col gap-2 mt-1">
        {currentUnits.map((u, index) => {
          const effectiveCost = u.costPricePiasters > 0 
            ? u.costPricePiasters 
            : (baseCostPiasters * u.conversionFactor);
          const profitPiasters = u.sellPricePiasters - effectiveCost;
          const markupPercent = effectiveCost > 0 ? ((profitPiasters / effectiveCost) * 100) : 0;
          const isLoss = profitPiasters < 0;

          return (
            <div 
              key={u.id || index}
              className={`p-2.5 rounded-md border transition-all ${
                u.isBaseUnit 
                  ? 'bg-brand-soft/20 border-brand/40 shadow-xs' 
                  : 'bg-surface border-line hover:border-line-hover'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {u.isBaseUnit ? (
                    <span className="px-2 py-0.5 rounded bg-brand text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs">
                      <Star className="w-3 h-3 fill-white" />
                      <span>الوحدة الأساسية (المخزن يُحسب بها)</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSetBase(index)}
                      className="px-2 py-0.5 rounded bg-surface hover:bg-brand-soft border border-line text-ink-muted hover:text-brand text-[10.5px] font-bold flex items-center gap-1 transition-colors"
                      title="اضغط لتعيين هذه الوحدة كوحدة أساسية للمنتج"
                    >
                      <span>تعيين كوحدة أساسية</span>
                    </button>
                  )}
                  {u.isDivisible ? (
                    <span className="text-[10px] text-brand bg-brand-soft px-1.5 py-0.2 rounded font-semibold">
                      قابلة للتجزئة
                    </span>
                  ) : (
                    <span className="text-[10px] text-ink-muted bg-surface-2 px-1.5 py-0.2 rounded font-semibold">
                      وحدة مقفولة (عدد صحيح فقط)
                    </span>
                  )}
                </div>

                {!u.isBaseUnit && (
                  <button
                    type="button"
                    onClick={() => handleDeleteUnit(index)}
                    className="p-1 rounded text-ink-muted hover:text-danger hover:bg-danger-soft transition-colors"
                    title="حذف هذه الوحدة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Input Fields Row */}
              <div className="grid grid-cols-12 gap-2 items-end">
                {/* Unit Name */}
                <div className="col-span-3">
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    اسم الوحدة *
                  </label>
                  <input
                    type="text"
                    value={u.unitName}
                    onChange={(e) => handleUpdateUnit(index, { unitName: e.target.value })}
                    placeholder="مثال: كرتونة"
                    className="w-full bg-surface border border-line rounded h-[32px] px-2 text-[12px] text-ink font-semibold focus:outline-none focus:border-brand"
                  />
                </div>

                {/* Conversion Factor */}
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    معامل التحويل *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    disabled={u.isBaseUnit}
                    value={u.isBaseUnit ? 1 : u.conversionFactor}
                    onChange={(e) => {
                      const val = parseInt(normalizeArabicNumerals(e.target.value), 10);
                      if (!isNaN(val) && val > 0) {
                        handleUpdateUnit(index, { conversionFactor: val });
                      }
                    }}
                    className={`w-full border rounded h-[32px] px-2 text-[12px] font-mono text-center font-bold ${
                      u.isBaseUnit 
                        ? 'bg-surface-2 text-ink-muted border-line cursor-not-allowed' 
                        : 'bg-surface text-ink border-line focus:outline-none focus:border-brand'
                    }`}
                    title={u.isBaseUnit ? 'الوحدة الأساسية معاملها دائمًا = 1' : 'كم وحدة أساسية تحتوي هذه الوحدة؟'}
                  />
                </div>

                {/* Selling Price */}
                <div className="col-span-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-ink">
                      سعر البيع
                    </label>
                    {!u.isBaseUnit && (
                      <button
                        type="button"
                        onClick={() => handleAutoCalculatePrices(index)}
                        className="text-[10px] text-brand hover:underline font-semibold flex items-center gap-0.5"
                        title="احتساب السعر تلقائياً: سعر الأساسية × المعامل"
                      >
                        <Calculator className="w-2.5 h-2.5" />
                        <span>تلقائي</span>
                      </button>
                    )}
                  </div>
                  <MoneyInput
                    valuePiasters={u.sellPricePiasters}
                    onChangePiasters={(p) => handleUpdateUnit(index, { sellPricePiasters: p })}
                    className="h-[32px] text-[12px] font-bold text-brand"
                  />
                </div>

                {/* Cost Price */}
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-ink mb-1">
                    التكلفة
                  </label>
                  <MoneyInput
                    valuePiasters={u.costPricePiasters}
                    onChangePiasters={(c) => handleUpdateUnit(index, { costPricePiasters: c })}
                    className="h-[32px] text-[12px]"
                  />
                </div>

                {/* Barcode */}
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-ink mb-1 truncate" title="باركود خاص بهذه الوحدة (اختياري)">
                    باركود الوحدة
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={u.barcode || ''}
                      onChange={(e) => handleUpdateUnit(index, { barcode: normalizeArabicNumerals(e.target.value) })}
                      placeholder="امسح الباركود"
                      className="w-full bg-surface border border-line rounded h-[32px] px-2 text-[11px] font-mono text-ink focus:outline-none focus:border-brand pl-6"
                    />
                    <BarcodeIcon className="w-3 h-3 text-ink-muted absolute left-1.5 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Profit & Divisible Toggle Info Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-line/40 text-[11px]">
                <label className="flex items-center gap-1.5 cursor-pointer text-ink select-none">
                  <input
                    type="checkbox"
                    checked={u.isDivisible}
                    onChange={(e) => handleUpdateUnit(index, { isDivisible: e.target.checked })}
                    className="w-3.5 h-3.5 rounded border-line text-brand focus:ring-0 cursor-pointer"
                  />
                  <span>قابلة للتجزئة (تسمح ببيع كسور مثل 0.5)</span>
                </label>

                <div className="flex items-center gap-2 font-mono">
                  {isLoss ? (
                    <span className="text-danger font-bold flex items-center gap-1">
                      <span>بيع بخسارة:</span>
                      <span>{formatArabicCurrency(profitPiasters)}</span>
                    </span>
                  ) : (
                    <span className="text-brand font-bold flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      <span>الربح: {formatArabicCurrency(profitPiasters)}</span>
                      <span className="text-ink-muted font-normal">({markupPercent.toFixed(0)}%)</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
