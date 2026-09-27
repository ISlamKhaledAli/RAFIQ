import React from 'react';
import { 
  UserCheck, 
  CreditCard, 
  Printer, 
  RotateCcw, 
  Eye 
} from 'lucide-react';
import type { Customer, Sale } from '../../types/models';
import type { CartItem } from './types';
import { formatArabicCurrency } from '../../utils/money';
import { MoneyInput } from '../../components/MoneyInput';
import { CustomSelect } from '../../components/CustomSelect';

interface PosCheckoutPanelProps {
  cart: CartItem[];
  nextExpectedInvoiceNumber: number | null;
  lastInvoiceNumber: number | null;
  totalItemCount: number;
  subtotalPiasters: number;
  discountPiasters: number;
  setDiscountPiasters: (val: number) => void;
  totalTaxPiasters: number;
  showTaxes: boolean;
  showCredit: boolean;
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
  paymentMethod: 'cash' | 'credit';
  setPaymentMethod: React.Dispatch<React.SetStateAction<'cash' | 'credit'>>;
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

export const PosCheckoutPanel: React.FC<PosCheckoutPanelProps> = ({
  cart,
  nextExpectedInvoiceNumber,
  lastInvoiceNumber,
  totalItemCount,
  subtotalPiasters,
  discountPiasters,
  setDiscountPiasters,
  totalTaxPiasters,
  showTaxes,
  showCredit,
  selectedCustomerId,
  setSelectedCustomerId,
  paymentMethod,
  setPaymentMethod,
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
  return (
    <section className="w-[23%] min-w-[210px] max-w-[280px] h-full bg-surface flex flex-col justify-between p-2.5 sm:p-3 select-none overflow-y-auto shrink-0">
      {/* Top Section: Line Breakdown */}
      <div className="flex flex-col gap-2">
        <div className="pb-1.5 hairline-b flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] sm:text-[13px] font-bold text-ink">ملخص الفاتورة</span>
            <span className="text-[10px] sm:text-[11px] font-mono font-bold text-brand bg-brand-soft border border-brand/20 px-1.5 py-0.5 rounded">
              #{nextExpectedInvoiceNumber || (lastInvoiceNumber ? lastInvoiceNumber + 1 : '1')}
            </span>
          </div>
          <span className="text-[10px] sm:text-[11px] font-mono text-ink-muted bg-surface-2 border border-line px-1.5 py-0.5 rounded">
            {cart.length} أصناف ({totalItemCount} ق)
          </span>
        </div>

        {/* Breakdown Rows */}
        <div className="flex justify-between items-center text-[12px] py-0.5">
          <span className="text-ink-muted">الإجمالي:</span>
          <span className="font-semibold text-ink font-mono tabular-nums">
            {formatArabicCurrency(subtotalPiasters)}
          </span>
        </div>

        <div className="flex justify-between items-center text-[12px] py-0.5 gap-2">
          <span className="text-danger font-semibold text-xs shrink-0">الخصم:</span>
          <div className="w-32">
            <MoneyInput
              valuePiasters={discountPiasters}
              onChangePiasters={setDiscountPiasters}
              className="h-[28px] sm:h-[30px] text-xs text-danger font-bold border-danger/40 focus:border-danger bg-danger-soft/20 text-right pr-2 pl-9"
            />
          </div>
        </div>

        {showTaxes && (
          <div className="flex justify-between items-center text-[10px] py-0.5 text-ink-muted border-t border-line">
            <span>الضريبة:</span>
            <span className="font-mono text-ink-muted">
              {totalTaxPiasters > 0
                ? `${formatArabicCurrency(totalTaxPiasters)} (مشمولة)`
                : '0.00 ج.م'}
            </span>
          </div>
        )}
      </div>

      {/* Customer & Debt Account Selector (Toggled by Feature #105) */}
      {showCredit && (
        <div className="bg-surface p-2 rounded border border-line flex flex-col gap-1 shrink-0 my-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-ink flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-brand" />
              <span>عميل الفاتورة:</span>
            </span>
            {selectedCustomerId && (() => {
              const cust = customers.find(c => c.id === selectedCustomerId);
              if (cust && cust.balancePiasters > 0) {
                return (
                  <span className="text-[9px] text-danger font-mono font-bold bg-danger-soft px-1 py-0.2 rounded border border-danger-border">
                    دين: {(cust.balancePiasters / 100).toFixed(0)} ج.م
                  </span>
                );
              }
              return null;
            })()}
          </div>

          <div className="flex gap-1">
            <CustomSelect
              value={selectedCustomerId}
              onChange={(val) => {
                setSelectedCustomerId(val);
                if (!val) setPaymentMethod('cash');
              }}
              options={[
                { value: '', label: 'عميل نقدي عام (بدون حساب)' },
                ...customers.map((c) => ({
                  value: c.id,
                  label: `${c.name} ${c.phone ? `(${c.phone})` : ''} ${c.balancePiasters > 0 ? `[دين: ${(c.balancePiasters / 100).toFixed(0)}]` : ''}`
                }))
              ]}
              className="flex-1 min-w-0"
              size="sm"
              searchable
            />

            {selectedCustomerId && (
              <div className="flex bg-surface-2 p-0.5 rounded border border-line text-[10px] shrink-0">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`px-1.5 py-0.5 rounded font-semibold ${paymentMethod === 'cash' ? 'bg-surface text-ink font-bold shadow-xs' : 'text-ink-muted'}`}
                >
                  نقدي
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('credit')}
                  className={`px-1.5 py-0.5 rounded font-semibold ${paymentMethod === 'credit' ? 'bg-danger-soft text-danger font-bold border border-danger-border' : 'text-ink-muted'}`}
                >
                  آجل
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Section: Hero Grand Total + Action Triggers */}
      <div className="flex flex-col gap-2 shrink-0">
        {/* Grand Total Solid Dark Bar (#14181A, Egyptian Pound) */}
        <div className="w-full bg-[#14181A] rounded-[6px] border border-[#2D3331] p-2 sm:p-2.5 flex flex-col justify-between shadow-sm shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-semibold text-[#8FA69C]">المطلوب سداده</span>
            {totalTaxPiasters > 0 && (
              <span className="text-[9px] font-medium text-emerald-400">
                (شامل الضريبة)
              </span>
            )}
            <span className="text-[10px] sm:text-[11px] font-medium text-[#DCE1DC]">جنيه</span>
          </div>
          <div className="flex items-baseline justify-end pt-0.5">
            <span className="text-white text-[22px] sm:text-[26px] leading-tight font-bold font-mono tabular-nums tracking-tight">
              {formatArabicCurrency(netTotalPiasters)}
            </span>
          </div>
        </div>

        {/* Main Action Buttons Grid */}
        <div className="grid grid-cols-2 gap-1.5 shrink-0">
          {paymentMethod === 'credit' ? (
            /* آجل [F9 / F12] */
            <button 
              type="button"
              onClick={() => handleOpenCheckout('credit')}
              disabled={loading || cart.length === 0}
              className="col-span-2 h-[42px] sm:h-[46px] bg-danger hover:bg-red-700 active:bg-red-800 disabled:bg-surface-2 disabled:text-ink-muted disabled:border disabled:border-line text-white rounded-[6px] px-2 flex items-center justify-between transition-colors shadow-sm"
            >
              <div className="flex items-center gap-1 min-w-0">
                <CreditCard className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[11px] sm:text-[12px] font-bold truncate">تسجيل بيع آجل</span>
              </div>
              <span className="text-[9px] font-mono bg-white/20 px-1.5 py-0.5 rounded text-white font-bold shrink-0">
                F12
              </span>
            </button>
          ) : (
            <>
              {/* نقدي [F9] */}
              <button 
                type="button"
                onClick={() => handleOpenCheckout('cash')}
                disabled={loading || cart.length === 0}
                className="h-[42px] sm:h-[46px] bg-brand hover:bg-brand-hover active:bg-brand-dark disabled:bg-surface-2 disabled:text-ink-muted disabled:border disabled:border-line text-white rounded-[6px] px-1.5 sm:px-2 flex items-center justify-between transition-colors shadow-sm"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <CreditCard className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] sm:text-[12px] font-bold truncate">نقدى</span>
                </div>
                <span className="text-[8px] sm:text-[9px] font-mono bg-white/20 px-1 py-0.5 rounded text-white font-bold shrink-0">
                  F9
                </span>
              </button>

              {/* حفظ وطباعة [F12] */}
              <button 
                type="button"
                onClick={() => handleOpenCheckout('cash')}
                disabled={loading || cart.length === 0}
                className="h-[42px] sm:h-[46px] bg-paid hover:bg-[#15633E] active:bg-[#0E492C] disabled:bg-surface-2 disabled:text-ink-muted disabled:border disabled:border-line text-white rounded-[6px] px-1.5 sm:px-2 flex items-center justify-between transition-colors shadow-sm"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] sm:text-[12px] font-bold truncate">طباعة</span>
                </div>
                <span className="text-[8px] sm:text-[9px] font-mono bg-white/20 px-1 py-0.5 rounded text-white font-bold shrink-0">
                  F12
                </span>
              </button>
            </>
          )}
        </div>

        {/* Void / Clear Cart Button & Last Receipt Preview */}
        <div className="flex gap-1.5">
          <button 
            type="button"
            onClick={requestClearCart}
            disabled={cart.length === 0}
            className="flex-1 h-[32px] sm:h-[34px] bg-surface hover:bg-danger-soft text-danger disabled:text-ink-muted border border-danger disabled:border-line text-[11px] font-bold rounded flex items-center justify-center gap-1 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>فاتورة جديدة (F7)</span>
          </button>

          {lastCompletedSale && (
            <button 
              type="button"
              onClick={onOpenReceipt}
              className="px-2 h-[32px] sm:h-[34px] bg-surface border border-line hover:bg-surface-2 text-ink text-[11px] font-semibold rounded flex items-center gap-1 transition-colors"
              title="معاينة إيصال آخر فاتورة"
            >
              <Eye className="w-3 h-3 text-brand" />
              <span>الإيصال</span>
            </button>
          )}
        </div>

        {/* Quick Action Strip (Held Sales / Recall / Return) */}
        <div className="grid grid-cols-3 gap-1 h-[30px] sm:h-[32px]">
          <button
            type="button"
            onClick={() => void handleHoldCurrentSale()}
            disabled={cart.length === 0}
            className="h-full bg-surface hover:bg-surface-2 text-ink disabled:text-ink-muted border border-line text-[10px] sm:text-[11px] font-bold rounded transition-colors truncate px-1 flex items-center justify-center gap-1 cursor-pointer"
            title="تعليق السلة الحالية (F6)"
          >
            <span>تعليق (F6)</span>
          </button>
          <button
            type="button"
            onClick={onOpenHeldSales}
            className="h-full bg-surface hover:bg-surface-2 text-ink border border-line text-[10px] sm:text-[11px] font-bold rounded transition-colors truncate px-1 flex items-center justify-center gap-1 cursor-pointer"
            title="عرض واسترجاع الفواتير المعلقة"
          >
            <span>معلقة</span>
            {heldSalesCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-white font-mono text-[9px] flex items-center justify-center font-bold">
                {heldSalesCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onOpenReturnModal}
            className="h-full bg-surface hover:bg-amber-50 text-amber-800 border border-amber-300 text-[10px] sm:text-[11px] font-bold rounded transition-colors truncate px-1 flex items-center justify-center gap-1 cursor-pointer"
            title="تسجيل مرتجع مبيعات (F11)"
          >
            <span>مرتجع (F11)</span>
          </button>
        </div>
      </div>
    </section>
  );
};
