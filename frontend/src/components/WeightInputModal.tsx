import React, { useState, useEffect, useRef } from 'react';
import { Scale, X, Check, Delete, RotateCcw } from 'lucide-react';
import { formatArabicCurrency, calculateLineTotal, normalizeArabicNumerals } from '../utils/money';

interface WeightInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    name: string;
    pricePiasters: number;
    barcode?: string | null;
  } | null;
  initialWeightMilli?: number;
  onConfirm: (weightMilli: number) => void;
}

interface WeightInputModalContentProps {
  onClose: () => void;
  product: {
    name: string;
    pricePiasters: number;
    barcode?: string | null;
  };
  initialWeightMilli: number;
  onConfirm: (weightMilli: number) => void;
}

const WeightInputModalContent: React.FC<WeightInputModalContentProps> = ({
  onClose,
  product,
  initialWeightMilli,
  onConfirm,
}) => {
  const [unitMode, setUnitMode] = useState<'kg' | 'gram'>('kg');
  const [inputValue, setInputValue] = useState<string>(() => {
    if (initialWeightMilli > 0) {
      const kgVal = (initialWeightMilli / 1000).toFixed(3).replace(/\.?0+$/, '');
      return kgVal || '1';
    }
    return '1';
  });

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus and select input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Calculate weight in milli-units (grams)
  const normalizedText = normalizeArabicNumerals(inputValue);
  const parsedNum = parseFloat(normalizedText) || 0;
  const weightMilli = unitMode === 'kg' 
    ? Math.round(parsedNum * 1000) 
    : Math.round(parsedNum);

  const pricePiasters = product.pricePiasters;
  const totalPiasters = calculateLineTotal(pricePiasters, weightMilli);

  const handleConfirm = () => {
    if (weightMilli <= 0) return;
    onConfirm(weightMilli);
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleKeypadPress = (val: string) => {
    if (val === 'C') {
      setInputValue('');
    } else if (val === 'BACK') {
      setInputValue((prev) => prev.slice(0, -1));
    } else if (val === '.') {
      if (!inputValue.includes('.')) {
        setInputValue((prev) => (prev ? prev + '.' : '0.'));
      }
    } else {
      setInputValue((prev) => (prev === '0' ? val : prev + val));
    }
    inputRef.current?.focus();
  };

  const setPresetGrams = (grams: number) => {
    if (unitMode === 'kg') {
      const kg = (grams / 1000).toFixed(3).replace(/\.?0+$/, '');
      setInputValue(kg);
    } else {
      setInputValue(grams.toString());
    }
    inputRef.current?.focus();
  };

  const handleSwitchUnitMode = (newMode: 'kg' | 'gram') => {
    if (newMode === unitMode) return;
    if (newMode === 'gram') {
      setInputValue(weightMilli.toString());
    } else {
      const kg = (weightMilli / 1000).toFixed(3).replace(/\.?0+$/, '');
      setInputValue(kg || '0');
    }
    setUnitMode(newMode);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 20);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      dir="rtl"
    >
      <div 
        className="w-full max-w-[480px] bg-surface rounded-xl border border-line shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-surface-2 hairline-b flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-ink leading-tight">
                {product.name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-ink-muted">
                <span>سعر الكيلو:</span>
                <span className="font-bold text-brand font-mono">
                  {formatArabicCurrency(product.pricePiasters)}
                </span>
                {product.barcode && (
                  <span className="font-mono text-[10.5px] text-ink-muted/80">
                    ({product.barcode})
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface border border-transparent hover:border-line flex items-center justify-center text-ink-muted hover:text-ink transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 flex flex-col gap-4">
          
          {/* Unit Mode Selector Tabs */}
          <div className="flex items-center p-1 bg-surface-2 rounded-lg border border-line">
            <button
              type="button"
              onClick={() => handleSwitchUnitMode('kg')}
              className={`flex-1 py-1.5 rounded-md text-[12.5px] font-bold transition-all ${
                unitMode === 'kg'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              بالكيلوجرام (كجم)
            </button>
            <button
              type="button"
              onClick={() => handleSwitchUnitMode('gram')}
              className={`flex-1 py-1.5 rounded-md text-[12.5px] font-bold transition-all ${
                unitMode === 'gram'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              بالجرام (جم)
            </button>
          </div>

          {/* Primary Weight Input Box */}
          <div className="relative flex flex-col bg-surface-2/70 p-3 rounded-xl border-2 border-brand/50 focus-within:border-brand">
            <div className="flex justify-between items-center text-[11.5px] text-ink-muted font-semibold mb-1">
              <span>{unitMode === 'kg' ? 'الوزن بالكيلو:' : 'الوزن بالجرام:'}</span>
              <span className="font-mono text-ink">
                {unitMode === 'kg'
                  ? `${weightMilli} جرام`
                  : `${(weightMilli / 1000).toFixed(3)} كجم`}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(normalizeArabicNumerals(e.target.value))}
                placeholder={unitMode === 'kg' ? '0.350' : '350'}
                className="w-full bg-transparent border-none text-[32px] font-bold font-mono text-ink text-center tracking-wider focus:outline-none"
              />
              <span className="text-[16px] font-bold text-brand shrink-0">
                {unitMode === 'kg' ? 'كجم' : 'جرام'}
              </span>
            </div>
          </div>

          {/* Quick Preset Buttons for Retail Supermarket Weights */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPresetGrams(100)}
              className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-2 border border-line text-ink text-[11.5px] font-bold transition-colors"
            >
              100 جم
            </button>
            <button
              type="button"
              onClick={() => setPresetGrams(250)}
              className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-2 border border-line text-ink text-[11.5px] font-bold transition-colors"
            >
              250 جم (ربع)
            </button>
            <button
              type="button"
              onClick={() => setPresetGrams(500)}
              className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-2 border border-line text-ink text-[11.5px] font-bold transition-colors"
            >
              500 جم (نصف)
            </button>
            <button
              type="button"
              onClick={() => setPresetGrams(750)}
              className="px-2.5 py-1.5 rounded bg-surface hover:bg-surface-2 border border-line text-ink text-[11.5px] font-bold transition-colors"
            >
              750 جم (إلا ربع)
            </button>
            <button
              type="button"
              onClick={() => setPresetGrams(1000)}
              className="px-3 py-1.5 rounded bg-brand/10 hover:bg-brand/20 border border-brand/30 text-brand text-[11.5px] font-bold transition-colors"
            >
              1 كجم
            </button>
            <button
              type="button"
              onClick={() => setPresetGrams(2000)}
              className="px-3 py-1.5 rounded bg-surface hover:bg-surface-2 border border-line text-ink text-[11.5px] font-bold transition-colors"
            >
              2 كجم
            </button>
          </div>

          {/* Interactive Touch / Click Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'BACK'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleKeypadPress(key)}
                className="h-[42px] bg-surface hover:bg-surface-2 active:bg-brand/10 border border-line rounded-lg text-[16px] font-bold font-mono text-ink flex items-center justify-center transition-colors shadow-2xs"
              >
                {key === 'BACK' ? <Delete className="w-5 h-5 text-ink-muted" /> : key}
              </button>
            ))}
          </div>

          {/* Live Calculated Price Summary */}
          <div className="p-3 bg-brand/5 border border-brand/20 rounded-xl flex items-center justify-between">
            <div>
              <span className="block text-[11.5px] text-ink-muted font-semibold">
                السعر الإجمالي المطلوب:
              </span>
              <span className="text-[11px] text-ink-muted font-mono">
                {unitMode === 'kg' ? `${parsedNum || 0} كجم` : `${parsedNum || 0} جم`} × {formatArabicCurrency(product.pricePiasters)}
              </span>
            </div>
            <div className="text-left font-mono font-bold text-[22px] text-brand tabular-nums">
              {formatArabicCurrency(totalPiasters)}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-surface-2 hairline-t flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => handleKeypadPress('C')}
            className="px-3 py-2 rounded-lg bg-surface hover:bg-surface-2 border border-line text-ink-muted hover:text-ink text-[12px] font-bold flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>مسح (C)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-surface hover:bg-surface-2 border border-line text-ink text-[12.5px] font-semibold transition-colors"
            >
              إلغاء (Esc)
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={weightMilli <= 0}
              className="px-5 py-2 rounded-lg bg-brand hover:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted text-white text-[12.5px] font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>تأكيد الوزن (Enter)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const WeightInputModal: React.FC<WeightInputModalProps> = ({
  isOpen,
  onClose,
  product,
  initialWeightMilli = 1000,
  onConfirm,
}) => {
  if (!isOpen || !product) return null;

  return (
    <WeightInputModalContent
      onClose={onClose}
      product={product}
      initialWeightMilli={initialWeightMilli}
      onConfirm={onConfirm}
    />
  );
};
