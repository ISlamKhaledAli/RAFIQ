import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle, Receipt, Save, ShieldCheck } from 'lucide-react';
import { invoke } from '../../bridge/ipc';
import { ReceiptPaper } from '../../components/ReceiptPaper';
import { RafiqLoadingState } from '../../components/RafiqLoadingState';
import { rafiqAlert } from '../../utils/dialogService';
import {
  buildReceiptModel,
  buildSampleReceiptSale,
  DEFAULT_DEVELOPER_SIGNATURE,
  normalizeReceiptText,
  receiptTextLimitError,
  resolveReceiptFooter,
  resolveReceiptSignature,
} from '../../utils/receiptLayout';
import { BUILT_IN_SIGNATURE_IMAGES } from '../../utils/signatureDefaults';
import { PRIMARY_BUTTON_CLASS, ReceiptTextField, SettingsCard, ToggleRow } from '../settings/settingsParts';
import { SignatureImageField } from './SignatureImageField';

const DEFAULT_LOGO_URL = '/receipt_logo_square.png';

/** Store data the sample receipt needs; read only here (the owner edits it in the store settings). */
interface StoreReceiptData {
  name: string;
  phone: string;
  address: string;
  taxNumber: string;
  header: string;
  footer: string;
  showLogo: boolean;
  logoUrl: string;
  showCashier: boolean;
  paper: '80mm' | '57mm';
}

const EMPTY_STORE: StoreReceiptData = {
  name: '',
  phone: '',
  address: '',
  taxNumber: '',
  header: '',
  footer: '',
  showLogo: true,
  logoUrl: DEFAULT_LOGO_URL,
  showCashier: true,
  paper: '80mm',
};

