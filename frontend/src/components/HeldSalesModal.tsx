import React, { useState, useEffect } from 'react';
import { PauseCircle, X, RotateCcw, Trash2, Clock, ShoppingBag, AlertCircle, Info } from 'lucide-react';
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

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await invoke<HeldSale[]>('sales:getHeld');
        if (active) setHeldSales(list || []);
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : 'تعذر تحميل الفواتير المعلقة';
          setActionError(msg);
        }
      }
    })();
    return () => { active = false; };
  }, []);

  if (!isOpen) return null;

  const handleRecall = async (sale: HeldSale) => {
    try {
      setLoading(true);
      // Recall atomically from backend (removes from held table)
      const recalled = await invoke<HeldSale>('sales:recallHeld', { id: sale.id });
      if (recalled) {
        onRecall(recalled);
        if (onHeldSalesChanged) onHeldSalesChanged();
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
      if (onHeldSalesChanged) onHeldSalesChanged();
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
        className="w-full max-w-[620px] bg-white rounded-xl border border-slate-300 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 border-t-4 border-t-[#0B4F42]"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="h-[52px] px-4 border-b border-slate-200 flex items-center justify-between bg-[#F7F8F6]">
          <div className="flex items-center gap-2">
            <PauseCircle className="w-5 h-5 text-[#0B4F42]" />
            <h2 className="text-[17px] font-bold text-[#14181A] m-0">الفواتير المعلقة</h2>
            <span className="text-xs font-mono font-bold bg-[#E1EAE5] text-[#0B4F42] px-2 py-0.5 rounded-full border border-[#0B4F42]/20">
              {heldSales.length} معلقة
            </span>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-3 overflow-y-auto max-h-[60vh]">
          {/* Informational Note */}
          <div className="flex items-center gap-2 text-[12px] text-slate-600 bg-[#F7F8F6] px-3 py-2 rounded-lg border border-slate-200">
            <Info className="w-4 h-4 text-[#0B4F42] shrink-0" />
            <span>الفواتير المعلقة تحفظ أصناف السلة والعميل دون التأثير على المخزون حتى يتم سدادها.</span>
          </div>

          {actionError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Held Invoices Table */}
          {heldSales.length > 0 ? (
            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="h-[36px] bg-[#F7F8F6] border-b border-slate-200 text-[11px] font-bold text-slate-600">
                    <th className="px-3">الوصف / العميل</th>
                    <th className="px-3">الوقت</th>
                    <th className="px-3">الأصناف</th>
                    <th className="px-3">الإجمالي</th>
                    <th className="px-3 text-center w-[150px]">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {heldSales.map((sale, idx) => (
                    <tr key={sale.id} className="h-[52px] hover:bg-slate-50/80 transition-colors">
                      <td className="px-3 font-bold text-slate-800 text-[13px]">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          <div className="truncate max-w-[130px]">
                            <span>{sale.customerName || sale.notes || `معلقة #${idx + 1}`}</span>
                            {sale.notes && sale.customerName && (
                              <span className="block text-[10px] text-slate-400 font-normal truncate">
                                {sale.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 text-slate-500 text-[12px] font-mono tabular-nums">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{formatHeldTime(sale.createdAt)}</span>
                        </div>
                      </td>
                      <td className="px-3 text-slate-700 text-[12px] tabular-nums">
                        <div className="flex items-center gap-1">
                          <ShoppingBag className="w-3 h-3 text-slate-400" />
                          <span>{sale.itemsCount} صنف</span>
                        </div>
                      </td>
                      <td className="px-3 font-bold text-[#0B4F42] text-[13px] font-mono tabular-nums">
                        {formatArabicCurrency(sale.totalPiasters)}
                      </td>
                      <td className="px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleRecall(sale)}
                            disabled={loading}
                            className="h-[32px] px-2.5 bg-white border border-[#0B4F42] text-[#0B4F42] hover:bg-[#E1EAE5] rounded-md text-[12px] font-bold flex items-center justify-center gap-1 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
                            title="استرجاع السلة والمتابعة"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>استرجاع</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (sale.id) void handleDelete(sale.id);
                            }}
                            disabled={deletingId === sale.id || loading}
                            className="h-[32px] w-[32px] bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 rounded-md flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                            title="حذف الفاتورة المعلقة"
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
            <div className="py-10 text-center text-slate-400 flex flex-col items-center justify-center">
              <PauseCircle className="w-12 h-12 mb-2 stroke-[1.5] text-slate-300" />
              <p className="text-sm font-bold text-slate-600">لا توجد فواتير معلقة حالياً</p>
              <p className="text-xs text-slate-400 mt-1">
                يمكنك تعليق أي فاتورة في السلة بالضغط على مفتاح <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-slate-100 border border-slate-300 rounded font-bold text-slate-700">F6</kbd>
              </p>
            </div>
          )}

          {/* Indicator */}
          <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
            <span>تحفظ حتى 50 فاتورة معلقة وتنظف تلقائياً بعد مرور 7 أيام</span>
            <span className="font-semibold text-[#0B4F42]">النشطة: {heldSales.length}</span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="h-[52px] px-4 bg-[#F7F8F6] border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            مفتاح <kbd className="px-1 bg-white border rounded text-slate-600 font-mono">Esc</kbd> للإغلاق
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-[36px] px-5 border border-slate-300 bg-white hover:bg-slate-50 text-[13px] font-bold text-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
