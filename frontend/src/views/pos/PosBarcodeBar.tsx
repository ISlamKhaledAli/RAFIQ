import React, { useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { Barcode, Search, Loader2, Layers } from 'lucide-react';
import { AppButton } from '../../components/AppButton';
import type { Product } from '../../types/models';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';
import { usePermissions } from '../../utils/usePermission';
import { describeSearchRow, shouldRunLiveSearch, type StockState } from './liveSearch';

const STOCK_TEXT_CLASS: Record<StockState, string> = {
  ok: 'text-ink-muted dark:text-ink-dark-muted',
  low: 'text-warn dark:text-warn-bright',
  out: 'text-danger dark:text-danger-bright',
};

interface PosBarcodeBarProps {
  searchContainerRef: React.RefObject<HTMLDivElement | null>;
  barcodeInputRef: React.RefObject<HTMLInputElement | null>;
  barcodeQuery: string;
  setBarcodeQuery: (val: string) => void;
  loading: boolean;
  isSearching: boolean;
  handleBarcodeSubmit: (e: FormEvent) => void;
  handleSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onOpenScannerModal: () => void;
  isSearchDropdownOpen: boolean;
  setIsSearchDropdownOpen: (val: boolean) => void;
  liveSearchResults: Product[];
  setLiveSearchResults: (val: Product[]) => void;
  selectedDropdownIndex: number;
  setSelectedDropdownIndex: (val: number) => void;
  onSelectProduct: (prod: Product) => void;
  onNavigateToEpay?: () => void;
}

export const PosBarcodeBar: React.FC<PosBarcodeBarProps> = ({
  searchContainerRef,
  barcodeInputRef,
  barcodeQuery,
  setBarcodeQuery,
  loading,
  isSearching,
  handleBarcodeSubmit,
  handleSearchKeyDown,
  onOpenScannerModal,
  isSearchDropdownOpen,
  setIsSearchDropdownOpen,
  liveSearchResults,
  setLiveSearchResults,
  selectedDropdownIndex,
  setSelectedDropdownIndex,
  onSelectProduct,
}) => {
  // Reader tuning is an owner/manager task (same rule as the F8 shortcut); cashiers never need it.
  const { hasPermission, isAdmin } = usePermissions();
  const canConfigureScanner = isAdmin || hasPermission('settings.barcode');

  const listRef = useRef<HTMLDivElement>(null);
  const hoverDrivenRef = useRef(false);

  // Arrow-key navigation keeps the highlighted row visible; mouse hover must not scroll the list under the pointer
  useEffect(() => {
    if (hoverDrivenRef.current) {
      hoverDrivenRef.current = false;
      return;
    }
    const row = listRef.current?.children[selectedDropdownIndex];
    if (row instanceof HTMLElement) row.scrollIntoView({ block: 'nearest' });
  }, [selectedDropdownIndex, liveSearchResults]);

  return (
    <div ref={searchContainerRef} className="p-2 sm:p-2.5 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark shrink-0 relative">
      <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-1.5 sm:gap-2">
        <div className="relative flex-1 h-11 flex items-center bg-surface-2 dark:bg-surface-dark-2 rounded-xl border border-line dark:border-line-dark focus-within:border-brand dark:focus-within:border-brand-bright focus-within:bg-surface dark:focus-within:bg-surface-dark focus-within:ring-2 focus-within:ring-brand/20 px-3 shadow-2xs transition-all">
          <Barcode className="w-5 h-5 text-brand dark:text-brand-bright ml-2 shrink-0" />
          <input
            ref={barcodeInputRef}
            type="text"
            placeholder="امسح الباركود أو اكتب اسم الصنف ثم اضغط Enter..."
            value={barcodeQuery}
            onChange={(e) => setBarcodeQuery(normalizeArabicNumerals(e.target.value))}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              if (shouldRunLiveSearch(barcodeQuery) && liveSearchResults.length > 0) {
                setIsSearchDropdownOpen(true);
              }
            }}
            className="w-full h-full bg-transparent border-none text-xs sm:text-sm text-ink dark:text-ink-dark placeholder:text-ink-muted/70 dark:placeholder:text-ink-dark-muted/70 focus:outline-none font-mono font-medium"
          />
          {isSearching && (
            <Loader2 className="w-4 h-4 text-brand dark:text-brand-bright animate-spin ml-2 shrink-0" />
          )}
          <div className="mr-2 flex items-center shrink-0">
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-surface dark:bg-surface-dark-3 text-ink-muted dark:text-ink-dark-muted rounded-md border border-line dark:border-line-dark">
              F2
            </span>
          </div>
        </div>

        <AppButton type="submit" variant="primary" size="lg" icon={Search} disabled={loading} className="shrink-0">
          إضافة
        </AppButton>

        {canConfigureScanner && (
          <AppButton
            variant="secondary"
            size="lg"
            icon={Barcode}
            onClick={onOpenScannerModal}
            aria-label="فحص القارئ"
            title="فحص وضبط قارئ الباركود (F8) - للمالك والمدير فقط"
            className="shrink-0"
          >
            <span className="hidden md:inline">فحص القارئ</span>
          </AppButton>
        )}
      </form>

      {/* Live name search: only what a cashier needs to pick an item (name, price, availability) */}
      {isSearchDropdownOpen && liveSearchResults.length > 0 && (
        <div
          className="absolute left-3 right-3 top-[64px] z-50 bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark shadow-2xl overflow-hidden max-h-[22.5rem] flex flex-col animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-2 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark flex items-center justify-between gap-2 text-xs font-semibold text-ink-muted dark:text-ink-dark-muted select-none">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-ink dark:text-ink-dark shrink-0">نتائج البحث ({liveSearchResults.length})</span>
              <span className="text-micro truncate">الأسهم ↑ ↓ للتنقل، Enter للإضافة</span>
            </div>
            <AppButton
              variant="subtle"
              size="xs"
              className="-my-1.5 shrink-0"
              onClick={() => {
                setIsSearchDropdownOpen(false);
                setLiveSearchResults([]);
              }}
            >
              إغلاق (Esc)
            </AppButton>
          </div>

          <div ref={listRef} role="listbox" className="overflow-y-auto divide-y divide-line/40 dark:divide-line-dark/60">
            {liveSearchResults.map((prod, idx) => {
              const isSelected = idx === selectedDropdownIndex;
              const info = describeSearchRow(prod);

              return (
                <div
                  key={prod.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onSelectProduct(prod)}
                  onMouseEnter={() => {
                    if (idx === selectedDropdownIndex) return;
                    hoverDrivenRef.current = true;
                    setSelectedDropdownIndex(idx);
                  }}
                  className={`min-h-11 px-3.5 py-2 flex items-center justify-between gap-3 cursor-pointer transition-colors border-r-4 ${
                    isSelected
                      ? 'bg-paid-soft/80 dark:bg-surface-dark-3 border-r-paid dark:border-r-brand-bright'
                      : 'border-r-transparent hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-sm text-ink dark:text-ink-dark truncate">{prod.name}</span>
                    {info.hasVariants && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-brand/30 dark:border-brand-bright/40 bg-brand-soft dark:bg-brand-dark-soft text-micro font-bold text-brand dark:text-brand-bright shrink-0">
                        <Layers className="w-3 h-3" />
                        <span>مقاسات وألوان</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 whitespace-nowrap">
                    <span className={`text-xs font-medium tabular-nums ${STOCK_TEXT_CLASS[info.stockState]}`}>
                      {info.stockText}
                    </span>
                    <span className="text-sm font-mono font-bold tabular-nums text-paid dark:text-paid-bright text-left">
                      {formatArabicCurrency(info.pricePiasters)}
                      {info.priceUnitName && (
                        <span className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted"> / {info.priceUnitName}</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
