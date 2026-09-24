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
    <div className="relative flex items-center w-full">
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleChange}
        className={`w-full bg-surface border border-line rounded px-3 py-1.5 pl-11 text-ink font-mono font-bold focus:outline-none focus:border-brand transition-colors text-right tabular-nums ${className}`}
      />
      <span className="absolute left-2.5 text-[11px] font-bold text-ink-muted pointer-events-none select-none">
        ج.م
      </span>
    </div>
  );
};
