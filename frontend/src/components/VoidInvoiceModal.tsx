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
  'الزبون رجع في كلامه',
  'غلط في تسجيل الصنف',
  'بضاعة تالفة أو مكسورة',
  'سبب تاني'
];

export const VoidInvoiceModal: React.FC<VoidInvoiceModalProps> = ({
  isOpen,
  sale,
  onClose,
  onCancelled
}) => {
  const [selectedReason, setSelectedReason] = useState<string>('الزبون رجع في كلامه');
  const [customReason, setCustomReason] = useState<string>('');
  const [supervisorPin, setSupervisorPin] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !sale) return null;

  const finalReason = selectedReason === 'سبب تاني' 
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
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-[480px] bg-surface rounded-xl border border-line shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 border-t-4 border-t-danger"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Modal Header */}
        <div className="h-[52px] px-4 border-b border-danger/20 flex items-center justify-between bg-danger-soft shrink-0">
          <div className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-danger" />
            <h2 className="text-[17px] font-bold text-danger m-0">إلغاء الفاتورة بالكامل</h2>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-danger hover:bg-danger-soft transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleConfirmCancel} className="p-4 space-y-4">
          {/* Warning Banner */}
          <div className="bg-danger-soft border border-danger/20 rounded-lg p-3 text-[13px] text-ink leading-relaxed flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div>
              <span>سيتم إلغاء الفاتورة رقم </span>
              <strong className="font-bold font-mono text-ink">#{sale.invoiceNumber || (sale.id ? sale.id.slice(0, 8) : '---')}</strong>
              <span> بقيمة </span>
              <strong className="font-bold font-mono text-danger">{formatArabicCurrency(sale.totalPiasters)}</strong>
              <span>، وكل الأصناف هترجع للمخزن فوراً وهيتلغي القيد المالي.</span>
            </div>
          </div>

          {errorMessage && (
            <div className="p-2.5 bg-red-100 border border-red-300 rounded-lg text-danger text-xs font-bold">
              {errorMessage}
            </div>
          )}

          {/* Reason Selection */}
          <div>
            <label className="block text-[13px] font-bold text-ink mb-1.5">
              سبب الإلغاء <span className="text-danger">*</span>
            </label>
            <div className="border border-line rounded-lg overflow-hidden bg-surface shadow-2xs divide-y divide-line">
              {PRESET_REASONS.map((r) => {
                const isSelected = selectedReason === r;
                return (
                  <div
                    key={r}
                    onClick={() => setSelectedReason(r)}
                    className={`px-3 py-2.5 flex items-center justify-between cursor-pointer transition-colors text-xs font-semibold ${
                      isSelected ? 'bg-danger-soft text-danger font-bold' : 'text-ink hover:bg-surface-2'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${
                        isSelected ? 'border-danger bg-danger text-white' : 'border-line'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </span>
                      <span>{r}</span>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] text-danger font-bold bg-surface px-2 py-0.5 rounded border border-danger/20">
                        محدد
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedReason === 'سبب تاني' && (
              <input
                type="text"
                autoFocus
                placeholder="اكتب سبب الإلغاء بالتفصيل..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                className="w-full mt-2 h-9 px-3 text-xs bg-surface-2 border border-line rounded-lg focus:outline-none focus:border-danger text-ink font-medium"
              />
            )}
          </div>

          {/* Supervisor PIN Input */}
          <div>
            <label className="block text-[13px] font-bold text-ink mb-1.5 flex items-center justify-between">
              <span>الرقم السري للمدير</span>
              <span className="text-[11px] text-ink-muted font-normal">(إن وُجد)</span>
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="••••"
                value={supervisorPin}
                onChange={(e) => setSupervisorPin(e.target.value)}
                className="w-full h-[40px] bg-surface-2 border border-line rounded-lg px-4 pr-10 text-[18px] font-bold text-center tracking-[4px] text-ink focus:outline-none focus:border-danger focus:bg-surface"
              />
              <Lock className="w-4 h-4 text-ink-muted absolute right-3 top-1/2 -translate-y-1/2" />
            </div>
            <span className="block text-[11px] text-ink-muted mt-1">
              مطلوب لو عمليات إلغاء الفواتير محمية برقم المدير السري
            </span>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 border-t border-line flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-[38px] px-4 text-xs font-bold text-ink-muted hover:text-ink rounded-lg hover:bg-surface-2 transition-colors cursor-pointer"
            >
              تراجع
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-[40px] px-5 bg-danger hover:bg-red-700 active:bg-red-800 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Ban className="w-4 h-4" />
              <span>{loading ? 'بيتم الإلغاء...' : 'تأكيد إلغاء الفاتورة نهائياً'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
