import type { FormEvent } from 'react';
import { Store, Save, Sparkles, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { ToggleSwitch } from '../../components/ToggleSwitch';

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
  logoVariant?: 'classic' | 'modern';
  setLogoVariant?: (val: 'classic' | 'modern') => void;
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
  logoVariant = 'classic',
  setLogoVariant,
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
          className="bg-surface rounded-lg border border-line shadow-subtle p-5 flex flex-col gap-4 text-xs"
        >
          {/* Header Card */}
          <div className="flex items-center justify-between border-b border-line pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-brand/10 text-brand flex items-center justify-center font-bold">
                <Store className="w-4 h-4 text-brand" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink m-0">بيانات وتفاصيل المحل</h3>
                <span className="text-[11px] text-ink-muted">بتظهر في وصل الكاشير الحراري وفواتير البيع للزبائن</span>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenWizard}
              className="px-3 py-1.5 bg-brand-soft hover:bg-brand/20 text-brand border border-brand/20 rounded text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-brand" />
              <span>معالج تهيئة المحل والنشاط</span>
            </button>
          </div>

          {/* Section: Basic Identity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink">
                اسم المحل أو المنشأة <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="مثلاً: سوبر ماركت رفيق / مؤسسة النور"
                className="w-full bg-surface border border-line rounded h-10 px-3 text-xs text-ink focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink">اسم الكاشير أو الوردية</label>
              <input
                type="text"
                value={cashierName}
                onChange={(e) => setCashierName(e.target.value)}
                placeholder="مثلاً: كاشير (1) / وردية الصباح"
                className="w-full bg-surface border border-line rounded h-10 px-3 text-xs text-ink focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink">رقم الهاتف للتواصل</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="مثلاً: 01000000000"
                dir="ltr"
                className="w-full bg-surface border border-line rounded h-10 px-3 text-xs text-ink focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors text-right tabular-nums font-mono"
              />
            </div>
          </div>

          {/* Section: Address & Tax */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink">العنوان والفرع</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="مثلاً: 23 شارع الجمهورية - وسط البلد"
                className="w-full bg-surface border border-line rounded h-10 px-3 text-xs text-ink focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink">الرقم الضريبي / السجل التجاري (اختياري)</label>
              <input
                type="text"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                placeholder="مثلاً: 934-210-884"
                dir="ltr"
                className="w-full bg-surface border border-line rounded h-10 px-3 text-xs text-ink focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors text-right tabular-nums font-mono"
              />
            </div>
          </div>

          {/* Section: Receipt Header & Footer */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-ink">كلام الترحيب أول الوصل (الترويسة)</label>
            <input
              type="text"
              value={receiptHeader}
              onChange={(e) => setReceiptHeader(e.target.value)}
              placeholder="مثلاً: أهلاً بكم، شرفتمونا!"
              className="w-full bg-surface border border-line rounded h-10 px-3 text-xs text-ink focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-ink">كلام تذييل الوصل (سياسة الاسترجاع ورسالة الشكر)</label>
            <textarea
              rows={2}
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder="مثلاً: شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بالفاتورة."
              className="w-full bg-surface border border-line rounded p-2.5 text-xs text-ink focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Feature #30: Negative Stock Policy */}
          <div className="bg-surface-2 p-3.5 rounded-lg border border-line flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink text-xs">السماح بالبيع بالسالب لما البضاعة تخلص</span>
              <span className="text-[11px] text-ink-muted leading-relaxed">
                مفيد في أول التشغيل عشان حركة البيع والزبائن في الطابور ما تقفش لو لسه ما خلصتش جرد المحل.
              </span>
            </div>
            <ToggleSwitch
              checked={allowNegativeStock}
              onChange={(next) => {
                setAllowNegativeStock(next);
                if (onToggleNegativeStock) onToggleNegativeStock(next);
              }}
              title={allowNegativeStock ? 'مفعّل (البيع شغال مع تنبيه بالسالب)' : 'معطّل (منع البيع لو الرصيد خلص)'}
            />
          </div>

          {/* Feature #110: Default Customer Credit Limit */}
          <div className="bg-surface-2 p-3.5 rounded-lg border border-line flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink text-xs">حد الشكك والتنبيه الافتراضي للزبائن الجدد</span>
              <span className="text-[11px] text-ink-muted leading-relaxed">
                المبلغ بالجنيه لأقصى دين للزبون الجديد. أول ما حسابه يتعدى الرقم ده يظهر تنبيه للكاشير وقت البيع الآجل.
              </span>
            </div>
            <div className="w-32 shrink-0 flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="50"
                value={defaultCustomerCreditLimitEgp}
                onChange={(e) => setDefaultCustomerCreditLimitEgp(Number(e.target.value) || 0)}
                className="w-full bg-surface border border-line rounded h-9 px-2 text-xs text-ink focus:outline-none focus:border-brand text-center font-bold tabular-nums font-mono"
              />
              <span className="text-xs text-ink-muted font-semibold shrink-0">ج.م</span>
            </div>
          </div>

          {/* Feature: Dual Logo Branding Selector (Classic & Modern) */}
          <div className="bg-surface-2 p-3.5 rounded-lg border border-line flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-paid" />
                <span className="font-bold text-ink text-xs">شعار وهوية البرنامج في الشريط العلوي (نسختان متاحتان)</span>
              </div>
              <span className="text-[10px] text-ink-muted bg-surface border border-line px-2 py-0.5 rounded font-medium">
                تنعكس فوراً على واجهة البرنامج
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Classic High-Contrast */}
              <button
                type="button"
                onClick={() => setLogoVariant?.('classic')}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-right cursor-pointer ${
                  logoVariant === 'classic'
                    ? 'bg-surface border-paid shadow-xs ring-2 ring-paid/30'
                    : 'bg-surface/60 hover:bg-surface border-line'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-surface border border-line p-1.5 flex items-center justify-center shrink-0 shadow-2xs">
                  <img src="/logo_classic.png" alt="الشعار الكلاسيكي" className="w-full h-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-ink">الشعار الكلاسيكي الأصلي</span>
                    {logoVariant === 'classic' && <CheckCircle2 className="w-4 h-4 text-paid shrink-0" />}
                  </div>
                  <p className="text-[10.5px] text-ink-muted m-0 mt-0.5 leading-snug">
                    تباين كحلي وزمردي عالي الوضوح، ممتاز للشاشات الفاتحة والخلفيات البيضاء.
                  </p>
                </div>
              </button>

              {/* Option 2: Modern Light */}
              <button
                type="button"
                onClick={() => setLogoVariant?.('modern')}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-right cursor-pointer ${
                  logoVariant === 'modern'
                    ? 'bg-surface border-paid shadow-xs ring-2 ring-paid/30'
                    : 'bg-surface/60 hover:bg-surface border-line'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-brand-dark border border-brand-dark p-1.5 flex items-center justify-center shrink-0 shadow-2xs">
                  <img src="/logo_modern.png" alt="الشعار المودرن" className="w-full h-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-ink">الشعار المودرن الفاتح</span>
                    {logoVariant === 'modern' && <CheckCircle2 className="w-4 h-4 text-paid shrink-0" />}
                  </div>
                  <p className="text-[10.5px] text-ink-muted m-0 mt-0.5 leading-snug">
                    إطار أبيض ناعم مع سهم زمردي، مناسب للشاشات والواجهات الداكنة.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Save Action Button */}
          <button
            type="submit"
            disabled={saveLoading}
            className="mt-1 h-11 bg-brand hover:bg-brand-dark disabled:bg-surface-2 disabled:text-ink-muted text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saveLoading ? 'جاري حفظ البيانات...' : 'حفظ وتطبيق بيانات المحل في البرنامج'}</span>
          </button>
        </form>
      </div>

      {/* LEFT COLUMN: Real 80mm Live Thermal Receipt Preview */}
      <div className="col-span-12 lg:col-span-5 flex flex-col items-center justify-start sticky top-2">
        <div className="w-full max-w-[320px] flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-ink-muted">معاينة وصل الكاشير الحراري (80 مم)</span>
          <span className="text-[10px] font-mono bg-surface border border-line px-2 py-0.5 rounded text-ink-muted">
            203 DPI • ESC/POS
          </span>
        </div>

        {/* Realistic Receipt Canvas Paper */}
        <div className="w-full max-w-[320px] bg-white text-ink font-mono text-[11.5px] p-5 shadow-card border border-line rounded flex flex-col relative select-text">
          {/* Top Zigzag Cut */}
          <div className="w-full h-2 receipt-zigzag mb-2 opacity-30"></div>

          {/* Receipt Header */}
          <div className="text-center flex flex-col gap-0.5">
            <h4 className="text-base font-bold m-0 font-sans text-black">{storeName || 'متجر رفيق'}</h4>
            <p className="text-[11px] text-gray-700 m-0">{address || 'الفرع الرئيسي'}</p>
            {phone && <p className="text-[11px] text-gray-700 m-0 dir-ltr text-center">تليفون: {phone}</p>}
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
              <span>المدفوع كاش:</span>
              <span>100.00 ج.م</span>
            </div>
            <div className="flex justify-between text-[11px] font-bold text-black">
              <span>الباقي للزبون:</span>
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
