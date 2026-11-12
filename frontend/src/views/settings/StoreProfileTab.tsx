import { useState, type FormEvent, type ChangeEvent, type RefObject } from 'react';
import {
  Save,
  Image as ImageIcon,
  Upload,
  RotateCcw,
  Store,
  FileText,
  Receipt,
  Printer,
  CheckCircle,
  UserRound,
  Type,
  Layers,
  ScrollText,
} from 'lucide-react';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { UnsavedChangesChip } from '../../components/UnsavedChangesChip';
import { AppButton } from '../../components/AppButton';
import {
  optimizeImageForThermal,
  detectImageComplexity,
  generateThermal1BitSimulation,
  type ThermalOptimizeMode,
} from '../../utils/thermalImageOptimizer';
import { ReceiptPaper } from '../../components/ReceiptPaper';
import {
  buildReceiptModel,
  buildSampleReceiptSale,
  DEFAULT_DEVELOPER_SIGNATURE,
  receiptTextLimitError,
} from '../../utils/receiptLayout';
import { FIELD_INPUT_CLASS, Field, ReceiptTextField, SettingsCard, ToggleRow } from './settingsParts';
import { InvoiceTemplatesTab } from './InvoiceTemplatesTab';
import MotionHeight from '../../components/MotionHeight';
import { BUILT_IN_SIGNATURE_IMAGES } from '../../utils/signatureDefaults';

interface StoreProfileTabProps {
  storeName: string;
  setStoreName: (val: string) => void;
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
  showReceiptLogo?: boolean;
  setShowReceiptLogo?: (val: boolean) => void;
  showReceiptCashier?: boolean;
  setShowReceiptCashier?: (val: boolean) => void;
  showReceiptInvoiceNumber?: boolean;
  setShowReceiptInvoiceNumber?: (val: boolean) => void;
  showReceiptPaid?: boolean;
  setShowReceiptPaid?: (val: boolean) => void;
  showReceiptChange?: boolean;
  setShowReceiptChange?: (val: boolean) => void;
  storeLogoUrl?: string;
  setStoreLogoUrl?: (val: string) => void;
  rawLogoSource?: string | null;
  setRawLogoSource?: (val: string | null) => void;
  thermalLogoMode?: ThermalOptimizeMode;
  setThermalLogoMode?: (mode: ThermalOptimizeMode) => void;
  /** Developer signature settings, read only here (edited on the root console): they only feed the live preview */
  developerSignature?: string;
  developerSignatureVisible?: boolean;
  developerSignatureImage?: string;
  /** Receipt paper width chosen in the printer settings: the preview follows it */
  paperWidth?: '80mm' | '57mm' | 'a4';
  /** true when something on this screen differs from what is saved */
  dirty: boolean;
  saved: boolean;
  saveLoading: boolean;
  handleSave: (e: FormEvent) => void;
  /** Shortcut to the printer settings (paper width and test print); omitted when the user cannot open them */
  onOpenPrinterSettings?: () => void;
  /** Goes on the save bar: the settings page scrolls to it and rings it when the user stays */
  saveBarRef: RefObject<HTMLDivElement | null>;
}

const DEFAULT_LOGOS = ['/receipt_logo.png', '/receipt_logo_square.png', '/logo.png'];
const DEFAULT_LOGO_URL = '/receipt_logo_square.png';

