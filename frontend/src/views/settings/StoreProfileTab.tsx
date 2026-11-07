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
} from 'lucide-react';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { UnsavedChangesChip } from '../../components/UnsavedChangesChip';
import { optimizeImageForThermal } from '../../utils/thermalImageOptimizer';
import { ReceiptPaper } from '../../components/ReceiptPaper';
import {
  buildReceiptModel,
  buildSampleReceiptSale,
  DEFAULT_DEVELOPER_SIGNATURE,
  receiptTextLimitError,
} from '../../utils/receiptLayout';
import { FIELD_INPUT_CLASS, Field, ReceiptTextField, SettingsCard, ToggleRow } from './settingsParts';
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
        try {
          // Auto-optimize to recommended thermal dimensions & pure high contrast monochrome
          setStoreLogoUrl(await optimizeImageForThermal(reader.result));
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
    statusNode = <UnsavedChangesChip />;
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
                  الأفضل صورة مربعة أو عريضة بخلفية بيضاء أو شفافة. يقوم النظام بتجهيزها تلقائياً بأعلى نقاء للطباعة الحرارية بدون بهتان أو بكسلة.
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
