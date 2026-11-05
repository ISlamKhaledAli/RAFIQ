import { useState, type FormEvent, type ChangeEvent } from 'react';
import {
  Save,
  Sparkles,
  Image as ImageIcon,
  Upload,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Store,
  FileText,
  Receipt,
  Printer,
  CheckCircle,
  UserRound,
} from 'lucide-react';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { optimizeImageForThermal } from '../../utils/thermalImageOptimizer';
import { ReceiptPaper } from '../../components/ReceiptPaper';
import {
  buildReceiptModel,
  buildSampleReceiptSale,
  DEFAULT_DEVELOPER_SIGNATURE,
  normalizeReceiptText,
  receiptTextLimitError,
  RECEIPT_TEXT_MAX_CHARS,
} from '../../utils/receiptLayout';
import { FIELD_INPUT_CLASS, Field, SettingsCard, ToggleRow } from './settingsParts';
import { SignatureImageField } from './SignatureImageField';
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
  storeLogoUrl?: string;
  setStoreLogoUrl?: (val: string) => void;
  developerSignature?: string;
  setDeveloperSignature?: (val: string) => void;
  /** developer_signature_visible: false hides the whole signature block (root only) */
  developerSignatureVisible?: boolean;
  setDeveloperSignatureVisible?: (val: boolean) => void;
  /** developer_signature_image: '' built-in banner, 'none' no image, or a PNG data URL (root only) */
  developerSignatureImage?: string;
  setDeveloperSignatureImage?: (val: string) => void;
  storeInstapayAddress?: string;
  setStoreInstapayAddress?: (val: string) => void;
  storeWalletNumber?: string;
  setStoreWalletNumber?: (val: string) => void;
  /** Receipt paper width chosen in the printer settings: the preview follows it */
  paperWidth?: '80mm' | '57mm' | 'a4';
  isRoot?: boolean;
  /** true when something on this screen differs from what is saved */
  dirty: boolean;
  saved: boolean;
  saveLoading: boolean;
  handleSave: (e: FormEvent) => void;
  onOpenWizard?: () => void;
  /** Shortcut to the printer settings (paper width and test print); omitted when the user cannot open them */
  onOpenPrinterSettings?: () => void;
}

const DEFAULT_LOGOS = ['/receipt_logo.png', '/receipt_logo_square.png', '/logo.png'];
const DEFAULT_LOGO_URL = '/receipt_logo_square.png';

interface ReceiptTextFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  rows: number;
  placeholder: string;
  hint?: string;
  error: string;
}

