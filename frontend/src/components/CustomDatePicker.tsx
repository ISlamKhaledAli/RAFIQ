import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronRight, 
  ChevronLeft, 
  RotateCcw,
  X
} from 'lucide-react';

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const ARABIC_DAYS_SAT_FIRST = [
  { short: 'سبت', full: 'السبت' },
  { short: 'أحد', full: 'الأحد' },
  { short: 'إثن', full: 'الإثنين' },
  { short: 'ثلا', full: 'الثلاثاء' },
  { short: 'أرب', full: 'الأربعاء' },
  { short: 'خمي', full: 'الخميس' },
  { short: 'جمع', full: 'الجمعة' },
];

function parseDateString(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.trim().split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m, d);
}

function formatDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatFriendlyArabicDate(dateStr: string): string {
  const d = parseDateString(dateStr);
  if (!d) return dateStr || 'اختر التاريخ';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  placeholder = 'اختر التاريخ',
  minDate,
  maxDate,
  className = '',
  disabled = false,
  size = 'md',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initialDate = useMemo(() => {
    return parseDateString(value) || new Date();
  }, [value]);

  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());
  const [isMonthSelectOpen, setIsMonthSelectOpen] = useState(false);
  const [isYearSelectOpen, setIsYearSelectOpen] = useState(false);

  // Sync view year/month when value changes
  useEffect(() => {
    const d = parseDateString(value);
    if (d) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsMonthSelectOpen(false);
        setIsYearSelectOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setIsMonthSelectOpen(false);
        setIsYearSelectOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    const dateStr = formatDateString(d);
    onChange(dateStr);
    setIsOpen(false);
    setIsMonthSelectOpen(false);
    setIsYearSelectOpen(false);
  };

  const handleTodayClick = () => {
    const today = new Date();
    onChange(formatDateString(today));
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setIsOpen(false);
  };

  const handleClearClick = () => {
    onChange('');
    setIsOpen(false);
  };

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    // In JS: 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    // We want Saturday to be index 0
    const startDayOfWeek = (firstDayOfMonth.getDay() + 1) % 7;

    const days: Array<{
      day: number;
      isCurrentMonth: boolean;
      dateStr: string;
      isDisabled: boolean;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    const todayStr = formatDateString(new Date());

    // Previous month padding
    const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(viewYear, viewMonth - 1, d);
      const dStr = formatDateString(prevDate);
      days.push({
        day: d,
        isCurrentMonth: false,
        dateStr: dStr,
        isDisabled: true,
        isToday: dStr === todayStr,
        isSelected: dStr === value,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const currDate = new Date(viewYear, viewMonth, i);
      const dStr = formatDateString(currDate);
      const isBeforeMin = minDate ? dStr < minDate : false;
      const isAfterMax = maxDate ? dStr > maxDate : false;

      days.push({
        day: i,
        isCurrentMonth: true,
        dateStr: dStr,
        isDisabled: isBeforeMin || isAfterMax,
        isToday: dStr === todayStr,
        isSelected: dStr === value,
      });
    }

    // Next month padding to fill complete weeks (multiples of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(viewYear, viewMonth + 1, i);
      const dStr = formatDateString(nextDate);
      days.push({
        day: i,
        isCurrentMonth: false,
        dateStr: dStr,
        isDisabled: true,
        isToday: dStr === todayStr,
        isSelected: dStr === value,
      });
    }

    return days;
  }, [viewYear, viewMonth, value, minDate, maxDate]);

  const yearRange = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear - 5; y <= currentYear + 2; y++) {
      years.push(y);
    }
    return years;
  }, []);

  const sizeClasses = {
    sm: 'h-[28px] px-2 text-[11.5px]',
    md: 'h-[34px] px-2.5 text-xs',
    lg: 'h-[40px] px-3 text-sm',
  }[size];

  return (
    <div ref={containerRef} className={`relative select-none text-right ${className}`} dir="rtl">
      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full ${sizeClasses} bg-surface border rounded-lg flex items-center justify-between gap-2 transition-all font-semibold shadow-2xs ${
          isOpen
            ? 'border-brand ring-1 ring-brand/30'
            : 'border-line hover:border-brand/60'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-surface-2' : 'cursor-pointer text-ink'}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5 truncate">
          <CalendarIcon className={`w-3.5 h-3.5 shrink-0 ${value ? 'text-brand' : 'text-ink-muted'}`} />
          {value ? (
            <span className="font-mono tabular-nums text-ink font-bold">{formatFriendlyArabicDate(value)}</span>
          ) : (
            <span className="text-ink-muted font-normal">{placeholder}</span>
          )}
        </div>

        {value && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              handleClearClick();
            }}
            title="مسح التاريخ"
            className="w-4 h-4 rounded hover:bg-surface-2 flex items-center justify-center text-ink-muted hover:text-danger cursor-pointer transition-colors"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* Floating Calendar Popover */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-surface border border-line rounded-xl shadow-xl p-3 w-[270px] animate-in fade-in zoom-in-95 duration-100 flex flex-col">
          {/* Header: Month & Year with Navigation */}
          <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-line/60">
            {/* Previous month (Right in RTL) */}
            <button
              type="button"
              onClick={handlePrevMonth}
              title="الشهر السابق"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Month & Year Selectors */}
            <div className="flex items-center gap-1">
              {/* Month Dropdown / Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsMonthSelectOpen((prev) => !prev);
                    setIsYearSelectOpen(false);
                  }}
                  className="px-2 py-1 rounded-md text-xs font-bold text-ink hover:bg-surface-2 hover:text-brand transition-colors cursor-pointer"
                >
                  {ARABIC_MONTHS[viewMonth]}
                </button>

                {isMonthSelectOpen && (
                  <div className="absolute top-full right-0 mt-1 z-20 bg-surface border border-line rounded-lg shadow-lg p-1 grid grid-cols-3 gap-1 w-44 max-h-48 overflow-y-auto animate-in fade-in">
                    {ARABIC_MONTHS.map((mName, idx) => (
                      <button
                        key={mName}
                        type="button"
                        onClick={() => {
                          setViewMonth(idx);
                          setIsMonthSelectOpen(false);
                        }}
                        className={`px-1.5 py-1 text-[11px] rounded text-center transition-colors cursor-pointer font-medium ${
                          viewMonth === idx
                            ? 'bg-brand text-white font-bold'
                            : 'text-ink hover:bg-surface-2'
                        }`}
                      >
                        {mName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Year Dropdown / Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIsYearSelectOpen((prev) => !prev);
                    setIsMonthSelectOpen(false);
                  }}
                  className="px-2 py-1 rounded-md text-xs font-bold font-mono text-ink hover:bg-surface-2 hover:text-brand transition-colors cursor-pointer"
                >
                  {viewYear}
                </button>

                {isYearSelectOpen && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-surface border border-line rounded-lg shadow-lg p-1 flex flex-col gap-0.5 w-24 max-h-48 overflow-y-auto animate-in fade-in">
                    {yearRange.map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => {
                          setViewYear(yr);
                          setIsYearSelectOpen(false);
                        }}
                        className={`px-2 py-1 text-xs font-mono rounded text-center transition-colors cursor-pointer ${
                          viewYear === yr
                            ? 'bg-brand text-white font-bold'
                            : 'text-ink hover:bg-surface-2'
                        }`}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Next month (Left in RTL) */}
            <button
              type="button"
              onClick={handleNextMonth}
              title="الشهر التالي"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Days of Week Header (Saturday to Friday) */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {ARABIC_DAYS_SAT_FIRST.map((d) => (
              <span key={d.short} className="text-[10px] font-bold text-ink-muted py-0.5">
                {d.short}
              </span>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {calendarDays.map((item, index) => {
              if (!item.isCurrentMonth) {
                return (
                  <span
                    key={`empty-${index}`}
                    className="h-7 flex items-center justify-center text-[11px] text-ink-muted/30 font-mono select-none"
                  >
                    {item.day}
                  </span>
                );
              }

              return (
                <button
                  key={item.dateStr}
                  type="button"
                  disabled={item.isDisabled}
                  onClick={() => handleSelectDay(item.day)}
                  className={`h-7 rounded-lg text-xs font-mono tabular-nums flex items-center justify-center transition-all cursor-pointer ${
                    item.isSelected
                      ? 'bg-brand-dark text-white font-bold shadow-2xs'
                      : item.isToday
                        ? 'border border-brand text-brand font-bold bg-brand-soft/30 hover:bg-brand-soft'
                        : 'text-ink hover:bg-surface-2 hover:text-brand'
                  } ${item.isDisabled ? 'opacity-30 cursor-not-allowed hover:bg-transparent' : ''}`}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          {/* Quick Action Footer */}
          <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-line/60 text-xs">
            <button
              type="button"
              onClick={handleTodayClick}
              className="text-brand font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>اليوم</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-ink-muted hover:text-ink font-medium px-2 py-0.5 rounded hover:bg-surface-2 transition-colors cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export interface CustomDateRangePickerProps {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  onChange: (startDate: string, endDate: string) => void;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const CustomDateRangePicker: React.FC<CustomDateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  className = '',
  disabled = false,
  size = 'sm',
}) => {
  return (
    <div className={`flex items-center gap-1.5 bg-surface border border-line px-2 py-1 rounded-lg text-xs shadow-2xs ${className}`} dir="rtl">
      <CustomDatePicker
        value={startDate}
        onChange={(newStart) => onChange(newStart, endDate)}
        placeholder="من تاريخ"
        maxDate={endDate || undefined}
        size={size}
        disabled={disabled}
        className="w-[110px]"
      />
      <span className="text-ink-muted text-xs font-bold px-0.5">إلى</span>
      <CustomDatePicker
        value={endDate}
        onChange={(newEnd) => onChange(startDate, newEnd)}
        placeholder="إلى تاريخ"
        minDate={startDate || undefined}
        size={size}
        disabled={disabled}
        className="w-[110px]"
      />
    </div>
  );
};
