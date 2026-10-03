import React from 'react';

interface PosFooterBarProps {
  onOpenHelp: () => void;
  onFocusSearch: () => void;
  onEditLastItemQuantity: () => void;
  onOpenDiscountModal: () => void;
  onHoldOrShowHeld: () => void;
  heldSalesCount: number;
  onOpenReturnModal: () => void;
  onRequestClearCart: () => void;
  onOpenScannerModal: () => void;
  onShowLastReceipt: () => void;
  paymentMethod: 'cash' | 'credit';
  onToggleCreditPayment: () => void;
  onFastCashCheckout: () => void;
}

export const PosFooterBar: React.FC<PosFooterBarProps> = ({
  onOpenHelp,
  onFocusSearch,
  onEditLastItemQuantity,
  onOpenDiscountModal,
  onHoldOrShowHeld,
  heldSalesCount,
  onOpenReturnModal,
  onRequestClearCart,
  onOpenScannerModal,
  onShowLastReceipt,
  paymentMethod,
  onToggleCreditPayment,
  onFastCashCheckout,
}) => {
  return (
    <footer className="h-10 w-full bg-surface border-t border-line flex items-center justify-between px-2.5 select-none shrink-0 z-10 text-xs overflow-x-auto gap-1.5 shadow-2xs">
      <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 custom-scrollbar w-full">
        {/* F1: Help */}
        <button 
          type="button"
          onClick={onOpenHelp}
          className="h-7 px-2 rounded-lg bg-surface hover:bg-surface-2 text-ink border border-line hover:border-paid/40 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer shrink-0 font-bold text-[11px]"
          title="دليل اختصارات لوحة المفاتيح الكامل (F1)"
        >
          <kbd className="px-1.5 py-0.2 rounded bg-paid-soft border border-paid-border font-mono text-[9px] font-bold text-paid">
            F1
          </kbd>
          <span>مساعدة</span>
        </button>

        {/* F2: Search / Barcode Focus */}
        <button 
          type="button"
          onClick={onFocusSearch}
          className="h-7 px-2 rounded-lg bg-surface hover:bg-surface-2 text-ink border border-line hover:border-paid/40 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer shrink-0 font-bold text-[11px]"
          title="التركيز على حقل البحث والباركود (F2)"
        >
          <kbd className="px-1.5 py-0.2 rounded bg-surface-2 border border-line font-mono text-[9px] font-bold text-ink-muted">
            F2
          </kbd>
          <span>بحث</span>
        </button>

        {/* F3: Quantity / Weight */}
        <button 
          type="button"
          onClick={onEditLastItemQuantity}
          className="h-7 px-2 rounded-lg bg-surface hover:bg-surface-2 text-ink border border-line hover:border-paid/40 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer shrink-0 font-bold text-[11px]"
          title="تعديل كمية أو وزن الصنف الأخير في السلة (F3)"
        >
          <kbd className="px-1.5 py-0.2 rounded bg-surface-2 border border-line font-mono text-[9px] font-bold text-ink-muted">
            F3
          </kbd>
          <span>كمية</span>
        </button>

        {/* F4: Discount */}
        <button 
          type="button"
          onClick={onOpenDiscountModal}
          className="h-7 px-2 rounded-lg bg-surface hover:bg-surface-2 text-ink border border-line hover:border-paid/40 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer shrink-0 font-bold text-[11px]"
          title="إضافة خصم على إجمالي الفاتورة (F4)"
        >
          <kbd className="px-1.5 py-0.2 rounded bg-surface-2 border border-line font-mono text-[9px] font-bold text-ink-muted">
            F4
          </kbd>
          <span>خصم</span>
        </button>

        {/* F6: Hold / Suspend */}
        <button 
          type="button"
          onClick={onHoldOrShowHeld}
          className="h-7 px-2 rounded-lg bg-surface hover:bg-surface-2 text-ink border border-line hover:border-paid/40 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer shrink-0 font-bold text-[11px]"
          title="تعليق السلة الحالية أو استرجاع السلة المعلقة (F6)"
        >
          <kbd className="px-1.5 py-0.2 rounded bg-surface-2 border border-line font-mono text-[9px] font-bold text-ink-muted">
            F6
          </kbd>
          <span>تعليق</span>
          {heldSalesCount > 0 && (
            <span className="w-3.5 h-3.5 rounded-full bg-warn text-white font-mono text-[9px] flex items-center justify-center font-bold">
              {heldSalesCount}
            </span>
          )}
        </button>

        {/* F11: Return */}
        <button 
          type="button"
          onClick={onOpenReturnModal}
          className="h-7 px-2 rounded-lg bg-surface hover:bg-warn-soft text-amber-900 border border-warn-border hover:border-warn shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer shrink-0 font-bold text-[11px]"
          title="تسجيل مرتجع مبيعات للعميل (F11)"
        >
          <kbd className="px-1.5 py-0.2 rounded bg-warn-soft border border-warn-border font-mono text-[9px] font-bold text-warn">
            F11
          </kbd>
          <span>مرتجع</span>
        </button>

        {/* F7: New Cart */}
        <button 
          type="button"
          onClick={onRequestClearCart}
          className="h-7 px-2 rounded-lg bg-surface hover:bg-danger-soft text-danger border border-danger-border hover:border-danger shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer shrink-0 font-bold text-[11px]"
          title="مسح السلة وبدء فاتورة جديدة (F7)"
        >
          <kbd className="px-1.5 py-0.2 rounded bg-danger-soft border border-danger-border font-mono text-[9px] font-bold text-danger">
            F7
          </kbd>
          <span>سلة جديدة</span>
        </button>

        {/* F8: Barcode Scanner */}
        <button 
          type="button"
          onClick={onOpenScannerModal}
          className="h-7 px-2 rounded-lg bg-surface hover:bg-surface-2 text-ink border border-line hover:border-paid/40 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer shrink-0 font-bold text-[11px]"
          title="إعدادات وضبط قارئ الباركود (F8)"
        >
          <kbd className="px-1.5 py-0.2 rounded bg-surface-2 border border-line font-mono text-[9px] font-bold text-ink-muted">
            F8
          </kbd>
          <span>القارئ</span>
        </button>

        {/* F9: Last Receipt */}
        <button 
          type="button"
          onClick={onShowLastReceipt}
          className="h-7 px-2 rounded-lg bg-surface hover:bg-surface-2 text-ink border border-line hover:border-paid/40 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer shrink-0 font-bold text-[11px]"
          title="معاينة وإعادة طباعة آخر إيصال تم حفظه (F9)"
        >
          <kbd className="px-1.5 py-0.2 rounded bg-surface-2 border border-line font-mono text-[9px] font-bold text-ink-muted">
            F9
          </kbd>
          <span>إعادة الإيصال</span>
        </button>

        {/* F10: Customer / Credit */}
        <button 
          type="button"
          onClick={onToggleCreditPayment}
          className={`h-7 px-2 rounded-lg border shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer shrink-0 font-bold text-[11px] ${
            paymentMethod === 'credit'
              ? 'bg-danger-soft text-danger border-danger-border'
              : 'bg-surface hover:bg-surface-2 text-ink border-line hover:border-paid/40'
          }`}
          title="التبديل بين الدفع النقدي والبيع الآجل للعميل (F10)"
        >
          <kbd className={`px-1.5 py-0.2 rounded font-mono text-[9px] font-bold ${
            paymentMethod === 'credit' ? 'bg-danger text-white' : 'bg-surface-2 border border-line text-ink-muted'
          }`}>
            F10
          </kbd>
          <span>{paymentMethod === 'credit' ? 'بيع آجل' : 'آجل/عميل'}</span>
        </button>

        {/* F12: Instant Cash Checkout */}
        <button 
          type="button"
          onClick={onFastCashCheckout}
          className="h-7 px-2.5 rounded-lg bg-paid hover:bg-paid-hover text-white border border-paid shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer shrink-0 font-bold text-[11px] mr-auto"
          title="سداد نقدي فوري وحفظ الفاتورة مباشرة (F12)"
        >
          <kbd className="px-1.5 py-0.2 rounded bg-brand-dark text-white font-mono text-[9px] font-bold">
            F12
          </kbd>
          <span>سداد نقدي</span>
        </button>
      </div>
    </footer>
  );
};
