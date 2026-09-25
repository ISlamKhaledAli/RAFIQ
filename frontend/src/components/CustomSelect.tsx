import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';

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
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Normalize options
  const normalizedOptions: SelectOption[] = options.map((opt) => {
    if (typeof opt === 'string') {
      const isAction = opt.startsWith('+') || opt.includes('إضافة');
      return { value: opt, label: opt, isAction };
    }
    return opt;
  });

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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    closeDropdown();
  };

  const sizeClasses = {
    sm: 'min-h-[26px] h-[26px] px-2 py-0 text-[11px]',
    md: 'min-h-[32px] px-2.5 py-1.5 text-xs',
    lg: 'min-h-[40px] px-3 py-2 text-sm',
  }[size];

  return (
    <div ref={containerRef} className={`relative select-none text-right ${className}`} dir="rtl">
      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full ${sizeClasses} bg-surface border rounded-md flex items-center justify-between gap-2 transition-all font-semibold ${
          isOpen
            ? 'border-brand ring-1 ring-brand/30 shadow-xs'
            : 'border-line hover:border-brand/60'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-surface-2' : 'cursor-pointer text-ink'}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-1.5 truncate">
          {selectedOption?.icon}
          {selectedOption ? (
            <span className="truncate text-ink font-bold">{selectedOption.label}</span>
          ) : (
            <span className="text-ink-muted">{placeholder}</span>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-ink-muted shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-brand' : ''
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
      {isOpen && (
        <div className="absolute right-0 left-0 top-[calc(100%+4px)] z-50 bg-surface border border-line rounded-lg shadow-xl py-1 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 flex flex-col">
          {isSearchEnabled && (
            <div className="p-1.5 border-b border-line/60 sticky top-0 bg-surface z-10">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث في الخيارات..."
                className="w-full h-7 px-2 text-xs bg-surface-2 border border-line rounded text-ink placeholder:text-ink-muted focus:border-brand focus:outline-hidden"
              />
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-ink-muted text-center">لا توجد خيارات مطابقة</div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === value;

              if (opt.isAction) {
                return (
                  <div key={opt.value} className="mt-1 pt-1 border-t border-line/60">
                    <button
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full px-3 py-2 text-xs font-bold text-brand hover:bg-brand hover:text-white flex items-center justify-between gap-1.5 transition-colors text-right ${
                        isSelected ? 'bg-brand text-white' : 'bg-brand-soft/20'
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
                      ? 'bg-brand-soft text-brand font-bold'
                      : 'text-ink hover:bg-surface-2 hover:text-brand'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {opt.icon}
                    <span className="truncate">{opt.label}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {opt.badge && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-surface-2 border border-line text-ink-muted">
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && <Check className="w-3.5 h-3.5 text-brand" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
