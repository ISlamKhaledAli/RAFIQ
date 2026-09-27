import React, { useState } from 'react';
import { Ban, X, AlertTriangle, Lock, Check } from 'lucide-react';
import type { Sale } from '../types/models';
import { formatArabicCurrency } from '../utils/money';
import { invoke } from '../bridge/ipc';

interface VoidInvoiceModalProps {
  isOpen: boolean;
  sale: Sale | null;
  onClose: () => void;
  onCancelled: (cancelledSale: Sale) => void;
}

const PRESET_REASONS = [
  'العميل غير رأيه',
  'خطأ في الإدخال',
  'صنف تالف',
  'سبب آخر'
];

export const VoidInvoiceModal: React.FC<VoidInvoiceModalProps> = ({
  isOpen,
  sale,
  onClose,
  onCancelled
}) => {
  const [selectedReason, setSelectedReason] = useState<string>('العميل غير رأيه');
  const [customReason, setCustomReason] = useState<string>('');
  const [supervisorPin, setSupervisorPin] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !sale) return null;

  const finalReason = selectedReason === 'سبب آخر' 
    ? (customReason.trim() || 'سبب آخر لم يحدد') 
    : selectedReason;

  const handleConfirmCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalReason) {
      setErrorMessage('يرجى تحديد أو كتابة سبب إلغاء الفاتورة');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const cancelled = await invoke<Sale>('sales:cancel', {
        saleId: sale.id,
        reason: finalReason,
        supervisorPin: supervisorPin.trim() || undefined
      });

      if (cancelled && cancelled.id) {
        onCancelled(cancelled);
        onClose();
      } else {
        throw new Error('تعذر إلغاء الفاتورة');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إلغاء الفاتورة';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[480px] bg-white rounded-xl border border-slate-300 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 border-t-4 border-t-rose-600"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="h-[52px] px-4 border-b border-rose-100 flex items-center justify-between bg-rose-50/70">
          <div className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-rose-600" />
            <h2 className="text-[17px] font-bold text-rose-900 m-0">إلغاء الفاتورة بالكامل</h2>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-100/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleConfirmCancel} className="p-4 space-y-4">
          {/* Warning Banner */}
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-[13px] text-slate-800 leading-relaxed flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span>سيتم إلغاء الفاتورة رقم </span>
              <strong className="font-bold font-mono text-slate-900">#{sale.invoiceNumber || (sale.id ? sale.id.slice(0, 8) : '---')}</strong>
              <span> بقيمة </span>
              <strong className="font-bold font-mono text-rose-700">{formatArabicCurrency(sale.totalPiasters)}</strong>
              <span>، وسيتم إرجاع جميع الأصناف للمخزون وعكس القيد المالي فوراً.</span>
            </div>
          </div>

          {errorMessage && (
            <div className="p-2.5 bg-rose-100/80 border border-rose-300 rounded-lg text-rose-900 text-xs font-bold">
              {errorMessage}
            </div>
          )}

          {/* Reason Selection */}
          <div>
            <label className="block text-[13px] font-bold text-slate-800 mb-1.5">
              سبب الإلغاء <span className="text-rose-600">*</span>
            </label>
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs divide-y divide-slate-100">
              {PRESET_REASONS.map((r) => {
                const isSelected = selectedReason === r;
                return (
                  <div
                    key={r}
                    onClick={() => setSelectedReason(r)}
                    className={`px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors text-xs font-semibold ${
                      isSelected ? 'bg-rose-50 text-rose-900 font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${
                        isSelected ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-300'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </span>
                      <span>{r}</span>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] text-rose-600 font-bold bg-white px-2 py-0.5 rounded border border-rose-200">
                        محدد
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedReason === 'سبب آخر' && (
              <input
                type="text"
                autoFocus
                placeholder="اكتب سبب الإلغاء بالتفصيل..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full mt-2 h-9 px-3 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-rose-500 text-slate-900 font-medium"
              />
            )}
          </div>

          {/* Supervisor PIN Input */}
          <div>
            <label className="block text-[13px] font-bold text-slate-800 mb-1.5 flex items-center justify-between">
              <span>الرقم السري للمشرف / المدير</span>
              <span className="text-[11px] text-slate-400 font-normal">(إن وُجد)</span>
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="••••"
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
                className="w-full h-[40px] bg-slate-50 border border-slate-300 rounded-lg px-4 pr-10 text-[18px] font-bold text-center tracking-[4px] text-slate-900 focus:outline-none focus:border-rose-500 focus:bg-white"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
            <span className="block text-[11px] text-slate-400 mt-1">
              مطلوب في حالة حماية عمليات الإلغاء بصلاحيات المشرف
            </span>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-[38px] px-4 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
            >
              تراجع
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-[40px] px-5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Ban className="w-4 h-4" />
              <span>{loading ? 'جاري الإلغاء...' : 'تأكيد إلغاء الفاتورة'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
