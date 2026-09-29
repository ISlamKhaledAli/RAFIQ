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
    <footer className="h-11 w-full bg-white border-t border-[#dce1dc] flex items-center justify-between px-3 select-none shrink-0 z-10 text-xs overflow-x-auto gap-2 shadow-[0_-1px_3px_rgba(0,0,0,0.02)]">
      <div className="flex items-center gap-1.5 overflow-x-auto py-1">
        {/* F1: Help */}
        <button 
          type="button"
          onClick={onOpenHelp}
          className="h-8 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#0f172a] border border-[#dce1dc] hover:border-[#006d41]/50 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="دليل اختصارات لوحة المفاتيح الكامل (F1)"
        >
          <kbd className="px-1.5 py-0.5 rounded-md bg-[#eaf5ee] border border-[#c4e3d0] font-mono text-[10px] font-black text-[#006d41]">
            F1
          </kbd>
          <span>مساعدة</span>
        </button>

        {/* F2: Search / Barcode Focus */}
        <button 
          type="button"
          onClick={onFocusSearch}
          className="h-8 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#0f172a] border border-[#dce1dc] hover:border-[#006d41]/50 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="التركيز على حقل البحث والباركود (F2)"
        >
          <kbd className="px-1.5 py-0.5 rounded-md bg-[#f1f5f4] border border-[#dce1dc] font-mono text-[10px] font-bold text-[#52605d]">
            F2
          </kbd>
          <span>بحث</span>
        </button>

        {/* F3: Quantity / Weight */}
        <button 
          type="button"
          onClick={onEditLastItemQuantity}
          className="h-8 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#0f172a] border border-[#dce1dc] hover:border-[#006d41]/50 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="تعديل كمية أو وزن الصنف الأخير في السلة (F3)"
        >
          <kbd className="px-1.5 py-0.5 rounded-md bg-[#f1f5f4] border border-[#dce1dc] font-mono text-[10px] font-bold text-[#52605d]">
            F3
          </kbd>
          <span>كمية (+/-)</span>
        </button>

        {/* F4: Discount */}
        <button 
          type="button"
          onClick={onOpenDiscountModal}
          className="h-8 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#0f172a] border border-[#dce1dc] hover:border-[#006d41]/50 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="إضافة خصم على إجمالي الفاتورة (F4)"
        >
          <kbd className="px-1.5 py-0.5 rounded-md bg-[#f1f5f4] border border-[#dce1dc] font-mono text-[10px] font-bold text-[#52605d]">
            F4
          </kbd>
          <span>خصم</span>
        </button>

        {/* F6: Hold / Suspend */}
        <button 
          type="button"
          onClick={onHoldOrShowHeld}
          className="h-8 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#0f172a] border border-[#dce1dc] hover:border-[#006d41]/50 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="تعليق السلة الحالية أو استرجاع السلة المعلقة (F6)"
        >
          <kbd className="px-1.5 py-0.5 rounded-md bg-[#f1f5f4] border border-[#dce1dc] font-mono text-[10px] font-bold text-[#52605d]">
            F6
          </kbd>
          <span>تعليق/معلقة</span>
          {heldSalesCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-[#b3720e] text-white font-mono text-[9px] flex items-center justify-center font-bold">
              {heldSalesCount}
            </span>
          )}
        </button>

        {/* F11: Return */}
        <button 
          type="button"
          onClick={onOpenReturnModal}
          className="h-8 px-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-900 border border-amber-200 hover:border-amber-400 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="تسجيل مرتجع مبيعات للعميل (F11)"
        >
          <kbd className="px-1.5 py-0.5 rounded-md bg-amber-100 border border-amber-200 font-mono text-[10px] font-black text-amber-800">
            F11
          </kbd>
          <span>مرتجع</span>
        </button>

        {/* F7: New Cart */}
        <button 
          type="button"
          onClick={onRequestClearCart}
          className="h-8 px-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-800 border border-rose-200 hover:border-rose-300 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="مسح السلة وبدء فاتورة جديدة (F7)"
        >
          <kbd className="px-1.5 py-0.5 rounded-md bg-rose-100 border border-rose-200 font-mono text-[10px] font-bold text-rose-700">
            F7
          </kbd>
          <span>سلة جديدة</span>
        </button>

        {/* F8: Barcode Scanner */}
        <button 
          type="button"
          onClick={onOpenScannerModal}
          className="h-8 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#0f172a] border border-[#dce1dc] hover:border-[#006d41]/50 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="إعدادات وضبط قارئ الباركود (F8)"
        >
          <kbd className="px-1.5 py-0.5 rounded-md bg-[#f1f5f4] border border-[#dce1dc] font-mono text-[10px] font-bold text-[#52605d]">
            F8
          </kbd>
          <span>القارئ</span>
        </button>

        {/* F9: Last Receipt */}
        <button 
          type="button"
          onClick={onShowLastReceipt}
          className="h-8 px-2.5 rounded-xl bg-white hover:bg-slate-50 text-[#0f172a] border border-[#dce1dc] hover:border-[#006d41]/50 shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs"
          title="معاينة وإعادة طباعة آخر إيصال تم حفظه (F9)"
        >
          <kbd className="px-1.5 py-0.5 rounded-md bg-[#f1f5f4] border border-[#dce1dc] font-mono text-[10px] font-bold text-[#52605d]">
            F9
          </kbd>
          <span>إعادة الإيصال</span>
        </button>

        {/* F10: Customer / Credit */}
        <button 
          type="button"
          onClick={onToggleCreditPayment}
          className={`h-8 px-2.5 rounded-xl border shadow-2xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-bold text-xs ${
            paymentMethod === 'credit'
              ? 'bg-[#fdf3f2] text-[#b23a2e] border-[#f6cbc6]'
              : 'bg-white hover:bg-slate-50 text-[#0f172a] border-[#dce1dc] hover:border-[#006d41]/50'
          }`}
          title="التبديل بين الدفع النقدي والبيع الآجل للعميل (F10)"
        >
          <kbd className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold ${
            paymentMethod === 'credit' ? 'bg-[#ffdad6] border border-[#f6cbc6] text-[#b23a2e]' : 'bg-[#f1f5f4] border border-[#dce1dc] text-[#52605d]'
          }`}>
            F10
          </kbd>
          <span>{paymentMethod === 'credit' ? 'بيع آجل (نشط)' : 'آجل/عميل'}</span>
        </button>

        {/* F12: Instant Cash Checkout */}
        <button 
          type="button"
          onClick={onFastCashCheckout}
          className="h-8 px-3 rounded-xl bg-[#006d41] hover:bg-[#005734] text-white border border-[#006d41] shadow-xs active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer shrink-0 font-black text-xs"
          title="سداد نقدي فوري وحفظ الفاتورة مباشرة (F12)"
        >
          <kbd className="px-1.5 py-0.5 rounded-md bg-[#004d3f] text-white border border-[#00372d] font-mono text-[10px] font-bold">
            F12
          </kbd>
          <span>سداد نقدي</span>
        </button>
      </div>
    </footer>
  );
};
