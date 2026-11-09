import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Plus } from 'lucide-react';
import { SearchInput } from './SearchInput';

export interface SelectOption {
  value: string;
  label: string;
  isAction?: boolean;
  badge?: string;
  icon?: React.ReactNode;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: (string | SelectOption)[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  size?: 'sm' | 'md' | 'lg';
  searchable?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'اختر...',
  className = '',
  disabled = false,
  required = false,
  id,
  size = 'md',
  searchable,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);

  // Normalize options and ensure distinct values (prevent duplicate rendering)
  const normalizedOptions: SelectOption[] = useMemo(() => {
    const seen = new Set<string>();
    const list: SelectOption[] = [];
    for (const opt of options) {
      const normalized: SelectOption =
        typeof opt === 'string'
          ? { value: opt, label: opt, isAction: opt.startsWith('+') || opt.includes('إضافة') }
          : opt;
      if (!seen.has(normalized.value)) {
        seen.add(normalized.value);
        list.push(normalized);
      }
    }
    return list;
  }, [options]);

  const isSearchEnabled = searchable ?? (normalizedOptions.length > 7);

  const filteredOptions = isSearchEnabled && searchQuery.trim()
    ? normalizedOptions.filter((opt) =>
        opt.isAction || opt.label.toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
    : normalizedOptions;

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  const closeDropdown = () => {
    setIsOpen(false);
    setSearchQuery('');
  };

  // The list is drawn in a portal with fixed coordinates so a modal's scroll area can never clip it;
  // it opens downward when there is room, otherwise upward, and its height follows the free space.
  const updateMenuPosition = useCallback(() => {
    const trigger = containerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const preferred = 260;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUp = spaceBelow < Math.min(preferred, 180) && spaceAbove > spaceBelow;
    const available = Math.max(120, openUp ? spaceAbove : spaceBelow);
    const style: React.CSSProperties = {
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(preferred, available),
      zIndex: 10000,
    };
    if (openUp) {
      style.bottom = window.innerHeight - rect.top + 4;
    } else {
      style.top = rect.bottom + 4;
    }
    setMenuStyle(style);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuStyle(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && isSearchEnabled) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isSearchEnabled]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current && containerRef.current.contains(target);
      const insideMenu = menuRef.current && menuRef.current.contains(target);
      if (!insideTrigger && !insideMenu) {
        closeDropdown();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    closeDropdown();
  };

  const sizeClasses = {
    sm: 'min-h-[1.625rem] h-[1.625rem] px-2 py-0 text-micro',
    md: 'min-h-[2rem] px-2.5 py-1.5 text-xs',
    lg: 'min-h-[2.5rem] px-3 py-2 text-sm',
  }[size];

  return (
    <div ref={containerRef} className={`relative select-none text-right ${className}`} dir="rtl">
      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full ${sizeClasses} bg-surface dark:bg-surface-dark border rounded-md flex items-center justify-between gap-2 transition-all font-semibold ${
          isOpen
            ? 'border-brand dark:border-brand-bright ring-1 ring-brand/30 dark:ring-brand-bright/30 shadow-xs'
            : 'border-line dark:border-line-dark hover:border-brand/60 dark:hover:border-brand-bright/60'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-surface-2 dark:bg-surface-dark-2' : 'cursor-pointer text-ink dark:text-ink-dark'}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5 truncate">
          {selectedOption?.icon}
          {selectedOption ? (
            <span className="truncate text-ink dark:text-ink-dark font-bold">{selectedOption.label}</span>
          ) : (
            <span className="text-ink-muted dark:text-ink-dark-muted">{placeholder}</span>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-ink-muted dark:text-ink-dark-muted shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-brand dark:text-brand-bright' : ''
          }`}
        />
      </button>

      {/* Hidden input for form validation */}
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
          value={value}
          onChange={() => {}}
          required={required}
        />
      )}

      {/* Floating Menu */}
      {isOpen && menuStyle && createPortal(
        <div
          ref={menuRef}
          dir="rtl"
          data-select-menu=""
          style={menuStyle}
          className="select-none text-right bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg shadow-xl py-1 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 flex flex-col"
        >
          {isSearchEnabled && (
            <div className="p-1.5 border-b border-line/60 dark:border-line-dark/60 sticky top-0 bg-surface dark:bg-surface-dark z-10">
              <SearchInput
                ref={searchInputRef}
                size="sm"
                searchButton={false}
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="بحث في الخيارات..."
                ariaLabel="بحث في الخيارات"
              />
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-ink-muted dark:text-ink-dark-muted text-center">لا توجد خيارات مطابقة</div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === value;

              if (opt.isAction) {
                return (
                  <div key={opt.value} className="mt-1 pt-1 border-t border-line/60 dark:border-line-dark/60">
                    <button
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full px-3 py-2 text-xs font-bold text-brand dark:text-brand-bright hover:bg-brand dark:hover:bg-brand-container hover:text-white dark:hover:text-white flex items-center justify-between gap-1.5 transition-colors text-right ${
                        isSelected ? 'bg-brand dark:bg-brand-dark-soft text-white dark:text-brand-bright dark:ring-1 dark:ring-inset dark:ring-brand-bright/40' : 'bg-brand-soft/20 dark:bg-brand-dark-soft'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Plus className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{opt.label}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-white" />}
                    </button>
                  </div>
                );
              }

              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full px-3 py-1.5 text-xs font-semibold flex items-center justify-between gap-2 transition-colors text-right ${
                    isSelected
                      ? 'bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright font-bold'
                      : 'text-ink dark:text-ink-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-brand dark:hover:text-brand-bright'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {opt.icon}
                    <span className="truncate">{opt.label}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {opt.badge && (
                      <span className="text-micro px-1.5 py-0.5 rounded font-mono bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted">
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && <Check className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />}
                  </div>
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
};
