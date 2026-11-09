import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PauseCircle, X, RotateCcw, Trash2, Clock, ShoppingBag, AlertCircle, Info, Loader2 } from 'lucide-react';
import type { HeldSale } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { invoke } from '../bridge/ipc';
import { DateFilterControl } from './DateFilterControl';
import { useDateFilter, isDateFilterActive, describeDateFilter, toLocalDateString, parseDateToLocalDateStr } from '../utils/dateFilter';

import { AppButton } from './AppButton';
interface HeldSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRecall: (heldSale: HeldSale) => void;
  onHeldSalesChanged?: () => void;
}

export const HeldSalesModal: React.FC<HeldSalesModalProps> = ({
  isOpen,
  onClose,
  onRecall,
  onHeldSalesChanged
}) => {
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // The held list is not capped by the backend, so the day it was parked on is filtered here
  const { dateFilter, setDateFilter, filterDate, resetDateFilter } = useDateFilter();
  const dateActive = isDateFilterActive(dateFilter);
  const visibleSales = useMemo(
    () => (dateActive ? heldSales.filter((s) => filterDate(s.createdAt)) : heldSales),
    [heldSales, dateActive, filterDate]
  );

  const loadHeldSales = useCallback(async () => {
    try {
      setLoading(true);
      setActionError(null);
      const list = await invoke<HeldSale[]>('sales:getHeld');
      setHeldSales(list || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تحميل الفواتير المعلقة';
      setActionError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Guarantee: always fetch fresh data dynamically whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      resetDateFilter();
      void loadHeldSales();
    }
  }, [isOpen, loadHeldSales, resetDateFilter]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRecall = async (sale: HeldSale) => {
    if (!sale.id) return;
    try {
      setLoading(true);
      setActionError(null);
      // Recall atomically from backend (removes from held table)
      const recalled = await invoke<HeldSale>('sales:recallHeld', { id: sale.id });
      if (recalled) {
        onRecall(recalled);
        onHeldSalesChanged?.();
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر استرجاع الفاتورة المعلقة';
      setActionError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingId(id);
      setActionError(null);
      await invoke('sales:deleteHeld', { id });
      setHeldSales((prev) => prev.filter((s) => s.id !== id));
      onHeldSalesChanged?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حذف الفاتورة المعلقة';
      setActionError(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const formatHeldTime = (isoString?: string) => {
    if (!isoString) return '--:--';
    try {
      const d = new Date(isoString);
      const time = d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
      // a cart parked on an earlier day must not look like it was parked today
      const day = parseDateToLocalDateStr(d);
      return day && day !== toLocalDateString(new Date()) ? `${day} ${time}` : time;
    } catch {
      return isoString;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-3xl bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150 border-t-4 border-t-brand dark:border-t-brand-bright"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="h-14 px-5 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2 dark:bg-surface-dark-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <PauseCircle className="w-5 h-5 text-brand dark:text-brand-bright" />
            <h2 className="t-modal-title text-ink dark:text-ink-dark m-0">الفواتير المعلقة (المحجوزة مؤقتاً)</h2>
            <span className="text-xs font-mono font-bold bg-brand-soft dark:bg-surface-dark-3 text-brand dark:text-brand-bright px-2.5 py-0.5 rounded-full border border-brand/20 dark:border-brand-bright/20">
              {visibleSales.length} معلقة
            </span>
          </div>
          <AppButton variant="subtle" size="sm" icon={X} onClick={onClose} title="إغلاق النافذة" aria-label="إغلاق النافذة" />
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
          {/* Informational Note */}
          <div className="flex items-center gap-2 text-xs text-ink-muted dark:text-ink-dark-muted bg-surface-2 dark:bg-surface-dark-2 px-3.5 py-2.5 rounded-xl border border-line dark:border-line-dark">
            <Info className="w-4 h-4 text-brand dark:text-brand-bright shrink-0" />
            <span>الفاتورة المعلقة بتفضل شايلة أصناف الزبون من غير ما تخصم من المخزن لحد ما يرجع يكملها ويدفع.</span>
          </div>

          {actionError && (
            <div className="p-3 bg-danger-soft dark:bg-danger-dark-soft border border-danger/20 dark:border-danger-bright/30 text-danger dark:text-danger-bright text-xs font-bold rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-danger dark:text-danger-bright" />
              <span>{actionError}</span>
            </div>
          )}

          {heldSales.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted">يوم التعليق:</span>
              <DateFilterControl value={dateFilter} onChange={setDateFilter} size="sm" selectWidthClass="w-44" />
            </div>
          )}

          {/* Held Invoices Table or States */}
          {loading && heldSales.length === 0 ? (
            <div className="py-14 text-center text-ink-muted dark:text-ink-dark-muted flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-8 h-8 text-brand dark:text-brand-bright animate-spin" />
              <p className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted m-0">ثواني، بنجيب الفواتير المعلقة...</p>
            </div>
          ) : visibleSales.length > 0 ? (
            <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="h-9 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-micro font-bold text-ink-muted dark:text-ink-dark-muted">
                    <th className="px-3">اسم الزبون / الملاحظة</th>
                    <th className="px-3">الوقت</th>
                    <th className="px-3">الأصناف</th>
                    <th className="px-3">المبلغ</th>
                    <th className="px-3 text-center w-[10.3125rem]">التحكم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark bg-surface dark:bg-surface-dark">
                  {visibleSales.map((sale, idx) => (
                    <tr key={sale.id} className="h-12 hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                      <td className="px-3 font-bold text-ink dark:text-ink-dark text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-warn shrink-0" />
                          <div className="truncate max-w-[13.75rem]">
                            <span>{sale.customerName || sale.notes || `معلقة #${idx + 1}`}</span>
                            {sale.notes && sale.customerName && (
                              <span className="block text-micro text-ink-muted dark:text-ink-dark-muted font-normal truncate">
                                {sale.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 text-ink-muted dark:text-ink-dark-muted text-xs font-mono tabular-nums">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-ink-muted/70 dark:text-ink-dark-muted/70" />
                          <span>{formatHeldTime(sale.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-3 text-ink dark:text-ink-dark text-xs tabular-nums">
                        <div className="flex items-center gap-1">
                          <ShoppingBag className="w-3.5 h-3.5 text-ink-muted/70 dark:text-ink-dark-muted/70" />
                          <span>{sale.itemsCount} صنف</span>
                        </div>
                      </td>
                      <td className="px-3 font-bold text-paid dark:text-brand-bright text-xs font-mono tabular-nums">
                        {formatArabicCurrency(sale.totalPiasters)}
                      </td>
                      <td className="px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <AppButton
                            variant="primary"
                            size="xs"
                            icon={RotateCcw}
                            onClick={() => void handleRecall(sale)}
                            disabled={loading}
                            title="استرجاع السلة والمتابعة"
                          >
                            كمّل الفاتورة
                          </AppButton>
                          <AppButton
                            variant="dangerSubtle"
                            size="xs"
                            icon={Trash2}
                            onClick={() => {
                              if (sale.id) void handleDelete(sale.id);
                            }}
                            disabled={deletingId === sale.id || loading}
                            title="مسح الفاتورة المعلقة"
                            aria-label="مسح الفاتورة المعلقة"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-ink-muted dark:text-ink-dark-muted flex flex-col items-center justify-center">
              <PauseCircle className="w-12 h-12 mb-2 stroke-[1.2] text-line-hover dark:text-line-dark-strong" />
              {dateActive && heldSales.length > 0 ? (
                <>
                  <p className="text-sm font-bold text-ink dark:text-ink-dark">{`مفيش فواتير معلقة خلال ${describeDateFilter(dateFilter)}`}</p>
                  <AppButton variant="primary" size="sm" icon={RotateCcw} className="mt-2" onClick={resetDateFilter}>
                    عرض كل المعلقة
                  </AppButton>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-ink dark:text-ink-dark">مفيش أي فواتير معلقة دلوقتي</p>
                  <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1">
                    تقدر تعلق أي فاتورة في السلة وانت شغال بالضغط على زرار تعليق الفاتورة
                  </p>
                </>
              )}
            </div>
          )}

          {/* Indicator */}
          <div className="text-micro text-ink-muted dark:text-ink-dark-muted px-1">
            السيستم بيشيل لحد 50 فاتورة معلقة وبينظفهم تلقائي بعد أسبوع
          </div>
        </div>
      </div>
    </div>
  );
};
