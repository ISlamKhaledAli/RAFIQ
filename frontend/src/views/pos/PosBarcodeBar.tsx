import React from 'react';
import type { FormEvent } from 'react';
import { Barcode, Search, Loader2 } from 'lucide-react';
import type { Product } from '../../types/models';
import { formatArabicCurrency, normalizeArabicNumerals } from '../../utils/money';

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
  return (
    <div ref={searchContainerRef} className="p-2 sm:p-3 bg-surface hairline-b shrink-0 relative">
      <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-1.5 sm:gap-2">
        <div className="relative flex-1 h-[40px] sm:h-[44px] flex items-center bg-surface rounded border-2 border-brand px-2 sm:px-3 focus-within:ring-1 focus-within:ring-brand">
          <Barcode className="w-5 h-5 text-brand ml-1.5 sm:ml-2 shrink-0" />
          <input
            ref={barcodeInputRef}
            type="text"
            placeholder="امسح الباركود أو اكتب اسم الصنف ثم اضغط Enter..."
            value={barcodeQuery}
            onChange={(e) => {
              const val = normalizeArabicNumerals(e.target.value);
              setBarcodeQuery(val);
              if (!val.trim() || val.trim().length < 2) {
                setLiveSearchResults([]);
                setIsSearchDropdownOpen(false);
              }
            }}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              if (liveSearchResults.length > 0) setIsSearchDropdownOpen(true);
            }}
            className="w-full h-full bg-transparent border-none text-xs sm:text-[14px] text-ink placeholder:text-ink-muted focus:outline-none font-mono"
          />
          {isSearching && (
            <Loader2 className="w-4 h-4 text-brand animate-spin ml-2 shrink-0" />
          )}
          <div className="mr-1.5 sm:mr-2 flex items-center shrink-0">
            <span className="px-1.5 py-0.5 text-[10px] sm:text-[11px] font-mono font-bold bg-surface-2 text-ink-muted rounded border border-line">
              F2
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="h-[40px] sm:h-[44px] px-3 sm:px-4 bg-brand hover:bg-brand-hover text-white rounded text-xs sm:text-[13px] font-bold flex items-center gap-1.5 transition-colors shrink-0 shadow-sm"
        >
          <Search className="w-4 h-4" />
          <span>إضافة</span>
        </button>

        <button
          type="button"
          onClick={onOpenScannerModal}
          className="h-[40px] sm:h-[44px] px-2.5 sm:px-3 bg-surface-2 hover:bg-surface border border-line text-ink rounded text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 shadow-2xs"
          title="فحص واختبار قارئ الباركود (F10)"
        >
          <Barcode className="w-4 h-4 text-brand" />
          <span className="hidden sm:inline">فحص القارئ</span>
        </button>
      </form>

      {/* Live Search Floating Dropdown (Task 22-4) */}
      {isSearchDropdownOpen && liveSearchResults.length > 0 && (
        <div 
          className="absolute left-3 right-3 top-[64px] z-50 bg-surface rounded-xl border hairline-all shadow-2xl overflow-hidden max-h-[360px] flex flex-col animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-1.5 bg-surface-2 hairline-b flex items-center justify-between text-[11px] font-semibold text-ink-muted select-none">
            <div className="flex items-center gap-2">
              <span>نتائج البحث الفورية ({liveSearchResults.length})</span>
              <span className="text-[10px] bg-canvas px-1.5 py-0.5 rounded border hairline-all">
                استخدم الأسهم ↑ ↓ ثم اضغط Enter للإضافة
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSearchDropdownOpen(false)}
              className="hover:text-ink text-[11px]"
            >
              إغلاق (Esc)
            </button>
          </div>

          <div className="overflow-y-auto divide-y divide-line/40">
            {liveSearchResults.map((prod, idx) => {
              const isSelected = idx === selectedDropdownIndex;
              const stock = prod.stockQuantityMilli / 1000;
              const minStock = (prod.minStockQuantityMilli || 5000) / 1000;
              const isOutOfStock = stock <= 0;
              const isLowStock = !isOutOfStock && stock <= minStock;

              return (
                <div
                  key={prod.id}
                  onClick={() => onSelectProduct(prod)}
                  onMouseEnter={() => setSelectedDropdownIndex(idx)}
                  className={`px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-brand/10 border-r-4 border-r-brand pl-2' : 'hover:bg-surface-2'
                  }`}
                >
                  {/* Right: Product Info */}
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[13px] text-ink">{prod.name}</span>
                      {prod.unit === 'kg' && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold bg-amber-500/10 text-amber-700 rounded border border-amber-300">
                          بالوزن (كجم)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-ink-muted font-mono">
                      {prod.barcode && (
                        <span className="flex items-center gap-1 bg-surface-2 px-1.5 py-0.5 rounded">
                          <Barcode className="w-3 h-3" />
                          {prod.barcode}
                        </span>
                      )}
                      {prod.internalCode && (
                        <span className="text-[10px] text-ink-muted">كود: {prod.internalCode}</span>
                      )}
                    </div>
                  </div>

                  {/* Left: Stock Status & Price */}
                  <div className="flex items-center gap-4 text-left">
                    {/* Stock status badge */}
                    <div className="text-right">
                      {isOutOfStock ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-danger-soft border border-danger-border text-danger">
                          نفد من المخزن (0)
                        </span>
                      ) : isLowStock ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 border border-amber-300 text-amber-800">
                          مخزون منخفض ({stock.toLocaleString('en-US')} {prod.unit === 'kg' ? 'كجم' : 'قطعة'})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-paid-soft border border-paid-border text-paid">
                          متاح ({stock.toLocaleString('en-US')} {prod.unit === 'kg' ? 'كجم' : 'قطعة'})
                        </span>
                      )}
                    </div>

                    {/* Price formatted */}
                    <div className="text-[15px] font-mono font-bold text-brand min-w-[70px] text-left">
                      {formatArabicCurrency(prod.pricePiasters)}
                    </div>
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
