import React from 'react';
import { 
  CreditCard, 
  Banknote,
  RotateCcw, 
  Clock, 
  Undo2,
  Receipt,
  Smartphone,
  Wallet,
  Link2,
  ShieldCheck,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { Customer } from '../../types/models';
import type { CartItem } from './types';
import type { InsuranceClaimLine } from '../../types/insurance';
import type { CartInteractionCheckResult } from '../../types/pharma';
import { formatArabicCurrency } from '../../utils/money';
import { useFeatures } from '../../context/useFeatures';

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
  handleHoldCurrentSale: () => Promise<void>;
  heldSalesCount: number;
  onOpenHeldSales: () => void;
  onOpenReturnModal: () => void;
  onOpenExpenseModal?: () => void;
  activeInsuranceClaim?: InsuranceClaimLine | null;
  onRemoveInsuranceClaim?: () => void;
  hasInstapayAccount?: boolean;
  hasWalletAccount?: boolean;
  onNavigateToWallets?: (subTab?: 'accounts' | 'transact') => void;
  ddiResult?: CartInteractionCheckResult | null;
  onOpenDdiAlert?: () => void;
  isDdiOverridden?: boolean;
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
  handleHoldCurrentSale,
  heldSalesCount,
  onOpenHeldSales,
  onOpenReturnModal,
  onOpenExpenseModal,
  activeInsuranceClaim,
  onRemoveInsuranceClaim,
  hasInstapayAccount = true,
  hasWalletAccount = true,
  onNavigateToWallets,
  ddiResult,
  onOpenDdiAlert,
  isDdiOverridden = false,
}) => {
  const { isEnabled } = useFeatures();
  const showWallets = isEnabled('feature_pos_digital_payments') || isEnabled('feature_digital_wallets');
  const selectedCust = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) : null;

  return (
    <div className="bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark shadow-[0_-2px_8px_rgba(0,0,0,0.03)] p-1.5 sm:p-2 flex flex-col gap-1.5 shrink-0 select-none">
      
      {/* 1. Upper Info & Support Actions Strip - Single neat non-wrapping row */}
      <div className="flex items-center justify-between gap-1 flex-nowrap pb-1 border-b border-line/60 dark:border-line-dark/60 overflow-x-auto no-scrollbar">
        
        {/* Cart Meta (Invoice #, Count, Discount, DDI status) */}
        <div className="flex items-center gap-1 text-xs shrink-0">
          <div className="flex items-center gap-1 font-bold">
            <span className="text-ink dark:text-ink-dark text-[11px]">فاتورة:</span>
            <span className="text-[10px] sm:text-[11px] font-mono font-bold text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 px-1.5 py-0.5 rounded-md shadow-2xs">
              #{nextExpectedInvoiceNumber || (lastInvoiceNumber ? lastInvoiceNumber + 1 : '1')}
            </span>
          </div>

          <span className="text-[10px] sm:text-[11px] text-ink dark:text-ink-dark font-bold bg-surface-2 dark:bg-surface-dark-3 px-2 py-0.5 rounded-md border border-line dark:border-line-dark/80 whitespace-nowrap">
            {cart.length} صنف ({totalItemCount} قطعة)
          </span>

          {discountPiasters > 0 && (
            <span className="text-[10px] sm:text-[11px] text-danger dark:text-danger-bright font-bold bg-danger-soft dark:bg-danger-dark-soft px-1.5 py-0.5 rounded-md border border-danger-border dark:border-danger-bright/30 whitespace-nowrap">
              خصم: -{formatArabicCurrency(discountPiasters)}
            </span>
          )}

          {/* DDI Clinical Status Pill */}
          {(isEnabled('feature_drug_interactions') || isEnabled('feature_pharmacy')) && cart.length >= 2 && ddiResult && (
            ddiResult.hasInteractions ? (
              <button
                type="button"
                onClick={onOpenDdiAlert}
                className={`h-6 px-2 rounded-md border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95 whitespace-nowrap shadow-2xs ${
                  ddiResult.maxSeverity === 'severe'
                    ? 'bg-danger-soft text-danger border-danger/40 animate-pulse hover:bg-danger-soft/80'
                    : ddiResult.maxSeverity === 'moderate'
                      ? 'bg-warn-soft text-warn border-warn/40 hover:bg-warn-soft/80'
                      : 'bg-brand-soft text-brand border-brand/40 hover:bg-brand-soft/80'
                }`}
                title="انقر لعرض تفاصيل التعارضات الدوائية والتدخل السريري"
              >
                <ShieldAlert className="w-3 h-3 shrink-0" />
                <span>
                  {ddiResult.maxSeverity === 'severe'
                    ? `تعارض حرج (${ddiResult.conflicts.length})${isDdiOverridden ? ' [معتمد]' : ''}`
                    : ddiResult.maxSeverity === 'moderate'
                      ? `تعارض متوسط (${ddiResult.conflicts.length})`
                      : `تداخل طفيف (${ddiResult.conflicts.length})`}
                </span>
              </button>
            ) : (
              <div
                className="h-6 px-2 rounded-md border border-paid/30 bg-paid-soft text-paid text-[10px] font-bold flex items-center gap-1 select-none whitespace-nowrap shadow-2xs"
                title="تم فحص السلة سريرياً: لا توجد تعارضات دوائية مسجلة بين الأصناف"
              >
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span>آمن دوائياً</span>
              </div>
            )
          )}
        </div>

        {/* Support Action Buttons (مصروف, تفريغ, تعليق, معلقة, مرتجع) */}
        <div className="flex items-center gap-1 shrink-0">

          {/* مصروف درج */}
          {onOpenExpenseModal && (
            <button
              type="button"
              onClick={onOpenExpenseModal}
              className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-surface dark:bg-surface-dark-2 hover:bg-danger-soft dark:hover:bg-danger-dark-soft text-danger dark:text-danger-bright border border-line dark:border-line-dark hover:border-danger/40 dark:hover:border-danger-bright/40 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
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
            className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-surface dark:bg-surface-dark-2 hover:bg-danger-soft dark:hover:bg-danger-dark-soft text-danger dark:text-danger-bright disabled:text-ink-muted/50 dark:disabled:text-ink-dark-muted/40 border border-danger-border dark:border-danger-bright/30 disabled:border-line dark:disabled:border-line-dark text-[10px] sm:text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 whitespace-nowrap"
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
            className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark disabled:text-ink-muted/50 dark:disabled:text-ink-dark-muted/40 border border-line dark:border-line-dark hover:border-brand-bright/40 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 whitespace-nowrap"
            title="تعليق الفاتورة الحالية (F6)"
          >
            <Clock className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted shrink-0" />
            <span>تعليق</span>
          </button>

          {/* فواتير معلقة */}
          <button
            type="button"
            onClick={onOpenHeldSales}
            className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-surface dark:bg-surface-dark-2 hover:bg-warn-soft dark:hover:bg-warn-dark-soft text-ink dark:text-ink-dark border border-line dark:border-line-dark hover:border-warn/30 dark:hover:border-warn-bright/30 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
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
            className="h-6.5 sm:h-7 px-1.5 sm:px-2 bg-warn-soft dark:bg-warn-dark-soft hover:bg-warn-soft/80 dark:hover:bg-warn-dark-soft/80 text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
            title="تسجيل مرتجع بضاعة (F11)"
          >
            <Undo2 className="w-3 h-3 shrink-0 text-warn dark:text-warn-bright" />
            <span>مرتجع</span>
          </button>

        </div>
      </div>

      {/* 1.5 Active Insurance Prescription Banner */}
      {activeInsuranceClaim && (
        <div className="flex items-center justify-between bg-paid-soft/80 dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 px-2 py-1 rounded-lg text-xs font-semibold text-paid dark:text-paid-bright">
          <div className="flex items-center gap-1.5 truncate">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-paid dark:text-paid-bright" />
            <span className="truncate">
              تأمين: {activeInsuranceClaim.companyName} ({activeInsuranceClaim.contractName}) - المشترك: {activeInsuranceClaim.patientName}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
            <span className="font-bold">تحمل: {formatArabicCurrency(activeInsuranceClaim.patientPiasters)}</span>
            <span className="opacity-40">|</span>
            <span className="font-bold">مطالبة: {formatArabicCurrency(activeInsuranceClaim.companyPiasters)}</span>
            {onRemoveInsuranceClaim && (
              <button
                type="button"
                onClick={onRemoveInsuranceClaim}
                className="text-danger dark:text-danger-bright hover:opacity-80 p-0.5 cursor-pointer"
                title="إلغاء التأمين من الفاتورة"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. Main Hero Section: Grand Total Card + Primary Payment Buttons */}
      <div className="flex flex-row items-stretch gap-1.5 sm:gap-2 h-[52px]">
        
        {/* Grand Total Hero Card ("المطلوب دفعه") - Sized proportionally as the largest card */}
        <div className="flex-[1.3] min-w-0 bg-gradient-to-br from-brand-dark via-brand to-brand-hover dark:from-[#0B4F42] dark:via-[#178068] dark:to-[#1D9A7E] rounded-xl border border-brand/80 dark:border-brand-bright/30 px-2.5 sm:px-3 py-1 flex flex-col justify-between shadow-[0_2px_8px_rgba(0,55,45,0.18)] select-none">
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
              className="w-full h-full bg-danger hover:bg-red-700 active:bg-red-800 disabled:bg-surface-2 dark:disabled:bg-surface-dark-3 disabled:text-ink-muted dark:disabled:text-ink-dark-muted/40 text-white rounded-xl px-3 sm:px-4 flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
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
                className="flex-1 min-w-0 h-full bg-brand hover:bg-brand-dark active:bg-brand-hover disabled:bg-surface-2 dark:disabled:bg-surface-dark-3 disabled:text-ink-muted/70 dark:disabled:text-ink-dark-muted/60 text-white rounded-xl px-2 py-1 flex flex-col justify-center items-center gap-0.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                title="دفع كاش وحساب الباقي (F9)"
              >
                <Banknote className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] sm:text-xs font-black truncate text-center leading-none">
                  كاش
                </span>
              </button>

              {/* انستاباي والمحافظ الإلكترونية */}
              {showWallets && (
                <>
                  <button 
                    type="button"
                    onClick={() => {
                      if (!hasInstapayAccount && onNavigateToWallets && cart.length === 0) {
                        onNavigateToWallets('accounts');
                      } else {
                        handleOpenCheckout('instapay');
                      }
                    }}
                    disabled={loading || cart.length === 0}
                    className="relative flex-1 min-w-0 h-full bg-[#582C83] hover:bg-[#49226e] active:bg-[#3b195a] disabled:bg-surface-2 dark:disabled:bg-surface-dark-3 disabled:text-ink-muted/70 dark:disabled:text-ink-dark-muted/60 text-white rounded-xl px-2 py-1 flex flex-col justify-center items-center gap-0.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                    title={hasInstapayAccount ? "سداد عبر تطبيق انستاباي" : "سداد فوري عبر تطبيق انستاباي"}
                  >
                    {!hasInstapayAccount && onNavigateToWallets && cart.length === 0 && (
                      <span className="absolute top-1 left-1.5 px-1 py-0.5 bg-black/15 dark:bg-white/20 text-current text-[8px] font-black rounded-md border border-current/20 flex items-center gap-0.5 shadow-2xs leading-none">
                        <Link2 className="w-2 h-2 text-current" />
                        <span>ربط</span>
                      </span>
                    )}
                    <Smartphone className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[11px] sm:text-xs font-black truncate text-center leading-none">
                      انستاباي
                    </span>
                  </button>

                  <button 
                    type="button"
                    onClick={() => {
                      if (!hasWalletAccount && onNavigateToWallets && cart.length === 0) {
                        onNavigateToWallets('accounts');
                      } else {
                        handleOpenCheckout('vodafone_cash');
                      }
                    }}
                    disabled={loading || cart.length === 0}
                    className="relative flex-1 min-w-0 h-full bg-[#D92D20] hover:bg-[#B42318] active:bg-[#912018] disabled:bg-surface-2 dark:disabled:bg-surface-dark-3 disabled:text-ink-muted/70 dark:disabled:text-ink-dark-muted/60 text-white rounded-xl px-2 py-1 flex flex-col justify-center items-center gap-0.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                    title={hasWalletAccount ? "سداد عبر المحفظة الإلكترونية (فودافون كاش، أورانج، اتصالات، وي)" : "سداد فوري عبر المحفظة الإلكترونية"}
                  >
                    {!hasWalletAccount && onNavigateToWallets && cart.length === 0 && (
                      <span className="absolute top-1 left-1.5 px-1 py-0.5 bg-black/15 dark:bg-white/20 text-current text-[8px] font-black rounded-md border border-current/20 flex items-center gap-0.5 shadow-2xs leading-none">
                        <Link2 className="w-2 h-2 text-current" />
                        <span>ربط</span>
                      </span>
                    )}
                    <Wallet className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[11px] sm:text-xs font-black truncate text-center leading-none">
                      محفظة
                    </span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  );
};
