import React from 'react';

interface Props {
  count?: number;
  gridClass?: string;
}

export const ProductGridSkeleton: React.FC<Props> = ({
  count = 8,
  gridClass = 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5',
}) => {
  return (
    <div className={gridClass} aria-busy="true" aria-label="جاري تحميل المنتجات">
      {[...Array(count)].map((_, i) => (
        <div
          key={i}
          className="bg-store-card rounded-3xl border border-store-line p-2.5 sm:p-3.5 space-y-3 animate-pulse shadow-2xs"
        >
          {/* Image placeholder */}
          <div className="w-full aspect-square rounded-2xl bg-slate-200/80" />

          {/* Unit pill placeholder */}
          <div className="h-2.5 w-1/3 bg-slate-200 rounded-md" />

          {/* Title lines placeholder */}
          <div className="space-y-1.5">
            <div className="h-3.5 w-4/5 bg-slate-200 rounded-md" />
            <div className="h-3 w-1/2 bg-slate-200/70 rounded-md" />
          </div>

          {/* Price & action bar placeholder */}
          <div className="pt-2 border-t border-store-line/60 flex items-center justify-between">
            <div className="h-5 w-16 bg-slate-200 rounded-lg" />
            <div className="h-7 w-12 bg-slate-200 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
};
