import React from 'react';
import { 
  UserCheck, 
  CreditCard, 
  Printer, 
  RotateCcw, 
  Eye, 
  Clock, 
  Undo2 
} from 'lucide-react';
import type { Customer, Sale } from '../../types/models';
import type { CartItem } from './types';
import { formatArabicCurrency } from '../../utils/money';

interface PosCartCheckoutBarProps {
  cart: CartItem[];
  nextExpectedInvoiceNumber: number | null;
  lastInvoiceNumber: number | null;
  totalItemCount: number;
  subtotalPiasters: number;
  discountPiasters: number;
  totalTaxPiasters?: number;
  showTaxes?: boolean;
  selectedCustomerId: string;
  paymentMethod: 'cash' | 'credit';
  customers: Customer[];
  netTotalPiasters: number;
  loading: boolean;
  handleOpenCheckout: (forcedMethod?: 'cash' | 'credit') => void;
  requestClearCart: () => void;
  lastCompletedSale: Sale | null;
  onOpenReceipt: () => void;
  handleHoldCurrentSale: () => Promise<void>;
  heldSalesCount: number;
  onOpenHeldSales: () => void;
  onOpenReturnModal: () => void;
}

export const PosCartCheckoutBar: React.FC<PosCartCheckoutBarProps> = ({
  cart,
  nextExpectedInvoiceNumber,
  lastInvoiceNumber,
  totalItemCount,
  subtotalPiasters,
  discountPiasters,
  totalTaxPiasters = 0,
  showTaxes = false,
  selectedCustomerId,
  paymentMethod,
  customers,
  netTotalPiasters,
  loading,
  handleOpenCheckout,
  requestClearCart,
  lastCompletedSale,
  onOpenReceipt,
  handleHoldCurrentSale,
  heldSalesCount,
  onOpenHeldSales,
  onOpenReturnModal,
}) => {
  const selectedCust = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) : null;

  return (
    <div className="bg-white border-t border-[#dce1dc] shadow-[0_-4px_12px_rgba(0,0,0,0.03)] p-2.5 sm:p-3 flex flex-col gap-2 shrink-0 select-none">
      {/* Top Subtle Cart Meta Strip */}
      <div className="flex items-center justify-between px-1.5 py-0.5 text-xs text-[#52605d] flex-wrap gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 font-bold">
            <span className="text-[#0f172a]">فاتورة:</span>
            <span className="text-[11px] font-mono font-bold text-[#006d41] bg-[#eaf5ee] border border-[#c4e3d0] px-2 py-0.2 rounded-md shadow-2xs">
              #{nextExpectedInvoiceNumber || (lastInvoiceNumber ? lastInvoiceNumber + 1 : '1')}
            </span>
          </div>

          <span className="text-[11px] text-[#52605d] font-medium bg-[#f8fafc] px-2 py-0.2 rounded-md border border-[#dce1dc]">
            {cart.length} أصناف ({totalItemCount} قطعة)
          </span>

          <span className="text-[11px] font-mono text-[#52605d]">
            المجموع: <strong className="text-[#0f172a] font-bold">{formatArabicCurrency(subtotalPiasters)}</strong>
          </span>

          {discountPiasters > 0 && (
            <span className="text-[11px] text-[#b23a2e] font-bold bg-[#fdf3f2] px-1.5 py-0.2 rounded border border-[#f6cbc6]">
              خصم: -{formatArabicCurrency(discountPiasters)}
            </span>
          )}
        </div>

        {selectedCust && (
          <div className="flex items-center gap-1 text-[11px] font-bold text-[#006d41] bg-[#eaf5ee] px-2 py-0.5 rounded-md border border-[#c4e3d0]">
            <UserCheck className="w-3 h-3" />
            <span className="truncate max-w-[140px]">{selectedCust.name}</span>
          </div>
        )}
      </div>

      {/* Main Bottom Section: Hero Grand Total Card + Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch gap-2">
        {/* Grand Total Hero Card (The Requested "المطلوب سداده" Card) */}
        <div className="sm:w-[42%] min-w-[240px] bg-gradient-to-br from-[#00372d] via-[#004d3f] to-[#0b4f42] rounded-2xl border border-[#0b4f42] px-3.5 py-2.5 flex flex-col justify-between shadow-[0_6px_16px_rgba(0,55,45,0.18)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#83bfaf]">المطلوب سداده</span>
            {showTaxes && totalTaxPiasters > 0 && (
              <span className="text-[10px] font-medium text-[#99f2bb]">
                (شامل الضريبة)
              </span>
            )}
            <span className="text-xs font-bold text-[#b1efdd]">جنيه مصري</span>
          </div>
          <div className="flex items-baseline justify-end pt-0.5">
            <span className="text-white text-2xl sm:text-[30px] leading-tight font-black font-mono tabular-nums tracking-tight">
              {formatArabicCurrency(netTotalPiasters)}
            </span>
          </div>
        </div>

        {/* Action Controls & Fast Buttons Area */}
        <div className="flex-1 flex flex-col justify-between gap-1.5">
          {/* Main Payment Triggers */}
          <div className="grid grid-cols-2 gap-1.5 h-11">
            {paymentMethod === 'credit' ? (
              /* آجل [F12] */
              <button 
                type="button"
                onClick={() => handleOpenCheckout('credit')}
                disabled={loading || cart.length === 0}
                className="col-span-2 h-full bg-[#b23a2e] hover:bg-[#962f25] active:bg-[#7a251d] disabled:bg-[#f1f4f6] disabled:text-[#52605d] text-white rounded-xl px-3 flex items-center justify-between transition-all shadow-sm active:scale-[0.98] cursor-pointer"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <span className="text-xs sm:text-sm font-bold truncate">تسجيل بيع آجل</span>
                </div>
                <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded text-white font-bold shrink-0">
                  F12
                </span>
              </button>
            ) : (
              <>
                {/* نقدى [F9] */}
                <button 
                  type="button"
                  onClick={() => handleOpenCheckout('cash')}
                  disabled={loading || cart.length === 0}
                  className="h-full bg-[#004d3f] hover:bg-[#00372d] active:bg-[#002720] disabled:bg-[#f1f4f6] disabled:text-[#52605d] text-white rounded-xl px-2.5 flex items-center justify-between transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                  title="سداد نقدي مباشر وحفظ الفاتورة (F9)"
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <CreditCard className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs sm:text-sm font-bold truncate">نقدى</span>
                  </div>
                  <span className="text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded text-white font-bold shrink-0">
                    F9
                  </span>
                </button>

                {/* حفظ وطباعة [F12] */}
                <button 
                  type="button"
                  onClick={() => handleOpenCheckout('cash')}
                  disabled={loading || cart.length === 0}
                  className="h-full bg-[#006d41] hover:bg-[#005734] active:bg-[#003d24] disabled:bg-[#f1f4f6] disabled:text-[#52605d] text-white rounded-xl px-2.5 flex items-center justify-between transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                  title="حفظ الفاتورة وطباعة الإيصال (F12)"
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <Printer className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs sm:text-sm font-bold truncate">طباعة</span>
                  </div>
                  <span className="text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded text-white font-bold shrink-0">
                    F12
                  </span>
                </button>
              </>
            )}
          </div>

          {/* Quick Support Actions: New Invoice, Recall, Hold, Return */}
          <div className="grid grid-cols-4 gap-1 sm:gap-1.5 h-8.5 sm:h-9">
            <button 
              type="button"
              onClick={requestClearCart}
              disabled={cart.length === 0}
              className="h-full bg-white hover:bg-[#fdf3f2] text-[#b23a2e] disabled:text-[#52605d] border border-[#f6cbc6] disabled:border-[#dce1dc] text-[10px] sm:text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer active:scale-[0.98] px-0.5 whitespace-nowrap"
              title="تفريغ السلة وفاتورة جديدة (F7)"
            >
              <RotateCcw className="w-3 h-3 shrink-0" />
              <span>جديدة F7</span>
            </button>

            <button
              type="button"
              onClick={() => void handleHoldCurrentSale()}
              disabled={cart.length === 0}
              className="h-full bg-white hover:bg-slate-50 text-[#0f172a] disabled:text-[#52605d] border border-[#dce1dc] hover:border-[#006d41]/40 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all px-0.5 flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-[0.98] whitespace-nowrap"
              title="تعليق السلة الحالية (F6)"
            >
              <Clock className="w-3 h-3 text-[#52605d] shrink-0" />
              <span>تعليق F6</span>
            </button>

            <button
              type="button"
              onClick={onOpenHeldSales}
              className="h-full bg-white hover:bg-amber-50 text-[#0f172a] border border-[#dce1dc] hover:border-amber-400 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all px-0.5 flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-[0.98] whitespace-nowrap"
              title="عرض واسترجاع الفواتير المعلقة"
            >
              <span>معلقة</span>
              {heldSalesCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white font-mono text-[9px] flex items-center justify-center font-bold shrink-0">
                  {heldSalesCount}
                </span>
              )}
            </button>

            {lastCompletedSale ? (
              <button 
                type="button"
                onClick={onOpenReceipt}
                className="h-full bg-white border border-[#dce1dc] hover:border-[#006d41]/50 hover:bg-[#eaf5ee] text-[#0f172a] text-[10px] sm:text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer px-0.5 whitespace-nowrap"
                title="معاينة إيصال آخر فاتورة"
              >
                <Eye className="w-3 h-3 text-[#006d41] shrink-0" />
                <span>الإيصال</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenReturnModal}
                className="h-full bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 hover:border-amber-400 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all px-0.5 flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-[0.98] whitespace-nowrap"
                title="تسجيل مرتجع مبيعات (F11)"
              >
                <Undo2 className="w-3 h-3 shrink-0" />
                <span>مرتجع F11</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
