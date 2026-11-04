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
  X,
} from 'lucide-react';
import type { Customer } from '../../types/models';
import type { CartItem } from './types';
import type { InsuranceClaimLine } from '../../types/insurance';
import type { CartInteractionCheckResult } from '../../types/pharma';
import { formatArabicCurrency } from '../../utils/money';
import { useFeatures } from '../../context/useFeatures';
import { usePermission } from '../../utils/usePermission';

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
}) => {
  const { isEnabled } = useFeatures();
  const canReturn = usePermission('returns.create');
  const showWallets = isEnabled('feature_pos_digital_payments') || isEnabled('feature_digital_wallets');
  const selectedCust = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) : null;
  const totalLabel = formatArabicCurrency(netTotalPiasters, false);

  return (
    <div className="bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark shadow-[0_-2px_8px_rgba(0,0,0,0.03)] p-1.5 sm:p-2 flex flex-col gap-1.5 shrink-0 select-none">
      
      {/* 1. Info strip (invoice, counters, alerts) then an evenly spread action row - nothing hides behind a scrollbar */}
      <div className="flex flex-col gap-1.5 pb-1.5 border-b border-line/60 dark:border-line-dark/60">
        
        {/* Cart Meta (Invoice #, Count, Discount, DDI status) */}
        <div className="flex items-center gap-1.5 text-xs shrink-0 min-h-7 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 font-bold">
            <span className="text-ink-muted dark:text-ink-dark-muted text-xs">فاتورة</span>
            <span className="text-sm font-mono font-extrabold tabular-nums text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 px-2 py-0.5 rounded-lg shadow-2xs">
              #{nextExpectedInvoiceNumber || (lastInvoiceNumber ? lastInvoiceNumber + 1 : '1')}
            </span>
          </div>

          <span className="text-xs text-ink-muted dark:text-ink-dark-muted font-bold bg-surface-2 dark:bg-surface-dark-3 px-2.5 py-0.5 rounded-lg border border-line dark:border-line-dark/80 whitespace-nowrap flex items-center gap-1">
            <span className="text-sm font-extrabold tabular-nums text-ink dark:text-ink-dark">{cart.length}</span>
            <span>صنف</span>
            <span className="opacity-50">·</span>
            <span className="text-sm font-extrabold tabular-nums text-ink dark:text-ink-dark">{totalItemCount}</span>
            <span>قطعة</span>
          </span>

          {discountPiasters > 0 && (
            <span className="text-xs text-danger dark:text-danger-bright font-extrabold tabular-nums bg-danger-soft dark:bg-danger-dark-soft px-2 py-0.5 rounded-lg border border-danger-border dark:border-danger-bright/30 whitespace-nowrap">
              خصم: -{formatArabicCurrency(discountPiasters)}
            </span>
          )}

          {/* DDI Clinical Status: conflicts are shown by the warning banner above the cart; only the all-clear state lives here */}
          {(isEnabled('feature_drug_interactions') || isEnabled('feature_pharmacy')) && cart.length >= 2 && ddiResult && !ddiResult.hasInteractions && (
            <div
              className="h-6 px-2 rounded-md border border-paid/30 dark:border-paid-dark-border bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-micro font-bold flex items-center gap-1 select-none whitespace-nowrap shadow-2xs"
              title="تم فحص السلة سريرياً: لا توجد تعارضات دوائية مسجلة بين الأصناف"
            >
              <ShieldCheck className="w-3 h-3 shrink-0" />
              <span>آمن دوائياً</span>
            </div>
          )}
        </div>

        {/* Support Action Buttons (مصروف, تفريغ, تعليق, معلقة, مرتجع) */}
        <div className="flex items-stretch gap-1">

          {/* مصروف درج */}
          {onOpenExpenseModal && (
            <button
              type="button"
              onClick={onOpenExpenseModal}
              className="h-8 flex-1 min-w-0 px-2 bg-surface dark:bg-surface-dark-2 hover:bg-danger-soft dark:hover:bg-danger-dark-soft text-danger dark:text-danger-bright border border-line dark:border-line-dark hover:border-danger/40 dark:hover:border-danger-bright/40 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
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
            className="h-8 flex-1 min-w-0 px-2 bg-surface dark:bg-surface-dark-2 hover:bg-danger-soft dark:hover:bg-danger-dark-soft text-danger dark:text-danger-bright disabled:text-ink-muted/50 dark:disabled:text-ink-dark-muted/40 border border-danger-border dark:border-danger-bright/30 disabled:border-line dark:disabled:border-line-dark text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 whitespace-nowrap"
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
            className="h-8 flex-1 min-w-0 px-2 bg-surface dark:bg-surface-dark-2 hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark disabled:text-ink-muted/50 dark:disabled:text-ink-dark-muted/40 border border-line dark:border-line-dark hover:border-brand-bright/40 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 whitespace-nowrap"
            title="تعليق الفاتورة الحالية (F6)"
          >
            <Clock className="w-3 h-3 text-ink-muted dark:text-ink-dark-muted shrink-0" />
            <span>تعليق</span>
          </button>

          {/* فواتير معلقة */}
          <button
            type="button"
            onClick={onOpenHeldSales}
            className="h-8 flex-1 min-w-0 px-2 bg-surface dark:bg-surface-dark-2 hover:bg-warn-soft dark:hover:bg-warn-dark-soft text-ink dark:text-ink-dark border border-line dark:border-line-dark hover:border-warn/30 dark:hover:border-warn-bright/30 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
            title="عرض واسترجاع الفواتير المعلقة"
          >
            <span>معلقة</span>
            {heldSalesCount > 0 && (
              <span className="min-w-5 h-5 px-1 rounded-full bg-warn text-white dark:bg-warn-bright dark:text-surface-dark font-mono text-xs tabular-nums flex items-center justify-center font-extrabold shrink-0">
                {heldSalesCount}
              </span>
            )}
          </button>

          {/* مرتجع [F11] */}
          {canReturn && (
          <button
            type="button"
            onClick={onOpenReturnModal}
            className="h-8 flex-1 min-w-0 px-2 bg-warn-soft dark:bg-warn-dark-soft hover:bg-warn-soft/80 dark:hover:bg-warn-dark-soft/80 text-warn dark:text-warn-bright border border-warn/20 dark:border-warn-bright/30 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
            title="تسجيل مرتجع بضاعة (F11)"
          >
            <Undo2 className="w-3 h-3 shrink-0 text-warn dark:text-warn-bright" />
            <span>مرتجع</span>
          </button>
          )}

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
          <div className="flex items-center gap-2 shrink-0 font-mono text-micro">
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
      <div className="flex flex-row items-stretch gap-1.5 sm:gap-2 h-14">
        
        {/* Grand Total Hero Card ("المطلوب دفعه") - Sized proportionally as the largest card */}
        <div className="flex-[2] min-w-0 bg-gradient-to-br from-brand-dark via-brand to-brand-hover dark:from-[#0B4F42] dark:via-[#178068] dark:to-[#1D9A7E] rounded-xl border border-brand/80 dark:border-brand-bright/30 px-2.5 sm:px-3 py-1 flex flex-col justify-between shadow-[0_2px_8px_rgba(0,55,45,0.18)] select-none">
          <div className="flex items-center justify-between leading-none">
            <span className="text-xs font-bold text-emerald-200">المطلوب دفعه</span>
            <span className="flex items-center gap-1 text-xs font-bold text-emerald-100">
              {showTaxes && totalTaxPiasters > 0 && <span className="text-micro font-medium text-emerald-300">(شامل)</span>}
              <span>ج.م</span>
            </span>
          </div>
          <div className="flex items-baseline justify-end leading-none pt-0.5">
            <span className={`text-white ${totalLabel.length > 10 ? 'text-lg' : totalLabel.length > 8 ? 'text-xl' : 'text-2xl'} font-black font-mono tracking-tight tabular-nums whitespace-nowrap`}>
              {totalLabel}
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
                <span className="text-micro sm:text-xs font-black truncate text-center leading-none">
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
                      <span className="absolute top-1 left-1.5 px-1 py-0.5 bg-black/15 dark:bg-white/20 text-current text-micro font-black rounded-md border border-current/20 flex items-center gap-0.5 shadow-2xs leading-none">
                        <Link2 className="w-2 h-2 text-current" />
                        <span>ربط</span>
                      </span>
                    )}
                    <Smartphone className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-micro sm:text-xs font-black truncate text-center leading-none">
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
                      <span className="absolute top-1 left-1.5 px-1 py-0.5 bg-black/15 dark:bg-white/20 text-current text-micro font-black rounded-md border border-current/20 flex items-center gap-0.5 shadow-2xs leading-none">
                        <Link2 className="w-2 h-2 text-current" />
                        <span>ربط</span>
                      </span>
                    )}
                    <Wallet className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-micro sm:text-xs font-black truncate text-center leading-none">
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
