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
    <footer className="h-11 w-full bg-slate-100/90 border-t border-slate-200/90 flex items-center justify-between px-3 select-none shrink-0 z-10 text-xs overflow-x-auto gap-2">
      <div className="flex items-center gap-1.5 overflow-x-auto py-1">
        {/* F1: Help */}
        <button 
          type="button"
          onClick={onOpenHelp}
          className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-300 hover:border-slate-400 border-b-2 border-b-slate-400/80 shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="دليل اختصارات لوحة المفاتيح الكامل (F1)"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-300 font-mono text-[10px] font-black text-[#006d41]">
            F1
          </kbd>
          <span>مساعدة</span>
        </button>

        {/* F2: Search / Barcode Focus */}
        <button 
          type="button"
          onClick={onFocusSearch}
          className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-300 hover:border-slate-400 border-b-2 border-b-slate-400/80 shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="التركيز على حقل البحث والباركود (F2)"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] font-black text-slate-700">
            F2
          </kbd>
          <span>بحث</span>
        </button>

        {/* F3: Quantity / Weight */}
        <button 
          type="button"
          onClick={onEditLastItemQuantity}
          className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-300 hover:border-slate-400 border-b-2 border-b-slate-400/80 shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="تعديل كمية أو وزن الصنف الأخير في السلة (F3)"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] font-black text-slate-700">
            F3
          </kbd>
          <span>كمية (+/-)</span>
        </button>

        {/* F4: Discount */}
        <button 
          type="button"
          onClick={onOpenDiscountModal}
          className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-300 hover:border-slate-400 border-b-2 border-b-slate-400/80 shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="إضافة خصم على إجمالي الفاتورة (F4)"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] font-black text-slate-700">
            F4
          </kbd>
          <span>خصم</span>
        </button>

        {/* F6: Hold / Suspend */}
        <button 
          type="button"
          onClick={onHoldOrShowHeld}
          className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-300 hover:border-slate-400 border-b-2 border-b-slate-400/80 shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="تعليق السلة الحالية أو استرجاع السلة المعلقة (F6)"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] font-black text-slate-700">
            F6
          </kbd>
          <span>تعليق/معلقة</span>
          {heldSalesCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-amber-500 text-white font-mono text-[9px] flex items-center justify-center font-bold">
              {heldSalesCount}
            </span>
          )}
        </button>

        {/* F11: Return */}
        <button 
          type="button"
          onClick={onOpenReturnModal}
          className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-amber-800 border border-amber-300 hover:border-amber-400 border-b-2 border-b-amber-400/80 shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="تسجيل مرتجع مبيعات للعميل (F11)"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 font-mono text-[10px] font-black text-amber-900">
            F11
          </kbd>
          <span>مرتجع</span>
        </button>

        {/* F7: New Cart */}
        <button 
          type="button"
          onClick={onRequestClearCart}
          className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-300 hover:border-slate-400 border-b-2 border-b-slate-400/80 shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="مسح السلة وبدء فاتورة جديدة (F7)"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] font-black text-slate-700">
            F7
          </kbd>
          <span>سلة جديدة</span>
        </button>

        {/* F8: Barcode Scanner */}
        <button 
          type="button"
          onClick={onOpenScannerModal}
          className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-300 hover:border-slate-400 border-b-2 border-b-slate-400/80 shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="إعدادات وضبط قارئ الباركود (F8)"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] font-black text-slate-700">
            F8
          </kbd>
          <span>القارئ</span>
        </button>

        {/* F9: Last Receipt */}
        <button 
          type="button"
          onClick={onShowLastReceipt}
          className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-300 hover:border-slate-400 border-b-2 border-b-slate-400/80 shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="معاينة وإعادة طباعة آخر إيصال تم حفظه (F9)"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] font-black text-slate-700">
            F9
          </kbd>
          <span>إعادة الإيصال</span>
        </button>

        {/* F10: Customer / Credit */}
        <button 
          type="button"
          onClick={onToggleCreditPayment}
          className={`h-8 px-2.5 rounded-lg border border-b-2 shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs ${
            paymentMethod === 'credit'
              ? 'bg-rose-50 text-rose-800 border-rose-300 border-b-rose-400'
              : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-300 hover:border-slate-400 border-b-slate-400/80'
          }`}
          title="التبديل بين الدفع النقدي والبيع الآجل للعميل (F10)"
        >
          <kbd className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-black ${
            paymentMethod === 'credit' ? 'bg-rose-100 border border-rose-300 text-rose-800' : 'bg-slate-100 border border-slate-300 text-slate-700'
          }`}>
            F10
          </kbd>
          <span>{paymentMethod === 'credit' ? 'بيع آجل (نشط)' : 'آجل/عميل'}</span>
        </button>

        {/* F12: Instant Cash Checkout */}
        <button 
          type="button"
          onClick={onFastCashCheckout}
          className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-[#004d3e] text-white border border-emerald-600 border-b-2 border-b-emerald-800 shadow-2xs hover:shadow-xs active:translate-y-0.5 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-black text-xs"
          title="سداد نقدي فوري وحفظ الفاتورة مباشرة (F12)"
        >
          <kbd className="px-1.5 py-0.5 rounded bg-emerald-700 text-white border border-emerald-800 font-mono text-[10px] font-black">
            F12
          </kbd>
          <span>سداد نقدي</span>
        </button>
      </div>

      <div className="text-[11px] font-mono text-slate-500 shrink-0 pr-2 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>كيبورد + لمس</span>
      </div>
    </footer>
  );
};
