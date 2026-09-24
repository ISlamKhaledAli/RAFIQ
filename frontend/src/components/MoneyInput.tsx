import React, { useState } from 'react';
import { poundsToPiasters, piastersToPounds, normalizeArabicNumerals } from '../utils/money';

interface MoneyInputProps {
  valuePiasters: number;
  onChangePiasters: (piasters: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

/**
 * خانة إدخال مبالغ نقدية متخصصة لنقاط البيع (Task 3-3)
 * - تقبل الأرقام العربية المشرقية (٠١٢٣٤٥٦٧٨٩) والإنجليزية
 * - تقبل الفاصلة العشرية (. أو ،)
 * - تخزن وتتعامل داخلياً بالقروش فقط كعدد صحيح
 */
export const MoneyInput: React.FC<MoneyInputProps> = ({
  valuePiasters,
  onChangePiasters,
  placeholder = '0.00',
  className = '',
  disabled = false,
  autoFocus = false,
}) => {
  const [displayValue, setDisplayValue] = useState<string>(() => {
    const pounds = piastersToPounds(valuePiasters);
    return pounds === 0 ? '' : pounds.toString();
  });

  const [prevValue, setPrevValue] = useState<number>(valuePiasters);

  // تحديث القيمة عند تغيرها من الخارج (مثلاً عند مسح السلة أو استرجاع بيانات صنف)
  if (prevValue !== valuePiasters) {
    setPrevValue(valuePiasters);
    const pounds = piastersToPounds(valuePiasters);
    setDisplayValue(pounds === 0 ? '' : pounds.toString());
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const normalized = normalizeArabicNumerals(raw);

    // السماح فقط بالأرقام ونقطة عشرية واحدة بحد أقصى خانتين
    if (/^[0-9]*\.?[0-9]{0,2}$/.test(normalized)) {
      setDisplayValue(normalized);
      const piasters = poundsToPiasters(normalized);
      setPrevValue(piasters);
      onChangePiasters(piasters);
    }
  };

  return (
    <div className="relative flex items-center">
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleChange}
        className={`w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-emerald-500 transition-colors ${className}`}
      />
      <span className="absolute left-3 text-xs font-semibold text-slate-400 pointer-events-none">
        ج.م
      </span>
    </div>
  );
};
