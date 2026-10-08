import React from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';

export interface PaginationBarProps {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  showPageSizeSelector?: boolean;
  className?: string;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  currentPage,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  itemLabel = 'عنصر',
  showPageSizeSelector = true,
  className = '',
}) => {
  if (totalCount <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const startRange = ((currentPage - 1) * pageSize) + 1;
  const endRange = Math.min(currentPage * pageSize, totalCount);

  return (
    <div
      className={`bg-surface border border-line rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 shrink-0 shadow-xs select-none ${className}`}
    >
      {/* Page Range Info */}
      <div className="text-xs text-ink-muted font-bold">
        عرض {startRange} - {endRange} من إجمالي {totalCount.toLocaleString('en-US')} {itemLabel}
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center gap-1.5">
        {/* Page Size Selector */}
        {showPageSizeSelector && onPageSizeChange && pageSizeOptions.length > 0 && (
          <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-line">
            <span className="text-[11px] text-ink-muted font-bold">عرض:</span>
            {pageSizeOptions.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  onPageSizeChange(size);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  pageSize === size
                    ? 'bg-brand-dark text-white shadow-xs'
                    : 'bg-surface-2 text-ink-muted border border-line hover:border-brand hover:text-brand'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        )}

        {/* Previous Page Button (Right chevron in RTL) */}
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-2 border border-line text-ink-muted hover:bg-brand-soft hover:text-brand hover:border-brand disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          title="الصفحة السابقة"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Numeric Page Buttons */}
        {pages.map((p, idx) =>
          typeof p === 'string' ? (
            <span key={`dots-${idx}`} className="text-xs text-ink-muted px-1 select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentPage === p
                  ? 'bg-brand-dark text-white shadow-xs'
                  : 'bg-surface-2 text-ink-muted border border-line hover:bg-brand-soft hover:text-brand hover:border-brand'
              }`}
            >
              {p}
            </button>
          )
        )}

        {/* Next Page Button (Left chevron in RTL) */}
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-2 border border-line text-ink-muted hover:bg-brand-soft hover:text-brand hover:border-brand disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          title="الصفحة التالية"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
