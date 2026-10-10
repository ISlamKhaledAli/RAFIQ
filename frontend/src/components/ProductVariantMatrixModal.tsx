import React, { useState, useMemo } from 'react';
import {
  Layers,
  X,
  Plus,
  Barcode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sliders,
  Package
} from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { CustomSelect } from './CustomSelect';
import { MoneyInput } from './MoneyInput';
import { normalizeArabicNumerals } from '../utils/money';
import type { Category, VariantMatrixCell, CreateVariantMatrixRequest, ParentProductWithVariants } from '../types/models';

interface ProductVariantMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: ParentProductWithVariants) => void;
  categories: Category[];
}

const PRESET_SIZES = {
  clothing: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  shoes: ['38', '39', '40', '41', '42', '43', '44', '45'],
  numbers: ['1', '2', '3', '4', '5'],
};

const PRESET_COLORS = [
  'أسود',
  'أبيض',
  'كحلي',
  'رمادي',
  'أحمر',
  'أزرق',
  'بيج',
  'زيتي',
  'بني',
  'أصفر'
];

export const ProductVariantMatrixModal: React.FC<ProductVariantMatrixModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  categories,
}) => {
  // Base product fields
  const [parentName, setParentName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [defaultPricePiasters, setDefaultPricePiasters] = useState<number>(0);
  const [defaultCostPiasters, setDefaultCostPiasters] = useState<number>(0);
  const [defaultMinStock, setDefaultMinStock] = useState<number>(2000); // 2 pieces

  // Selected sizes & colors tags
  const [sizes, setSizes] = useState<string[]>(['M', 'L', 'XL']);
  const [colors, setColors] = useState<string[]>(['أسود', 'كحلي']);
  const [newSizeInput, setNewSizeInput] = useState('');
  const [newColorInput, setNewColorInput] = useState('');

  // Bulk fill inputs
  const [bulkStockUnits, setBulkStockUnits] = useState<string>('5');

  // Matrix cells state
  const [matrixCells, setMatrixCells] = useState<Record<string, VariantMatrixCell>>({});

  // Loading & feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize or synchronize matrix cells whenever sizes or colors change
  const cellKeys = useMemo(() => {
    const keys: string[] = [];
    for (const c of colors) {
      for (const s of sizes) {
        keys.push(`${c}_${s}`);
      }
    }
    return keys;
  }, [colors, sizes]);

  // Sync cells when combinations change
  React.useEffect(() => {
    setMatrixCells((prev) => {
      const next: Record<string, VariantMatrixCell> = {};
      for (const c of colors) {
        for (const s of sizes) {
          const key = `${c}_${s}`;
          if (prev[key]) {
            next[key] = prev[key];
          } else {
            next[key] = {
              color: c,
              size: s,
              barcode: '',
              sku: '',
              pricePiasters: defaultPricePiasters,
              costPiasters: defaultCostPiasters,
              stockQuantityMilli: 0,
              minStockQuantityMilli: defaultMinStock,
              isEnabled: true,
            };
          }
        }
      }
      return next;
    });
  }, [colors, sizes, defaultPricePiasters, defaultCostPiasters, defaultMinStock]);

  if (!isOpen) return null;

  // Add / remove tags
  const handleAddSize = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || sizes.includes(trimmed)) return;
    setSizes([...sizes, trimmed]);
    setNewSizeInput('');
  };

  const handleRemoveSize = (sizeToRemove: string) => {
    setSizes(sizes.filter((s) => s !== sizeToRemove));
  };

  const handleAddColor = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || colors.includes(trimmed)) return;
    setColors([...colors, trimmed]);
    setNewColorInput('');
  };

  const handleRemoveColor = (colorToRemove: string) => {
    setColors(colors.filter((c) => c !== colorToRemove));
  };

  // Bulk actions
  const applyDefaultPricesToAll = () => {
    setMatrixCells((prev) => {
      const updated = { ...prev };
      for (const k of Object.keys(updated)) {
        updated[k] = {
          ...updated[k],
          pricePiasters: defaultPricePiasters,
          costPiasters: defaultCostPiasters,
        };
      }
      return updated;
    });
  };

  const applyBulkStockToAll = () => {
    const stockMilli = Math.max(0, Math.round((parseFloat(bulkStockUnits) || 0) * 1000));
    setMatrixCells((prev) => {
      const updated = { ...prev };
      for (const k of Object.keys(updated)) {
        updated[k] = {
          ...updated[k],
          stockQuantityMilli: stockMilli,
        };
      }
      return updated;
    });
  };

  const toggleAllCells = (enable: boolean) => {
    setMatrixCells((prev) => {
      const updated = { ...prev };
      for (const k of Object.keys(updated)) {
        updated[k] = {
          ...updated[k],
          isEnabled: enable,
        };
      }
      return updated;
    });
  };

  const autoGenerateAllBarcodes = () => {
    setMatrixCells((prev) => {
      const updated = { ...prev };
      for (const k of Object.keys(updated)) {
        const randDigits = Math.floor(100000000 + Math.random() * 900000000);
        updated[k] = {
          ...updated[k],
          barcode: `214${randDigits}`,
          sku: `${parentName.trim() || 'PROD'}-${updated[k].color}-${updated[k].size}`.replace(/\s+/g, '-'),
        };
      }
      return updated;
    });
  };

  // Metrics
  const activeCells = Object.values(matrixCells).filter((c) => c.isEnabled);
  const totalStockUnits = activeCells.reduce((sum, c) => sum + c.stockQuantityMilli / 1000, 0);
  const totalCostEGP = activeCells.reduce((sum, c) => sum + (c.costPiasters * (c.stockQuantityMilli / 1000)) / 100, 0);

  // Submit
  const handleSubmit = async () => {
    setErrorMessage(null);
    if (!parentName.trim()) {
      setErrorMessage('يرجى إدخال اسم المنتج الأساسي');
      return;
    }
    if (sizes.length === 0 || colors.length === 0) {
      setErrorMessage('يرجى تحديد مقاس واحد ولون واحد على الأقل');
      return;
    }
    if (activeCells.length === 0) {
      setErrorMessage('يجب تفعيل تركيبة واحدة على الأقل في المصفوفة');
      return;
    }

    setIsSubmitting(true);
    try {
      const req: CreateVariantMatrixRequest = {
        parentName: parentName.trim(),
        categoryId: categoryId || null,
        defaultPricePiasters,
        defaultCostPiasters,
        defaultMinStockQuantityMilli: defaultMinStock,
        sizes,
        colors,
        matrixCells: activeCells,
      };

      const result = await invoke<ParentProductWithVariants>('variants:createMatrix', req);
      onSuccess(result);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء حفظ مصفوفة التركيبات');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        dir="rtl"
        className="bg-surface rounded-2xl border border-line shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-ink font-sans"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-surface-2/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                إضافة منتج متعدد المقاسات والألوان
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-soft text-brand font-medium">
                  {activeCells.length} تركيبة مفعلة
                </span>
              </h2>
              <p className="text-xs text-ink-muted">
                إنشاء منتج أب وجميع تركيبات المقاسات والألوان بجدول تفاعلي واحد
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ink-muted hover:text-ink hover:bg-line/40 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="p-3.5 bg-danger/10 border border-danger/20 rounded-xl flex items-center gap-3 text-danger text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Base Product Info */}
          <div className="bg-surface-2/40 border border-line rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <Package className="w-4 h-4 text-brand" />
              بيانات المنتج الأساسي
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-ink-muted mb-1">
                  اسم المنتج الأساسي <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  placeholder="مثال: قميص رجالي كاجوال / بنطلون جينز"
                  className="w-full h-10 px-3 rounded-lg border border-line bg-surface text-ink text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">
                  القسم / التصنيف
                </label>
                <CustomSelect
                  value={categoryId}
                  onChange={setCategoryId}
                  options={[
                    { value: '', label: 'بدون تصنيف' },
                    ...categories.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  placeholder="اختر التصنيف..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">
                  حد الطلب الافتراضي (قطع)
                </label>
                <input
                  type="number"
                  min="0"
                  value={defaultMinStock / 1000}
                  onChange={(e) => setDefaultMinStock(Math.max(0, parseFloat(e.target.value) || 0) * 1000)}
                  className="w-full h-10 px-3 rounded-lg border border-line bg-surface text-ink text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">
                  سعر البيع الافتراضي
                </label>
                <MoneyInput
                  valuePiasters={defaultPricePiasters}
                  onChangePiasters={setDefaultPricePiasters}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">
                  سعر التكلفة الافتراضي
                </label>
                <MoneyInput
                  valuePiasters={defaultCostPiasters}
                  onChangePiasters={setDefaultCostPiasters}
                  placeholder="0.00"
                />
              </div>

              <div className="md:col-span-2 flex items-end">
                <button
                  type="button"
                  onClick={applyDefaultPricesToAll}
                  className="h-10 px-4 rounded-lg bg-surface border border-line hover:border-brand hover:text-brand text-xs font-semibold text-ink transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  تطبيق الأسعار الافتراضية على كل التركيبات
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Sizes & Colors Definition */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Sizes Box */}
            <div className="bg-surface-2/40 border border-line rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-brand" />
                  المقاسات المتاحة ({sizes.length})
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-ink-muted">نماذج:</span>
                  <button
                    type="button"
                    onClick={() => setSizes([...PRESET_SIZES.clothing])}
                    className="text-[11px] text-brand hover:underline px-1"
                  >
                    ملابس
                  </button>
                  <button
                    type="button"
                    onClick={() => setSizes([...PRESET_SIZES.shoes])}
                    className="text-[11px] text-brand hover:underline px-1"
                  >
                    أحذية
                  </button>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 min-h-[42px] p-2 bg-surface rounded-lg border border-line">
                {sizes.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-soft text-brand text-xs font-bold border border-brand/20"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => handleRemoveSize(s)}
                      className="hover:text-danger hover:bg-danger/10 rounded p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {sizes.length === 0 && (
                  <span className="text-xs text-ink-muted flex items-center">أضف مقاساً أدناه...</span>
                )}
              </div>

              {/* Add Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSizeInput}
                  onChange={(e) => setNewSizeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSize(newSizeInput);
                    }
                  }}
                  placeholder="أدخل مقاساً واضغط Enter..."
                  className="flex-1 h-9 px-3 rounded-lg border border-line bg-surface text-ink text-xs outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => handleAddSize(newSizeInput)}
                  className="h-9 px-3 rounded-lg bg-surface border border-line hover:border-brand text-ink text-xs font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  إضافة
                </button>
              </div>
            </div>

            {/* Colors Box */}
            <div className="bg-surface-2/40 border border-line rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-paid" />
                  الألوان المتاحة ({colors.length})
                </label>
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[11px] text-ink-muted">سريعة:</span>
                  {PRESET_COLORS.slice(0, 5).map((pc) => (
                    <button
                      key={pc}
                      type="button"
                      onClick={() => handleAddColor(pc)}
                      className="text-[11px] text-brand hover:underline px-1"
                    >
                      {pc}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 min-h-[42px] p-2 bg-surface rounded-lg border border-line">
                {colors.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-paid-soft text-paid text-xs font-bold border border-paid/20"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => handleRemoveColor(c)}
                      className="hover:text-danger hover:bg-danger/10 rounded p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {colors.length === 0 && (
                  <span className="text-xs text-ink-muted flex items-center">أضف لوناً أدناه...</span>
                )}
              </div>

              {/* Add Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newColorInput}
                  onChange={(e) => setNewColorInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddColor(newColorInput);
                    }
                  }}
                  placeholder="أدخل لوناً واضغط Enter..."
                  className="flex-1 h-9 px-3 rounded-lg border border-line bg-surface text-ink text-xs outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => handleAddColor(newColorInput)}
                  className="h-9 px-3 rounded-lg bg-surface border border-line hover:border-paid text-ink text-xs font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  إضافة
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Matrix Grid Table & Quick Bulk Operations */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-2/60 border border-line p-3 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink">إجراءات جماعية سريعة:</span>
                <button
                  type="button"
                  onClick={autoGenerateAllBarcodes}
                  className="px-2.5 py-1 rounded-lg bg-surface border border-line hover:border-brand text-xs font-semibold text-brand flex items-center gap-1.5 transition-colors"
                >
                  <Barcode className="w-3.5 h-3.5" />
                  توليد باركود فريد للكل (214)
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllCells(true)}
                  className="px-2.5 py-1 rounded-lg bg-surface border border-line hover:bg-surface-2 text-xs font-medium text-ink transition-colors"
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  onClick={() => toggleAllCells(false)}
                  className="px-2.5 py-1 rounded-lg bg-surface border border-line hover:bg-surface-2 text-xs font-medium text-ink transition-colors"
                >
                  إلغاء تحديد الكل
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-muted">رصيد افتتاحي للكل:</span>
                <input
                  type="number"
                  min="0"
                  value={bulkStockUnits}
                  onChange={(e) => setBulkStockUnits(e.target.value)}
                  className="w-16 h-8 px-2 rounded-lg border border-line bg-surface text-ink text-xs text-center outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={applyBulkStockToAll}
                  className="h-8 px-3 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-dark transition-colors"
                >
                  تطبيق
                </button>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="border border-line rounded-xl overflow-hidden bg-surface shadow-sm">
              <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="bg-surface-2 text-ink-muted sticky top-0 z-10 border-b border-line font-bold">
                    <tr>
                      <th className="p-3 w-10 text-center">#</th>
                      <th className="p-3">اللون</th>
                      <th className="p-3">المقاس</th>
                      <th className="p-3 w-40">الباركود (داخلي أو مصنع)</th>
                      <th className="p-3 w-28">سعر البيع</th>
                      <th className="p-3 w-28">سعر التكلفة</th>
                      <th className="p-3 w-24">الرصيد الافتتاحي</th>
                      <th className="p-3 w-16 text-center">تفعيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {cellKeys.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-ink-muted">
                          يرجى إضافة مقاسات وألوان لتوليد المصفوفة التفاعلية
                        </td>
                      </tr>
                    ) : (
                      cellKeys.map((key, idx) => {
                        const cell = matrixCells[key];
                        if (!cell) return null;
                        const isEnabled = cell.isEnabled;

                        return (
                          <tr
                            key={key}
                            className={`transition-colors ${
                              isEnabled ? 'hover:bg-brand-soft/20' : 'bg-surface-2/40 opacity-50'
                            }`}
                          >
                            <td className="p-3 text-center text-ink-muted font-mono">{idx + 1}</td>
                            <td className="p-3 font-bold text-ink">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-paid-soft text-paid">
                                {cell.color}
                              </span>
                            </td>
                            <td className="p-3 font-bold text-ink">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand-soft text-brand font-mono">
                                {cell.size}
                              </span>
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={cell.barcode}
                                onChange={(e) =>
                                  setMatrixCells((prev) => ({
                                    ...prev,
                                    [key]: { ...prev[key], barcode: e.target.value },
                                  }))
                                }
                                placeholder="تلقائي (214...)"
                                disabled={!isEnabled}
                                className="w-full h-8 px-2 rounded border border-line bg-surface text-ink font-mono text-xs focus:border-brand outline-none"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={cell.pricePiasters > 0 ? (cell.pricePiasters / 100).toString() : ''}
                                onChange={(e) => {
                                  const norm = normalizeArabicNumerals(e.target.value);
                                  if (/^[0-9]*\.?[0-9]{0,2}$/.test(norm)) {
                                    setMatrixCells((prev) => ({
                                      ...prev,
                                      [key]: {
                                        ...prev[key],
                                        pricePiasters: Math.round((parseFloat(norm) || 0) * 100),
                                      },
                                    }));
                                  }
                                }}
                                onFocus={(e) => e.target.select()}
                                placeholder="0.00"
                                disabled={!isEnabled}
                                className="w-full h-8 px-2 rounded border border-line bg-surface text-ink text-xs focus:border-brand outline-none"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={cell.costPiasters > 0 ? (cell.costPiasters / 100).toString() : ''}
                                onChange={(e) => {
                                  const norm = normalizeArabicNumerals(e.target.value);
                                  if (/^[0-9]*\.?[0-9]{0,2}$/.test(norm)) {
                                    setMatrixCells((prev) => ({
                                      ...prev,
                                      [key]: {
                                        ...prev[key],
                                        costPiasters: Math.round((parseFloat(norm) || 0) * 100),
                                      },
                                    }));
                                  }
                                }}
                                onFocus={(e) => e.target.select()}
                                placeholder="0.00"
                                disabled={!isEnabled}
                                className="w-full h-8 px-2 rounded border border-line bg-surface text-ink text-xs focus:border-brand outline-none"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="number"
                                min="0"
                                value={cell.stockQuantityMilli / 1000 || ''}
                                onChange={(e) =>
                                  setMatrixCells((prev) => ({
                                    ...prev,
                                    [key]: {
                                      ...prev[key],
                                      stockQuantityMilli: Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 1000)),
                                    },
                                  }))
                                }
                                placeholder="0"
                                disabled={!isEnabled}
                                className="w-full h-8 px-2 rounded border border-line bg-surface text-ink text-xs text-center font-mono focus:border-brand outline-none"
                              />
                            </td>
                            <td className="p-3 text-center">
                              <input
                                type="checkbox"
                                checked={cell.isEnabled}
                                onChange={(e) =>
                                  setMatrixCells((prev) => ({
                                    ...prev,
                                    [key]: { ...prev[key], isEnabled: e.target.checked },
                                  }))
                                }
                                className="w-4 h-4 rounded text-brand border-line focus:ring-brand cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer & Metrics */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-line bg-surface-2/60">
          <div className="flex items-center gap-6 text-xs text-ink-muted">
            <div>
              التركيبات النشطة:{' '}
              <strong className="text-ink font-bold font-mono text-sm">{activeCells.length}</strong>
            </div>
            <div>
              إجمالي الرصيد:{' '}
              <strong className="text-brand font-bold font-mono text-sm">{totalStockUnits}</strong> قطعة
            </div>
            <div>
              قيمة التكلفة الافتتاحية:{' '}
              <strong className="text-paid font-bold font-mono text-sm">
                {totalCostEGP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>{' '}
              ج.م
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 px-4 rounded-xl border border-line text-ink-muted hover:text-ink hover:bg-surface-2 text-xs font-semibold transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="h-10 px-6 rounded-xl bg-brand text-white hover:bg-brand-dark text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  جاري الحفظ والإنشاء الذري...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  حفظ مصفوفة التركيبات في المخزن
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
