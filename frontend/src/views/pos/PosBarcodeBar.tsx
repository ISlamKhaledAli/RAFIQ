import React from 'react';
import type { FormEvent } from 'react';
import { Barcode, Search, Loader2, Package } from 'lucide-react';
import type { Product, ProductUnit } from '../../types/models';
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
  onSelectProduct: (prod: Product, specificUnit?: ProductUnit) => void;
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
    <div ref={searchContainerRef} className="p-2 sm:p-3 bg-white border-b border-[#dce1dc] shrink-0 relative">
      <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-1.5 sm:gap-2">
        <div className="relative flex-1 h-11 flex items-center bg-[#fdfdfd] rounded-xl border-2 border-[#006d41] px-3 focus-within:ring-2 focus-within:ring-[#006d41]/20 shadow-2xs transition-all">
          <Barcode className="w-5 h-5 text-[#006d41] ml-2 shrink-0" />
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
            className="w-full h-full bg-transparent border-none text-xs sm:text-sm text-[#0f172a] placeholder:text-[#52605d] focus:outline-none font-mono font-medium"
          />
          {isSearching && (
            <Loader2 className="w-4 h-4 text-[#006d41] animate-spin ml-2 shrink-0" />
          )}
          <div className="mr-2 flex items-center shrink-0">
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-[#f1f5f4] text-[#52605d] rounded-md border border-[#dce1dc]">
              F2
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="h-11 px-4.5 bg-paid hover:bg-paid-hover text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shrink-0 shadow-xs active:scale-[0.98] cursor-pointer"
        >
          <Search className="w-4 h-4 stroke-[2.5]" />
          <span>إضافة</span>
        </button>

        <button
          type="button"
          onClick={onOpenScannerModal}
          className="h-11 px-3.5 bg-surface hover:bg-surface-2 border border-line hover:border-paid/50 text-ink rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 shadow-2xs active:scale-[0.98] cursor-pointer"
          title="فحص واختبار قارئ الباركود (F8)"
        >
          <Barcode className="w-4 h-4 text-paid" />
          <span className="hidden sm:inline">فحص القارئ</span>
        </button>
      </form>

      {/* Live Search Floating Dropdown (Task 22-4) */}
      {isSearchDropdownOpen && liveSearchResults.length > 0 && (
        <div 
          className="absolute left-3 right-3 top-[64px] z-50 bg-surface rounded-xl border border-line shadow-2xl overflow-hidden max-h-[360px] flex flex-col animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-2 bg-surface-2 border-b border-line flex items-center justify-between text-xs font-semibold text-ink-muted select-none">
            <div className="flex items-center gap-2">
              <span className="font-bold text-ink">نتائج البحث الفورية ({liveSearchResults.length})</span>
              <span className="text-[10px] bg-surface px-2 py-0.5 rounded border border-line">
                استخدم الأسهم ↑ ↓ ثم اضغط Enter للإضافة
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsSearchDropdownOpen(false)}
              className="hover:text-ink text-xs font-bold cursor-pointer"
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

              // Find primary packaging unit (e.g. carton/box) if exists
              const packUnit = prod.units?.find((u) => !u.isBaseUnit && u.conversionFactor > 1);
              const wholePacks = packUnit && packUnit.conversionFactor > 0 ? Math.floor(stock / packUnit.conversionFactor) : null;
              const remPieces = packUnit && packUnit.conversionFactor > 0 ? stock % packUnit.conversionFactor : null;

              return (
                <div
                  key={prod.id}
                  onClick={() => onSelectProduct(prod)}
                  onMouseEnter={() => setSelectedDropdownIndex(idx)}
                  className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-paid-soft border-r-4 border-r-paid pl-2' : 'hover:bg-surface-2'
                  }`}
                >
                  {/* Right: Product Info & Package Buttons */}
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[13px] text-ink">{prod.name}</span>
                      {prod.unit === 'kg' && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold bg-sky-50 text-sky-800 rounded border border-sky-200">
                          بالوزن (كجم)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-ink-muted font-mono">
                      {prod.barcode && (
                        <span className="flex items-center gap-1 bg-surface-2 px-1.5 py-0.5 rounded border border-line/60">
                          <Barcode className="w-3 h-3" />
                          {prod.barcode}
                        </span>
                      )}
                      {prod.internalCode && (
                        <span className="text-[10px] text-ink-muted">كود: {prod.internalCode}</span>
                      )}
                    </div>

                    {/* Quick Package Action Buttons for Cashiers without Barcode Scanner */}
                    {prod.units && prod.units.length > 1 && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {prod.units.map((u) => (
                          <button
                            key={u.id || u.unitName}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectProduct(prod, u);
                            }}
                            className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-paid-soft hover:bg-paid text-paid hover:text-white border border-paid/20 hover:border-paid transition-all flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                            title={`إضافة ${u.unitName} (${u.conversionFactor} قطعة) - ${formatArabicCurrency(u.sellPricePiasters || (prod.pricePiasters * u.conversionFactor))}`}
                          >
                            <Package className="w-3 h-3" />
                            <span>+ {u.unitName} ({u.conversionFactor})</span>
                            <span className="font-mono text-[10px] opacity-80">
                              {formatArabicCurrency(u.sellPricePiasters || (prod.pricePiasters * u.conversionFactor))}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Left: Stock Status & Price */}
                  <div className="flex items-center gap-4 text-left">
                    {/* Stock status badge with dynamic carton breakdown */}
                    <div className="text-right">
                      {isOutOfStock ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-danger-soft border border-danger/30 text-danger">
                          نفد من المخزن (0)
                        </span>
                      ) : isLowStock ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-800">
                          مخزون منخفض ({stock.toLocaleString('en-US')} {prod.unit === 'kg' ? 'كجم' : 'قطعة'}
                          {packUnit && wholePacks !== null && wholePacks > 0 ? ` = ${wholePacks} ${packUnit.unitName}` : ''})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-paid-soft border border-paid/20 text-paid">
                          متاح: {stock.toLocaleString('en-US')} {prod.unit === 'kg' ? 'كجم' : 'قطعة'}
                          {packUnit && wholePacks !== null ? ` (${wholePacks} ${packUnit.unitName}${remPieces && remPieces > 0 ? ` و ${remPieces} ق` : ''})` : ''}
                        </span>
                      )}
                    </div>

                    {/* Price formatted */}
                    <div className="text-[15px] font-mono font-bold text-paid min-w-[70px] text-left">
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