export const StoreProfileTab = ({
  storeName,
  setStoreName,
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
  showReceiptLogo = true,
  setShowReceiptLogo,
  showReceiptCashier = true,
  setShowReceiptCashier,
  showReceiptInvoiceNumber = true,
  setShowReceiptInvoiceNumber,
  showReceiptPaid = true,
  setShowReceiptPaid,
  showReceiptChange = true,
  setShowReceiptChange,
  storeLogoUrl = DEFAULT_LOGO_URL,
  setStoreLogoUrl,
  rawLogoSource = null,
  setRawLogoSource,
  thermalLogoMode = 'dither',
  setThermalLogoMode,
  developerSignature = DEFAULT_DEVELOPER_SIGNATURE,
  developerSignatureVisible = true,
  developerSignatureImage = '',
  paperWidth = '80mm',
  dirty,
  saved,
  saveLoading,
  handleSave,
  onOpenPrinterSettings,
  saveBarRef,
}: StoreProfileTabProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [profileViewMode, setProfileViewMode] = useState<'sales_receipt' | 'other_templates'>('sales_receipt');
  const [localRawSource, setLocalRawSource] = useState<string | null>(null);
  const effectiveRawSource = rawLogoSource || localRawSource || null;
  const logoMode = thermalLogoMode;
  const [isThermalSim, setIsThermalSim] = useState(false);
  const [thermalSimUrl, setThermalSimUrl] = useState('');

  const headerError = receiptTextLimitError(receiptHeader);
  const footerError = receiptTextLimitError(receiptFooter);
  const hasTextError = headerError !== '' || footerError !== '';
  const isDefaultLogo = DEFAULT_LOGOS.includes(storeLogoUrl);
  const previewPaper = paperWidth === '57mm' ? '57mm' : '80mm';

  const handleLogoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !setStoreLogoUrl) return;
    if (!file.type.startsWith('image/')) {
      setLogoError('الملف المختار ليس صورة. اختر ملف PNG أو JPG.');
      return;
    }
    setLogoError('');
    setIsUploading(true);
    const reader = new FileReader();
    reader.onerror = () => {
      setLogoError('تعذر قراءة الملف. جرّب صورة أخرى.');
      setIsUploading(false);
    };
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const raw = reader.result;
        setLocalRawSource(raw);
        setRawLogoSource?.(raw);
        try {
          const tempImg = new Image();
          tempImg.onload = async () => {
            let autoMode: ThermalOptimizeMode = 'crisp';
            try {
              const canvas = document.createElement('canvas');
              canvas.width = Math.min(200, tempImg.width);
              canvas.height = Math.min(200, tempImg.height);
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(tempImg, 0, 0, canvas.width, canvas.height);
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
                autoMode = detectImageComplexity(data.data, canvas.width, canvas.height);
              }
            } catch {
              // fallback to crisp
            }
            setThermalLogoMode?.(autoMode);
            const optimized = await optimizeImageForThermal(raw, { mode: autoMode });
            setStoreLogoUrl(optimized);
            const sim = await generateThermal1BitSimulation(optimized);
            setThermalSimUrl(sim);
            setIsUploading(false);
          };
          tempImg.onerror = async () => {
            setThermalLogoMode?.('crisp');
            const optimized = await optimizeImageForThermal(raw, { mode: 'crisp' });
            setStoreLogoUrl(optimized);
            setIsUploading(false);
          };
          tempImg.src = raw;
        } catch {
          setStoreLogoUrl(raw);
          setIsUploading(false);
        }
      } else {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleModeChange = async (nextMode: ThermalOptimizeMode) => {
    if (!setStoreLogoUrl || isUploading) return;
    const src = effectiveRawSource || storeLogoUrl;
    if (!src || isDefaultLogo) {
      setThermalLogoMode?.(nextMode);
      return;
    }
    setThermalLogoMode?.(nextMode);
    setIsUploading(true);
    try {
      const optimized = await optimizeImageForThermal(src, { mode: nextMode });
      setStoreLogoUrl(optimized);
      const sim = await generateThermal1BitSimulation(optimized);
      setThermalSimUrl(sim);
    } catch (err) {
      console.warn('Thermal logo mode change fallback:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleThermalSim = async () => {
    const next = !isThermalSim;
    setIsThermalSim(next);
    if (next && (!thermalSimUrl || thermalSimUrl === '')) {
      const active = storeLogoUrl;
      if (active && !isDefaultLogo) {
        try {
          const sim = await generateThermal1BitSimulation(active);
          setThermalSimUrl(sim);
        } catch (err) {
          console.warn('Thermal sim fallback:', err);
        }
      }
    }
  };

  let statusNode;
  if (saveLoading) {
    statusNode = <span className="text-ink-muted dark:text-ink-muted-dark">جاري الحفظ...</span>;
  } else if (hasTextError) {
    statusNode = <span className="text-danger dark:text-danger-bright font-semibold">قصّر نصوص الوصل ثم احفظ</span>;
  } else if (dirty) {
    statusNode = null;
  } else if (saved) {
    statusNode = (
      <span className="flex items-center gap-2 text-paid dark:text-paid-bright font-bold">
        <CheckCircle className="w-4 h-4" />
        تم حفظ التغييرات
      </span>
    );
  } else {
    statusNode = <span className="text-ink-muted dark:text-ink-muted-dark">كل التغييرات محفوظة</span>;
  }

  return (
    <div className="flex flex-col gap-5 flex-1">
      {/* Top Tab Bar: Sales Receipt (Mother Invoice) vs All Other Document Templates */}
      <div className="bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-xs rounded-2xl p-2 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line dark:border-line-dark bg-canvas dark:bg-canvas-dark p-1 gap-1.5 text-xs font-bold">
          <button
            type="button"
            aria-pressed={profileViewMode === 'sales_receipt'}
            onClick={() => setProfileViewMode('sales_receipt')}
            className={`flex items-center gap-2 h-9 px-4 rounded-lg cursor-pointer transition-all ${
              profileViewMode === 'sales_receipt'
                ? 'bg-brand text-white shadow-xs dark:bg-brand-dark-soft dark:text-brand-bright dark:border-brand-bright/40'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-2'
            }`}
          >
            <Receipt className="w-4 h-4 shrink-0" />
            <span>فاتورة المبيعات الرئيسية (الفاتورة الأم)</span>
          </button>

          <button
            type="button"
            aria-pressed={profileViewMode === 'other_templates'}
            onClick={() => setProfileViewMode('other_templates')}
            className={`flex items-center gap-2 h-9 px-4 rounded-lg cursor-pointer transition-all ${
              profileViewMode === 'other_templates'
                ? 'bg-brand text-white shadow-xs dark:bg-brand-dark-soft dark:text-brand-bright dark:border-brand-bright/40'
                : 'text-ink-muted dark:text-ink-dark-muted hover:text-ink dark:hover:text-ink-dark hover:bg-surface dark:hover:bg-surface-dark-2'
            }`}
          >
            <ScrollText className="w-4 h-4 shrink-0" />
            <span>معاينة وتخصيص باقي الفواتير والمستندات</span>
          </button>
        </div>

        {profileViewMode === 'sales_receipt' ? (
          <button
            type="button"
            onClick={() => setProfileViewMode('other_templates')}
            className="text-xs font-bold text-brand dark:text-brand-bright hover:underline flex items-center gap-1.5 cursor-pointer px-2"
          >
            <ScrollText className="w-4 h-4" />
            <span>معاينة نماذج المرتجع والمشتريات والسندات</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setProfileViewMode('sales_receipt')}
            className="text-xs font-bold text-brand dark:text-brand-bright hover:underline flex items-center gap-1.5 cursor-pointer px-2"
          >
            <Receipt className="w-4 h-4" />
            <span>العودة لبيانات المحل وفاتورة المبيعات</span>
          </button>
        )}
      </div>

      {profileViewMode === 'other_templates' ? (
        <InvoiceTemplatesTab
          storeName={storeName}
          storePhone={phone}
          storeAddress={address}
          taxNumber={taxNumber}
          storeLogoUrl={storeLogoUrl}
          saveBarRef={saveBarRef}
          onOpenPrinterSettings={onOpenPrinterSettings}
        />
      ) : (
        <div className="grid grid-cols-12 gap-5 flex-1 items-start">
          {/* Form column */}
          <form onSubmit={handleSave} className="col-span-12 xl:col-span-7 flex flex-col gap-5">
            <SettingsCard
              icon={Store}
              title="هوية المحل"
              description="الاسم والعنوان والهاتف والرقم الضريبي تظهر أعلى الوصل المطبوع، والاسم يظهر أيضاً في عنوان البرنامج."
            >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="اسم المحل أو المنشأة" required className="md:col-span-2">
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="مثلاً: سوبر ماركت رفيق"
                className={FIELD_INPUT_CLASS}
                required
              />
            </Field>
            <Field label="العنوان والفرع" className="md:col-span-2">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="مثلاً: 23 شارع الجمهورية - وسط البلد"
                className={FIELD_INPUT_CLASS}
              />
            </Field>
            <Field label="رقم الهاتف">
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01000000000"
                dir="ltr"
                className={`${FIELD_INPUT_CLASS} text-right tabular-nums font-mono`}
              />
            </Field>
            <Field label="الرقم الضريبي أو السجل التجاري">
              <input
                type="text"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                placeholder="934-210-884"
                dir="ltr"
                className={`${FIELD_INPUT_CLASS} text-right tabular-nums font-mono`}
              />
            </Field>
          </div>
        </SettingsCard>

        <MotionHeight>
        <SettingsCard
          icon={ImageIcon}
          title="شعار الوصل"
          description="يُطبع أعلى الوصل قبل اسم المحل."
          action={
            <ToggleSwitch
              checked={showReceiptLogo}
              onChange={(next) => setShowReceiptLogo?.(next)}
              title={showReceiptLogo ? 'الشعار يُطبع على الوصل' : 'الشعار لا يُطبع على الوصل'}
            />
          }
        >
          {showReceiptLogo && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-24 h-16 rounded-lg border border-line dark:border-line-dark bg-white p-1.5 flex items-center justify-center overflow-hidden shrink-0 shadow-xs relative">
                    <img
                      src={isThermalSim && thermalSimUrl ? thermalSimUrl : storeLogoUrl}
                      alt="معاينة الشعار"
                      className="max-h-full max-w-full object-contain [image-rendering:pixelated]"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO_URL;
                      }}
                    />
                    {isThermalSim && (
                      <span dir="ltr" className="absolute bottom-1 right-1 text-micro font-bold px-1.5 py-0.5 rounded bg-ink text-white dark:bg-canvas-dark dark:text-paid-bright dark:border dark:border-paid-bright/30 leading-none shadow-xs">
                        1-Bit
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-48 flex flex-col gap-1">
                    <span className="t-label text-ink dark:text-ink-dark">
                      {isDefaultLogo ? 'شعار رفيق الافتراضي' : 'شعار المحل المخصص'}
                    </span>
                    <span className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                      {isDefaultLogo
                        ? 'ارفع شعار محلك ليحل محله على الوصل.'
                        : 'معالج تلقائياً بتقنية تشتيت النقط الحرارية وتعويض تمدد الحبر.'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={`h-10 px-4 bg-brand dark:bg-paid-bright hover:bg-brand-dark dark:hover:bg-paid-bright-hover text-white dark:text-surface-dark rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${
                        isUploading ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      <span>{isUploading ? 'جاري تجهيز الشعار...' : 'رفع شعار جديد'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={isUploading}
                        onChange={handleLogoUpload}
                      />
                    </label>
                    {!isDefaultLogo && (
                      <AppButton variant="secondary" icon={RotateCcw} onClick={() => {
                        setLocalRawSource(null);
                        setRawLogoSource?.(null);
                        setThermalSimUrl('');
                        setIsThermalSim(false);
                        setStoreLogoUrl?.(DEFAULT_LOGO_URL);
                      }}>
                        الشعار الافتراضي
                      </AppButton>
                    )}
                  </div>
                </div>

                {!isDefaultLogo && (
                  <div className="pt-3 border-t border-line dark:border-line-dark flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-ink-muted dark:text-ink-muted-dark">
                        نمط المعالجة الحرارية:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleModeChange('crisp')}
                        disabled={isUploading}
                        aria-pressed={logoMode === 'crisp'}
                        className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors border cursor-pointer ${
                          logoMode === 'crisp'
                            ? 'bg-brand dark:bg-paid-bright text-white dark:text-surface-dark border-transparent shadow-xs'
                            : 'bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                        } ${isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <Type className="w-3.5 h-3.5" />
                        <span>خطوط ونصوص حادة</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModeChange('dither')}
                        disabled={isUploading}
                        aria-pressed={logoMode === 'dither'}
                        className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors border cursor-pointer ${
                          logoMode === 'dither'
                            ? 'bg-brand dark:bg-paid-bright text-white dark:text-surface-dark border-transparent shadow-xs'
                            : 'bg-surface dark:bg-surface-dark text-ink dark:text-ink-dark border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2'
                        } ${isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>تدرجات وتفاصيل دقيقة</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleThermalSim}
                      aria-pressed={isThermalSim}
                      className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors border cursor-pointer ${
                        isThermalSim
                          ? 'bg-paid-soft dark:bg-paid-dark-soft text-paid dark:text-paid-bright border-paid dark:border-paid-bright/40 shadow-xs'
                          : 'bg-surface dark:bg-surface-dark text-ink-muted dark:text-ink-muted-dark border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-2 hover:text-ink dark:hover:text-ink-dark'
                      }`}
                      title="محاكاة ما يطبعه سن الطابعة الحرارية بالضبط بنقاط الأبيض والأسود"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>معاينة سن الطابعة (1-Bit)</span>
                    </button>
                  </div>
                )}
              </div>

              {logoError ? (
                <span className="text-xs font-semibold text-danger dark:text-danger-bright">{logoError}</span>
              ) : (
                <span className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-paid dark:text-paid-bright shrink-0" />
                  <span>
                    يقوم رفيق تلقائياً بتنظيف خلفيات كاميرا الهاتف، تعويض تمدد الحبر الحراري، وقص الحواف الفارغة لضمان أقصى نقاء.
                  </span>
                </span>
              )}
            </div>
          )}
        </SettingsCard>
        </MotionHeight>

        <SettingsCard
          icon={FileText}
          title="نصوص الوصل"
          description="اضغط Enter للانتقال لسطر جديد (حتى 4 أسطر)، وتُطبع الأسطر كما كتبتها."
        >
          <ReceiptTextField
            label="ترحيب أول الوصل"
            value={receiptHeader}
            onChange={setReceiptHeader}
            rows={2}
            placeholder="مثلاً: أهلاً بكم، شرفتمونا!"
            error={headerError}
          />
          <ReceiptTextField
            label="تذييل الوصل (سياسة الاسترجاع ورسالة الشكر)"
            value={receiptFooter}
            onChange={setReceiptFooter}
            rows={3}
            placeholder="مثلاً: البضاعة المباعة ترد وتستبدل خلال 14 يوماً بالفاتورة."
            hint="لو تُرك فارغاً لا يُطبع شيء."
            error={footerError}
          />
        </SettingsCard>

        <SettingsCard icon={UserRound} title="بيانات الفاتورة" description="ما يظهر في الوصل المطبوع.">
          <ToggleRow
            title="إظهار اسم الكاشير في الوصل"
            description="يُطبع اسم الكاشير الذي أتمّ البيع تلقائياً."
            checked={showReceiptCashier}
            onChange={(next) => setShowReceiptCashier?.(next)}
          />
          <ToggleRow
            title="إظهار رقم الفاتورة في الوصل"
            description="يُطبع سطر فاتورة رقم، ويبقى باركود الفاتورة لأنه يُستخدم للبحث عنها عند المرتجع."
            checked={showReceiptInvoiceNumber}
            onChange={(next) => setShowReceiptInvoiceNumber?.(next)}
          />
          <ToggleRow
            title="إظهار المدفوع في الوصل"
            description="تُطبع صفوف المبلغ المدفوع وطرق الدفع، ويبقى المتبقي آجل على الحساب ظاهراً دائماً."
            checked={showReceiptPaid}
            onChange={(next) => setShowReceiptPaid?.(next)}
          />
          <ToggleRow
            title="إظهار الباقي للعميل في الوصل"
            description="يُطبع المبلغ الذي رُدّ للعميل عند دفعه أكثر من المطلوب."
            checked={showReceiptChange}
            onChange={(next) => setShowReceiptChange?.(next)}
          />
        </SettingsCard>

        <div ref={saveBarRef} className="sticky bottom-0 z-10 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-md rounded-2xl px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs inline-grid items-center">
            <div className="col-start-1 row-start-1">
              <UnsavedChangesChip dirty={dirty && !saveLoading && !hasTextError} />
            </div>
            <div className="col-start-1 row-start-1" role="status">
              {statusNode}
            </div>
          </div>
          <AppButton type="submit" variant="primary" size="lg" icon={Save} loading={saveLoading} disabled={hasTextError || !dirty}>
            حفظ التغييرات
          </AppButton>
        </div>
      </form>

      {/* Preview column: built by the same layout code the printer follows, with a sample basket */}
      <aside className="col-span-12 xl:col-span-5 xl:sticky xl:top-0">
        <SettingsCard
          icon={Receipt}
          title="معاينة الوصل"
          description="بأصناف تجريبية، وتتحدث مع كل تعديل."
          action={
            <span className="text-micro font-bold text-ink-muted dark:text-ink-muted-dark bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark px-2.5 py-1 rounded-lg">
              ورق {previewPaper === '57mm' ? '57' : '80'} مم
            </span>
          }
        >
          <div className="flex justify-center bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4">
            <ReceiptPaper
              model={buildReceiptModel(
                buildSampleReceiptSale(),
                {
                  name: storeName,
                  phone,
                  address,
                  taxNumber,
                  header: receiptHeader,
                  footer: receiptFooter,
                  signature: developerSignature,
                },
                {
                  showCashier: showReceiptCashier,
                  showInvoiceNumber: showReceiptInvoiceNumber,
                  showPaid: showReceiptPaid,
                  showChange: showReceiptChange,
                  signatureVisible: developerSignatureVisible,
                  signatureImage: developerSignatureImage,
                  builtInSignatureImages: BUILT_IN_SIGNATURE_IMAGES,
                },
              )}
              paper={previewPaper}
              logoUrl={showReceiptLogo ? (isThermalSim && thermalSimUrl ? thermalSimUrl : storeLogoUrl) : null}
            />
          </div>
          <p className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0">
            الأسماء والأصناف في المعاينة أمثلة فقط، والوصل الحقيقي يطبع بيانات الفاتورة الفعلية.
          </p>
          {onOpenPrinterSettings && (
            <AppButton variant="secondary" icon={Printer} onClick={onOpenPrinterSettings} className="self-start">
              عرض الورق واختبار الطباعة
            </AppButton>
          )}
        </SettingsCard>
      </aside>
    </div>
    )}
  </div>
  );
};
