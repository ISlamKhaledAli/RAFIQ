import React from 'react';
import { Database } from 'lucide-react';

export interface RafiqLoadingStateProps {
  label?: string;
  sublabel?: string;
  minHeight?: string;
  className?: string;
}

export const RafiqLoadingState: React.FC<RafiqLoadingStateProps> = ({
  label = 'جاري جلب وتحميل البيانات...',
  sublabel = 'الاتصال بقاعدة البيانات المحلية وتحديث السجلات الحية',
  minHeight = 'min-h-[220px]',
  className = '',
}) => {
  return (
    <div 
      className={`w-full flex flex-col items-center justify-center gap-3 select-none p-6 animate-in fade-in duration-200 transition-all ${minHeight} ${className}`}
      dir="rtl"
    >
      {/* Branded dual-ring pulse loader */}
      <div className="relative flex items-center justify-center">
        {/* Ambient glow circle */}
        <div className="w-14 h-14 rounded-2xl bg-brand-soft/90 border border-brand/20 flex items-center justify-center shadow-xs">
          <Database className="w-5 h-5 text-brand/70 animate-pulse" />
        </div>
        {/* Spinning brand spinner */}
        <div className="absolute inset-0 m-auto w-10 h-10 border-2 border-brand/20 border-t-brand border-r-paid rounded-full animate-spin" />
      </div>

      {/* Text labels */}
      <div className="text-center space-y-1">
        <h4 className="text-xs sm:text-sm font-bold text-ink tracking-tight">
          {label}
        </h4>
        {sublabel && (
          <p className="text-[11px] text-ink-muted max-w-sm leading-relaxed">
            {sublabel}
          </p>
        )}
      </div>

      {/* Shimmer progress line */}
      <div className="w-40 h-1 bg-surface-2 rounded-full overflow-hidden mt-1">
        <div className="w-full h-full bg-gradient-to-r from-brand-soft via-paid to-brand-soft rounded-full animate-pulse" />
      </div>
    </div>
  );
};

export interface RafiqTableLoadingProps {
  colSpan: number;
  label?: string;
  sublabel?: string;
}

export const RafiqTableLoading: React.FC<RafiqTableLoadingProps> = ({
  colSpan,
  label = 'جاري جلب وتحميل البيانات من قاعدة البيانات...',
  sublabel = 'يرجى الانتظار لحظات لتحديث الجدول',
}) => {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <RafiqLoadingState label={label} sublabel={sublabel} minHeight="min-h-[240px]" />
      </td>
    </tr>
  );
};
