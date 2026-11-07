import React, { useState, useEffect } from 'react';
import { History, X, TrendingUp, TrendingDown, ArrowLeft, Calendar, AlertCircle, User } from 'lucide-react';
import { invoke } from '../bridge/ipc';
import { useModalDismiss } from '../hooks/useModalDismiss';
import type { ProductPriceHistory } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { DateFilterControl } from './DateFilterControl';
import {
  type DateFilterValue,
  DEFAULT_DATE_FILTER,
  describeDateFilter,
  getDateFilterPayload,
  isDateFilterActive,
  useToday,
} from '../utils/dateFilter';

const PRICE_HISTORY_LIMIT = 200;

interface PriceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
}

export const PriceHistoryModal: React.FC<PriceHistoryModalProps> = ({
  isOpen,
  onClose,
  productId,
  productName,
}) => {
  const [history, setHistory] = useState<ProductPriceHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ ...DEFAULT_DATE_FILTER });
  // Re-evaluates relative presets when the day rolls over while the modal stays open
  const today = useToday();

  // Every opening (or another product) starts from an unfiltered period
  const resetKey = isOpen ? productId : '';
  const [handledResetKey, setHandledResetKey] = useState(resetKey);
  if (handledResetKey !== resetKey) {
    setHandledResetKey(resetKey);
    setDateFilter({ ...DEFAULT_DATE_FILTER });
  }

  const isDateActive = isDateFilterActive(dateFilter);
  const periodLabel = describeDateFilter(dateFilter);

  useEffect(() => {
    if (!isOpen || !productId) return;
    let active = true;

    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await invoke<ProductPriceHistory[]>('products:getPriceHistory', {
          productId,
          limit: PRICE_HISTORY_LIMIT,
          ...getDateFilterPayload(dateFilter),
        });
        if (active) {
          setHistory(Array.isArray(res) ? res : []);
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(`فشل تحميل سجل الأسعار: ${msg}`);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchHistory();

    return () => {
      active = false;
    };
  }, [isOpen, productId, dateFilter, today]);

  const { requestClose, handleBackdropClick } = useModalDismiss({
    isOpen,
    onDismiss: onClose,
    isDirty: false,
  });

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-EG-u-nu-latn', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-ink/40 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none"
    >
      <div 
        className="bg-surface dark:bg-surface-dark rounded-xl border border-line dark:border-line-dark hairline-all shadow-2xl w-full max-w-4xl flex flex-col max-h-[88vh] overflow-hidden text-ink dark:text-ink-dark"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2/60 dark:bg-surface-dark-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="t-modal-title text-ink dark:text-ink-dark leading-tight">سجل تغيير الأسعار والتكلفة</h3>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted leading-tight mt-0.5">{productName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-3 border border-transparent hover:border-line dark:hover:border-line-dark transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Period filter */}
        <div className="px-5 py-2.5 bg-surface dark:bg-surface-dark border-b border-line dark:border-line-dark flex items-center justify-between gap-x-3 gap-y-2 flex-wrap shrink-0">
          <DateFilterControl
            value={dateFilter}
            onChange={setDateFilter}
            size="md"
            selectWidthClass="w-44 sm:w-48"
          />
          <div className="text-micro font-semibold text-ink-muted dark:text-ink-dark-muted font-mono">
            {history.length} تعديل{isDateActive ? ` في الفترة: ${periodLabel}` : ' مسجل'}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3 bg-surface dark:bg-surface-dark">
          {error && (
            <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 rounded text-danger dark:text-danger-bright text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-ink-muted dark:text-ink-dark-muted text-sm flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-brand dark:border-brand-bright border-t-transparent rounded-full animate-spin" />
              <span>جاري تحميل سجل الأسعار...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-ink-muted dark:text-ink-dark-muted text-sm flex flex-col items-center gap-2 bg-canvas/60 dark:bg-canvas-dark rounded border border-dashed border-line dark:border-line-dark">
              <History className="w-8 h-8 text-ink-muted/50 dark:text-ink-dark-muted" />
              <p className="font-semibold text-ink dark:text-ink-dark">
                {isDateActive ? `لا توجد تعديلات أسعار في الفترة دي (${periodLabel})` : 'لا توجد تعديلات أسعار سابقة مسجلة'}
              </p>
              <p className="text-micro text-ink-muted dark:text-ink-dark-muted">سيتم تسجيل أي تعديل تقوم به على سعر البيع أو التكلفة تلقائياً هنا مع التاريخ والوقت والمستخدم المسؤول.</p>
              {isDateActive && (
                <button
                  type="button"
                  onClick={() => setDateFilter({ ...DEFAULT_DATE_FILTER })}
                  className="mt-1 h-9 px-4 rounded-xl bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 text-xs font-bold cursor-pointer hover:bg-brand/10 transition-colors"
                >
                  عرض كل الفترات
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-micro font-semibold text-ink-muted dark:text-ink-dark-muted">
                {history.length >= PRICE_HISTORY_LIMIT
                  ? `معروض أحدث ${PRICE_HISTORY_LIMIT} تعديل فقط، حدّد فترة أضيق لعرض الأقدم`
                  : `إجمالي التعديلات المسجلة: ${history.length}`}
              </div>

              <div className="border border-line dark:border-line-dark rounded overflow-hidden">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted text-micro font-bold">
                      <th className="py-2.5 px-3">التاريخ والوقت</th>
                      <th className="py-2.5 px-3">سعر البيع</th>
                      <th className="py-2.5 px-3">سعر التكلفة</th>
                      <th className="py-2.5 px-3">هامش الربح الجديد</th>
                      <th className="py-2.5 px-3">المستخدم المسؤول</th>
                      <th className="py-2.5 px-3">البيان والسبب</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-line-dark">
                    {history.map((item) => {
                      const priceDiff = item.newPricePiasters - item.oldPricePiasters;
                      const isInitial = item.oldPricePiasters === 0 && item.oldCostPiasters === 0;
                      const profitPiasters = item.newPricePiasters - item.newCostPiasters;
                      const markupPercent = item.newCostPiasters > 0
                        ? (((profitPiasters) / item.newCostPiasters) * 100).toFixed(1)
                        : '0.0';
                      const isLoss = profitPiasters < 0;

                      return (
                        <tr key={item.id} className="hover:bg-surface-2/40 dark:hover:bg-surface-dark-2 transition-colors">
                          <td className="py-2.5 px-3 text-ink-muted dark:text-ink-dark-muted font-mono text-micro whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted" />
                              {formatDate(item.createdAt)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {isInitial ? (
                              <span className="font-bold text-ink dark:text-ink-dark">
                                {formatArabicCurrency(item.newPricePiasters)}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="text-ink-muted dark:text-ink-dark-muted line-through text-micro">
                                  {formatArabicCurrency(item.oldPricePiasters)}
                                </span>
                                <ArrowLeft className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted" />
                                <span className="font-bold text-ink dark:text-ink-dark flex items-center gap-0.5">
                                  {formatArabicCurrency(item.newPricePiasters)}
                                  {priceDiff > 0 ? (
                                    <TrendingUp className="w-3 h-3 text-brand dark:text-brand-bright" />
                                  ) : priceDiff < 0 ? (
                                    <TrendingDown className="w-3 h-3 text-danger dark:text-danger-bright" />
                                  ) : null}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {isInitial ? (
                              <span className="text-ink dark:text-ink-dark font-mono">
                                {formatArabicCurrency(item.newCostPiasters)}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="text-ink-muted dark:text-ink-dark-muted line-through text-micro">
                                  {formatArabicCurrency(item.oldCostPiasters)}
                                </span>
                                <ArrowLeft className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted" />
                                <span className="text-ink dark:text-ink-dark font-semibold">
                                  {formatArabicCurrency(item.newCostPiasters)}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {isLoss ? (
                              <span className="px-1.5 py-0.5 rounded text-micro font-bold bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border border-danger/20 font-mono">
                                خسارة ({markupPercent}%)
                              </span>
                            ) : profitPiasters === 0 ? (
                              <span className="px-1.5 py-0.5 rounded text-micro font-medium bg-surface-2 dark:bg-surface-dark-2 text-ink-muted dark:text-ink-dark-muted border border-line dark:border-line-dark font-mono">
                                رأس برأس
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-micro font-bold bg-brand-soft dark:bg-brand-dark-soft text-brand dark:text-brand-bright border border-brand/20 dark:border-brand/30 font-mono">
                                +{markupPercent}%
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-ink dark:text-ink-dark text-micro whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark font-medium">
                              <User className="w-3 h-3 text-brand dark:text-brand-bright shrink-0" />
                              <span>{item.userName || item.userId || 'المدير'}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-ink-muted dark:text-ink-dark-muted text-micro max-w-[240px] truncate" title={item.changeReason || ''}>
                            {item.changeReason || 'تعديل يدوي'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
