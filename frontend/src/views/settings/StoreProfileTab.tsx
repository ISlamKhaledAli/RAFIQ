import type { FormEvent } from 'react';
import { Store, Save, Sparkles, ToggleLeft, ToggleRight } from 'lucide-react';

interface StoreProfileTabProps {
  storeName: string;
  setStoreName: (val: string) => void;
  cashierName: string;
  setCashierName: (val: string) => void;
  phone: string;
  setPhone: (val: string) => void;
  address: string;
  setAddress: (val: string) => void;
  taxNumber: string;
  setTaxNumber: (val: string) => void;
  receiptHeader: string;
  setReceiptHeader: (val: string) => void;
  receiptFooter: string;
  setReceiptFooter: (val: string) => void;
  allowNegativeStock: boolean;
  setAllowNegativeStock: (val: boolean) => void;
  onToggleNegativeStock?: (val: boolean) => void;
  defaultCustomerCreditLimitEgp: number;
  setDefaultCustomerCreditLimitEgp: (val: number) => void;
  saveLoading: boolean;
  handleSave: (e: FormEvent) => void;
  onOpenWizard: () => void;
}

export const StoreProfileTab = ({
  storeName,
  setStoreName,
  cashierName,
  setCashierName,
  phone,
  setPhone,
  address,
  setAddress,
  taxNumber,
  setTaxNumber,
  receiptHeader,
  setReceiptHeader,
  receiptFooter,
  setReceiptFooter,
  allowNegativeStock,
  setAllowNegativeStock,
  onToggleNegativeStock,
  defaultCustomerCreditLimitEgp,
  setDefaultCustomerCreditLimitEgp,
  saveLoading,
  handleSave,
  onOpenWizard,
}: StoreProfileTabProps) => {
  return (
    <div className="grid grid-cols-12 gap-5 flex-1 items-start">
      {/* RIGHT COLUMN: Store Profile Form (7 cols) */}
      <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
        <form 
          onSubmit={handleSave} 
          className="bg-white rounded-lg border border-[#dce1dc] shadow-subtle p-5 flex flex-col gap-4 text-xs"
        >
          {/* Header Card */}
          <div className="flex items-center justify-between border-b border-[#dce1dc] pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-[#0b4f42]/10 text-[#0b4f42] flex items-center justify-center font-bold">
                <Store className="w-4 h-4 text-[#0b4f42]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#14181a] m-0">بيانات المتجر والمنشأة</h3>
                <span className="text-[11px] text-[#5b6664]">تنعكس فوراً على الإيصال المطبوع وفواتير الكاشير</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenWizard}
              className="px-3 py-1.5 bg-[#e1eae5] hover:bg-[#d0dfd8] text-[#0b4f42] border border-[#0b4f42]/20 rounded text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#0b4f42]" />
              <span>معالج نوع المحل (Setup Wizard)</span>
            </button>
          </div>

          {/* Section: Basic Identity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#14181a]">
                اسم المحل أو المنشأة <span className="text-[#b23a2e]">*</span>
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="مثال: سوبر ماركت النور"
                className="w-full bg-[#fdfdfd] border border-[#dce1dc] rounded h-10 px-3 text-xs text-[#14181a] focus:outline-none focus:border-[#0b4f42] focus:ring-1 focus:ring-[#0b4f42] transition-colors"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#14181a]">اسم الكاشير أو الوردية</label>
              <input
                type="text"
                value={cashierName}
                onChange={(e) => setCashierName(e.target.value)}
                placeholder="مثال: كاشير الوردية (1)"
                className="w-full bg-[#fdfdfd] border border-[#dce1dc] rounded h-10 px-3 text-xs text-[#14181a] focus:outline-none focus:border-[#0b4f42] focus:ring-1 focus:ring-[#0b4f42] transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#14181a]">رقم الهاتف للتواصل</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="مثال: 01000000000"
                dir="ltr"
                className="w-full bg-[#fdfdfd] border border-[#dce1dc] rounded h-10 px-3 text-xs text-[#14181a] focus:outline-none focus:border-[#0b4f42] focus:ring-1 focus:ring-[#0b4f42] transition-colors text-right tabular-nums font-mono"
              />
            </div>
          </div>

          {/* Section: Address & Tax */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#14181a]">العنوان والفرع</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="مثال: 23 شارع الجمهورية - وسط المدينة"
                className="w-full bg-[#fdfdfd] border border-[#dce1dc] rounded h-10 px-3 text-xs text-[#14181a] focus:outline-none focus:border-[#0b4f42] focus:ring-1 focus:ring-[#0b4f42] transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#14181a]">الرقم الضريبي / السجل التجاري</label>
              <input
                type="text"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                placeholder="مثال: 934-210-884"
                dir="ltr"
                className="w-full bg-[#fdfdfd] border border-[#dce1dc] rounded h-10 px-3 text-xs text-[#14181a] focus:outline-none focus:border-[#0b4f42] focus:ring-1 focus:ring-[#0b4f42] transition-colors text-right tabular-nums font-mono"
              />
            </div>
          </div>

          {/* Section: Receipt Header & Footer */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#14181a]">ترويسة الإيصال الحراري (السطر الترحيبي)</label>
            <input
              type="text"
              value={receiptHeader}
              onChange={(e) => setReceiptHeader(e.target.value)}
              placeholder="مثال: أهلاً بكم في متجرنا"
              className="w-full bg-[#fdfdfd] border border-[#dce1dc] rounded h-10 px-3 text-xs text-[#14181a] focus:outline-none focus:border-[#0b4f42] focus:ring-1 focus:ring-[#0b4f42] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#14181a]">تذييل الإيصال (سياسة الاستبدال والاسترجاع)</label>
            <textarea
              rows={2}
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder="مثال: شكراً لزيارتكم! الاستبدال خلال 3 أيام بموجب الفاتورة."
              className="w-full bg-[#fdfdfd] border border-[#dce1dc] rounded p-2.5 text-xs text-[#14181a] focus:outline-none focus:border-[#0b4f42] focus:ring-1 focus:ring-[#0b4f42] transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Feature #30: Negative Stock Policy */}
          <div className="bg-[#f7f8f6] p-3.5 rounded-lg border border-[#dce1dc] flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-[#14181a] text-xs">السماح بالبيع بالسالب عند نفاد المخزون</span>
              <span className="text-[11px] text-[#5b6664] leading-relaxed">
                موصى به في بداية التشغيل لتفادي تعطيل حركة البيع أمام طابور الزبائن عند عدم تطابق الجرد الفوري.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !allowNegativeStock;
                setAllowNegativeStock(next);
                if (onToggleNegativeStock) onToggleNegativeStock(next);
              }}
              className="shrink-0 transition-transform active:scale-95 cursor-pointer"
              title={allowNegativeStock ? 'مفعّل (السماح بالسالب مع تحذير)' : 'معطّل (منع البيع عند عدم كفاية الرصيد)'}
            >
              {allowNegativeStock ? (
                <ToggleRight className="w-8 h-8 text-[#0b4f42]" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-[#5b6664]/60" />
              )}
            </button>
          </div>

          {/* Feature #110: Default Customer Credit Limit */}
          <div className="bg-[#f7f8f6] p-3.5 rounded-lg border border-[#dce1dc] flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-[#14181a] text-xs">حد التنبيه الافتراضي للعملاء الجدد</span>
              <span className="text-[11px] text-[#5b6664] leading-relaxed">
                المبلغ بالجنيه لحد مديونية العميل الجديد. عند تجاوزه يظهر تنبيه للكاشير وقت تسجيل الآجل.
              </span>
            </div>
            <div className="w-32 shrink-0 flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="50"
                value={defaultCustomerCreditLimitEgp}
                onChange={(e) => setDefaultCustomerCreditLimitEgp(Number(e.target.value) || 0)}
                className="w-full bg-white border border-[#dce1dc] rounded h-9 px-2 text-xs text-[#14181a] focus:outline-none focus:border-[#0b4f42] text-center font-bold tabular-nums font-mono"
              />
              <span className="text-xs text-[#5b6664] font-semibold shrink-0">ج.م</span>
            </div>
          </div>

          {/* Save Action Button */}
          <button
            type="submit"
            disabled={saveLoading}
            className="mt-1 h-11 bg-[#0b4f42] hover:bg-[#0f6a57] disabled:bg-[#f1f4f6] disabled:text-[#5b6664] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saveLoading ? 'جاري الحفظ...' : 'حفظ وتطبيق بيانات المتجر في قاعدة البيانات'}</span>
          </button>
        </form>
      </div>

      {/* LEFT COLUMN: Real 80mm Live Thermal Receipt Preview */}
      <div className="col-span-12 lg:col-span-5 flex flex-col items-center justify-start sticky top-2">
        <div className="w-full max-w-[320px] flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-[#5b6664]">معاينة الإيصال الحراري الفعلي (80 مم)</span>
          <span className="text-[10px] font-mono bg-white border border-[#dce1dc] px-2 py-0.5 rounded text-[#5b6664]">
            203 DPI • ESC/POS
          </span>
        </div>

        {/* Realistic Receipt Canvas Paper */}
        <div className="w-full max-w-[320px] bg-white text-[#181c1e] font-mono text-[11.5px] p-5 shadow-card border border-[#dce1dc] rounded flex flex-col relative select-text">
          {/* Top Zigzag Cut */}
          <div className="w-full h-2 receipt-zigzag mb-2 opacity-30"></div>

          {/* Receipt Header */}
          <div className="text-center flex flex-col gap-0.5">
            <h4 className="text-base font-bold m-0 font-sans text-black">{storeName || 'متجر رفيق'}</h4>
            <p className="text-[11px] text-gray-700 m-0">{address || 'الفرع الرئيسي'}</p>
            {phone && <p className="text-[11px] text-gray-700 m-0 dir-ltr text-center">هاتف: {phone}</p>}
            {taxNumber && <p className="text-[10px] text-gray-500 m-0">ر.ض: {taxNumber}</p>}
            {receiptHeader && (
              <p className="text-[11px] font-semibold text-gray-800 mt-1 border-t border-b border-dashed border-gray-400 py-1 font-sans">
                {receiptHeader}
              </p>
            )}
          </div>

          {/* Meta Row */}
          <div className="flex justify-between text-[10px] text-gray-600 my-2 border-b border-dashed border-gray-300 pb-1">
            <span>فاتورة: #1042</span>
            <span>2026/09/27 19:35</span>
          </div>

          {/* Table Line Items */}
          <div className="pt-0.5 pb-1 flex flex-col gap-1 text-[11px]">
            <div className="flex justify-between font-bold text-[10px] text-gray-600 pb-0.5 border-b border-gray-300">
              <span>الصنف</span>
              <span>الكمية × السعر</span>
              <span>الإجمالي</span>
            </div>
            <div className="flex justify-between pt-1">
              <span className="truncate max-w-[130px]">جبنة عبور لاند 500 جم</span>
              <span>1 × 38.00</span>
              <span className="font-bold">38.00</span>
            </div>
            <div className="flex justify-between">
              <span className="truncate max-w-[130px]">شاي العروسة 100 جم</span>
              <span>2 × 15.00</span>
              <span className="font-bold">30.00</span>
            </div>
            <div className="flex justify-between">
              <span className="truncate max-w-[130px]">سكر حر 1 كجم</span>
              <span>1 × 27.00</span>
              <span className="font-bold">27.00</span>
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-dashed border-black pt-1.5 flex flex-col gap-1 text-xs">
            <div className="flex justify-between text-gray-700">
              <span>المجموع الفرعي:</span>
              <span>95.00 ج.م</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>الخصم:</span>
              <span>0.00 ج.م</span>
            </div>
            <div className="flex justify-between font-bold text-sm border-t border-black pt-1 mt-0.5 text-black">
              <span>الإجمالي المطلوب:</span>
              <span>95.00 ج.م</span>
            </div>
            <div className="flex justify-between text-[11px] text-gray-700">
              <span>المدفوع نقداً:</span>
              <span>100.00 ج.م</span>
            </div>
            <div className="flex justify-between text-[11px] font-bold text-black">
              <span>الباقي للعميل:</span>
              <span>5.00 ج.م</span>
            </div>
          </div>

          {/* Barcode Simulation */}
          <div className="my-3 flex flex-col items-center">
            <div className="h-8 w-44 bg-black flex items-center justify-center text-white text-[8px] font-mono tracking-widest">
              ||| | |||| | ||| |||| | ||
            </div>
            <span className="text-[9px] text-gray-500 mt-0.5">2026104200095</span>
          </div>

          {/* Receipt Footer */}
          {receiptFooter && (
            <div className="text-center text-[10px] text-gray-700 border-t border-dashed border-gray-400 pt-1.5 font-sans leading-relaxed">
              {receiptFooter}
            </div>
          )}

          {/* Bottom Zigzag Cut */}
          <div className="w-full h-2 receipt-zigzag mt-3 opacity-30"></div>
        </div>
      </div>
    </div>
  );
};
