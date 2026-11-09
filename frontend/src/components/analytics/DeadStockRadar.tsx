import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import { 
  PackageX, 
  DollarSign, 
  AlertTriangle, 
  RefreshCw,
  ChevronLeft,
  Pencil
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { useDataSubscription } from '../../utils/eventBus';
import { formatArabicCurrency } from '../../utils/money';
import { normalizeArabicDigits } from '../../utils/numberEnforcer';
import type { DeadStockReport, DeadStockItem } from '../../types/models';

import { AppButton } from '../AppButton';
import { formatUnitArabic } from '../../utils/units';
import { SegmentedTabs, type SegmentedTabOption } from '../SegmentedTabs';

const DEFAULT_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 3650;
const DAY_PRESETS = [15, 30, 45, 60, 90, 180];
const DAY_PRESET_OPTIONS: SegmentedTabOption<string>[] = DAY_PRESETS.map((days) => ({
  value: String(days),
  label: `${days} يوم`,
}));

export interface DeadStockRadarProps {
  onNavigateToProduct?: (productId: string) => void;
}

export const DeadStockRadar: FC<DeadStockRadarProps> = ({ onNavigateToProduct }) => {
  const [daysThreshold, setDaysThreshold] = useState<number>(DEFAULT_DAYS);
  const [customInputVal, setCustomInputVal] = useState<string>(String(DEFAULT_DAYS));
  const [report, setReport] = useState<DeadStockReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await invoke<DeadStockReport>('reports:getDeadStock', { daysThreshold });
      if (res) setReport(res);
    } catch (err) {
      console.error('Failed to load dead stock report:', err);
    } finally {
      setIsLoading(false);
    }
  }, [daysThreshold]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useDataSubscription(['products', 'sales', 'all'], () => {
    void loadData();
  });

  const applyDays = (days: number) => {
    setDaysThreshold(days);
    setCustomInputVal(String(days));
  };

  const handleApplyCustomDays = () => {
    const parsed = parseInt(customInputVal, 10);
    if (!isNaN(parsed) && parsed >= MIN_DAYS && parsed <= MAX_DAYS) {
      applyDays(parsed);
    } else {
      setCustomInputVal(String(daysThreshold));
    }
  };

  const items = report?.items || [];
  const totalTiedCapital = report?.totalTiedCapitalPiasters || 0;
  const count = report?.totalDeadItemsCount || 0;

  return (
    <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-xl p-5 shadow-2xs select-none">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 pb-3 border-b border-line/60 dark:border-line-dark/60">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright flex items-center justify-center font-bold">
            <PackageX className="w-4 h-4 text-danger dark:text-danger-bright" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink dark:text-ink-dark">
              أصناف في المخزن لم تُبع خلال آخر {daysThreshold} يوم
            </p>
            <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-0.5">
              تُحسب من تاريخ آخر بيع لكل صنف حتى اليوم، وتظهر الأصناف التي لم تُبع أبداً أيضاً
            </p>
          </div>
        </div>

        {/* Days threshold: anchored to today, so a number of days (not a from/to range) */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">لم تُبع منذ:</span>
          <SegmentedTabs
            size="compact"
            ariaLabel="عدد الأيام دون بيع"
            value={String(daysThreshold)}
            onChange={(value) => applyDays(Number(value))}
            options={DAY_PRESET_OPTIONS}
          />
          <label className="flex items-center gap-2">
            <span className="text-sm font-bold text-ink-muted dark:text-ink-dark-muted whitespace-nowrap">عدد مخصص:</span>
            <span className="relative flex items-center">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={customInputVal}
                onChange={(e) => setCustomInputVal(normalizeArabicDigits(e.target.value).replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyCustomDays();
                }}
                onBlur={handleApplyCustomDays}
                aria-label={`عدد الأيام دون بيع (من ${MIN_DAYS} إلى ${MAX_DAYS})`}
                title="اكتب عدد الأيام (من 1 إلى 3650) واضغط إنتر"
                className="w-28 h-10 ps-3 pe-10 text-center text-sm font-mono font-bold bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded-lg text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
              />
              <span className="absolute inset-y-0 end-3 flex items-center text-xs font-semibold text-ink-muted dark:text-ink-dark-muted pointer-events-none">
                يوم
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-3.5">
        <div className="p-3 rounded-lg bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 flex items-center justify-between">
          <div>
            <div className="text-xs text-danger dark:text-danger-bright font-semibold">إجمالي الأموال المجمدة على الرف</div>
            <div className="font-mono font-black text-base text-danger dark:text-danger-bright mt-0.5">
              {formatArabicCurrency(totalTiedCapital)}
            </div>
          </div>
          <DollarSign className="w-6 h-6 text-danger/50 dark:text-danger-bright/50" />
        </div>

        <div className="p-3 rounded-lg bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark flex items-center justify-between">
          <div>
            <div className="text-xs text-ink-muted dark:text-ink-dark-muted font-semibold">عدد الأصناف الراكدة</div>
            <div className="font-mono font-bold text-base text-ink dark:text-ink-dark mt-0.5">
              {count} صنف
            </div>
          </div>
          <PackageX className="w-6 h-6 text-ink-muted/50 dark:text-ink-dark-muted/50" />
        </div>

        <div className="p-3 rounded-lg bg-warn-soft dark:bg-warn-dark-soft border border-warn/20 dark:border-warn-bright/30 flex items-center justify-between">
          <div>
            <div className="text-xs text-warn dark:text-warn-bright font-semibold">توصية إدارة المخزن</div>
            <div className="text-xs text-ink dark:text-ink-dark font-bold mt-0.5">
              {count > 0 ? 'عمل عروض تخفيض أو استرجاع للمورد' : 'المخزون يتحرك بكفاءة ممتازة'}
            </div>
          </div>
          <AlertTriangle className="w-6 h-6 text-warn/50 dark:text-warn-bright/50" />
        </div>
      </div>

      {/* Items Table */}
      {!isLoading && count > items.length && (
        <p className="text-xs text-ink-muted dark:text-ink-dark-muted mb-2">
          يعرض الجدول أعلى {items.length} صنف قيمةً من أصل {count}، والإجمالي أعلاه يشمل الكل
        </p>
      )}
      {isLoading ? (
        <div className="py-8 text-center text-xs text-ink-muted dark:text-ink-dark-muted flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-brand dark:text-brand-bright" />
          <span>جاري جرد وحساب الرواكد...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-xs text-paid dark:text-paid-bright bg-paid-soft/50 dark:bg-paid-dark-soft/50 rounded-lg border border-paid/20 dark:border-paid/40 my-2">
          <div className="font-bold">ممتاز! لا توجد أصناف راكدة خلال آخر {daysThreshold} يوم</div>
          <div className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1">كافة المنتجات المتوفرة لها حركة بيع نشطة</div>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line dark:border-line-dark rounded-lg max-h-64 overflow-y-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted sticky top-0 border-b border-line dark:border-line-dark text-xs">
              <tr>
                <th className="px-3 py-3 font-bold whitespace-nowrap">اسم السلعة والباركود</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap">القسم</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap">الرصيد المعطل</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap">سعر التكلفة</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap text-danger dark:text-danger-bright">السيولة المجمدة</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap">أيام الركود</th>
                <th className="px-3 py-3 font-bold whitespace-nowrap text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 dark:divide-line-dark/60">
              {items.map((item: DeadStockItem) => (
                <tr key={item.productId} className="hover:bg-surface-2 dark:hover:bg-surface-dark-2/50 transition-colors">
                  <td className="px-3 py-3">
                    <div className="font-bold text-ink dark:text-ink-dark">{item.name}</div>
                    <div className="font-mono text-xs text-ink-muted dark:text-ink-dark-muted">{item.barcode || 'بدون باركود'}</div>
                  </td>
                  <td className="px-3 py-3 text-ink-muted dark:text-ink-dark-muted">{item.categoryName}</td>
                  <td className="px-3 py-3 whitespace-nowrap font-mono font-bold text-ink dark:text-ink-dark">
                    {(item.stockMilli / 1000).toLocaleString('ar-EG-u-nu-latn')} {formatUnitArabic(item.unit)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap font-mono text-ink dark:text-ink-dark">
                    {formatArabicCurrency(item.unitCostPiasters)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap font-mono font-bold text-danger dark:text-danger-bright">
                    {formatArabicCurrency(item.tiedCapitalPiasters)}
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/20 dark:border-danger-bright/30">
                      {item.daysInactive >= 999 ? 'لم يُبع أبداً' : `${item.daysInactive} يوم`}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {onNavigateToProduct && (
                      <AppButton
                        variant="secondary"
                        size="xs"
                        icon={Pencil}
                        onClick={() => onNavigateToProduct(item.productId)}
                        title="تعديل بيانات وسعر السلعة لتصريفها من المخزن"
                      >
                        <span>تعديل</span>
                        <ChevronLeft className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted" />
                      </AppButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
