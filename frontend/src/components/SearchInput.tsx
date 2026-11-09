import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { InputHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { AppButton } from './AppButton';

export type SearchInputSize = 'sm' | 'md';

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onSubmit' | 'className' | 'size' | 'type' | 'placeholder' | 'disabled' | 'autoFocus'>;

export interface SearchInputProps extends NativeInputProps {
  value: string;
  /** Receives the raw text; callers that normalise digits (Arabic-Indic to Latin) do it here. */
  onChange: (value: string) => void;
  placeholder?: string;
  /** sm = h-8 / text-xs, md = h-10 / text-sm. Pick the height of the neighbouring toolbar controls. */
  size?: SearchInputSize;
  /** Called with the current text when Enter is pressed or the search button is clicked (scanner terminator, explicit apply). */
  onSubmit?: (value: string) => void;
  /**
   * Visible "بحث" button at the inline end, same height as the box. It does exactly what Enter does:
   * it calls onSubmit(value), so debounced callers apply their pending text at once. Without onSubmit
   * (live filters) it focuses the input and selects its text so the next keystroke starts a new search.
   * Opt out only where a button would crush the box or the field already has its own action button.
   */
  searchButton?: boolean;
  searchButtonLabel?: string;
  /** Defaults to onChange(''). Override when clearing has to reset more than the text. */
  onClear?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Required: there is no visible label. */
  ariaLabel: string;
  /** Layout only (width, flex, margins). Defaults to w-full. Applies to the box plus its button as one control. Never colours, heights or radii. */
  className?: string;
  /** Extra control rendered at the inline end after the clear button (e.g. a scan toggle). */
  trailing?: ReactNode;
}

const SIZE_CLASSES: Record<SearchInputSize, { box: string; input: string; icon: string; gap: string }> = {
  sm: { box: 'h-8 gap-2 ps-2.5 pe-2.5', input: 'text-xs', icon: 'w-3.5 h-3.5', gap: 'gap-1.5' },
  md: { box: 'h-10 gap-2.5 ps-3 pe-3', input: 'text-sm', icon: 'w-4 h-4', gap: 'gap-2' },
};

const BOX_CLASSES =
  'relative flex items-center min-w-0 rounded-lg border border-line dark:border-line-dark bg-surface-2 dark:bg-surface-dark-2 focus-within:border-brand dark:focus-within:border-brand-bright focus-within:bg-surface dark:focus-within:bg-surface-dark focus-within:ring-2 focus-within:ring-brand/20 dark:focus-within:ring-brand-bright/30 transition-colors';

const INPUT_CLASSES =
  'flex-1 min-w-0 h-full bg-transparent border-none p-0 text-ink dark:text-ink-dark placeholder:text-ink-muted dark:placeholder:text-ink-dark-muted focus:outline-none';

/** The one search box of the app: same shape, icon side, focus ring and clear button on every page. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    value,
    onChange,
    placeholder,
    size = 'sm',
    onSubmit,
    searchButton = true,
    searchButtonLabel = 'بحث',
    onClear,
    autoFocus,
    disabled,
    ariaLabel,
    className,
    trailing,
    onKeyDown,
    ...native
  },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);
  const sizeClasses = SIZE_CLASSES[size];

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Enter' || !onSubmit || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSubmit(value);
  };

  const handleSearchClick = () => {
    if (onSubmit) {
      onSubmit(value);
      return;
    }
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const handleClear = () => {
    (onClear ?? (() => onChange('')))();
    inputRef.current?.focus();
  };

  const showButton = searchButton && !disabled;
  const layoutClass = className ?? 'w-full';
  const boxClass = `${BOX_CLASSES} ${sizeClasses.box} ${disabled ? 'opacity-60' : ''}`;

  const box = (
    <div className={showButton ? `${boxClass} flex-1` : `${boxClass} ${layoutClass}`}>
      <Search className={`${sizeClasses.icon} shrink-0 text-ink-muted dark:text-ink-dark-muted pointer-events-none`} aria-hidden="true" />
      <input
        {...native}
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={ariaLabel}
        autoComplete={native.autoComplete ?? 'off'}
        className={`${INPUT_CLASSES} ${sizeClasses.input}`}
      />
      {value !== '' && !disabled && (
        <AppButton variant="subtle" size="xs" icon={X} onClick={handleClear} aria-label="مسح نص البحث" className="-me-1.5" />
      )}
      {trailing}
    </div>
  );

  if (!showButton) return box;

  return (
    <div className={`flex items-center min-w-0 ${sizeClasses.gap} ${layoutClass}`}>
      {box}
      <AppButton variant="primary" size={size} icon={Search} onClick={handleSearchClick} aria-label={searchButtonLabel} className="shrink-0">
        {searchButtonLabel}
      </AppButton>
    </div>
  );
});
