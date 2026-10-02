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
  subtotalPiasters: _subtotalPiasters,
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
    <div className="bg-white border-t border-[#dce1dc] shadow-[0_-4px_12px_rgba(0,0,0,0.03)] p-2 sm:p-2.5 flex flex-col gap-2 shrink-0 select-none">
      {/* 1. Upper Info & Support Actions Strip (Spans full width so buttons never overflow or get squished) */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap pb-1.5 border-b border-[#f1f3f1]">
        {/* Cart Meta (Invoice #, Count, Discount, Customer) - Redundant total removed as requested */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <div className="flex items-center gap-1 font-bold">
            <span className="text-[#0f172a]">فاتورة:</span>
            <span className="text-[11px] font-mono font-bold text-[#006d41] bg-[#eaf5ee] border border-[#c4e3d0] px-2 py-0.5 rounded-md shadow-2xs">
              #{nextExpectedInvoiceNumber || (lastInvoiceNumber ? lastInvoiceNumber + 1 : '1')}
            </span>
          </div>

          <span className="text-[11px] text-[#52605d] font-semibold bg-[#f8fafc] px-2 py-0.5 rounded-md border border-[#dce1dc]">
            {cart.length} أصناف ({totalItemCount} قطعة)
          </span>

          {discountPiasters > 0 && (
            <span className="text-[11px] text-[#b23a2e] font-bold bg-[#fdf3f2] px-2 py-0.5 rounded-md border border-[#f6cbc6]">
              خصم: -{formatArabicCurrency(discountPiasters)}
            </span>
          )}

          {selectedCust && (
            <div className="flex items-center gap-1 text-[11px] font-bold text-[#006d41] bg-[#eaf5ee] px-2 py-0.5 rounded-md border border-[#c4e3d0]">
              <UserCheck className="w-3 h-3" />
              <span className="truncate max-w-[120px]">{selectedCust.name}</span>
            </div>
          )}
        </div>

        {/* Support Action Buttons (جديدة, تعليق, معلقة, مرتجع) */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* جديدة [F7] */}
          <button 
            type="button"
            onClick={requestClearCart}
            disabled={cart.length === 0}
            className="h-7 sm:h-8 px-2 bg-white hover:bg-[#fdf3f2] text-[#b23a2e] disabled:text-[#52605d]/60 border border-[#f6cbc6] disabled:border-[#dce1dc] text-[10.5px] sm:text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 whitespace-nowrap"
            title="تفريغ السلة وفاتورة جديدة (F7)"
          >
            <RotateCcw className="w-3 h-3 shrink-0" />
            <span>جديدة F7</span>
          </button>

          {/* تعليق [F6] */}
          <button
            type="button"
            onClick={() => void handleHoldCurrentSale()}
            disabled={cart.length === 0}
            className="h-7 sm:h-8 px-2 bg-white hover:bg-slate-50 text-[#0f172a] disabled:text-[#52605d]/60 border border-[#dce1dc] hover:border-[#006d41]/40 text-[10.5px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 whitespace-nowrap"
            title="تعليق السلة الحالية (F6)"
          >
            <Clock className="w-3 h-3 text-[#52605d] shrink-0" />
            <span>تعليق F6</span>
          </button>

          {/* معلقة */}
          <button
            type="button"
            onClick={onOpenHeldSales}
            className="h-7 sm:h-8 px-2 bg-white hover:bg-amber-50 text-[#0f172a] border border-[#dce1dc] hover:border-amber-400 text-[10.5px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
            title="عرض واسترجاع الفواتير المعلقة"
          >
            <span>معلقة</span>
            {heldSalesCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-white font-mono text-[9px] flex items-center justify-center font-bold shrink-0">
                {heldSalesCount}
              </span>
            )}
          </button>

          {/* مرتجع [F11] */}
          <button
            type="button"
            onClick={onOpenReturnModal}
            className="h-7 sm:h-8 px-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 hover:border-amber-400 text-[10.5px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
            title="تسجيل مرتجع مبيعات (F11)"
          >
            <Undo2 className="w-3 h-3 shrink-0 text-amber-700" />
            <span>مرتجع F11</span>
          </button>

          {/* الإيصال إذا كان متاحاً */}
          {lastCompletedSale && (
            <button 
              type="button"
              onClick={onOpenReceipt}
              className="h-7 sm:h-8 px-2 bg-white border border-[#dce1dc] hover:border-[#006d41]/50 hover:bg-[#eaf5ee] text-[#006d41] text-[10.5px] sm:text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer whitespace-nowrap"
              title="معاينة إيصال آخر فاتورة"
            >
              <Eye className="w-3 h-3 text-[#006d41] shrink-0" />
              <span>الإيصال</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Hero Section: Grand Total Card + Primary Payment Buttons */}
      <div className="flex flex-row items-stretch gap-2 min-h-[64px]">
        {/* Grand Total Hero Card ("المطلوب سداده") */}
        <div className="flex-1 min-w-[170px] bg-gradient-to-br from-[#00372d] via-[#004d3f] to-[#0b4f42] rounded-xl border border-[#0b4f42] px-3.5 py-2 flex flex-col justify-between shadow-[0_4px_12px_rgba(0,55,45,0.18)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#83bfaf]">المطلوب سداده</span>
            {showTaxes && totalTaxPiasters > 0 && (
              <span className="text-[10px] font-medium text-[#99f2bb]">
                (شامل الضريبة)
              </span>
            )}
            <span className="text-[11px] font-bold text-[#b1efdd]">جنيه مصري</span>
          </div>
          <div className="flex items-baseline justify-end pt-0.5">
            <span className="text-white text-2xl sm:text-[28px] leading-tight font-black font-mono tabular-nums tracking-tight">
              {formatArabicCurrency(netTotalPiasters)}
            </span>
          </div>
        </div>

        {/* Primary Checkout Triggers (نقدى / طباعة / آجل) */}
        <div className="flex-1 min-w-[160px] flex items-stretch">
          {paymentMethod === 'credit' ? (
            /* آجل [F12] */
            <button 
              type="button"
              onClick={() => handleOpenCheckout('credit')}
              disabled={loading || cart.length === 0}
              className="w-full h-full bg-[#b23a2e] hover:bg-[#962f25] active:bg-[#7a251d] disabled:bg-[#f1f4f6] disabled:text-[#52605d] text-white rounded-xl px-3 flex items-center justify-between transition-all shadow-sm active:scale-[0.98] cursor-pointer"
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
            <div className="w-full grid grid-cols-2 gap-1.5">
              {/* نقدى [F9] */}
              <button 
                type="button"
                onClick={() => handleOpenCheckout('cash')}
                disabled={loading || cart.length === 0}
                className="h-full bg-[#004d3f] hover:bg-[#00372d] active:bg-[#002720] disabled:bg-[#f1f4f6] disabled:text-[#52605d]/60 text-white rounded-xl px-2 sm:px-3 flex flex-col justify-center items-center gap-0.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                title="سداد نقدي مباشر وحفظ الفاتورة (F9)"
              >
                <div className="flex items-center gap-1">
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <span className="text-xs sm:text-sm font-extrabold">نقدى</span>
                </div>
                <span className="text-[9.5px] font-mono bg-white/20 px-1.5 py-0.2 rounded text-white/90 font-bold">
                  F9
                </span>
              </button>

              {/* حفظ وطباعة [F12] */}
              <button 
                type="button"
                onClick={() => handleOpenCheckout('cash')}
                disabled={loading || cart.length === 0}
                className="h-full bg-[#006d41] hover:bg-[#005734] active:bg-[#003d24] disabled:bg-[#f1f4f6] disabled:text-[#52605d]/60 text-white rounded-xl px-2 sm:px-3 flex flex-col justify-center items-center gap-0.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                title="حفظ الفاتورة وطباعة الإيصال (F12)"
              >
                <div className="flex items-center gap-1">
                  <Printer className="w-4 h-4 shrink-0" />
                  <span className="text-xs sm:text-sm font-extrabold">طباعة</span>
                </div>
                <span className="text-[9.5px] font-mono bg-white/20 px-1.5 py-0.2 rounded text-white/90 font-bold">
                  F12
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


