import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Store, Save, Sparkles, CheckCircle2, Sun, Moon, Monitor, Palette, Image as ImageIcon, Upload, RotateCcw, ShieldCheck, Info, Wand2 } from 'lucide-react';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { useTheme } from '../../context/useTheme';
import { optimizeImageForThermal } from '../../utils/thermalImageOptimizer';

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
  showReceiptLogo?: boolean;
  setShowReceiptLogo?: (val: boolean) => void;
  storeLogoUrl?: string;
  setStoreLogoUrl?: (val: string) => void;
  developerSignature?: string;
  setDeveloperSignature?: (val: string) => void;
  isRoot?: boolean;
  saveLoading: boolean;
  handleSave: (e: FormEvent) => void;
  onOpenWizard?: () => void;
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
  showReceiptLogo = true,
  setShowReceiptLogo,
  storeLogoUrl = '/receipt_logo_square.png',
  setStoreLogoUrl,
  developerSignature = 'نظام رفيق للأنظمة والحلول البرمجية | تطوير: م. إسلام خالد - 01097782965',
  setDeveloperSignature,
  isRoot = false,
  saveLoading,
  handleSave,
  onOpenWizard,
}: StoreProfileTabProps) => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string' && setStoreLogoUrl) {
        try {
          // Auto-optimize to recommended thermal dimensions (200x70) & pure high contrast monochrome
          const optimized = await optimizeImageForThermal(reader.result, 200, 70);
          setStoreLogoUrl(optimized);
        } catch {
          setStoreLogoUrl(reader.result);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOptimizeCurrentLogo = async () => {
    if (!storeLogoUrl || !setStoreLogoUrl || isOptimizing) return;
    setIsOptimizing(true);
    try {
      const optimized = await optimizeImageForThermal(storeLogoUrl, 200, 70);
      setStoreLogoUrl(optimized);
    } catch (err) {
      console.error('Failed to optimize logo:', err);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleResetLogo = (variant: 'wide' | 'square' = 'square') => {
    if (setStoreLogoUrl) {
      setStoreLogoUrl(variant === 'wide' ? '/receipt_logo.png' : '/receipt_logo_square.png');
    }
  };

  return (
    <div className="grid grid-cols-12 gap-5 flex-1 items-start">
      {/* RIGHT COLUMN: Store Profile Form (7 cols) */}
      <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
        <form 
          onSubmit={handleSave} 
          className="bg-surface dark:bg-surface-dark rounded-lg border border-line dark:border-line-dark shadow-subtle p-5 flex flex-col gap-4 text-xs"
        >
          {/* Header Card */}
          <div className="flex items-center justify-between border-b border-line dark:border-line-dark pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded bg-brand/10 dark:bg-brand-bright/15 text-brand dark:text-brand-bright flex items-center justify-center font-bold">
                <Store className="w-4 h-4 text-brand dark:text-brand-bright" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink dark:text-ink-dark m-0">بيانات وتفاصيل المحل</h3>
                <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark">بتظهر في وصل الكاشير الحراري وفواتير البيع للزبائن</span>
              </div>
            </div>
            {isRoot && onOpenWizard && (
              <button
                type="button"
                onClick={onOpenWizard}
                className="px-3 py-1.5 bg-brand-soft dark:bg-brand-bright/15 hover:bg-brand/20 dark:hover:bg-brand-bright/25 text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 rounded text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-brand dark:text-brand-bright" />
                <span>معالج تهيئة المحل والنشاط</span>
              </button>
            )}
          </div>

          {/* Section: Basic Identity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink dark:text-ink-dark">
                اسم المحل أو المنشأة <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="مثلاً: سوبر ماركت رفيق / مؤسسة النور"
                className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors"
                required
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink dark:text-ink-dark">اسم الكاشير أو الوردية</label>
              <input
                type="text"
                value={cashierName}
                onChange={(e) => setCashierName(e.target.value)}
                placeholder="مثلاً: كاشير (1) / وردية الصباح"
                className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink dark:text-ink-dark">رقم الهاتف للتواصل</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="مثلاً: 01000000000"
                dir="ltr"
                className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors text-right tabular-nums font-mono"
              />
            </div>
          </div>

          {/* Section: Address & Tax */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink dark:text-ink-dark">العنوان والفرع</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="مثلاً: 23 شارع الجمهورية - وسط البلد"
                className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-ink dark:text-ink-dark">الرقم الضريبي / السجل التجاري (اختياري)</label>
              <input
                type="text"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                placeholder="مثلاً: 934-210-884"
                dir="ltr"
                className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors text-right tabular-nums font-mono"
              />
            </div>
          </div>

          {/* Section: Receipt Header & Footer */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-ink dark:text-ink-dark">كلام الترحيب أول الوصل (الترويسة)</label>
            <input
              type="text"
              value={receiptHeader}
              onChange={(e) => setReceiptHeader(e.target.value)}
              placeholder="مثلاً: أهلاً بكم، شرفتمونا!"
              className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded h-10 px-3 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-ink dark:text-ink-dark">كلام تذييل الوصل (سياسة الاسترجاع ورسالة الشكر)</label>
            <textarea
              rows={2}
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder="مثلاً: شكراً لزيارتكم! البضاعة المباعة ترد وتستبدل خلال 14 يوماً بالفاتورة."
              className="w-full bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded p-2.5 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright focus:ring-1 focus:ring-brand dark:focus:ring-brand-bright transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Section: Receipt Logo Customization & Technical Guidance */}
          <div className="bg-surface-2 dark:bg-surface-dark-2 p-3.5 rounded-lg border border-line dark:border-line-dark flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-brand dark:text-brand-bright" />
                <span className="font-bold text-ink dark:text-ink-dark text-xs">شعار المتجر أعلى الإيصال الحراري</span>
              </div>
              <ToggleSwitch
                checked={showReceiptLogo}
                onChange={(next) => setShowReceiptLogo && setShowReceiptLogo(next)}
                title={showReceiptLogo ? 'مفعّل (طباعة الشعار أعلى الوصل)' : 'معطّل (إلغاء طباعة الشعار)'}
              />
            </div>

            {showReceiptLogo && (
              <div className="flex flex-col gap-3 pt-1 border-t border-line dark:border-line-dark">
                {/* Controls and current preview */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-surface dark:bg-surface-dark p-3 rounded border border-line dark:border-line-dark">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-12 rounded border border-line dark:border-line-dark bg-white dark:bg-surface-dark-3 p-1 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                      <img
                        src={storeLogoUrl}
                        alt="معاينة الشعار"
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/receipt_logo_square.png';
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-ink dark:text-ink-dark">
                        {storeLogoUrl !== '/receipt_logo.png' && storeLogoUrl !== '/receipt_logo_square.png' && storeLogoUrl !== '/logo.png'
                          ? 'شعار مخصص للمتجر (مجهّز حرارياً)'
                          : 'شعار رفيق المعتمد للطابعات الحرارية (Monochrome)'}
                      </span>
                      <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark">
                        أبيض وأسود نقي عالي التباين بدقة 203 DPI بدون بهتان
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center flex-wrap gap-2">
                    {/* Default Rafiq Variants Toggle */}
                    {(storeLogoUrl === '/receipt_logo.png' || storeLogoUrl === '/receipt_logo_square.png' || storeLogoUrl === '/logo.png') && (
                      <div className="flex items-center gap-1 bg-surface-2 dark:bg-surface-dark-2 p-0.5 rounded border border-line dark:border-line-dark text-[11px]">
                        <button
                          type="button"
                          onClick={() => handleResetLogo('square')}
                          className={`px-2 py-1 rounded transition-colors ${
                            storeLogoUrl === '/receipt_logo_square.png'
                              ? 'bg-brand text-white font-bold'
                              : 'text-ink-muted hover:text-ink dark:text-ink-muted-dark'
                          }`}
                        >
                          شعار مربع (120×120) • الافتراضي
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetLogo('wide')}
                          className={`px-2 py-1 rounded transition-colors ${
                            storeLogoUrl === '/receipt_logo.png' || storeLogoUrl === '/logo.png'
                              ? 'bg-brand text-white font-bold'
                              : 'text-ink-muted hover:text-ink dark:text-ink-muted-dark'
                          }`}
                        >
                          شعار عريض (200×60)
                        </button>
                      </div>
                    )}

                    {/* Optimize custom logo button */}
                    {storeLogoUrl !== '/receipt_logo.png' && storeLogoUrl !== '/receipt_logo_square.png' && storeLogoUrl !== '/logo.png' && (
                      <button
                        type="button"
                        onClick={handleOptimizeCurrentLogo}
                        disabled={isOptimizing}
                        className="px-2.5 py-1.5 bg-paid-soft dark:bg-paid-dark/30 text-paid dark:text-paid-bright border border-paid/30 hover:bg-paid/20 rounded text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title="تحسين ومعالجة الشعار تلقائياً إلى أبيض وأسود عالي التباين وأبعاد 200×70"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>{isOptimizing ? 'جاري المعالجة...' : 'تحسين حراري'}</span>
                      </button>
                    )}

                    <label className="px-3 py-1.5 bg-brand text-white hover:bg-brand-hover rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      <span>رفع شعار جديد</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </label>

                    {storeLogoUrl !== '/receipt_logo.png' && storeLogoUrl !== '/receipt_logo_square.png' && storeLogoUrl !== '/logo.png' && (
                      <button
                        type="button"
                        onClick={() => handleResetLogo('square')}
                        className="px-2.5 py-1.5 bg-surface-2 dark:bg-surface-dark-2 text-ink-muted hover:text-ink dark:text-ink-muted-dark dark:hover:text-ink-dark border border-line dark:border-line-dark rounded text-xs font-medium flex items-center gap-1 transition-colors"
                        title="استعادة الشعار الافتراضي لنظام رفيق"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>الافتراضي</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Technical Recommended Dimensions Banner */}
                <div className="bg-brand-soft/40 dark:bg-brand-dark/20 border border-brand/20 dark:border-brand-bright/20 rounded p-2.5 text-[11px] leading-relaxed text-ink dark:text-ink-dark flex items-start gap-2">
                  <Info className="w-4 h-4 text-brand dark:text-brand-bright shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <div className="font-bold text-brand dark:text-brand-bright">
                      المقاسات والمواصفات الفنية الموصى بها للطابعات الحرارية:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-ink-muted dark:text-ink-muted-dark text-[10.5px]">
                      <li>
                        <strong className="text-ink dark:text-ink-dark">ورق قياسي 80 مم:</strong> الأبعاد المثالية هي <span dir="ltr" className="font-mono font-semibold">200 × 70</span> بكسل (أو مربع حتى <span dir="ltr" className="font-mono font-semibold">120 × 120</span> بكسل).
                      </li>
                      <li>
                        <strong className="text-ink dark:text-ink-dark">ورق مضغوط 57 مم:</strong> الأبعاد المثالية هي <span dir="ltr" className="font-mono font-semibold">150 × 50</span> بكسل.
                      </li>
                      <li>
                        <strong className="text-ink dark:text-ink-dark">نقاء الطباعة:</strong> يُفضل دائماً ملف <span className="font-semibold">PNG</span> بخلفية بيضاء نقية أو مفرغة، مع تصميم أبيض وأسود عالي التباين (High Contrast / Grayscale) وبدقة 203 DPI لتجنب أي بهتان في رأس الطباعة الحراري.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section: Developer Signature & Branding (Root Protected) */}
          {isRoot && (
            <div className="bg-surface-2 dark:bg-surface-dark-2 p-3.5 rounded-lg border border-line dark:border-line-dark flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-paid dark:text-paid-bright" />
                  <span className="font-bold text-ink dark:text-ink-dark text-xs">
                    حقوق وتوقيع مطور النظام (دعاية النظام أسفل الفاتورة)
                  </span>
                </div>

                <span className="text-[10px] font-bold text-paid dark:text-paid-bright bg-paid-soft dark:bg-paid-dark/30 border border-paid/30 px-2 py-0.5 rounded flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>صلاحية روت مفعّلة (المطور)</span>
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  value={developerSignature}
                  onChange={(e) => setDeveloperSignature && setDeveloperSignature(e.target.value)}
                  placeholder="نظام رفيق للأنظمة والحلول البرمجية | تطوير: م. إسلام خالد - 01097782965"
                  className="w-full rounded h-9 px-3 text-xs font-medium transition-colors bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright"
                />
                <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                  بصفتك المطور (روت)، يمكنك تخصيص عبارة الدعاية والتوقيع البرمجي التي تظهر في سطر أسفل جميع فواتير البيع.
                </span>
              </div>
            </div>
          )}

          {/* Feature #30: Negative Stock Policy */}
          <div className="bg-surface-2 dark:bg-surface-dark-2 p-3.5 rounded-lg border border-line dark:border-line-dark flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">السماح بالبيع بالسالب لما البضاعة تخلص</span>
              <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed">
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
          <div className="bg-surface-2 dark:bg-surface-dark-2 p-3.5 rounded-lg border border-line dark:border-line-dark flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-ink dark:text-ink-dark text-xs">حد الشكك والتنبيه الافتراضي للزبائن الجدد</span>
              <span className="text-[11px] text-ink-muted dark:text-ink-muted-dark leading-relaxed">
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
                className="w-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark rounded h-9 px-2 text-xs text-ink dark:text-ink-dark focus:outline-none focus:border-brand dark:focus:border-brand-bright text-center font-bold tabular-nums font-mono"
              />
              <span className="text-xs text-ink-muted dark:text-ink-muted-dark font-semibold shrink-0">ج.م</span>
            </div>
          </div>



          {/* Feature: Theme Mode (Light / Dark / System) */}
          <div className="bg-surface-2 dark:bg-surface-dark-2 p-3.5 rounded-lg border border-line dark:border-line-dark flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-paid dark:text-paid-bright" />
                <span className="font-bold text-ink dark:text-ink-dark text-xs">مظهر البرنامج والسمة البصرية (الوضع النهاري والداكن)</span>
              </div>
              <span className="text-[10px] text-ink-muted dark:text-ink-muted-dark bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-2 py-0.5 rounded font-medium">
                {theme === 'system' ? `تلقائي (${resolvedTheme === 'dark' ? 'داكن' : 'نهاري'})` : theme === 'dark' ? 'الوضع الليلي' : 'الوضع النهاري'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Option 1: Light Mode */}
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-all text-right cursor-pointer ${
                  theme === 'light'
                    ? 'bg-surface dark:bg-surface-dark border-paid dark:border-paid-bright shadow-xs ring-2 ring-paid/30 dark:ring-paid-bright/30'
                    : 'bg-surface/60 dark:bg-surface-dark/60 hover:bg-surface dark:hover:bg-surface-dark border-line dark:border-line-dark'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-surface-dark-3 border border-amber-200 dark:border-line-dark text-amber-500 dark:text-warn-bright flex items-center justify-center shrink-0">
                  <Sun className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-ink dark:text-ink-dark">نهاري (فاتح)</span>
                    {theme === 'light' && <CheckCircle2 className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />}
                  </div>
                  <p className="text-[10px] text-ink-muted dark:text-ink-muted-dark m-0 mt-0.5 leading-snug">
                    الوضع الافتراضي عالي الإشراق
                  </p>
                </div>
              </button>

              {/* Option 2: Dark Mode */}
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-all text-right cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-surface dark:bg-surface-dark border-paid dark:border-paid-bright shadow-xs ring-2 ring-paid/30 dark:ring-paid-bright/30'
                    : 'bg-surface/60 dark:bg-surface-dark/60 hover:bg-surface dark:hover:bg-surface-dark border-line dark:border-line-dark'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-surface-dark-3 border border-indigo-200 dark:border-line-dark text-indigo-600 dark:text-brand-bright flex items-center justify-center shrink-0">
                  <Moon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-ink dark:text-ink-dark">ليلي (داكن)</span>
                    {theme === 'dark' && <CheckCircle2 className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />}
                  </div>
                  <p className="text-[10px] text-ink-muted dark:text-ink-muted-dark m-0 mt-0.5 leading-snug">
                    مريح للعينين في الإضاءة المنخفضة
                  </p>
                </div>
              </button>

              {/* Option 3: System Mode */}
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-all text-right cursor-pointer ${
                  theme === 'system'
                    ? 'bg-surface dark:bg-surface-dark border-paid dark:border-paid-bright shadow-xs ring-2 ring-paid/30 dark:ring-paid-bright/30'
                    : 'bg-surface/60 dark:bg-surface-dark/60 hover:bg-surface dark:hover:bg-surface-dark border-line dark:border-line-dark'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark text-ink-muted dark:text-ink-muted-dark flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-ink dark:text-ink-dark">تلقائي (الويندوز)</span>
                    {theme === 'system' && <CheckCircle2 className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />}
                  </div>
                  <p className="text-[10px] text-ink-muted dark:text-ink-muted-dark m-0 mt-0.5 leading-snug">
                    يتوافق تلقائياً مع نظام التشغيل
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Save Action Button */}
          <button
            type="submit"
            disabled={saveLoading}
            className="mt-1 h-11 bg-brand dark:bg-paid-bright hover:bg-brand-dark dark:hover:bg-paid disabled:bg-surface-2 dark:disabled:bg-surface-dark-2 disabled:text-ink-muted dark:disabled:text-ink-muted-dark text-white dark:text-slate-900 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saveLoading ? 'جاري حفظ البيانات...' : 'حفظ وتطبيق بيانات المحل في البرنامج'}</span>
          </button>
        </form>
      </div>

      {/* LEFT COLUMN: Real 80mm Live Thermal Receipt Preview */}
      <div className="col-span-12 lg:col-span-5 flex flex-col items-center justify-start sticky top-2">
        <div className="w-full max-w-[320px] flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-ink-muted dark:text-ink-muted-dark">معاينة وصل الكاشير الحراري (80 مم)</span>
          <span className="text-[10px] font-mono bg-surface dark:bg-surface-dark-2 border border-line dark:border-line-dark px-2 py-0.5 rounded text-ink-muted dark:text-ink-muted-dark">
            203 DPI • ESC/POS
          </span>
        </div>

        {/* Realistic Receipt Canvas Paper */}
        <div className="w-full max-w-[320px] bg-white text-ink font-mono text-[11.5px] p-5 shadow-card border border-line dark:border-line-dark rounded flex flex-col relative select-text">
          {/* Top Zigzag Cut */}
          <div className="w-full h-2 receipt-zigzag mb-2 opacity-30"></div>

          {/* Receipt Header & Logo */}
          <div className="text-center flex flex-col gap-0.5 items-center">
            {showReceiptLogo && (
              <div className="flex justify-center mb-1">
                <img
                  src={storeLogoUrl}
                  alt="شعار المتجر"
                  className="max-h-11 max-w-[150px] object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/receipt_logo_square.png';
                  }}
                />
              </div>
            )}
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

          {/* Developer Branding Signature */}
          <div className="border-t border-dotted border-gray-400 pt-1.5 mt-2 text-center text-[9px] text-gray-500 font-sans tracking-tight">
            {developerSignature}
          </div>

          {/* Bottom Zigzag Cut */}
          <div className="w-full h-2 receipt-zigzag mt-3 opacity-30"></div>
        </div>
      </div>
    </div>
  );
};
