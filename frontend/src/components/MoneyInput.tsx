import React, { useState } from 'react';
import { poundsToPiasters, piastersToPounds, normalizeArabicNumerals } from '../utils/money';

export interface MoneyInputProps {
  valuePiasters: number;
  onChangePiasters: (piasters: number) => void;
  placeholder?: string;
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  hideCurrency?: boolean;
  currencyLabel?: string;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

/**
 * خانة إدخال مبالغ نقدية متخصصة لنقاط البيع والتسعير
 * - تقبل الأرقام العربية المشرقية (٠١٢٣٤٥٦٧٨٩) والإنجليزية
 * - تقبل الفاصلة العشرية (. أو ،)
 * - تدعم التحديد التلقائي على الفوكس وسهولة كتابة عدة أرقام
 * - خالية تماماً من أسهم المتصفح العشوائية
 * - تخزن وتتعامل داخلياً بالقروش فقط كعدد صحيح
 */
export const MoneyInput: React.FC<MoneyInputProps> = ({
  valuePiasters,
  onChangePiasters,
  placeholder = '0.00',
  className = '',
  containerClassName = '',
  disabled = false,
  autoFocus = false,
  hideCurrency = false,
  currencyLabel = 'ج.م',
  onFocus,
  onBlur,
  onKeyDown,
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

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
    if (onFocus) {
      onFocus(e);
    }
  };

  return (
    <div className={`relative flex items-center ${containerClassName || 'w-full'}`}>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className={`w-full bg-surface border border-line rounded px-3 py-1.5 ${
          hideCurrency ? '' : 'pl-11'
        } text-ink font-mono font-bold focus:outline-none focus:border-brand transition-colors text-right tabular-nums ${className}`}
      />
      {!hideCurrency && (
        <span className="absolute left-2.5 text-[11px] font-bold text-ink-muted pointer-events-none select-none">
          {currencyLabel}
        </span>
      )}
    </div>
  );
};
