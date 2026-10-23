import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  piastersToPounds,
  normalizeNumericInput,
  formatThousands,
  tafqeetCurrency,
} from '../utils/money';

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
  showTafqeetHint?: boolean;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

/**
 * خانة إدخال مبالغ نقدية متخصصة ومتقدمة لنقاط البيع والتسعير (Senior POS Financial Input)
 * - تدعم فواصل الآلاف الرياضية القياسية المباشرة (,) أثناء الكتابة لقراءة الأرقام الكبيرة بوضوح
 * - تحافظ بدقة متناهية على موضع مؤشر الكتابة (Cursor Position) وتمنع القفز العشوائي
 * - تعالج زر Backspace بذكاء عند الوقوف خلف الفواصل
 * - تقبل الأرقام المشرقية والفارسية وتوحد الفواصل العشرية
 * - تعرض التفقيط المالي بالكلمات العربية في تلميح (Tooltip) ومؤشر اختياري
 * - تخزن وتتعامل داخلياً بالقروش فقط كعدد صحيح (Rule #1: Integer Financial Arithmetic)
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(({
  valuePiasters,
  onChangePiasters,
  placeholder = '0.00',
  className = '',
  containerClassName = '',
  disabled = false,
  autoFocus = false,
  hideCurrency = false,
  currencyLabel = 'ج.م',
  showTafqeetHint = false,
  onFocus,
  onBlur,
  onKeyDown,
}, ref) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  const [isFocused, setIsFocused] = useState(false);

  const formatPoundsInitial = (p: number): string => {
    if (!p) return '';
    const pounds = piastersToPounds(p);
    return pounds.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const [displayValue, setDisplayValue] = useState<string>(() => formatPoundsInitial(valuePiasters));
  const [prevValue, setPrevValue] = useState<number>(valuePiasters);

  // تحديث القيمة عند تغيرها من الخارج (مثلاً أزرار الاختصارات السريعة أو تصفير الحساب)
  if (prevValue !== valuePiasters) {
    setPrevValue(valuePiasters);
    if (!valuePiasters) {
      setDisplayValue('');
    } else {
      const pounds = piastersToPounds(valuePiasters);
      if (isFocused) {
        setDisplayValue(formatThousands(pounds.toString()));
      } else {
        setDisplayValue(
          pounds.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        );
      }
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const raw = input.value;
    const cursorPos = input.selectionStart ?? raw.length;

    // حساب عدد الحروف غير الفاصلة قبل المؤشر للحفاظ على موقع المؤشر بدقة
    const rawBeforeCursor = raw.slice(0, cursorPos).replace(/,/g, '');
    const nonCommaBefore = rawBeforeCursor.length;

    // تنظيف وتوحيد المدخلات الرقمية
    const normalized = normalizeNumericInput(raw);
    const unformatted = normalized.replace(/,/g, '');

    // السماح فقط بالأرقام وعلامة سالب اختيارية ونقطة عشرية واحدة مع خانتين بحد أقصى
    if (unformatted !== '' && !/^-?[0-9]*\.?[0-9]{0,2}$/.test(unformatted)) {
      return;
    }

    if (unformatted === '' || unformatted === '-') {
      setDisplayValue(unformatted);
      setPrevValue(0);
      onChangePiasters(0);
      return;
    }

    const formatted = formatThousands(unformatted);
    setDisplayValue(formatted);

    const piasters = poundsToPiastersSafe(unformatted);
    setPrevValue(piasters);
    onChangePiasters(piasters);

    // إعادة ضبط موقع المؤشر الرياضي بسلاسة تامة بعد إدخال الفواصل
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      let newPos = 0;
      let seen = 0;
      while (newPos < formatted.length && seen < nonCommaBefore) {
        if (formatted[newPos] !== ',') {
          seen++;
        }
        newPos++;
      }
      inputRef.current.setSelectionRange(newPos, newPos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const input = e.currentTarget;
      const { selectionStart, selectionEnd, value } = input;
      // إذا كان المؤشر مباشرة بعد فاصلة رياضية مفردة، احذف الرقم الذي يسبقها
      if (selectionStart !== null && selectionStart === selectionEnd && selectionStart > 1) {
        if (value[selectionStart - 1] === ',') {
          e.preventDefault();
          const before = value.slice(0, selectionStart - 2);
          const after = value.slice(selectionStart);
          const combined = (before + after).replace(/,/g, '');
          const formatted = formatThousands(combined);
          setDisplayValue(formatted);
          const piasters = poundsToPiastersSafe(combined);
          setPrevValue(piasters);
          onChangePiasters(piasters);

          const targetPos = Math.max(0, selectionStart - 2);
          requestAnimationFrame(() => {
            if (inputRef.current) {
              inputRef.current.setSelectionRange(targetPos, targetPos);
            }
          });
          return;
        }
      }
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    e.target.select();
    if (onFocus) {
      onFocus(e);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    if (valuePiasters !== 0) {
      const pounds = piastersToPounds(valuePiasters);
      setDisplayValue(
        pounds.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    } else {
      setDisplayValue('');
    }
    if (onBlur) {
      onBlur(e);
    }
  };

  const tafqeetText = tafqeetCurrency(valuePiasters);

  return (
    <div className={`relative flex flex-col justify-center ${containerClassName || 'w-full'}`}>
      <div className="relative flex items-center w-full">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          title={tafqeetText ? `${tafqeetText}` : undefined}
          className={`w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded px-3 py-1.5 ${
            hideCurrency ? '' : 'pl-10'
          } text-ink dark:text-ink-dark font-mono font-bold focus:outline-none focus:border-brand dark:focus:border-brand-bright transition-colors text-right tabular-nums ${className}`}
        />
        {!hideCurrency && (
          <span className="absolute left-2.5 text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted pointer-events-none select-none">
            {currencyLabel}
          </span>
        )}
      </div>
      {showTafqeetHint && valuePiasters !== 0 && (
        <span className="text-[10px] text-ink-muted dark:text-ink-dark-muted mt-0.5 truncate text-right font-medium">
          {tafqeetText}
        </span>
      )}
    </div>
  );
});

MoneyInput.displayName = 'MoneyInput';

function poundsToPiastersSafe(str: string): number {
  if (!str) return 0;
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}
