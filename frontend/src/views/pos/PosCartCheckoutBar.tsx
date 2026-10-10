import React, { useState, useMemo } from 'react';
import { 
  UserCheck, 
  CreditCard, 
  Banknote,
  RotateCcw, 
  Eye, 
  Clock, 
  Undo2,
  Users,
  Search,
  X,
  Receipt,
  Check
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
  handleFastCardCheckout: () => Promise<void>;
  requestClearCart: () => void;
  lastCompletedSale: Sale | null;
  onOpenReceipt: () => void;
  handleHoldCurrentSale: () => Promise<void>;
  heldSalesCount: number;
  onOpenHeldSales: () => void;
  onOpenReturnModal: () => void;
  onSelectCustomer?: (customerId: string) => void;
  onChangePaymentMethod?: (method: 'cash' | 'credit') => void;
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
  customers,
  netTotalPiasters,
  loading,
  handleOpenCheckout,
  handleFastCardCheckout,
  requestClearCart,
  lastCompletedSale,
  onOpenReceipt,
  handleHoldCurrentSale,
  heldSalesCount,
  onOpenHeldSales,
  onOpenReturnModal,
  onSelectCustomer,
  onChangePaymentMethod,
  onOpenExpenseModal,
}) => {
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  const selectedCust = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) : null;

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) {
      return customers.slice(0, 25);
    }
    const q = customerSearchQuery.trim().toLowerCase();
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)))
      .slice(0, 25);
  }, [customers, customerSearchQuery]);

  const handleChooseCustomer = (customerId: string, asCredit: boolean) => {
    if (onSelectCustomer) {
      onSelectCustomer(customerId);
    }
    if (onChangePaymentMethod) {
      onChangePaymentMethod(asCredit ? 'credit' : 'cash');
    }
    setIsCustomerModalOpen(false);
    setCustomerSearchQuery('');
  };

  const handleClearCustomer = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (onSelectCustomer) {
      onSelectCustomer('');
    }
    if (onChangePaymentMethod) {
      onChangePaymentMethod('cash');
    }
  };

  return (
    <div className="bg-surface border-t border-line shadow-[0_-4px_12px_rgba(0,0,0,0.03)] p-2 sm:p-2.5 flex flex-col gap-2 shrink-0 select-none">
      
      {/* 1. Upper Info & Support Actions Strip */}
      <div className="flex items-center justify-between gap-1.5 flex-wrap pb-1.5 border-b border-line/60">
        
        {/* Cart Meta (Invoice #, Count, Discount, Customer Quick Badge) */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <div className="flex items-center gap-1 font-bold">
            <span className="text-ink">فاتورة:</span>
            <span className="text-[11px] font-mono font-bold text-paid bg-paid-soft border border-paid-border px-2 py-0.5 rounded-md shadow-2xs">
              #{nextExpectedInvoiceNumber || (lastInvoiceNumber ? lastInvoiceNumber + 1 : '1')}
            </span>
          </div>

          <span className="text-[11px] text-ink-muted font-semibold bg-surface-2 px-2 py-0.5 rounded-md border border-line">
            {cart.length} صنف ({totalItemCount} حتة)
          </span>

          {discountPiasters > 0 && (
            <span className="text-[11px] text-danger font-bold bg-danger-soft px-2 py-0.5 rounded-md border border-danger-border">
              خصم: -{formatArabicCurrency(discountPiasters)}
            </span>
          )}

          {/* Quick Customer Indicator / Button (Point 3 Solution) */}
          {selectedCust ? (
            <div 
              onClick={() => setIsCustomerModalOpen(true)}
              className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-md border cursor-pointer transition-all shadow-2xs hover:opacity-90 ${
                paymentMethod === 'credit'
                  ? 'bg-rose-50 border-rose-200 text-danger'
                  : 'bg-paid-soft border-paid/30 text-paid'
              }`}
              title="اضغط لتغيير الزبون أو تبديل طريقة الدفع"
            >
              <UserCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[110px]">{selectedCust.name}</span>
              {selectedCust.balancePiasters > 0 && (
                <span className="text-[10px] font-mono text-danger font-bold">
                  (عليه {formatArabicCurrency(selectedCust.balancePiasters)})
                </span>
              )}
              {onChangePaymentMethod && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangePaymentMethod(paymentMethod === 'credit' ? 'cash' : 'credit');
                  }}
                  className={`px-1 rounded text-[10px] font-bold border transition ${
                    paymentMethod === 'credit'
                      ? 'bg-danger text-white border-danger'
                      : 'bg-surface text-ink border-line hover:bg-surface-2'
                  }`}
                  title={paymentMethod === 'credit' ? 'تبديل إلى دفع كاش' : 'تبديل إلى بيع شكك'}
                >
                  {paymentMethod === 'credit' ? 'شكك' : 'كاش'}
                </button>
              )}
              <button
                type="button"
                onClick={handleClearCustomer}
                className="p-0.5 hover:bg-black/10 rounded text-ink-muted hover:text-danger transition"
                title="إلغاء الزبون (بيع عادي كاش)"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(true)}
              className="flex items-center gap-1 text-[11px] font-bold text-brand bg-brand-soft hover:bg-brand-soft/80 border border-brand/20 px-2 py-0.5 rounded-md transition shadow-2xs cursor-pointer active:scale-95"
              title="اختيار زبون للفاتورة أو بيع شكك"
            >
              <Users className="w-3.5 h-3.5" />
              <span>اختار زبون</span>
            </button>
          )}
        </div>

        {/* Support Action Buttons (جديدة, تعليق, معلقة, مرتجع, مصروف, الإيصال) */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* مصروف درج (نثريات) */}
          {onOpenExpenseModal && (
            <button
              type="button"
              onClick={onOpenExpenseModal}
              className="h-7.5 px-2 bg-surface hover:bg-rose-50 text-danger border border-line hover:border-danger/30 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
              title="تسجيل مصروف نثريات طلع من الدرج"
            >
              <Receipt className="w-3 h-3 shrink-0" />
              <span>مصروف درج</span>
            </button>
          )}

          {/* جديدة [F7] */}
          <button 
            type="button"
            onClick={requestClearCart}
            disabled={cart.length === 0}
            className="h-7.5 px-2 bg-surface hover:bg-danger-soft text-danger disabled:text-ink-muted/50 border border-danger-border disabled:border-line text-[11px] font-bold rounded-lg flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50 whitespace-nowrap"
            title="تفريغ السلة وفاتورة جديدة (F7)"
          >
            <RotateCcw className="w-3 h-3 shrink-0" />
            <span>تفريغ السلة F7</span>
          </button>

          {/* تعليق [F6] */}
          <button
            type="button"
            onClick={() => void handleHoldCurrentSale()}
            disabled={cart.length === 0}
            className="h-7.5 px-2 bg-surface hover:bg-surface-2 text-ink disabled:text-ink-muted/50 border border-line hover:border-paid/40 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50 whitespace-nowrap"
            title="تعليق الفاتورة الحالية (F6)"
          >
            <Clock className="w-3 h-3 text-ink-muted shrink-0" />
            <span>تعليق F6</span>
          </button>

          {/* معلقة */}
          <button
            type="button"
            onClick={onOpenHeldSales}
            className="h-7.5 px-2 bg-surface hover:bg-warn-soft text-ink border border-line hover:border-warn text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
            title="عرض واسترجاع الفواتير المعلقة"
          >
            <span>فواتير معلقة</span>
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
            className="h-7.5 px-2 bg-warn-soft hover:bg-amber-100 text-amber-900 border border-warn-border text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
            title="تسجيل مرتجع بضاعة (F11)"
          >
            <Undo2 className="w-3 h-3 shrink-0 text-amber-700" />
            <span>مرتجع F11</span>
          </button>

          {/* الإيصال إذا كان متاحاً */}
          {lastCompletedSale && (
            <button 
              type="button"
              onClick={onOpenReceipt}
              className="h-7.5 px-2 bg-surface border border-line hover:border-paid/50 hover:bg-paid-soft text-paid text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1 transition-all shadow-2xs cursor-pointer whitespace-nowrap"
              title="معاينة وطباعة وصل آخر فاتورة"
            >
              <Eye className="w-3 h-3 text-paid shrink-0" />
              <span>وصل البيع</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Hero Section: Grand Total Card + Primary Payment Buttons */}
      <div className="flex flex-row items-stretch gap-2 min-h-[60px]">
        
        {/* Grand Total Hero Card ("المطلوب دفعه") */}
        <div className="flex-1 min-w-[160px] bg-gradient-to-br from-brand-dark via-brand to-brand-hover rounded-xl border border-brand px-3 py-1.5 flex flex-col justify-between shadow-[0_4px_12px_rgba(0,55,45,0.18)]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-200">المطلوب دفعه</span>
            {showTaxes && totalTaxPiasters > 0 && (
              <span className="text-[10px] font-medium text-emerald-300">
                (شامل الضريبة)
              </span>
            )}
            <span className="text-[11px] font-bold text-emerald-100">ج.م</span>
          </div>
          <div className="flex items-baseline justify-end pt-0.5">
            <span className="text-white text-2xl sm:text-[26px] leading-tight font-black font-mono tabular-nums tracking-tight">
              {formatArabicCurrency(netTotalPiasters)}
            </span>
          </div>
        </div>

        {/* Primary Checkout Triggers (كاش / فيزا / شكك) */}
        <div className="flex-1 min-w-[200px] sm:min-w-[260px] flex items-stretch gap-1.5 sm:gap-2">
          {paymentMethod === 'credit' ? (
            /* شكك [F12] */
            <button 
              type="button"
              onClick={() => handleOpenCheckout('credit')}
              disabled={loading || cart.length === 0}
              className="w-full h-full bg-danger hover:bg-red-700 active:bg-red-800 disabled:bg-surface-2 disabled:text-ink-muted text-white rounded-xl px-3 flex items-center justify-between transition-all shadow-sm active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <CreditCard className="w-4 h-4 shrink-0" />
                <span className="text-xs sm:text-sm font-bold truncate">
                  تسجيل بيع شكك {selectedCust ? `(${selectedCust.name})` : ''}
                </span>
              </div>
              <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded text-white font-bold shrink-0">
                F12
              </span>
            </button>
          ) : (
            <>
              {/* كاش [F9] */}
              <button 
                type="button"
                onClick={() => handleOpenCheckout('cash')}
                disabled={loading || cart.length === 0}
                className="flex-1 h-full bg-brand hover:bg-brand-dark active:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted/60 text-white rounded-xl px-2.5 sm:px-3 flex items-center justify-between transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                title="دفع كاش وحساب الباقي (F9)"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Banknote className="w-4 h-4 shrink-0" />
                  <span className="text-xs sm:text-sm font-extrabold truncate">كاش</span>
                </div>
                <span className="text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded text-white/90 font-bold shrink-0">
                  F9
                </span>
              </button>

              {/* فيزا [F10] */}
              <button 
                type="button"
                onClick={() => void handleFastCardCheckout()}
                disabled={loading || cart.length === 0}
                className="flex-1 h-full bg-[#006d41] hover:bg-[#005230] active:bg-[#003d24] disabled:bg-surface-2 disabled:text-ink-muted/60 text-white rounded-xl px-2.5 sm:px-3 flex items-center justify-between transition-all shadow-sm active:scale-[0.98] cursor-pointer"
                title="سداد فوري عبر الفيزا / ماكينة POS (F10)"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <CreditCard className="w-4 h-4 shrink-0" />
                  <span className="text-xs sm:text-sm font-extrabold truncate">فيزا</span>
                </div>
                <span className="text-[10px] font-mono bg-white/20 px-1.5 py-0.5 rounded text-white/90 font-bold shrink-0">
                  F10
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 3. Quick Customer Picker Popover Modal */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" dir="rtl">
          <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="px-4 py-3 bg-brand-dark text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-300" />
                <h3 className="font-bold text-sm">اختيار زبون الفاتورة (شكك أو كاش)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Box */}
            <div className="p-3 bg-surface-2 border-b border-line">
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-ink-muted" />
                <input
                  type="text"
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  placeholder="ابحث باسم الزبون أو رقم الموبايل..."
                  className="w-full pr-9 pl-3 py-2 text-xs bg-white border border-line rounded-xl focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand font-medium"
                  autoFocus
                />
              </div>
            </div>

            {/* Customer List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[50vh]">
              {selectedCust && (
                <div className="p-2.5 rounded-xl bg-paid-soft border border-paid/30 flex items-center justify-between mb-2">
                  <div className="text-xs">
                    <span className="font-bold text-paid">الزبون المختار حالياً: </span>
                    <strong className="text-ink">{selectedCust.name}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleClearCustomer();
                      setIsCustomerModalOpen(false);
                    }}
                    className="text-[11px] font-bold text-danger hover:underline"
                  >
                    إلغاء واختيار زبون عادي (بدون حساب)
                  </button>
                </div>
              )}

              {filteredCustomers.length === 0 ? (
                <div className="p-6 text-center text-xs text-ink-muted">
                  مفيش زباين متطابقة مع البحث.
                </div>
              ) : (
                filteredCustomers.map((cust) => {
                  const isSelected = cust.id === selectedCustomerId;
                  const hasDebt = cust.balancePiasters > 0;
                  return (
                    <div 
                      key={cust.id}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                        isSelected 
                          ? 'bg-brand-soft border-brand text-brand'
                          : 'bg-surface hover:bg-surface-2 border-line text-ink'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-ink flex items-center gap-1.5">
                          <span>{cust.name}</span>
                          {cust.phone && <span className="text-[11px] text-ink-muted font-mono" dir="ltr">{cust.phone}</span>}
                        </div>
                        <div className="text-[11px] mt-0.5">
                          {hasDebt ? (
                            <span className="text-danger font-semibold">
                              حسابه القديم: {formatArabicCurrency(cust.balancePiasters)}
                            </span>
                          ) : (
                            <span className="text-paid font-medium">حسابه خالص (0.00)</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleChooseCustomer(cust.id, false)}
                          className="px-2.5 py-1 rounded-lg bg-surface border border-line hover:border-brand text-ink text-[11px] font-bold transition shadow-2xs"
                          title="تحديد الزبون مع الاحتفاظ بالدفع الكاش"
                        >
                          {isSelected && paymentMethod === 'cash' ? (
                            <span className="flex items-center gap-1 text-paid font-bold">
                              <Check className="w-3 h-3" /> كاش
                            </span>
                          ) : (
                            'كاش'
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChooseCustomer(cust.id, true)}
                          className="px-2.5 py-1 rounded-lg bg-danger hover:bg-red-700 text-white text-[11px] font-bold transition shadow-2xs"
                          title="تحديد الزبون والتحويل للبيع الشكك فوراً"
                        >
                          {isSelected && paymentMethod === 'credit' ? (
                            <span className="flex items-center gap-1 text-white font-bold">
                              <Check className="w-3 h-3" /> شكك
                            </span>
                          ) : (
                            'شكك'
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2.5 bg-surface-2 border-t border-line flex items-center justify-between">
              <span className="text-[11px] text-ink-muted">
                إجمالي الزباين في الدفتر: {customers.length}
              </span>
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="px-3 py-1 bg-surface border border-line rounded-lg text-xs font-semibold text-ink hover:bg-surface transition"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
