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
        className="w-full max-w-[640px] bg-surface rounded-2xl border border-line shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 border-t-4 border-t-brand"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="h-14 px-5 border-b border-line flex items-center justify-between bg-surface-2">
          <div className="flex items-center gap-2.5">
            <PauseCircle className="w-5 h-5 text-brand" />
            <h2 className="text-base font-bold text-ink m-0">الفواتير المعلقة (المحجوزة مؤقتاً)</h2>
            <span className="text-xs font-mono font-bold bg-brand-soft text-brand px-2.5 py-0.5 rounded-full border border-brand/20">
              {heldSales.length} معلقة
            </span>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-danger hover:bg-surface transition-colors cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3 overflow-y-auto max-h-[60vh]">
          {/* Informational Note */}
          <div className="flex items-center gap-2 text-xs text-ink-muted bg-surface-2 px-3.5 py-2.5 rounded-xl border border-line">
            <Info className="w-4 h-4 text-brand shrink-0" />
            <span>الفاتورة المعلقة بتفضل شايلة أصناف الزبون من غير ما تخصم من المخزن لحد ما يرجع يكملها ويدفع.</span>
          </div>

          {actionError && (
            <div className="p-3 bg-danger-soft border border-danger/20 text-danger text-xs font-bold rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Held Invoices Table or States */}
          {loading && heldSales.length === 0 ? (
            <div className="py-14 text-center text-ink-muted flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-8 h-8 text-brand animate-spin" />
              <p className="text-xs font-bold text-ink-muted m-0">ثواني، بنجيب الفواتير المعلقة...</p>
            </div>
          ) : heldSales.length > 0 ? (
            <div className="border border-line rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="h-9 bg-surface-2 border-b border-line text-[11px] font-bold text-ink-muted">
                    <th className="px-3">اسم الزبون / الملاحظة</th>
                    <th className="px-3">الساعة</th>
                    <th className="px-3">الأصناف</th>
                    <th className="px-3">المبلغ</th>
                    <th className="px-3 text-center w-[165px]">التحكم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {heldSales.map((sale, idx) => (
                    <tr key={sale.id} className="h-12 hover:bg-surface-2/60 transition-colors">
                      <td className="px-3 font-bold text-ink text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-warn shrink-0" />
                          <div className="truncate max-w-[140px]">
                            <span>{sale.customerName || sale.notes || `معلقة #${idx + 1}`}</span>
                            {sale.notes && sale.customerName && (
                              <span className="block text-[10px] text-ink-muted font-normal truncate">
                                {sale.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 text-ink-muted text-xs font-mono tabular-nums">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-ink-muted/70" />
                          <span>{formatHeldTime(sale.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-3 text-ink text-xs tabular-nums">
                        <div className="flex items-center gap-1">
                          <ShoppingBag className="w-3.5 h-3.5 text-ink-muted/70" />
                          <span>{sale.itemsCount} صنف</span>
                        </div>
                      </td>
                      <td className="px-3 font-bold text-paid text-xs font-mono tabular-nums">
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
                            className="h-7.5 w-7.5 bg-surface border border-line text-ink-muted hover:text-danger hover:border-danger/30 hover:bg-danger-soft rounded-lg flex items-center justify-center transition-colors shadow-2xs cursor-pointer shrink-0"
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
            <div className="py-12 text-center text-ink-muted flex flex-col items-center justify-center">
              <PauseCircle className="w-12 h-12 mb-2 stroke-[1.2] text-line-hover" />
              <p className="text-sm font-bold text-ink">مفيش أي فواتير معلقة دلوقتي</p>
              <p className="text-xs text-ink-muted mt-1">
                تقدر تعلق أي فاتورة في السلة وانت شغال بالضغط على زرار <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-surface-2 border border-line rounded font-bold text-ink">F6</kbd>
              </p>
            </div>
          )}

          {/* Indicator */}
          <div className="text-[11px] text-ink-muted flex items-center justify-between px-1">
            <span>السيستم بيشيل لحد 50 فاتورة معلقة وبينظفهم تلقائي بعد أسبوع</span>
            <span className="font-semibold text-brand">النشطة: {heldSales.length}</span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="h-13 px-5 bg-surface-2 border-t border-line flex items-center justify-between">
          <span className="text-[11px] text-ink-muted">
            مفتاح <kbd className="px-1.5 py-0.5 bg-surface border border-line rounded text-ink font-mono text-[10px]">Esc</kbd> للإغلاق
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-5 border border-line bg-surface hover:bg-surface-2 text-xs font-bold text-ink rounded-xl transition-colors cursor-pointer shadow-2xs"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
