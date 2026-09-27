import type { FormEvent } from 'react';
import { Save, Sparkles, ToggleLeft, ToggleRight } from 'lucide-react';

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
  defaultCustomerCreditLimitEgp,
  setDefaultCustomerCreditLimitEgp,
  saveLoading,
  handleSave,
  onOpenWizard,
}: StoreProfileTabProps) => {
  return (
    <div className="grid grid-cols-12 gap-4 flex-1">
      {/* RIGHT COLUMN: Store Profile Form (7 cols) */}
      <div className="col-span-7 flex flex-col gap-4">
        <form onSubmit={handleSave} className="bg-surface hairline-all rounded-[6px] p-5 flex flex-col gap-3.5 text-[12px]">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-bold text-ink m-0">بيانات المتجر والفاتورة</h3>
              <span className="text-[11px] text-ink-muted">تنعكس فوراً على الإيصال المطبوع</span>
            </div>
            <button
              type="button"
              onClick={onOpenWizard}
              className="px-2.5 py-1 bg-brand-soft hover:bg-brand/20 text-brand border border-brand/30 rounded text-[11px] font-bold flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>معالج نوع المحل (Setup Wizard)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-ink font-semibold mb-1">اسم المتجر أو المنشأة *</label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="مثال: متجر رفيق"
                className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
                required
              />
            </div>

            <div>
              <label className="block text-ink font-semibold mb-1">اسم الكاشير أو الوردية الافتراضي</label>
              <input
                type="text"
                value={cashierName}
                onChange={(e) => setCashierName(e.target.value)}
                placeholder="مثال: كاشير الوردية (1)"
                className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
              />
            </div>

            <div>
              <label className="block text-ink font-semibold mb-1">رقم الهاتف للتواصل</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="مثال: 01000000000"
                className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-ink font-semibold mb-1">العنوان والفرع</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="مثال: الفرع الرئيسي - وسط المدينة"
                className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
              />
            </div>

            <div>
              <label className="block text-ink font-semibold mb-1">الرقم الضريبي / السجل التجاري (اختياري)</label>
              <input
                type="text"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                placeholder="مثال: 123-456-789"
                className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-ink font-semibold mb-1">ترويسة الإيصال الحراري (السطر الترحيبي)</label>
            <input
              type="text"
              value={receiptHeader}
              onChange={(e) => setReceiptHeader(e.target.value)}
              className="w-full bg-surface border border-line rounded h-[38px] px-3 text-[13px] text-ink focus:outline-none focus:border-brand font-sans"
            />
          </div>

          <div>
            <label className="block text-ink font-semibold mb-1">تذييل الإيصال (سياسة الاستبدال والاسترجاع)</label>
            <textarea
              rows={2}
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              className="w-full bg-surface border border-line rounded p-2.5 text-[12px] text-ink focus:outline-none focus:border-brand font-sans resize-none"
            />
          </div>

          {/* Feature #30 / Task 30-2: Negative Stock Policy Setting */}
          <div className="bg-surface-2 p-3.5 rounded border border-line flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink text-[12.5px]">السماح بالبيع بالسالب عند نفاد المخزون</span>
              <span className="text-[11px] text-ink-muted">
                موصى به في بداية التشغيل. عند تفعيله، يسمح النظام بإتمام البيع حتى لو كان رصيد الصنف صفراً أو غير كافٍ مع إظهار تحذير للكاشير دون تعطيل حركة العمل.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAllowNegativeStock(!allowNegativeStock)}
              className="shrink-0 text-brand"
              title={allowNegativeStock ? 'مفعّل (السماح بالسالب مع تحذير)' : 'معطّل (منع البيع عند عدم كفاية الرصيد)'}
            >
              {allowNegativeStock ? (
                <ToggleRight className="w-8 h-8 text-brand" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-ink-muted" />
              )}
            </button>
          </div>

          {/* Feature #110 / Task 110-1: Default Customer Credit Limit Setting */}
          <div className="bg-surface-2 p-3.5 rounded border border-line flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink text-[12.5px]">حد التنبيه الافتراضي للعملاء الجدد</span>
              <span className="text-[11px] text-ink-muted">
                المبلغ الافتراضي بالجنيه لحد مديونية العميل. عند تجاوزه يظهر تحذير واضح وقت البيع الآجل دون منع البيع.
              </span>
            </div>
            <div className="w-32 shrink-0 flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="50"
                value={defaultCustomerCreditLimitEgp}
                onChange={(e) => setDefaultCustomerCreditLimitEgp(Number(e.target.value) || 0)}
                className="w-full bg-surface border border-line rounded h-[38px] px-2 text-[13px] text-ink focus:outline-none focus:border-brand font-mono text-center font-bold"
              />
              <span className="text-xs text-ink-muted shrink-0">ج.م</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={saveLoading}
            className="mt-1 h-[40px] bg-brand hover:bg-brand-hover disabled:bg-surface-2 disabled:text-ink-muted text-white rounded text-[13px] font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>{saveLoading ? 'جاري الحفظ...' : 'حفظ وتطبيق بيانات المتجر في قاعدة البيانات'}</span>
          </button>
        </form>
      </div>

      {/* LEFT COLUMN: Real 80mm Live Thermal Receipt Preview */}
      <div className="col-span-5 flex flex-col items-center justify-start">
        <div className="w-full flex items-center justify-between mb-2">
          <span className="text-[12px] font-bold text-ink-muted">معاينة الإيصال الحراري الفعلي (80 مم)</span>
          <span className="text-[10px] font-mono bg-surface border border-line px-2 py-0.5 rounded text-ink-muted">
            203 DPI / 96 DPI Display
          </span>
        </div>

        {/* Realistic Receipt Canvas Paper */}
        <div className="w-[310px] bg-white text-black font-mono text-[12px] p-5 shadow-sm border border-line rounded flex flex-col relative select-text">
          {/* Top Zigzag Cut */}
          <div className="w-full h-2 receipt-zigzag mb-2 opacity-30"></div>

          {/* Receipt Header */}
          <div className="text-center flex flex-col gap-0.5">
            <h4 className="text-[16px] font-bold m-0 font-sans">{storeName || 'متجر رفيق'}</h4>
            <p className="text-[11px] text-gray-700 m-0">{address}</p>
            <p className="text-[11px] text-gray-700 m-0">هاتف: {phone}</p>
            <p className="text-[10px] text-gray-500 m-0">ر.ض: {taxNumber}</p>
            <p className="text-[11px] font-semibold text-gray-800 mt-1 border-t border-b border-dashed border-gray-400 py-1 font-sans">
              {receiptHeader}
            </p>
          </div>

          {/* Meta Row */}
          <div className="flex justify-between text-[10px] text-gray-600 my-2">
            <span>فاتورة: #1042</span>
            <span>2026/09/24 14:35</span>
          </div>

          {/* Table Line Items */}
          <div className="border-t border-dashed border-black pt-1 pb-1 flex flex-col gap-1 text-[11px]">
            <div className="flex justify-between font-bold text-[10px] text-gray-600 pb-0.5">
              <span>الصنف</span>
              <span>الكمية × السعر</span>
              <span>الإجمالي</span>
            </div>
            <div className="flex justify-between">
              <span className="truncate max-w-[130px]">لبن جهينة 1 لتر</span>
              <span>1 × 42.00</span>
              <span className="font-bold">42.00</span>
            </div>
            <div className="flex justify-between">
              <span className="truncate max-w-[130px]">مياه بركة 1.5 لتر</span>
              <span>2 × 8.00</span>
              <span className="font-bold">16.00</span>
            </div>
            <div className="flex justify-between">
              <span className="truncate max-w-[130px]">عيش فينو 5 رغيف</span>
              <span>1 × 10.00</span>
              <span className="font-bold">10.00</span>
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-dashed border-black pt-1.5 flex flex-col gap-1 text-[12px]">
            <div className="flex justify-between">
              <span>المجموع الفرعي:</span>
              <span>68.00 ج.م</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>الخصم:</span>
              <span>0.00 ج.م</span>
            </div>
            <div className="flex justify-between font-bold text-[15px] border-t border-black pt-1 mt-0.5">
              <span>الإجمالي المطلوب:</span>
              <span>68.00 ج.م</span>
            </div>
            <div className="flex justify-between text-[11px] text-gray-700">
              <span>المدفوع نقداً:</span>
              <span>70.00 ج.م</span>
            </div>
            <div className="flex justify-between text-[11px] font-bold text-gray-900">
              <span>الباقي للعميل:</span>
              <span>2.00 ج.م</span>
            </div>
          </div>

          {/* Barcode Simulation */}
          <div className="my-3 flex flex-col items-center">
            <div className="h-9 w-44 bg-black flex items-center justify-center text-white text-[9px] font-mono tracking-widest">
              ||| | |||| | ||| |||| | ||
            </div>
            <span className="text-[9px] text-gray-500 mt-0.5">2026104200068</span>
          </div>

          {/* Receipt Footer */}
          <div className="text-center text-[10px] text-gray-700 border-t border-dashed border-gray-400 pt-1.5 font-sans leading-relaxed">
            {receiptFooter}
          </div>

          {/* Bottom Zigzag Cut */}
          <div className="w-full h-2 receipt-zigzag mt-3 opacity-30"></div>
        </div>
      </div>
    </div>
  );
};
