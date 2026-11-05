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
  Tag,
  X,
  Lock,
} from 'lucide-react';
import type { Customer } from '../../types/models';
import type { CartItem } from './types';
import type { InsuranceClaimLine } from '../../types/insurance';
import type { CartInteractionCheckResult } from '../../types/pharma';
import { formatArabicCurrency } from '../../utils/money';
import { useFeatures } from '../../context/useFeatures';
import { usePermission } from '../../utils/usePermission';

// Shared look of the secondary action row (h-11, readable label, tokens only); icons drop below xl so five buttons fit one row.
const SECONDARY_BTN =
  'h-11 flex-1 min-w-[4.5rem] px-2 xl:px-3 rounded-lg border text-sm font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shadow-2xs transition-colors cursor-pointer active:scale-95 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100';
const SECONDARY_ICON = 'w-4 h-4 shrink-0 max-xl:hidden';
const SECONDARY_NEUTRAL =
  'bg-surface dark:bg-surface-dark-2 text-ink dark:text-ink-dark border-line dark:border-line-dark enabled:hover:bg-surface-2 dark:enabled:hover:bg-surface-dark-3 enabled:hover:border-line-hover dark:enabled:hover:border-line-dark-hover';
const SECONDARY_DISABLED =
  'disabled:bg-surface-2 disabled:border-line disabled:text-ink-muted dark:disabled:bg-surface-dark-2 dark:disabled:border-line-dark dark:disabled:text-ink-dark-muted';

// Payment triggers: min-h-14, disabled reads as an inert dashed outline (not just faded).
const PAY_BTN =
  'group relative flex-1 min-w-0 min-h-14 px-3 rounded-xl border-2 flex items-center justify-center gap-2 text-base font-semibold whitespace-nowrap shadow-sm transition-colors cursor-pointer active:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 disabled:border-dashed disabled:bg-surface-2 disabled:border-line disabled:text-ink-muted dark:disabled:bg-surface-dark-2 dark:disabled:border-line-dark dark:disabled:text-ink-dark-muted';
const PAY_OUTLINE =
  'bg-surface dark:bg-surface-dark-2 text-ink dark:text-ink-dark border-brand dark:border-brand-bright/60 enabled:hover:bg-brand-soft dark:enabled:hover:bg-brand-dark-soft';
const PAY_SOLID =
  'bg-paid text-white border-paid-hover dark:border-paid-bright/50 enabled:hover:bg-paid-hover';
const PAY_ICON = 'w-5 h-5 shrink-0';
const PAY_ICON_BRAND = `${PAY_ICON} group-enabled:text-brand dark:group-enabled:text-brand-bright`;
const LINK_BADGE =
  'absolute -top-2.5 start-2 px-1.5 py-0.5 bg-warn-soft dark:bg-warn-dark-soft text-warn dark:text-warn-bright text-micro font-bold rounded-md border border-warn-border dark:border-warn-bright/40 flex items-center gap-0.5 shadow-2xs leading-none';

/** Sales are blocked until a shift is open; the bar shows the notice and guards the payment buttons. */
export interface ShiftBlockNotice {
  message: string;
  canOpenShift: boolean;
  isFlashing: boolean;
  onOpenShift: () => void;
  /** A click on a disabled payment button still tells the cashier why nothing happened. */
  onBlockedAttempt: () => void;
}

interface PayButtonGuardProps {
  notice: ShiftBlockNotice | null | undefined;
  children: React.ReactNode;
}

