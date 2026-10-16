import React, { useState, useEffect, useCallback } from 'react';
import { PauseCircle, X, RotateCcw, Trash2, Clock, ShoppingBag, AlertCircle, Info, Loader2 } from 'lucide-react';
import type { HeldSale } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { invoke } from '../bridge/ipc';

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
      void loadHeldSales();
    }
  }, [isOpen, loadHeldSales]);

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
      return d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[640px] bg-surface dark:bg-surface-dark rounded-2xl border border-line dark:border-line-dark shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 border-t-4 border-t-brand dark:border-t-brand-bright"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="h-14 px-5 border-b border-line dark:border-line-dark flex items-center justify-between bg-surface-2 dark:bg-surface-dark-2">
          <div className="flex items-center gap-2.5">
            <PauseCircle className="w-5 h-5 text-brand dark:text-brand-bright" />
            <h2 className="text-base font-bold text-ink dark:text-ink-dark m-0">الفواتير المعلقة (المحجوزة مؤقتاً)</h2>
            <span className="text-xs font-mono font-bold bg-brand-soft dark:bg-surface-dark-3 text-brand dark:text-brand-bright px-2.5 py-0.5 rounded-full border border-brand/20 dark:border-brand-bright/20">
              {heldSales.length} معلقة
            </span>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted dark:text-ink-dark-muted hover:text-danger hover:bg-surface dark:hover:bg-surface-dark-3 transition-colors cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3 overflow-y-auto max-h-[60vh]">
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

          {/* Held Invoices Table or States */}
          {loading && heldSales.length === 0 ? (
            <div className="py-14 text-center text-ink-muted dark:text-ink-dark-muted flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-8 h-8 text-brand dark:text-brand-bright animate-spin" />
              <p className="text-xs font-bold text-ink-muted dark:text-ink-dark-muted m-0">ثواني، بنجيب الفواتير المعلقة...</p>
            </div>
          ) : heldSales.length > 0 ? (
            <div className="border border-line dark:border-line-dark rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="h-9 bg-surface-2 dark:bg-surface-dark-2 border-b border-line dark:border-line-dark text-[11px] font-bold text-ink-muted dark:text-ink-dark-muted">
                    <th className="px-3">اسم الزبون / الملاحظة</th>
                    <th className="px-3">الساعة</th>
                    <th className="px-3">الأصناف</th>
                    <th className="px-3">المبلغ</th>
                    <th className="px-3 text-center w-[165px]">التحكم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-line-dark bg-surface dark:bg-surface-dark">
                  {heldSales.map((sale, idx) => (
                    <tr key={sale.id} className="h-12 hover:bg-surface-2/60 dark:hover:bg-surface-dark-2/60 transition-colors">
                      <td className="px-3 font-bold text-ink dark:text-ink-dark text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-warn shrink-0" />
                          <div className="truncate max-w-[140px]">
                            <span>{sale.customerName || sale.notes || `معلقة #${idx + 1}`}</span>
                            {sale.notes && sale.customerName && (
                              <span className="block text-[10px] text-ink-muted dark:text-ink-dark-muted font-normal truncate">
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
                          <button
                            type="button"
                            onClick={() => void handleRecall(sale)}
                            disabled={loading}
                            className="h-7.5 px-2.5 bg-brand text-white hover:bg-brand-dark rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
                            title="استرجاع السلة والمتابعة"
                          >
                            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                            <span>كمّل الفاتورة</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (sale.id) void handleDelete(sale.id);
                            }}
                            disabled={deletingId === sale.id || loading}
                            className="h-7.5 w-7.5 bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-dark-muted hover:text-danger hover:border-danger/30 hover:bg-danger-soft dark:hover:bg-danger/20 rounded-lg flex items-center justify-center transition-colors shadow-2xs cursor-pointer shrink-0"
                            title="مسح الفاتورة المعلقة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
              <p className="text-sm font-bold text-ink dark:text-ink-dark">مفيش أي فواتير معلقة دلوقتي</p>
              <p className="text-xs text-ink-muted dark:text-ink-dark-muted mt-1">
                تقدر تعلق أي فاتورة في السلة وانت شغال بالضغط على زرار تعليق الفاتورة
              </p>
            </div>
          )}

          {/* Indicator */}
          <div className="text-[11px] text-ink-muted dark:text-ink-dark-muted flex items-center justify-between px-1">
            <span>السيستم بيشيل لحد 50 فاتورة معلقة وبينظفهم تلقائي بعد أسبوع</span>
            <span className="font-semibold text-brand dark:text-brand-bright">النشطة: {heldSales.length}</span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="h-13 px-5 bg-surface-2 dark:bg-surface-dark-2 border-t border-line dark:border-line-dark flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-5 border border-line dark:border-line-dark bg-surface dark:bg-surface-dark-3 hover:bg-surface-2 dark:hover:bg-surface-dark-2 text-xs font-bold text-ink dark:text-ink-dark rounded-xl transition-colors cursor-pointer shadow-2xs"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
