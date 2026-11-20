import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  X,
} from 'lucide-react';

const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
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
  allowClear?: boolean;
  id?: string;
  placement?: 'auto' | 'top' | 'bottom';
  align?: 'auto' | 'right' | 'left';
}

/**
 * Official Rafiq Custom Arabic RTL Date Picker (Ported 1:1 from Desktop POS).
 * Zero native browser English date inputs; Saturday-first Arabic calendar with Month/Year selectors.
 */
export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  placeholder = 'اختر التاريخ',
  minDate,
  maxDate,
  className = '',
  disabled = false,
  size = 'md',
  allowClear = false,
  id,
  placement = 'auto',
  align = 'auto',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const initialDate = useMemo(() => parseDateString(value) || new Date(), [value]);

  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());
  const [isMonthSelectOpen, setIsMonthSelectOpen] = useState(false);
  const [isYearSelectOpen, setIsYearSelectOpen] = useState(false);

  const updateCoords = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const calendarHeight = 310;
    const calendarWidth = size === 'sm' ? 260 : 276;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: number;
    if (placement === 'top' || (placement === 'auto' && spaceBelow < 320 && spaceAbove > spaceBelow)) {
      top = Math.max(8, rect.top - calendarHeight - 6);
    } else {
      top = Math.min(window.innerHeight - calendarHeight - 8, rect.bottom + 6);
    }

    let left: number;
    if (align === 'left') {
      left = rect.left;
    } else if (align === 'right') {
      left = rect.right - calendarWidth;
    } else {
      left = rect.right - calendarWidth;
      if (left < 10) {
        left = Math.max(10, rect.left);
      }
    }

    if (left + calendarWidth > window.innerWidth - 10) {
      left = window.innerWidth - calendarWidth - 10;
    }
    if (left < 10) left = 10;

    setCoords({ top, left });
  }, [placement, align, size]);

  useEffect(() => {
    const d = parseDateString(value);
    if (d) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }
    updateCoords();

    const handleScroll = (e: Event) => {
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) return;
      updateCoords();
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
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

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', updateCoords);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updateCoords);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updateCoords]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day);
    onChange(formatDateString(d));
    setIsOpen(false);
    setIsMonthSelectOpen(false);
    setIsYearSelectOpen(false);
  };

  const handleTodayClick = () => {
    const today = new Date();
    const todayStr = formatDateString(today);
    if (maxDate && todayStr > maxDate) return;
    if (minDate && todayStr < minDate) return;
    onChange(todayStr);
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setIsOpen(false);
  };

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startDayOfWeek = (firstDayOfMonth.getDay() + 1) % 7; // Saturday = 0

    const days: Array<{
      day: number;
      isCurrentMonth: boolean;
      dateStr: string;
      isDisabled: boolean;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    const todayStr = formatDateString(new Date());

    const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const dStr = formatDateString(new Date(viewYear, viewMonth - 1, d));
      days.push({
        day: d,
        isCurrentMonth: false,
        dateStr: dStr,
        isDisabled: true,
        isToday: dStr === todayStr,
        isSelected: dStr === value,
      });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const dStr = formatDateString(new Date(viewYear, viewMonth, i));
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

    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const dStr = formatDateString(new Date(viewYear, viewMonth + 1, i));
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
    for (let y = currentYear - 4; y <= currentYear + 1; y++) {
      years.push(y);
    }
    return years;
  }, []);

  const sizeClasses = {
    sm: 'h-8 px-2.5 text-[11px]',
    md: 'h-9 px-3 text-xs',
    lg: 'h-10 px-3.5 text-sm',
  }[size];

  return (
    <div ref={containerRef} className={`relative select-none text-right ${className}`} dir="rtl">
      {/* Official Rafiq Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        className={`w-full ${sizeClasses} bg-white border rounded-xl flex items-center justify-between gap-2 transition-all font-semibold shadow-sm ${
          isOpen
            ? 'border-[#004D3F] ring-2 ring-[#004D3F]/20'
            : 'border-[#DCE1DC] hover:border-[#004D3F]/60'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-[#F1F5F4]' : 'cursor-pointer text-[#0F172A]'}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5 truncate">
          <CalendarIcon
            className={`w-3.5 h-3.5 shrink-0 ${value ? 'text-[#004D3F]' : 'text-[#52605D]'}`}
          />
          {value ? (
            <span className="font-mono tabular-nums text-[#0F172A] font-bold">
              {formatFriendlyArabicDate(value)}
            </span>
          ) : (
            <span className="text-[#52605D] font-normal">{placeholder}</span>
          )}
        </div>

        {allowClear && value && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => {
              e.stopPropagation();
              onChange('');
              setIsOpen(false);
            }}
            title="مسح التاريخ"
            className="w-4 h-4 rounded hover:bg-[#F1F5F4] flex items-center justify-center text-[#52605D] hover:text-[#B23A2E] cursor-pointer transition-colors"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* Portal Calendar Popover (Official Rafiq Forest Green Identity + Desktop Motion) */}
      {isOpen &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            dir="rtl"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: 99999,
            }}
            className={`bg-white border border-[#DCE1DC] rounded-2xl shadow-2xl ${
              size === 'sm' ? 'p-3 w-[260px]' : 'p-3.5 w-[276px]'
            } motion-popup flex flex-col text-right select-none`}
          >
            {/* Header: Prev / Month & Year Selectors / Next */}
            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#DCE1DC]/70">
              <button
                type="button"
                onClick={handlePrevMonth}
                title="الشهر السابق"
                aria-label="الشهر السابق"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#52605D] hover:text-[#004D3F] hover:bg-[#E6F2ED] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1">
                {/* Arabic Month Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMonthSelectOpen(prev => !prev);
                      setIsYearSelectOpen(false);
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-black text-[#0F172A] hover:text-[#004D3F] hover:bg-[#E6F2ED] transition-colors cursor-pointer"
                  >
                    {ARABIC_MONTHS[viewMonth]}
                  </button>

                  {isMonthSelectOpen && (
                    <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-[#DCE1DC] rounded-xl shadow-xl p-1.5 grid grid-cols-3 gap-1 w-44 max-h-52 overflow-y-auto motion-popup">
                      {ARABIC_MONTHS.map((mName, idx) => (
                        <button
                          key={mName}
                          type="button"
                          onClick={() => {
                            setViewMonth(idx);
                            setIsMonthSelectOpen(false);
                          }}
                          className={`px-1.5 py-1.5 text-[11px] rounded-lg text-center transition-colors cursor-pointer font-bold ${
                            viewMonth === idx
                              ? 'bg-[#004D3F] text-white'
                              : 'text-[#0F172A] hover:bg-[#E6F2ED] hover:text-[#004D3F]'
                          }`}
                        >
                          {mName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Year Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsYearSelectOpen(prev => !prev);
                      setIsMonthSelectOpen(false);
                    }}
                    className="px-2 py-1 rounded-lg text-xs font-mono font-black text-[#0F172A] hover:text-[#004D3F] hover:bg-[#E6F2ED] transition-colors cursor-pointer"
                  >
                    {viewYear}
                  </button>

                  {isYearSelectOpen && (
                    <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-[#DCE1DC] rounded-xl shadow-xl p-1 flex flex-col gap-0.5 w-24 max-h-48 overflow-y-auto motion-popup">
                      {yearRange.map(yr => (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => {
                            setViewYear(yr);
                            setIsYearSelectOpen(false);
                          }}
                          className={`px-2 py-1.5 text-xs font-mono rounded-lg text-center transition-colors cursor-pointer font-bold ${
                            viewYear === yr
                              ? 'bg-[#004D3F] text-white'
                              : 'text-[#0F172A] hover:bg-[#E6F2ED] hover:text-[#004D3F]'
                          }`}
                        >
                          {yr}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                title="الشهر التالي"
                aria-label="الشهر التالي"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#52605D] hover:text-[#004D3F] hover:bg-[#E6F2ED] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Days Header (Saturday -> Friday) */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
              {ARABIC_DAYS_SAT_FIRST.map(d => (
                <span key={d.short} className="text-[11px] font-bold text-[#52605D] py-0.5">
                  {d.short}
                </span>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarDays.map((item, index) => {
                if (!item.isCurrentMonth) {
                  return (
                    <span
                      key={`empty-${index}`}
                      className="h-[30px] flex items-center justify-center text-[11px] text-[#52605D]/30 font-mono select-none"
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
                    className={`h-[30px] rounded-lg text-xs font-mono tabular-nums flex items-center justify-center transition-all cursor-pointer ${
                      item.isSelected
                        ? 'bg-[#004D3F] text-white font-black shadow-sm'
                        : item.isToday
                        ? 'border border-[#004D3F] text-[#004D3F] bg-[#E6F2ED]/60 font-bold hover:bg-[#E6F2ED]'
                        : 'text-[#0F172A] font-medium hover:bg-[#E6F2ED]/70 hover:text-[#004D3F]'
                    } ${item.isDisabled ? 'opacity-25 cursor-not-allowed hover:bg-transparent' : ''}`}
                  >
                    {item.day}
                  </button>
                );
              })}
            </div>

            {/* Footer: Today + Close */}
            <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-[#DCE1DC]/70 text-xs">
              <button
                type="button"
                onClick={handleTodayClick}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#E6F2ED] hover:bg-[#004D3F] text-[#004D3F] hover:text-white text-[11px] font-bold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>اليوم</span>
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 rounded-lg text-[#52605D] hover:text-[#0F172A] hover:bg-[#F1F5F4] text-[11px] font-bold transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export interface CustomDateRangePickerProps {
  startDate: string;
  endDate: string;
  maxDate?: string;
  onChange: (startDate: string, endDate: string) => void;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const CustomDateRangePicker: React.FC<CustomDateRangePickerProps> = ({
  startDate,
  endDate,
  maxDate,
  onChange,
  className = '',
  disabled = false,
  size = 'md',
}) => {
  return (
    <div
      className={`flex flex-wrap sm:flex-nowrap items-center gap-2 bg-[#F1F5F4]/80 border border-[#DCE1DC] p-1.5 rounded-xl text-xs ${className}`}
      dir="rtl"
    >
      <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
        <span className="text-[11px] font-bold text-[#52605D] px-1 whitespace-nowrap">من</span>
        <CustomDatePicker
          value={startDate}
          onChange={newStart => onChange(newStart, endDate)}
          placeholder="من تاريخ"
          maxDate={endDate || maxDate}
          size={size}
          disabled={disabled}
          className="flex-1"
        />
      </div>
      <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
        <span className="text-[11px] font-bold text-[#52605D] px-1 whitespace-nowrap">إلى</span>
        <CustomDatePicker
          value={endDate}
          onChange={newEnd => onChange(startDate, newEnd)}
          placeholder="إلى تاريخ"
          minDate={startDate || undefined}
          maxDate={maxDate}
          size={size}
          disabled={disabled}
          className="flex-1"
        />
      </div>
    </div>
  );
};
