import React from 'react';
import { 
  CreditCard, 
  Banknote,
  RotateCcw, 
  Eye, 
  Clock, 
  Undo2,
  Receipt,
  Smartphone,
  Wallet
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
  selectedCustomerId?: string;
  paymentMethod: 'cash' | 'credit';
  customers?: Customer[];
  netTotalPiasters: number;
  loading: boolean;
  handleOpenCheckout: (forcedMethod?: 'cash' | 'credit' | 'instapay' | 'vodafone_cash') => void;
  handleInstapayCheckout?: () => Promise<void>;
  handleVodafoneCashCheckout?: () => Promise<void>;
  requestClearCart: () => void;
  lastCompletedSale: Sale | null;
  onOpenReceipt: () => void;
  handleHoldCurrentSale: () => Promise<void>;
  heldSalesCount: number;
  onOpenHeldSales: () => void;
  onOpenReturnModal: () => void;
  onOpenExpenseModal?: () => void;
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
  customers = [],
  netTotalPiasters,
  loading,
  handleOpenCheckout,
  handleInstapayCheckout: _handleInstapayCheckout,
  handleVodafoneCashCheckout: _handleVodafoneCashCheckout,
  requestClearCart,
  lastCompletedSale,
  onOpenReceipt,
  handleHoldCurrentSale,
  heldSalesCount,
  onOpenHeldSales,
  onOpenReturnModal,
  onOpenExpenseModal,
}) => {
  const selectedCust = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) : null;

  return (
    <div className="bg-surface border-t border-line shadow-[0_-2px_8px_rgba(0,0,0,0.03)] p-1.5 sm:p-2 flex flex-col gap-1.5 shrink-0 select-none">
      
      {/* 1. Upper Info & Support Actions Strip - Single neat non-wrapping row */}
      <div className="flex items-center justify-between gap-1 flex-nowrap pb-1 border-b border-line/60 overflow-x-auto no-scrollbar">
        
        {/* Cart Meta (Invoice #, Count, Discount) */}
        <div className="flex items-center gap-1 text-xs shrink-0">
          <div className="flex items-center gap-1 font-bold">
            <span className="text-ink text-[11px]">فاتورة:</span>
            <span className="text-[10px] sm:text-[11px] font-mono font-bold text-paid bg-paid-soft border border-paid-border px-1.5 py-0.5 rounded-md shadow-2xs">
              #{nextExpectedInvoiceNumber || (lastInvoiceNumber ? lastInvoiceNumber + 1 : '1')}
            </span>
          </div>

          <span className="text-[10px] sm:text-[11px] text-ink-muted font-semibold bg-surface-2 px-1.5 py-0.5 rounded-md border border-line whitespace-nowrap">
            {cart.length} صنف ({totalItemCount} قطعة)
          </span>

          {discountPiasters > 0 && (
            <span className="text-[10px] sm:text-[11px] text-danger font-bold bg-danger-soft px-1.5 py-0.5 rounded-md border border-danger-border whitespace-nowrap">
              خصم: -{formatArabicCurrency(discountPiasters)}
            </span>
          )}
        </div>

        {/* Support Action Buttons (مصروف, تفريغ, تعليق, معلقة, مرتجع, وصل) */}
        <div className="flex items-center gap-1 shrink-0">
          {/* مصروف درج */}
          {onOpenExpenseModal && (
            <button
              type="button"
              onClick={onOpenExpenseModal}
              className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-surface hover:bg-rose-50 text-danger border border-line hover:border-danger/30 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
              title="تسجيل مصروف نثريات طلع من الدرج"
            >
              <Receipt className="w-3 h-3 shrink-0" />
              <span>مصروف</span>
            </button>
          )}

          {/* تفريغ [F7] */}
          <button 
            type="button"
            onClick={requestClearCart}
            disabled={cart.length === 0}
            className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-surface hover:bg-danger-soft text-danger disabled:text-ink-muted/50 border border-danger-border disabled:border-line text-[10px] sm:text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 whitespace-nowrap"
            title="تفريغ السلة وفاتورة جديدة (F7)"
          >
            <RotateCcw className="w-3 h-3 shrink-0" />
            <span>تفريغ</span>
          </button>

          {/* تعليق [F6] */}
          <button
            type="button"
            onClick={() => void handleHoldCurrentSale()}
            disabled={cart.length === 0}
            className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-surface hover:bg-surface-2 text-ink disabled:text-ink-muted/50 border border-line hover:border-paid/40 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 whitespace-nowrap"
            title="تعليق الفاتورة الحالية (F6)"
          >
            <Clock className="w-3 h-3 text-ink-muted shrink-0" />
            <span>تعليق</span>
          </button>

          {/* فواتير معلقة */}
          <button
            type="button"
            onClick={onOpenHeldSales}
            className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-surface hover:bg-warn-soft text-ink border border-line hover:border-warn text-[10px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
            title="عرض واسترجاع الفواتير المعلقة"
          >
            <span>معلقة</span>
            {heldSalesCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-warn text-white font-mono text-[9px] flex items-center justify-center font-bold shrink-0">
                {heldSalesCount}
              </span>
            )}
          </button>

          {/* مرتجع [F11] */}
          <button
            type="button"
            onClick={onOpenReturnModal}
            className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-warn-soft hover:bg-amber-100 text-amber-900 border border-warn-border text-[10px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
            title="تسجيل مرتجع بضاعة (F11)"
          >
            <Undo2 className="w-3 h-3 shrink-0 text-amber-700" />
            <span>مرتجع</span>
          </button>

          {/* الإيصال إذا كان متاحاً */}
          {lastCompletedSale && (
            <button 
              type="button"
              onClick={onOpenReceipt}
              className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-surface border border-line hover:border-paid/50 hover:bg-paid-soft text-paid text-[10px] sm:text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer whitespace-nowrap"
              title="معاينة وطباعة وصل آخر فاتورة"
            >
              <Eye className="w-3 h-3 text-paid shrink-0" />
              <span>وصل</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Hero Section: Grand Total Card + Primary Payment Buttons */}
      <div className="flex flex-row items-stretch gap-1.5 sm:gap-2 h-[52px]">
        
        {/* Grand Total Hero Card ("المطلوب دفعه") - Sized proportionally as the largest card */}
        <div className="flex-[1.3] min-w-0 bg-gradient-to-br from-brand-dark via-brand to-brand-hover rounded-xl border border-brand/80 px-2.5 sm:px-3 py-1 flex flex-col justify-between shadow-[0_2px_8px_rgba(0,55,45,0.18)] select-none">
          <div className="flex items-center justify-between leading-none">
            <span className="text-[10px] sm:text-[11px] font-bold text-emerald-200">المطلوب دفعه</span>
            {showTaxes && totalTaxPiasters > 0 ? (
              <span className="text-[9px] font-medium text-emerald-300">
                (شامل)
              </span>
            ) : (
              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-100">ج.م</span>
            )}
          </div>
          <div className="flex items-baseline justify-end leading-none pt-0.5">
            <span className="text-white text-xl sm:text-[23px] font-black font-mono tracking-tight tabular-nums truncate">
              {formatArabicCurrency(netTotalPiasters)}
            </span>
          </div>
        </div>

        {/* Primary Checkout Triggers (كاش / انستاباي / محافظ / شكك) - Evenly balanced */}
        <div className="flex-[2.7] min-w-0 flex items-stretch gap-1 sm:gap-1.5">
          {paymentMethod === 'credit' ? (
            /* شكك */
            <button 
              type="button"
              onClick={() => handleOpenCheckout('credit')}
              disabled={loading || cart.length === 0}
              className="w-full h-full bg-danger hover:bg-red-700 active:bg-red-800 disabled:bg-surface-2 disabled:text-ink-muted text-white rounded-xl px-3 sm:px-4 flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
              title="تسجيل بيع شكك (F12)"
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              <span className="text-xs sm:text-sm font-bold truncate">
                تسجيل بيع شكك {selectedCust ? `(${selectedCust.name})` : ''}
              </span>
            </button>
          ) : (
            <>
              {/* كاش */}
              <button 
                type="button"
                onClick={() => handleOpenCheckout('cash')}
                disabled={loading || cart.length === 0}
                className="flex-1 min-w-0 h-full bg-brand hover:bg-brand-dark active:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted/50 text-white rounded-xl px-2 py-1 flex flex-col justify-center items-center gap-0.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                title="دفع كاش وحساب الباقي (F9)"
              >
                <Banknote className="w-3.5 h-3.5 shrink-0 text-white/90" />
                <span className="text-[11px] sm:text-xs font-black truncate text-center leading-none">
                  كاش
                </span>
              </button>

              {/* انستاباي */}
              <button 
                type="button"
                onClick={() => handleOpenCheckout('instapay')}
                disabled={loading || cart.length === 0}
                className="flex-1 min-w-0 h-full bg-[#582C83] hover:bg-[#462269] active:bg-[#371954] disabled:bg-surface-2 disabled:text-ink-muted/50 text-white rounded-xl px-2 py-1 flex flex-col justify-center items-center gap-0.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                title="سداد عبر تطبيق انستاباي"
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0 text-white/90" />
                <span className="text-[11px] sm:text-xs font-black truncate text-center leading-none">
                  انستاباي
                </span>
              </button>

              {/* محفظة إلكترونية (فودافون، أورانج، اتصالات، وي) */}
              <button 
                type="button"
                onClick={() => handleOpenCheckout('vodafone_cash')}
                disabled={loading || cart.length === 0}
                className="flex-1 min-w-0 h-full bg-[#e60000] hover:bg-[#cc0000] active:bg-[#b30000] disabled:bg-surface-2 disabled:text-ink-muted/50 text-white rounded-xl px-2 py-1 flex flex-col justify-center items-center gap-0.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                title="سداد عبر المحفظة الإلكترونية (فودافون كاش، أورانج، اتصالات، وي)"
              >
                <Wallet className="w-3.5 h-3.5 shrink-0 text-white/90" />
                <span className="text-[11px] sm:text-xs font-black truncate text-center leading-none">
                  محفظة
                </span>
              </button>
            </>
          )}
        </div>
      </div>

    </div>
  );
};