/** Multi-line receipt text: Enter starts a new line and the line breaks are printed as typed. */
const ReceiptTextField = ({ label, value, onChange, rows, placeholder, hint, error }: ReceiptTextFieldProps) => (
  <label className="flex flex-col gap-2">
    <span className="t-label text-ink dark:text-ink-dark">{label}</span>
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-invalid={error !== ''}
      className={`w-full bg-surface dark:bg-surface-dark-2 border rounded-lg px-3 py-2.5 text-sm text-ink dark:text-ink-dark placeholder:text-ink-muted/70 dark:placeholder:text-ink-muted-dark/70 focus:outline-none focus:ring-1 transition-colors resize-none leading-relaxed ${
        error
          ? 'border-danger dark:border-danger-bright focus:border-danger dark:focus:border-danger-bright focus:ring-danger dark:focus:ring-danger-bright'
          : 'border-line dark:border-line-dark focus:border-brand dark:focus:border-brand-bright focus:ring-brand dark:focus:ring-brand-bright'
      }`}
    />
    <span className="flex flex-wrap items-center justify-between gap-x-3 text-xs leading-relaxed">
      {error ? (
        <span className="text-danger dark:text-danger-bright font-semibold">{error}</span>
      ) : (
        <span className="text-ink-muted dark:text-ink-muted-dark">{hint ?? ''}</span>
      )}
      <span dir="ltr" className="text-ink-muted dark:text-ink-muted-dark tabular-nums">
        {normalizeReceiptText(value).length} / {RECEIPT_TEXT_MAX_CHARS}
      </span>
    </span>
  </label>
);

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
  storeLogoUrl = DEFAULT_LOGO_URL,
  setStoreLogoUrl,
  developerSignature = DEFAULT_DEVELOPER_SIGNATURE,
  setDeveloperSignature,
  developerSignatureVisible = true,
  setDeveloperSignatureVisible,
  developerSignatureImage = '',
  setDeveloperSignatureImage,
  storeInstapayAddress = '',
  setStoreInstapayAddress,
  storeWalletNumber = '',
  setStoreWalletNumber,
  paperWidth = '80mm',
  isRoot = false,
  dirty,
  saved,
  saveLoading,
  handleSave,
  onOpenWizard,
  onOpenPrinterSettings,
}: StoreProfileTabProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  // Pool image the root clicked to see on the sample receipt (null = the sample invoice's own pick)
  const [previewImageIndex, setPreviewImageIndex] = useState<number | null>(null);

  const headerError = receiptTextLimitError(receiptHeader);
  const footerError = receiptTextLimitError(receiptFooter);
  const signatureError = isRoot ? receiptTextLimitError(developerSignature) : '';
  const hasTextError = headerError !== '' || footerError !== '' || signatureError !== '';
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
        try {
          // Auto-optimize to recommended thermal dimensions (200x70) & pure high contrast monochrome
          setStoreLogoUrl(await optimizeImageForThermal(reader.result, 200, 70));
        } catch {
          setStoreLogoUrl(reader.result);
        }
      }
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  let statusNode;
  if (saveLoading) {
    statusNode = <span className="text-ink-muted dark:text-ink-muted-dark">جاري الحفظ...</span>;
  } else if (hasTextError) {
    statusNode = <span className="text-danger dark:text-danger-bright font-semibold">قصّر نصوص الوصل ثم احفظ</span>;
  } else if (dirty) {
    statusNode = (
      <span className="flex items-center gap-2 text-warn dark:text-warn-bright font-semibold">
        <span className="w-2 h-2 rounded-full bg-warn dark:bg-warn-bright" />
        تغييرات لم تُحفظ بعد
      </span>
    );
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
    <div className="grid grid-cols-12 gap-5 flex-1 items-start">
      {/* Form column */}
      <form onSubmit={handleSave} className="col-span-12 xl:col-span-7 flex flex-col gap-5">
        <SettingsCard
          icon={Store}
          title="هوية المحل"
          description="الاسم والعنوان والهاتف والرقم الضريبي تظهر أعلى الوصل المطبوع، والاسم يظهر أيضاً في عنوان البرنامج."
          action={
            isRoot && onOpenWizard ? (
              <button
                type="button"
                onClick={onOpenWizard}
                className="h-10 px-4 bg-brand-soft dark:bg-brand-bright/15 hover:bg-brand/20 dark:hover:bg-brand-bright/25 text-brand dark:text-brand-bright border border-brand/20 dark:border-brand-bright/30 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>معالج تهيئة المحل والنشاط</span>
              </button>
            ) : undefined
          }
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

        <SettingsCard
          icon={Smartphone}
          title="الدفع الإلكتروني المباشر"
          description="تظهر للكاشير في شاشة الدفع عند تحويل الزبون مباشرة بإنستاباي أو محفظة كاش، دون الحاجة لتشغيل خدمات المحافظ."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="عنوان إنستاباي (IPA أو رقم الهاتف)">
              <input
                type="text"
                value={storeInstapayAddress}
                onChange={(e) => setStoreInstapayAddress?.(e.target.value)}
                placeholder="username@instapay"
                dir="ltr"
                className={`${FIELD_INPUT_CLASS} text-right font-mono`}
              />
            </Field>
            <Field label="رقم محفظة كاش (فودافون وغيرها)">
              <input
                type="text"
                value={storeWalletNumber}
                onChange={(e) => setStoreWalletNumber?.(e.target.value)}
                placeholder="01012345678"
                dir="ltr"
                className={`${FIELD_INPUT_CLASS} text-right font-mono tabular-nums`}
              />
            </Field>
          </div>
        </SettingsCard>

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
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-4 bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4">
                <div className="w-20 h-14 rounded-lg border border-line dark:border-line-dark bg-white p-1 flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    src={storeLogoUrl}
                    alt="معاينة الشعار"
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO_URL;
                    }}
                  />
                </div>
                <div className="flex-1 min-w-48 flex flex-col gap-1">
                  <span className="t-label text-ink dark:text-ink-dark">
                    {isDefaultLogo ? 'شعار رفيق الافتراضي' : 'شعار المحل المخصص'}
                  </span>
                  <span className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                    {isDefaultLogo
                      ? 'ارفع شعار محلك ليحل محله على الوصل.'
                      : 'جُهّز تلقائياً للطباعة الحرارية: أبيض وأسود عالي التباين.'}
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
                    <button
                      type="button"
                      onClick={() => setStoreLogoUrl?.(DEFAULT_LOGO_URL)}
                      className="h-10 px-4 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>الشعار الافتراضي</span>
                    </button>
                  )}
                </div>
              </div>
              {logoError ? (
                <span className="text-xs font-semibold text-danger dark:text-danger-bright">{logoError}</span>
              ) : (
                <span className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed">
                  الأفضل ملف PNG بخلفية بيضاء، بعرض حتى 200 بكسل لورق 80 مم أو 150 بكسل لورق 57 مم.
                </span>
              )}
            </div>
          )}
        </SettingsCard>

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

        <SettingsCard icon={UserRound} title="بيانات الفاتورة" description="ما يظهر في رأس الوصل.">
          <ToggleRow
            title="إظهار اسم الكاشير في الوصل"
            description="يُطبع اسم الكاشير الذي أتمّ البيع تلقائياً."
            checked={showReceiptCashier}
            onChange={(next) => setShowReceiptCashier?.(next)}
          />
        </SettingsCard>

        {isRoot && (
          <SettingsCard
            icon={ShieldCheck}
            title="توقيع المطور أسفل الوصل"
            description="يظهر أسفل كل فواتير البيع، ويعدله حساب المطور (روت) فقط."
          >
            <ToggleRow
              title="إظهار توقيع الإيصال"
              description="يظهر أسفل كل وصل: صورة ثم أسطر النص."
              checked={developerSignatureVisible}
              onChange={(next) => setDeveloperSignatureVisible?.(next)}
            />
            <ReceiptTextField
              label="نص التوقيع"
              value={developerSignature}
              onChange={(next) => setDeveloperSignature?.(next)}
              rows={4}
              placeholder={DEFAULT_DEVELOPER_SIGNATURE}
              hint="تُطبع الصورة فوق هذه الأسطر، ويسمح بأربعة أسطر."
              error={signatureError}
            />
            <SignatureImageField
              value={developerSignatureImage}
              onChange={(next) => setDeveloperSignatureImage?.(next)}
              builtIns={BUILT_IN_SIGNATURE_IMAGES}
              selectedIndex={previewImageIndex}
              onSelect={setPreviewImageIndex}
            />
          </SettingsCard>
        )}

        <div className="sticky bottom-0 z-10 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-md rounded-2xl px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs" role="status">
            {statusNode}
          </div>
          <button
            type="submit"
            disabled={saveLoading || hasTextError || !dirty}
            className="h-11 px-6 bg-brand dark:bg-paid-bright hover:bg-brand-dark dark:hover:bg-paid-bright-hover disabled:bg-surface-2 dark:disabled:bg-surface-dark-3 disabled:text-ink-muted dark:disabled:text-ink-muted-dark disabled:cursor-not-allowed text-white dark:text-surface-dark rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>حفظ التغييرات</span>
          </button>
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
                { showCashier: showReceiptCashier, signatureVisible: developerSignatureVisible, signatureImage: developerSignatureImage, builtInSignatureImages: BUILT_IN_SIGNATURE_IMAGES, signatureImageIndex: previewImageIndex },
              )}
              paper={previewPaper}
              logoUrl={showReceiptLogo ? storeLogoUrl : null}
            />
          </div>
          <p className="text-xs text-ink-muted dark:text-ink-muted-dark leading-relaxed m-0">
            الأسماء والأصناف في المعاينة أمثلة فقط، والوصل الحقيقي يطبع بيانات الفاتورة الفعلية.
          </p>
          {onOpenPrinterSettings && (
            <button
              type="button"
              onClick={onOpenPrinterSettings}
              className="h-10 px-4 self-start bg-surface dark:bg-surface-dark border border-line dark:border-line-dark hover:bg-surface-2 dark:hover:bg-surface-dark-3 text-ink dark:text-ink-dark rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>عرض الورق واختبار الطباعة</span>
            </button>
          )}
        </SettingsCard>
      </aside>
    </div>
  );
};