const PayButtonGuard: React.FC<PayButtonGuardProps> = ({ notice, children }) => (
  <div className="relative flex-1 min-w-0 flex">
    {children}
    {notice && (
      <div
        className="absolute inset-0 rounded-xl cursor-not-allowed"
        title={notice.message}
        onClick={notice.onBlockedAttempt}
      />
    )}
  </div>
);

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
  /** When given, the invoice discount becomes a button (same entry as F4); without it the chip is display-only. */
  onOpenInvoiceDiscount?: () => void;
  activeInsuranceClaim?: InsuranceClaimLine | null;
  onRemoveInsuranceClaim?: () => void;
  hasInstapayAccount?: boolean;
  hasWalletAccount?: boolean;
  onNavigateToWallets?: (subTab?: 'accounts' | 'transact') => void;
  ddiResult?: CartInteractionCheckResult | null;
  shiftBlock?: ShiftBlockNotice | null;
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
  onOpenInvoiceDiscount,
  activeInsuranceClaim,
  onRemoveInsuranceClaim,
  hasInstapayAccount = true,
  hasWalletAccount = true,
  onNavigateToWallets,
  ddiResult,
  shiftBlock,
}) => {
  const { isEnabled } = useFeatures();
  const canReturn = usePermission('returns.create');
  const showWallets = isEnabled('feature_pos_digital_payments') || isEnabled('feature_digital_wallets');
  const selectedCust = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) : null;
  // No account linked yet and nothing in the cart: the button becomes the shortcut to link one
  const needsInstapayLink = !hasInstapayAccount && Boolean(onNavigateToWallets) && cart.length === 0;
  const needsWalletLink = !hasWalletAccount && Boolean(onNavigateToWallets) && cart.length === 0;
  const totalLabel = formatArabicCurrency(netTotalPiasters, false);

  return (
    <div className="bg-surface dark:bg-surface-dark border-t border-line dark:border-line-dark shadow-[0_-2px_8px_rgba(0,0,0,0.03)] px-3 py-2.5 flex flex-col gap-2.5 shrink-0 select-none">
      
      {/* 1. Info strip (invoice, counters, alerts) then an evenly spread action row */}
      <div className="flex flex-col gap-2 pb-2.5 border-b border-line/60 dark:border-line-dark/60">
        
        {/* Cart Meta (Invoice #, Count, Discount, DDI status) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm shrink-0 min-h-8">
          <div className="flex items-center gap-2 font-semibold">
            <span className="text-ink-muted dark:text-ink-dark-muted text-sm font-semibold">فاتورة</span>
            <span className="text-sm font-mono font-bold tabular-nums text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark-soft border border-paid-border dark:border-paid/30 px-3 py-1 rounded-lg shadow-2xs">
              #{nextExpectedInvoiceNumber || (lastInvoiceNumber ? lastInvoiceNumber + 1 : '1')}
            </span>
          </div>

          <span className="text-sm text-ink-muted dark:text-ink-dark-muted font-semibold bg-surface-2 dark:bg-surface-dark-3 px-3 py-1 rounded-lg border border-line dark:border-line-dark/80 whitespace-nowrap flex items-center gap-1.5">
            <span className="text-sm font-bold tabular-nums text-ink dark:text-ink-dark">{cart.length}</span>
            <span>صنف</span>
            <span className="text-ink-muted dark:text-ink-dark-muted" aria-hidden="true">·</span>
            <span className="text-sm font-bold tabular-nums text-ink dark:text-ink-dark">{totalItemCount}</span>
            <span>قطعة</span>
          </span>

          {onOpenInvoiceDiscount ? (
            <button
              type="button"
              onClick={onOpenInvoiceDiscount}
              disabled={cart.length === 0}
              className={`h-8 px-3 rounded-lg border text-sm font-bold tabular-nums whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer transition-colors focus-visible:border-brand dark:focus-visible:border-brand-bright disabled:cursor-not-allowed disabled:bg-surface-2 disabled:border-line disabled:text-ink-muted dark:disabled:bg-surface-dark-2 dark:disabled:border-line-dark dark:disabled:text-ink-dark-muted ${
                discountPiasters > 0
                  ? 'text-danger dark:text-danger-bright bg-danger-soft dark:bg-danger-dark-soft border-danger-border dark:border-danger-bright/40 enabled:hover:bg-danger-soft/60 dark:enabled:hover:bg-danger-dark-soft/60'
                  : 'text-ink dark:text-ink-dark bg-surface dark:bg-surface-dark-2 border-line dark:border-line-dark enabled:hover:bg-surface-2 dark:enabled:hover:bg-surface-dark-3 enabled:hover:border-line-hover dark:enabled:hover:border-line-dark-hover'
              }`}
              title="إضافة أو تعديل خصم على إجمالي الفاتورة (F4)"
            >
              <Tag className="w-4 h-4 shrink-0" />
              <span>{discountPiasters > 0 ? `خصم: -${formatArabicCurrency(discountPiasters)}` : 'خصم على الفاتورة'}</span>
            </button>
          ) : (
            discountPiasters > 0 && (
              <span className="text-sm text-danger dark:text-danger-bright font-bold tabular-nums bg-danger-soft dark:bg-danger-dark-soft px-3 py-1 rounded-lg border border-danger-border dark:border-danger-bright/30 whitespace-nowrap">
                خصم: -{formatArabicCurrency(discountPiasters)}
              </span>
            )
          )}

          {/* DDI Clinical Status: conflicts are shown by the warning banner above the cart; only the all-clear state lives here */}
          {(isEnabled('feature_drug_interactions') || isEnabled('feature_pharmacy')) && cart.length >= 2 && ddiResult && !ddiResult.hasInteractions && (
            <div
              className="h-7 px-2.5 rounded-lg border border-paid/30 dark:border-paid-dark-border bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright text-xs font-semibold flex items-center gap-1.5 select-none whitespace-nowrap shadow-2xs"
              title="تم فحص السلة سريرياً: لا توجد تعارضات دوائية مسجلة بين الأصناف"
            >
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>آمن دوائياً</span>
            </div>
          )}
        </div>

        {/* Support Action Buttons (مصروف, تفريغ, تعليق, معلقة, مرتجع) */}
        <div className="flex flex-wrap items-stretch gap-2">

          {/* مصروف درج */}
          {onOpenExpenseModal && (
            <button
              type="button"
              onClick={onOpenExpenseModal}
              className={`${SECONDARY_BTN} ${SECONDARY_NEUTRAL}`}
              title="تسجيل مصروف نثريات طلع من الدرج"
            >
              <Receipt className={`${SECONDARY_ICON} text-ink-muted dark:text-ink-dark-muted`} />
              <span>مصروف</span>
            </button>
          )}

          {/* تفريغ [F7] */}
          <button 
            type="button"
            onClick={requestClearCart}
            disabled={cart.length === 0}
            className={`${SECONDARY_BTN} ${SECONDARY_DISABLED} bg-danger-soft dark:bg-danger-dark-soft text-danger dark:text-danger-bright border-danger-border dark:border-danger-bright/40 enabled:hover:bg-danger-soft/60 dark:enabled:hover:bg-danger-dark-soft/60 enabled:hover:border-danger dark:enabled:hover:border-danger-bright`}
            title="تفريغ السلة وفاتورة جديدة (F7)"
          >
            <RotateCcw className={SECONDARY_ICON} />
            <span>تفريغ</span>
          </button>

          {/* تعليق [F6] */}
          <button
            type="button"
            onClick={() => void handleHoldCurrentSale()}
            disabled={cart.length === 0}
            className={`${SECONDARY_BTN} ${SECONDARY_DISABLED} ${SECONDARY_NEUTRAL}`}
            title="تعليق الفاتورة الحالية (F6)"
          >
            <Clock className={`${SECONDARY_ICON} text-ink-muted dark:text-ink-dark-muted`} />
            <span>تعليق</span>
          </button>

          {/* فواتير معلقة */}
          <button
            type="button"
            onClick={onOpenHeldSales}
            className={`${SECONDARY_BTN} ${SECONDARY_NEUTRAL}`}
            title="عرض واسترجاع الفواتير المعلقة"
          >
            <span>معلقة</span>
            {heldSalesCount > 0 && (
              <span className="min-w-6 h-6 px-1.5 rounded-full bg-warn text-white dark:bg-warn-bright dark:text-surface-dark font-mono text-xs tabular-nums flex items-center justify-center font-bold shrink-0">
                {heldSalesCount}
              </span>
            )}
          </button>

          {/* مرتجع [F11] */}
          {canReturn && (
          <button
            type="button"
            onClick={onOpenReturnModal}
            className={`${SECONDARY_BTN} bg-warn-soft dark:bg-warn-dark-soft enabled:hover:bg-warn-soft/70 dark:enabled:hover:bg-warn-dark-soft/70 text-ink dark:text-ink-dark border-warn-border dark:border-warn-bright/40`}
            title="تسجيل مرتجع بضاعة (F11)"
          >
            <Undo2 className={`${SECONDARY_ICON} text-warn dark:text-warn-bright`} />
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

      {/* 1.8 No open shift: persistent, actionable notice right above the payment buttons */}
      {shiftBlock && (
        <div
          role="alert"
          className={`flex items-center gap-3 rounded-xl border px-3 py-2 bg-warn-soft dark:bg-warn-dark-soft border-warn-border dark:border-warn-bright/40 transition-shadow ${
            shiftBlock.isFlashing ? 'ring-2 ring-danger dark:ring-danger-bright animate-pulse' : ''
          }`}
        >
          <Lock className="w-5 h-5 shrink-0 text-warn dark:text-warn-bright" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink dark:text-ink-dark">{shiftBlock.message}</div>
            <div className="text-xs font-medium text-ink-muted dark:text-ink-dark-muted">
              {shiftBlock.canOpenShift ? 'افتح الوردية الأول وبعدها كمّل البيع.' : 'اطلب من المدير أو المالك يفتح وردية.'}
            </div>
          </div>
          {shiftBlock.canOpenShift && (
            <button
              type="button"
              onClick={shiftBlock.onOpenShift}
              className="h-10 px-4 shrink-0 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-bold shadow-2xs active:scale-[0.98] transition-colors cursor-pointer"
            >
              فتح وردية
            </button>
          )}
        </div>
      )}

      {/* 2. Hero: Grand Total Card (dominant) above the primary payment buttons */}
      <div className="flex flex-col gap-2.5">
        {/* Grand Total Hero Card ("المطلوب دفعه") */}
        <div className="min-w-0 min-h-16 bg-gradient-to-br from-brand-dark via-brand to-brand-hover dark:from-brand-dark dark:via-brand dark:to-brand-container rounded-xl border border-brand dark:border-brand-bright/40 px-4 py-2.5 flex items-center justify-between gap-3 shadow-[0_2px_8px_rgba(0,55,45,0.18)] select-none">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-base font-semibold text-white">المطلوب دفعه</span>
            {showTaxes && totalTaxPiasters > 0 && <span className="text-xs font-medium text-white/80">(شامل الضريبة)</span>}
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className={`text-white ${totalLabel.length > 10 ? 'text-2xl' : totalLabel.length > 8 ? 'text-3xl' : 'text-4xl'} font-black font-mono tracking-tight tabular-nums whitespace-nowrap leading-none`}>
              {totalLabel}
            </span>
            <span className="text-sm font-bold text-white/80 shrink-0">ج.م</span>
          </div>
        </div>

        {/* Primary Checkout Triggers (كاش / انستاباي / محفظة / شكك) */}
        <div className="flex items-stretch gap-3">
          {paymentMethod === 'credit' ? (
            /* شكك */
            <PayButtonGuard notice={shiftBlock}>
              <button 
                type="button"
                onClick={() => handleOpenCheckout('credit')}
                disabled={loading || cart.length === 0 || Boolean(shiftBlock)}
                className={`${PAY_BTN} bg-danger text-white border-danger-ink dark:bg-danger-dark-fill dark:border-danger-bright/50 enabled:hover:bg-danger-ink dark:enabled:hover:bg-danger`}
                title="تسجيل بيع شكك (F12)"
              >
                <CreditCard className={PAY_ICON} />
                <span className="truncate">
                  تسجيل بيع شكك {selectedCust ? `(${selectedCust.name})` : ''}
                </span>
              </button>
            </PayButtonGuard>
          ) : (
            <>
              {/* كاش */}
              <PayButtonGuard notice={shiftBlock}>
                <button 
                  type="button"
                  onClick={() => handleOpenCheckout('cash')}
                  disabled={loading || cart.length === 0 || Boolean(shiftBlock)}
                  className={`${PAY_BTN} ${PAY_SOLID}`}
                  title="دفع كاش وحساب الباقي (F9)"
                >
                  <Banknote className={PAY_ICON} />
                  <span className="truncate">كاش</span>
                </button>
              </PayButtonGuard>

              {/* انستاباي والمحافظ الإلكترونية */}
              {showWallets && (
                <>
                  <PayButtonGuard notice={needsInstapayLink ? null : shiftBlock}>
                    <button 
                      type="button"
                      onClick={() => {
                        if (needsInstapayLink) {
                          onNavigateToWallets?.('accounts');
                        } else {
                          handleOpenCheckout('instapay');
                        }
                      }}
                      disabled={loading || (cart.length === 0 && !needsInstapayLink) || (Boolean(shiftBlock) && !needsInstapayLink)}
                      className={`${PAY_BTN} ${PAY_OUTLINE}`}
                      title={hasInstapayAccount ? "سداد عبر تطبيق انستاباي" : "سداد فوري عبر تطبيق انستاباي"}
                    >
                      {needsInstapayLink && (
                        <span className={LINK_BADGE}>
                          <Link2 className="w-2.5 h-2.5 text-current" />
                          <span>ربط</span>
                        </span>
                      )}
                      <Smartphone className={PAY_ICON_BRAND} />
                      <span className="truncate">انستاباي</span>
                    </button>
                  </PayButtonGuard>

                  <PayButtonGuard notice={needsWalletLink ? null : shiftBlock}>
                    <button 
                      type="button"
                      onClick={() => {
                        if (needsWalletLink) {
                          onNavigateToWallets?.('accounts');
                        } else {
                          handleOpenCheckout('vodafone_cash');
                        }
                      }}
                      disabled={loading || (cart.length === 0 && !needsWalletLink) || (Boolean(shiftBlock) && !needsWalletLink)}
                      className={`${PAY_BTN} ${PAY_OUTLINE}`}
                      title={hasWalletAccount ? "سداد عبر المحفظة الإلكترونية (فودافون كاش، أورانج، اتصالات، وي)" : "سداد فوري عبر المحفظة الإلكترونية"}
                    >
                      {needsWalletLink && (
                        <span className={LINK_BADGE}>
                          <Link2 className="w-2.5 h-2.5 text-current" />
                          <span>ربط</span>
                        </span>
                      )}
                      <Wallet className={PAY_ICON_BRAND} />
                      <span className="truncate">محفظة</span>
                    </button>
                  </PayButtonGuard>
                </>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  );
};
