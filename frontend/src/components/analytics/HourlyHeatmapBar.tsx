import { useState } from 'react';
import type { FC } from 'react';
import { Clock, Flame, Info, Calendar, Sparkles } from 'lucide-react';
import type { HourlyIntensityReport, HourlySalesPoint } from '../../types/models';
import { formatArabicCurrency } from '../../utils/money';

export interface HourlyHeatmapBarProps {
  report: HourlyIntensityReport | null;
  isLoading?: boolean;
}

export const HourlyHeatmapBar: FC<HourlyHeatmapBarProps> = ({ report, isLoading }) => {
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  // Generate 24 default hours if report is not yet loaded
  const defaultHours: HourlySalesPoint[] = Array.from({ length: 24 }, (_, i) => {
    const suffix = i >= 12 ? 'م' : 'ص';
    const displayHour = i % 12 === 0 ? 12 : i % 12;
    return {
      hour: i,
      hourLabel: `${String(displayHour).padStart(2, '0')}:00 ${suffix}`,
      salesPiasters: 0,
      invoicesCount: 0,
      returnsPiasters: 0,
    };
  });

  const hours = (report?.hours && report.hours.length === 24) ? report.hours : defaultHours;
  const maxSales = Math.max(1, ...hours.map((h) => h.salesPiasters));
  const totalSalesInDay = hours.reduce((acc, h) => acc + h.salesPiasters, 0);
  const totalInvoicesInDay = hours.reduce((acc, h) => acc + h.invoicesCount, 0);

  const peakPoint = report?.hours?.find((h) => h.hour === report.peakHour) || null;
  const currentSystemHour = new Date().getHours();

  // Active inspected hour: user selected, or peak hour, or current hour, or first hour with sales
  const activePoint = selectedHour !== null 
    ? hours.find((h) => h.hour === selectedHour) 
    : (peakPoint && peakPoint.salesPiasters > 0 
        ? peakPoint 
        : hours.find((h) => h.hour === currentSystemHour) || hours[12] || hours[0]);

  if (isLoading) {
    return (
      <div className="bg-surface border border-line rounded-xl p-5 shadow-2xs flex flex-col items-center justify-center min-h-[220px] animate-pulse">
        <Clock className="w-7 h-7 text-paid animate-spin mb-2" />
        <span className="text-xs font-bold text-ink">جاري قراءة وتوزيع مبيعات الـ 24 ساعة...</span>
        <span className="text-[11px] text-ink-muted mt-1">يتم تجميع الفواتير وحساب ساعة الذروة والضغط</span>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-xl p-4 sm:p-5 shadow-2xs select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold">
            <Flame className="w-5 h-5 text-amber-600 fill-amber-600/30" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">خريطة ساعات الذروة وكثافة الزبائن (24 ساعة)</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              تحديد أوقات الازدحام لتوزيع الكاشيرات بدقة وتنظيم استلام البضائع من الموردين
            </p>
          </div>
        </div>

        {totalSalesInDay > 0 && peakPoint && peakPoint.salesPiasters > 0 ? (
          <div className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-2 self-start sm:self-auto shadow-2xs">
            <Flame className="w-4 h-4 text-amber-600 fill-amber-600" />
            <span>ساعة الذروة: {peakPoint.hourLabel}</span>
            <span className="font-mono bg-white/80 px-1.5 py-0.5 rounded border border-amber-200">
              {peakPoint.invoicesCount} من {totalInvoicesInDay} فاتورة ({formatArabicCurrency(peakPoint.salesPiasters)})
            </span>
          </div>
        ) : (
          <div className="px-2.5 py-1 rounded-lg bg-surface-2 text-ink-muted border border-line text-xs font-medium flex items-center gap-1.5 self-start sm:self-auto">
            <Calendar className="w-3.5 h-3.5" />
            <span>توزيع الـ 24 ساعة لليوم</span>
          </div>
        )}
      </div>

      {/* 24-Hour Visual Intensity Chart Container */}
      <div className="mt-4 pt-2 pb-1">
        {/* The Grid: 24 columns reliably rendered with explicit CSS grid */}
        <div 
          className="items-end h-32 pt-4 pb-2 border-b border-line/80 px-1"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(24, minmax(0, 1fr))',
            gap: '4px',
          }}
        >
          {hours.map((item) => {
            const hasSales = item.salesPiasters > 0;
            const ratio = hasSales ? item.salesPiasters / maxSales : 0;
            const isPeak = totalSalesInDay > 0 && item.hour === report?.peakHour && hasSales;
            const isSelected = activePoint?.hour === item.hour;

            // Height scaling between 12px (min) and 92px (max)
            const heightPx = hasSales ? Math.max(16, Math.round(ratio * 92)) : 8;

            // Color gradations according to volume
            let barBg = 'bg-surface-2 group-hover:bg-slate-200';
            if (hasSales) {
              if (ratio >= 0.75) {
                barBg = 'bg-brand-dark group-hover:bg-brand';
              } else if (ratio >= 0.45) {
                barBg = 'bg-paid group-hover:bg-paid-hover';
              } else if (ratio >= 0.2) {
                barBg = 'bg-paid/75 group-hover:bg-paid';
              } else {
                barBg = 'bg-paid/45 group-hover:bg-paid/60';
              }
            }

            if (isSelected) {
              barBg += ' ring-2 ring-warn ring-offset-1 shadow-sm';
            }

            return (
              <button
                key={item.hour}
                type="button"
                onClick={() => setSelectedHour(item.hour)}
                onMouseEnter={() => setSelectedHour(item.hour)}
                title={`${item.hourLabel}: ${formatArabicCurrency(item.salesPiasters)} (${item.invoicesCount} فاتورة)`}
                className="group relative flex flex-col items-center justify-end h-full w-full focus:outline-none cursor-pointer p-0.5 rounded transition-all"
              >
                {/* Peak flame marker */}
                {isPeak && (
                  <div className="absolute -top-3.5 flex flex-col items-center animate-bounce z-10">
                    <Flame className="w-3.5 h-3.5 text-warn fill-warn" />
                  </div>
                )}

                {/* Vertical Bar Slot Container */}
                <div className="w-full h-full flex flex-col justify-end items-center bg-slate-50/50 rounded-t-sm">
                  <div
                    className={`w-full rounded-t-sm transition-all duration-300 ${barBg}`}
                    style={{ height: `${heightPx}px` }}
                  />
                </div>

                {/* Hour label index */}
                <span className={`text-[9px] font-mono mt-1.5 leading-none transition-colors ${
                  isSelected ? 'text-warn font-black' : 'text-ink-muted'
                }`}>
                  {item.hour % 3 === 0 ? item.hour : '·'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Legend / Timeline Periods Indicator */}
        <div className="flex items-center justify-between text-[10px] text-ink-muted font-bold mt-2 px-1">
          <span>00:00 (منتصف الليل)</span>
          <span>06:00 (الصباح)</span>
          <span>12:00 (الظهيرة)</span>
          <span>18:00 (المساء)</span>
          <span>23:00 (نهاية اليوم)</span>
        </div>
      </div>

      {/* Selected / Current Hour Inspection Summary Card */}
      {activePoint ? (
        <div className="mt-3.5 p-3 rounded-xl bg-surface-2 border border-line/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-surface border border-line flex items-center justify-center font-mono font-bold text-ink">
              <Clock className="w-4 h-4 text-brand" />
            </div>
            <div>
              <span className="text-ink-muted text-[11px]">الساعة المحددة: </span>
              <span className="font-bold text-ink font-mono text-sm">{activePoint.hourLabel}</span>
              {activePoint.hour === currentSystemHour && (
                <span className="mr-2 text-[10px] bg-paid-soft text-paid px-1.5 py-0.5 rounded font-bold border border-paid/20">
                  الساعة الحالية الآن
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div>
              <span className="text-ink-muted text-[11px]">المبيعات: </span>
              <span className="font-mono font-bold text-paid text-sm">
                {formatArabicCurrency(activePoint.salesPiasters)}
              </span>
            </div>

            <div>
              <span className="text-ink-muted text-[11px]">الزبائن والفواتير: </span>
              <span className="font-mono font-bold text-ink text-sm">
                {activePoint.invoicesCount} فاتورة
              </span>
            </div>

            {activePoint.returnsPiasters > 0 && (
              <div>
                <span className="text-danger text-[11px]">مرتجع: </span>
                <span className="font-mono text-danger font-bold text-sm">
                  {formatArabicCurrency(activePoint.returnsPiasters)}
                </span>
              </div>
            )}
          </div>

          <div className="text-[11px] text-ink-muted flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-brand shrink-0" />
            <span>اضغط أو مرر المؤشر على أي ساعة لمعاينة تفاصيلها</span>
          </div>
        </div>
      ) : null}

      {/* When no sales recorded in this period */}
      {totalSalesInDay === 0 && (
        <div className="mt-3 p-2.5 rounded-lg bg-paid-soft/40 border border-paid/20 text-xs text-ink-muted flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-paid shrink-0" />
          <span>لا توجد مبيعات مسجلة في هذا اليوم حتى الآن — يرتفع المخطط البياني تلقائياً مع إصدار الفواتير لتحديد ساعة الازدحام.</span>
        </div>
      )}
    </div>
  );
};
