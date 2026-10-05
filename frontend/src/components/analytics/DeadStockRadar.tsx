import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import { 
  PackageX, 
  DollarSign, 
  AlertTriangle, 
  RefreshCw, 
  ChevronLeft
} from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { formatArabicCurrency } from '../../utils/money';
import type { DeadStockReport, DeadStockItem } from '../../types/models';

export interface DeadStockRadarProps {
  onNavigateToProduct?: (productId: string) => void;
}

export const DeadStockRadar: FC<DeadStockRadarProps> = ({ onNavigateToProduct }) => {
  const [daysThreshold, setDaysThreshold] = useState<number>(30);
  const [customInputVal, setCustomInputVal] = useState<string>('30');
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

  const handleApplyCustomDays = () => {
    const parsed = parseInt(customInputVal, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 9999) {
      setDaysThreshold(parsed);
    } else {
      setCustomInputVal(String(daysThreshold));
    }
  };

  const items = report?.items || [];
  const totalTiedCapital = report?.totalTiedCapitalPiasters || 0;
  const count = report?.totalDeadItemsCount || 0;

  return (
    <div className="bg-surface border border-line rounded-xl p-4 shadow-2xs select-none">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-red-100 text-danger flex items-center justify-center font-bold">
            <PackageX className="w-4 h-4 text-danger" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink">رادار البضاعة الراكدة والسيولة المجمدة</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              أصناف متواجدة بالمخزن لم يتم بيع قطعة واحدة منها خلال الفترة المحددة
            </p>
          </div>
        </div>

        {/* Days Threshold Pills with Custom Number Input */}
        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          <span className="text-[11px] text-ink-muted ml-1">لم تباع منذ:</span>
          {[15, 30, 45, 60, 90, 180].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => {
                setDaysThreshold(days);
                setCustomInputVal(String(days));
              }}
              className={`h-7 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                daysThreshold === days
                  ? 'bg-danger text-white shadow-2xs'
                  : 'bg-surface-2 text-ink-muted hover:text-ink hover:bg-slate-200'
              }`}
            >
              {days} يوم
            </button>
          ))}

          {/* Custom Days Input */}
          <div className="flex items-center gap-1 bg-surface-2 px-2 py-0.5 rounded-lg border border-line">
            <span className="text-[11px] text-ink-muted">مخصص:</span>
            <input
              type="number"
              min={1}
              max={9999}
              value={customInputVal}
              onChange={(e) => setCustomInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApplyCustomDays();
              }}
              onBlur={handleApplyCustomDays}
              className="w-12 h-6 text-center text-xs font-mono font-bold bg-surface border border-line rounded text-ink focus:outline-none focus:border-brand"
              title="اكتب أي عدد أيام واضغط إنتر"
            />
            <span className="text-[10px] text-ink-muted">يوم</span>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={isLoading}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-2 hover:bg-slate-200 text-ink-muted transition-colors cursor-pointer"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-paid' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 my-3.5">
        <div className="p-3 rounded-lg bg-red-50/60 border border-red-200 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-danger font-semibold">إجمالي الأموال المجمدة على الرف</div>
            <div className="font-mono font-black text-base text-danger mt-0.5">
              {formatArabicCurrency(totalTiedCapital)}
            </div>
          </div>
          <DollarSign className="w-6 h-6 text-danger/50" />
        </div>

        <div className="p-3 rounded-lg bg-surface-2 border border-line flex items-center justify-between">
          <div>
            <div className="text-[11px] text-ink-muted font-semibold">عدد الأصناف الراكدة</div>
            <div className="font-mono font-bold text-base text-ink mt-0.5">
              {count} صنف
            </div>
          </div>
          <PackageX className="w-6 h-6 text-ink-muted/50" />
        </div>

        <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-warn font-semibold">توصية إدارة المخزن</div>
            <div className="text-xs text-ink font-bold mt-0.5">
              {count > 0 ? 'عمل عروض تخفيض أو استرجاع للمورد' : 'المخزون يتحرك بكفاءة ممتازة'}
            </div>
          </div>
          <AlertTriangle className="w-6 h-6 text-warn/50" />
        </div>
      </div>

      {/* Items Table */}
      {isLoading ? (
        <div className="py-8 text-center text-xs text-ink-muted flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-brand" />
          <span>جاري جرد وحساب الرواكد...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-xs text-paid bg-paid-soft/50 rounded-lg border border-paid/20 my-2">
          <div className="font-bold">ممتاز! لا توجد أصناف راكدة خلال آخر {daysThreshold} يوم</div>
          <div className="text-[11px] text-ink-muted mt-1">كافة المنتجات المتوفرة لها حركة بيع نشطة</div>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line rounded-lg max-h-64 overflow-y-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-surface-2 text-ink-muted sticky top-0 border-b border-line text-[11px]">
              <tr>
                <th className="p-2.5 font-bold">اسم السلعة والباركود</th>
                <th className="p-2.5 font-bold">القسم</th>
                <th className="p-2.5 font-bold">الرصيد المعطل</th>
                <th className="p-2.5 font-bold">سعر التكلفة</th>
                <th className="p-2.5 font-bold text-danger">السيولة المجمدة</th>
                <th className="p-2.5 font-bold">أيام الركود</th>
                <th className="p-2.5 font-bold text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {items.map((item: DeadStockItem) => (
                <tr key={item.productId} className="hover:bg-slate-50 transition-colors">
                  <td className="p-2.5">
                    <div className="font-bold text-ink">{item.name}</div>
                    <div className="font-mono text-[10px] text-ink-muted">{item.barcode || 'بدون باركود'}</div>
                  </td>
                  <td className="p-2.5 text-ink-muted">{item.categoryName}</td>
                  <td className="p-2.5 font-mono font-bold text-ink">
                    {(item.stockMilli / 1000).toLocaleString('ar-EG-u-nu-latn')} {item.unit}
                  </td>
                  <td className="p-2.5 font-mono text-ink">
                    {formatArabicCurrency(item.unitCostPiasters)}
                  </td>
                  <td className="p-2.5 font-mono font-bold text-danger">
                    {formatArabicCurrency(item.tiedCapitalPiasters)}
                  </td>
                  <td className="p-2.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-red-100 text-danger">
                      {item.daysInactive >= 999 ? 'لم يُبع أبداً' : `${item.daysInactive} يوم`}
                    </span>
                  </td>
                  <td className="p-2.5 text-center">
                    {onNavigateToProduct && (
                      <button
                        type="button"
                        onClick={() => onNavigateToProduct(item.productId)}
                        className="px-2 py-1 rounded bg-surface hover:bg-surface-2 border border-line text-[11px] font-bold text-ink hover:text-brand transition-colors cursor-pointer inline-flex items-center gap-1"
                      >
                        <span>تعديل</span>
                        <ChevronLeft className="w-3 h-3" />
                      </button>
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