/** Root page: the developer signature printed under every receipt (text, visibility and image gallery). */
export const RootReceiptPage = () => {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [store, setStore] = useState<StoreReceiptData>(EMPTY_STORE);
  const [signature, setSignature] = useState(DEFAULT_DEVELOPER_SIGNATURE);
  const [visible, setVisible] = useState(true);
  const [image, setImage] = useState('');
  const [baseline, setBaseline] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Pool image the root clicked to see on the sample receipt (null = the sample invoice's own pick)
  const [previewImageIndex, setPreviewImageIndex] = useState<number | null>(null);

  const snapshot = JSON.stringify([normalizeReceiptText(signature), visible, image]);
  const dirty = loaded && snapshot !== baseline;
  const signatureError = receiptTextLimitError(signature);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const settings = await invoke<Record<string, string>>('settings:getAll');
        if (!active) return;
        const s = settings ?? {};
        const nextSignature = s.developer_signature ? resolveReceiptSignature(s.developer_signature) : DEFAULT_DEVELOPER_SIGNATURE;
        const nextVisible = s.developer_signature_visible !== '0';
        const nextImage = s.developer_signature_image ?? '';
        setSignature(nextSignature);
        setVisible(nextVisible);
        setImage(nextImage);
        setBaseline(JSON.stringify([normalizeReceiptText(nextSignature), nextVisible, nextImage]));
        setStore({
          name: s.store_name ?? '',
          phone: s.store_phone ?? '',
          address: s.store_address ?? '',
          taxNumber: s.tax_number ?? '',
          header: s.receipt_header ?? '',
          footer: resolveReceiptFooter(s.receipt_footer),
          showLogo: s.show_receipt_logo === undefined ? true : s.show_receipt_logo === '1' || s.show_receipt_logo === 'true',
          logoUrl:
            !s.store_logo_url || s.store_logo_url === '/logo.png' || s.store_logo_url === '/receipt_logo.png'
              ? DEFAULT_LOGO_URL
              : s.store_logo_url,
          showCashier: s.receipt_show_cashier !== '0',
          paper: s.receipt_paper_width === '57mm' ? '57mm' : '80mm',
        });
        setLoaded(true);
      } catch (err: unknown) {
        if (active) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (signatureError) return;
    setSaving(true);
    try {
      await invoke('settings:save', {
        developer_signature: normalizeReceiptText(signature),
        developer_signature_visible: visible ? '1' : '0',
        developer_signature_image: image,
      });
      setBaseline(snapshot);
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      void rafiqAlert({ title: 'فشل حفظ التوقيع', message: `فشل حفظ توقيع الإيصال: ${msg}`, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div role="alert" className="bg-danger-soft dark:bg-danger-dark-soft border border-danger/30 dark:border-danger-bright/30 text-danger dark:text-danger-bright rounded-2xl p-5 font-semibold">
        تعذر قراءة إعدادات الإيصال: {loadError}
      </div>
    );
  }

  if (!loaded) {
    return <RafiqLoadingState label="جاري تحميل إعدادات التوقيع..." minHeight="min-h-64" />;
  }

  let statusNode;
  if (saving) {
    statusNode = <span className="text-ink-muted dark:text-ink-muted-dark">جاري الحفظ...</span>;
  } else if (signatureError) {
    statusNode = <span className="text-danger dark:text-danger-bright font-semibold">قصّر نص التوقيع ثم احفظ</span>;
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
        تم حفظ التوقيع
      </span>
    );
  } else {
    statusNode = <span className="text-ink-muted dark:text-ink-muted-dark">كل التغييرات محفوظة</span>;
  }

  return (
    <div className="grid grid-cols-12 gap-5 items-start text-sm">
      <form onSubmit={(e) => void handleSave(e)} className="col-span-12 xl:col-span-7 flex flex-col gap-5">
        <SettingsCard
          icon={ShieldCheck}
          title="توقيع المطور أسفل الوصل"
          description="يظهر أسفل كل فواتير البيع، ولا يستطيع صاحب المحل تعديله."
        >
          <ToggleRow
            title="إظهار توقيع الإيصال"
            description="يظهر أسفل كل وصل: صورة ثم أسطر النص."
            checked={visible}
            onChange={setVisible}
          />
          <ReceiptTextField
            label="نص التوقيع"
            value={signature}
            onChange={setSignature}
            rows={4}
            placeholder={DEFAULT_DEVELOPER_SIGNATURE}
            hint="تُطبع الصورة فوق هذه الأسطر، ويسمح بأربعة أسطر."
            error={signatureError}
          />
          <SignatureImageField
            value={image}
            onChange={setImage}
            builtIns={BUILT_IN_SIGNATURE_IMAGES}
            selectedIndex={previewImageIndex}
            onSelect={setPreviewImageIndex}
          />
        </SettingsCard>

        <div className="sticky bottom-0 z-10 bg-surface dark:bg-surface-dark border border-line dark:border-line-dark shadow-md rounded-2xl px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm" role="status">
            {statusNode}
          </div>
          <button type="submit" disabled={saving || !!signatureError || !dirty} className={PRIMARY_BUTTON_CLASS}>
            <Save className="w-4 h-4" />
            <span>حفظ التوقيع</span>
          </button>
        </div>
      </form>

      <aside className="col-span-12 xl:col-span-5 xl:sticky xl:top-0">
        <SettingsCard
          icon={Receipt}
          title="معاينة الوصل"
          description="بأصناف تجريبية وببيانات المحل الحالية، وتتحدث مع كل تعديل."
        >
          <div className="flex justify-center bg-surface-2 dark:bg-surface-dark-2 border border-line dark:border-line-dark rounded-xl p-4">
            <ReceiptPaper
              model={buildReceiptModel(
                buildSampleReceiptSale(),
                {
                  name: store.name,
                  phone: store.phone,
                  address: store.address,
                  taxNumber: store.taxNumber,
                  header: store.header,
                  footer: store.footer,
                  signature,
                },
                {
                  showCashier: store.showCashier,
                  signatureVisible: visible,
                  signatureImage: image,
                  builtInSignatureImages: BUILT_IN_SIGNATURE_IMAGES,
                  signatureImageIndex: previewImageIndex,
                },
              )}
              paper={store.paper}
              logoUrl={store.showLogo ? store.logoUrl : null}
            />
          </div>
        </SettingsCard>
      </aside>
    </div>
  );
};
