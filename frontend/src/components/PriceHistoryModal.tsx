import React, { useState, useEffect } from 'react';
import { History, X, TrendingUp, TrendingDown, ArrowLeft, Calendar, AlertCircle } from 'lucide-react';
import { invoke } from '../bridge/ipc';
import type { ProductPriceHistory } from '../types/models';
import { formatArabicCurrency } from '../utils/money';

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

  useEffect(() => {
    if (!isOpen || !productId) return;
    let active = true;

    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await invoke<ProductPriceHistory[]>('products:getPriceHistory', { productId, limit: 50 });
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
  }, [isOpen, productId]);

  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-EG', {
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

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in select-none">
      <div className="bg-surface rounded-lg hairline-all shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-center justify-between bg-surface-2/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-brand-soft text-brand flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-ink leading-tight">سجل تغيير الأسعار والتكلفة</h3>
              <p className="text-[11px] text-ink-muted leading-tight mt-0.5">{productName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface border border-transparent hover:border-line transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3">
          {error && (
            <div className="p-3 bg-danger-soft border border-danger/30 rounded text-danger text-[12px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-ink-muted text-[13px] flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span>جاري تحميل سجل الأسعار...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="py-12 text-center text-ink-muted text-[13px] flex flex-col items-center gap-2 bg-canvas/60 rounded border border-dashed border-line">
              <History className="w-8 h-8 text-ink-muted/50" />
              <p className="font-semibold text-ink">لا توجد تعديلات أسعار سابقة مسجلة</p>
              <p className="text-[11.5px] text-ink-muted">سيتم تسجيل أي تعديل تقوم به على سعر البيع أو التكلفة تلقائياً هنا مع التاريخ والوقت.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-[11.5px] font-semibold text-ink-muted">
                إجمالي التعديلات المسجلة: {history.length}
              </div>

              <div className="border border-line rounded overflow-hidden">
                <table className="w-full text-right border-collapse text-[12px]">
                  <thead>
                    <tr className="bg-surface-2 border-b border-line text-ink-muted text-[11px] font-bold">
                      <th className="py-2.5 px-3">التاريخ والوقت</th>
                      <th className="py-2.5 px-3">سعر البيع</th>
                      <th className="py-2.5 px-3">سعر التكلفة</th>
                      <th className="py-2.5 px-3">هامش الربح الجديد</th>
                      <th className="py-2.5 px-3">البيان</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {history.map((item) => {
                      const priceDiff = item.newPricePiasters - item.oldPricePiasters;
                      const isInitial = item.oldPricePiasters === 0 && item.oldCostPiasters === 0;
                      const profitPiasters = item.newPricePiasters - item.newCostPiasters;
                      const markupPercent = item.newCostPiasters > 0
                        ? (((profitPiasters) / item.newCostPiasters) * 100).toFixed(1)
                        : '0.0';
                      const isLoss = profitPiasters < 0;

                      return (
                        <tr key={item.id} className="hover:bg-surface-2/40 transition-colors">
                          <td className="py-2.5 px-3 text-ink-muted font-mono text-[11px] whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-ink-muted" />
                              {formatDate(item.createdAt)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            {isInitial ? (
                              <span className="font-bold text-ink">
                                {formatArabicCurrency(item.newPricePiasters)}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="text-ink-muted line-through text-[11px]">
                                  {formatArabicCurrency(item.oldPricePiasters)}
                                </span>
                                <ArrowLeft className="w-3 h-3 text-ink-muted" />
                                <span className="font-bold text-ink flex items-center gap-0.5">
                                  {formatArabicCurrency(item.newPricePiasters)}
                                  {priceDiff > 0 ? (
                                    <TrendingUp className="w-3 h-3 text-brand" />
                                  ) : priceDiff < 0 ? (
                                    <TrendingDown className="w-3 h-3 text-danger" />
                                  ) : null}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {isInitial ? (
                              <span className="text-ink font-mono">
                                {formatArabicCurrency(item.newCostPiasters)}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="text-ink-muted line-through text-[11px]">
                                  {formatArabicCurrency(item.oldCostPiasters)}
                                </span>
                                <ArrowLeft className="w-3 h-3 text-ink-muted" />
                                <span className="text-ink font-semibold">
                                  {formatArabicCurrency(item.newCostPiasters)}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {isLoss ? (
                              <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-danger-soft text-danger border border-danger/20 font-mono">
                                خسارة ({markupPercent}%)
                              </span>
                            ) : profitPiasters === 0 ? (
                              <span className="px-1.5 py-0.5 rounded text-[10.5px] font-medium bg-surface-2 text-ink-muted border border-line font-mono">
                                رأس برأس
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-brand-soft text-brand border border-brand/20 font-mono">
                                +{markupPercent}%
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-ink-muted text-[11.5px] max-w-[150px] truncate" title={item.changeReason || ''}>
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

        {/* Footer */}
        <div className="p-4 border-t border-line bg-surface-2/40 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-[36px] px-5 bg-surface hover:bg-surface-2 border border-line text-ink rounded text-[12px] font-semibold transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
