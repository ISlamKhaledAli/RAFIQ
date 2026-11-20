import React, { useState } from 'react';
import type { Store } from '../../types';
import { buildWhatsAppUrl } from '../../utils/whatsapp';
import { ToggleSwitch } from './ToggleSwitch';
import {
  Store as StoreIcon,
  Phone,
  MapPin,
  Clock,
  Truck,
  FileText,
  Plus,
  Trash2,
  Check,
  PauseCircle,
  PlayCircle,
  Copy,
  ExternalLink,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Smartphone,
  Image as ImageIcon,
} from 'lucide-react';

interface Props {
  store: Store;
  isDemoStore?: boolean;
  hasCustomPin?: boolean;
  storeName: string;
  welcomeMessage: string;
  phone: string;
  whatsapp: string;
  address: string;
  vodafoneCashPhone?: string;
  instapayHandle?: string;
  workingHoursText: string;
  minOrderPounds: string;
  isPaused: boolean;
  pauseMessage: string;
  deliveryZones: Array<{ name: string; fee: number }>;
  isSaving: boolean;
  onStoreNameChange: (v: string) => void;
  onWelcomeMessageChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onWhatsappChange: (v: string) => void;
  onAddressChange: (v: string) => void;
  onVodafoneCashPhoneChange?: (v: string) => void;
  onInstapayHandleChange?: (v: string) => void;
  onWorkingHoursChange: (v: string) => void;
  onMinOrderChange: (v: string) => void;
  onTogglePaused: () => void;
  onPauseMessageChange: (v: string) => void;
  onAddDeliveryZone: (name: string, feePiasters: number) => void;
  onRemoveDeliveryZone: (idx: number) => void;
  onSave: () => void;
  onChangePin?: (currentPin: string, newPin: string) => Promise<void>;
  onBackToStore: () => void;
}

export const StoreSettingsPanel: React.FC<Props> = ({
  store,
  isDemoStore = false,
  hasCustomPin = false,
  storeName,
  welcomeMessage,
  phone,
  whatsapp,
  address,
  vodafoneCashPhone = '',
  instapayHandle = '',
  workingHoursText,
  minOrderPounds,
  isPaused,
  pauseMessage,
  deliveryZones,
  isSaving,
  onStoreNameChange,
  onWelcomeMessageChange,
  onPhoneChange,
  onWhatsappChange,
  onAddressChange,
  onVodafoneCashPhoneChange,
  onInstapayHandleChange,
  onWorkingHoursChange,
  onMinOrderChange,
  onTogglePaused,
  onPauseMessageChange,
  onAddDeliveryZone,
  onRemoveDeliveryZone,
  onSave,
  onChangePin,
  onBackToStore,
}) => {
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneFee, setNewZoneFee] = useState('20');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Security PIN change state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [pinFeedback, setPinFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onChangePin) return;
    setPinFeedback(null);

    if (!currentPin.trim()) {
      setPinFeedback({ type: 'error', text: 'يرجى إدخال الرمز السري الحالي (الافتراضي لأول مرة: 1234)' });
      return;
    }
    if (newPin.trim().length < 4 || newPin.trim().length > 20) {
      setPinFeedback({ type: 'error', text: 'يجب أن يتكون الرمز السري الجديد من 4 إلى 20 رقماً أو حرفاً' });
      return;
    }
    if (newPin.trim() !== confirmPin.trim()) {
      setPinFeedback({ type: 'error', text: 'الرمز السري الجديد وتأكيده غير متطابقين' });
      return;
    }

    setIsUpdatingPin(true);
    try {
      await onChangePin(currentPin.trim(), newPin.trim());
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setPinFeedback({ type: 'success', text: 'تم تحديث الرمز السري للوحة التحكم بنجاح وتأمين الجلسة.' });
    } catch (err: any) {
      setPinFeedback({ type: 'error', text: err?.message || 'تعذر تغيير الرمز السري، تأكد من الرمز الحالي.' });
    } finally {
      setIsUpdatingPin(false);
    }
  };

  const storePublicUrl = `https://rafiq-store-web.rafiq-store-api.workers.dev/${store.slug}`;

  const handleCopyUrl = () => {
    try {
      navigator.clipboard.writeText(storePublicUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {}
  };

  const handleAddZoneSubmit = () => {
    if (!newZoneName.trim()) return;
    const parsed = parseFloat(newZoneFee || '0');
    const feePiasters = isNaN(parsed) ? 0 : Math.max(0, Math.round(parsed * 100));
    onAddDeliveryZone(newZoneName.trim(), feePiasters);
    setNewZoneName('');
    setNewZoneFee('20');
  };

  return (
    <div className="space-y-5 pb-20">
      {/* 1. Store Operational Status & Share Link Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Live Status Switch Card */}
        <div
          className={`lg:col-span-7 rounded-2xl border p-5 shadow-2xs space-y-4 transition-colors ${
            isPaused ? 'bg-amber-50/70 border-amber-200' : 'bg-white border-slate-200/90'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  isPaused ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {isPaused ? <PauseCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  {isPaused ? 'المتجر مغلق مؤقتاً أمام الطلبات' : 'المتجر مفتوح ويستقبل الطلبات'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isPaused
                    ? 'يمكن للزبائن تصفح الأصناف لكن لن يتمكنوا من إتمام طلب جديد حتى إعادة الفتح.'
                    : 'عملاؤك يقدرون يطلبوا الآن أونلاين وتصلك الطلبات فوراً هنا وعلى الكاشير.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <ToggleSwitch
                checked={!isPaused}
                onChange={() => onTogglePaused()}
                label={isPaused ? 'مغلق مؤقتاً' : 'مفتوح للطلب'}
                size="md"
              />
            </div>
          </div>

          {isPaused && (
            <div className="motion-nav-group">
              <div className="pt-2 border-t border-amber-200/80 space-y-1.5">
                <label className="block text-xs font-bold text-amber-900">
                  رسالة الإغلاق المؤقت التي تظهر للزبائن
                </label>
                <input
                  type="text"
                  value={pauseMessage}
                  onChange={e => onPauseMessageChange(e.target.value)}
                  placeholder="مثال: المتجر مغلق مؤقتاً للجرد وسنعود لاستقبال طلباتكم الساعة 5 مساءً"
                  className="w-full text-xs font-bold p-2.5 rounded-xl border border-amber-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Store Direct Link Card */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-store-primary" />
              <span>الرابط الرسمي لمتجرك</span>
            </div>
            <div
              dir="ltr"
              className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-slate-700 truncate"
            >
              {storePublicUrl}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-store-primary-light hover:bg-store-primary/15 text-store-primary text-xs font-black transition-colors cursor-pointer"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? 'تم النسخ' : 'نسخ الرابط'}</span>
            </button>
            <button
              type="button"
              onClick={onBackToStore}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>معاينة</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Identity & Announcement Banner Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-5">
        <div className="pb-3 border-b border-slate-100">
          <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-store-primary" />
            <span>هوية المتجر وشريط الإعلانات</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            الاسم والشريط العلوي يظهران للزبائن في رأس المتجر وفي معاينة رابط واتساب
          </p>
        </div>

        {/* Store Logo & Branding Identity */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white border border-slate-200 p-1.5 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-2xs">
            <img
              src={store.logo_url || '/rafiq_logo.png'}
              alt={storeName}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/rafiq_logo.png';
              }}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-store-primary" />
                <span>شعار المتجر الرسمي</span>
              </span>
              {store.logo_url ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  شعار مخصص
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  شعار رفيق الافتراضي
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              يتزامن تلقائياً وبأعلى جودة ألوان من إعدادات كاشير رفيق (بيانات المتجر)، ويظهر في رأس الموقع وعلى الفواتير وأيقونة تبويب المتصفح.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">اسم المتجر / المحل</label>
            <input
              type="text"
              value={storeName}
              onChange={e => onStoreNameChange(e.target.value)}
              placeholder="مثال: سوبر ماركت النور"
              className="w-full text-xs font-bold p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-store-primary transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-store-primary" />
              <span>شريط الإعلانات والرسالة الترحيبية</span>
            </label>
            <input
              type="text"
              value={welcomeMessage}
              onChange={e => onWelcomeMessageChange(e.target.value)}
              placeholder="مثال: توصيل مجاني للطلبات فوق 250 جنيه طوال الأسبوع"
              className="w-full text-xs font-bold p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-store-primary transition-all"
            />
          </div>
        </div>

        {/* Live Announcement Strip Preview */}
        {welcomeMessage.trim() && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400">معاينة الشريط كما يظهر أعلى المتجر:</span>
            <div className="rounded-xl bg-gradient-to-r from-store-primary via-store-secondary to-store-primary text-white text-xs py-2 px-4 text-center font-bold flex items-center justify-center gap-2 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-store-accent flex-shrink-0" />
              <span className="truncate">{welcomeMessage}</span>
            </div>
          </div>
        )}
      </div>

      {/* 2.5. Electronic Payment Accounts (Vodafone Cash & InstaPay) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
        <div className="pb-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-store-primary" />
              <span>حسابات ومحافظ الدفع الإلكتروني (فودافون كاش وإنستاباي)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تظهر تلقائياً للعميل عند اختيار الدفع بالمحفظة أو إنستاباي في صفحة الدفع والسلة مع زر نسخ فوري ورفع إيصال التحويل
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-[#EAF5EE] text-[#006D41] border border-[#006D41]/25">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>مربوط تلقائياً بالمحفظة الأساسية في الكاشير</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>رقم محفظة فودافون كاش (Vodafone Cash)</span>
              {vodafoneCashPhone.trim() && (
                <span className="text-[10px] text-emerald-700 font-bold">جاهز لاستقبال التحويلات</span>
              )}
            </label>
            <input
              type="text"
              dir="ltr"
              value={vodafoneCashPhone}
              onChange={e => onVodafoneCashPhoneChange?.(e.target.value)}
              placeholder="010xxxxxxxx"
              className="w-full text-xs font-bold p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-store-primary text-right font-mono transition-all"
            />
            <p className="text-[10px] text-slate-400">
              يتزامن تلقائياً مع رقم المحفظة الافتراضية في كاشير رفيق؛ وتسمع التعديلات فورياً في صفحة الشراء.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>عنوان أو حساب إنستاباي (InstaPay IPA / Phone)</span>
              {instapayHandle.trim() && (
                <span className="text-[10px] text-purple-700 font-bold">جاهز لاستقبال التحويلات</span>
              )}
            </label>
            <input
              type="text"
              dir="ltr"
              value={instapayHandle}
              onChange={e => onInstapayHandleChange?.(e.target.value)}
              placeholder="username@instapay أو 010xxxxxxxx"
              className="w-full text-xs font-bold p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-store-primary text-right font-mono transition-all"
            />
            <p className="text-[10px] text-slate-400">
              يتزامن تلقائياً مع حساب إنستاباي الأساسي في كاشير رفيق؛ ويتم عرضه للعميل لنسخه والتحويل فورياً.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Contact Info, Address & Working Hours */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-5">
        <div className="pb-3 border-b border-slate-100">
          <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
            <Phone className="w-4 h-4 text-store-primary" />
            <span>بيانات التواصل ومواعيد العمل</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            تُستخدم في أزرار الاتصال وواتساب وصفحة تأكيد الطلب
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">رقم هاتف الاتصال</label>
            <input
              type="text"
              value={phone}
              onChange={e => onPhoneChange(e.target.value)}
              dir="ltr"
              placeholder="010xxxxxxxx"
              className="w-full text-xs font-bold p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-store-primary text-right font-mono transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>رقم واتساب المتجر</span>
              {whatsapp.trim() && (
                <a
                  href={buildWhatsAppUrl(whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-emerald-700 hover:underline font-bold inline-flex items-center gap-0.5"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>اختبار الرابط</span>
                </a>
              )}
            </label>
            <input
              type="text"
              value={whatsapp}
              onChange={e => onWhatsappChange(e.target.value)}
              dir="ltr"
              placeholder="010xxxxxxxx"
              className="w-full text-xs font-bold p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-store-primary text-right font-mono transition-all"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-store-primary" />
              <span>عنوان المحل الفعلي</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={e => onAddressChange(e.target.value)}
              placeholder="مثال: شارع التحرير، بجوار البنك الأهلي"
              className="w-full text-xs font-bold p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-store-primary transition-all"
            />
          </div>
        </div>

        {/* Working Hours + Quick Presets */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-store-primary" />
              <span>مواعيد العمل والتوصيل (صيغة: اليوم: المواعيد)</span>
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onWorkingHoursChange('يومياً: 9:00 ص - 11:30 م')}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                قالب: يومياً 9 ص - 11:30 م
              </button>
              <button
                type="button"
                onClick={() =>
                  onWorkingHoursChange('السبت - الخميس: 9:00 ص - 12:00 م\nالجمعة: 1:00 م - 12:00 م')
                }
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                قالب: السبت للخميس + الجمعة
              </button>
            </div>
          </div>
          <textarea
            rows={2}
            value={workingHoursText}
            onChange={e => onWorkingHoursChange(e.target.value)}
            placeholder="السبت - الخميس: 9:00 ص - 11:30 م&#10;الجمعة: 1:00 م - 12:00 م"
            className="w-full text-xs font-bold p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-store-primary resize-none transition-all"
          />
        </div>
      </div>

      {/* 4. Delivery Zones & Minimum Order Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-store-primary" />
              <span>مناطق التوصيل والحد الأدنى للطلب</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              حدد مناطق التغطية ورسوم التوصيل لكل منطقة بالجنيه المصري (0 = توصيل مجاني)
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <label className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
              الحد الأدنى للطلب:
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={minOrderPounds}
              onChange={e => onMinOrderChange(e.target.value)}
              dir="ltr"
              className="w-20 text-xs font-black font-mono text-center p-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
            />
            <span className="text-[11px] font-bold text-slate-500">ج.م</span>
          </div>
        </div>

        {/* Zones List */}
        {deliveryZones.length === 0 ? (
          <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500">
            لم يتم إضافة مناطق توصيل بعد. أضف أول منطقة أدناه لتظهر لعملائك في السلة.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {deliveryZones.map((z, idx) => (
              <div
                key={`${z.name}-${idx}`}
                className="flex items-center justify-between p-3 bg-slate-50/80 hover:bg-slate-50 rounded-xl border border-slate-200 text-xs transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
                  <span className="font-bold text-slate-900 truncate">{z.name}</span>
                </div>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-lg font-black font-mono text-[11px] ${
                      z.fee === 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-store-primary-light text-store-primary'
                    }`}
                  >
                    {z.fee === 0 ? 'توصيل مجاني' : `${(z.fee / 100).toFixed(2)} ج.م`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveDeliveryZone(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="حذف المنطقة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Zone Form */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
          <input
            type="text"
            value={newZoneName}
            onChange={e => setNewZoneName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddZoneSubmit();
              }
            }}
            placeholder="اسم المنطقة الجديدة (مثال: مدينة نصر، المعادي، وسط البلد)"
            className="flex-1 text-xs font-bold p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
          />
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="number"
                min="0"
                step="1"
                value={newZoneFee}
                onChange={e => setNewZoneFee(e.target.value)}
                placeholder="الرسوم"
                dir="ltr"
                className="w-28 text-xs font-bold p-3 pl-9 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-store-primary text-center font-mono"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                ج.م
              </span>
            </div>
            <button
              type="button"
              onClick={handleAddZoneSubmit}
              className="px-4 py-3 bg-store-primary hover:opacity-90 text-white rounded-xl text-xs font-black transition-all btn-spring flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة منطقة</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4.5. Owner Dashboard Security & PIN Management */}
      {onChangePin && (
        <form
          onSubmit={e => void handlePinSubmit(e)}
          className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#004D3F]" />
                <span>أمان لوحة التحكم والرمز السري (PIN)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                غيّر رمز الدخول الخاص بصاحب المحل في أي وقت — الجلسة تظل مفتوحة على جهازك لمدة 30 يوماً تلقائياً.
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl border ${
                hasCustomPin
                  ? 'bg-[#EAF5EE] text-[#006D41] border-[#006D41]/25'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{hasCustomPin ? 'رمز سري مخصص ومؤمّن' : 'الرمز الافتراضي (1234) — يُنصح بتغييره'}</span>
            </span>
          </div>

          {pinFeedback && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                pinFeedback.type === 'success'
                  ? 'bg-[#EAF5EE] text-[#006D41] border-[#006D41]/30'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {pinFeedback.type === 'success' ? (
                <Check className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{pinFeedback.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">الرمز السري الحالي</label>
              <input
                type={showPins ? 'text' : 'password'}
                dir="ltr"
                value={currentPin}
                onChange={e => setCurrentPin(e.target.value)}
                placeholder={hasCustomPin ? '••••' : '1234'}
                autoComplete="current-password"
                className="w-full text-xs font-bold font-mono tracking-widest p-3 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#004D3F] text-center transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">الرمز السري الجديد</label>
              <input
                type={showPins ? 'text' : 'password'}
                dir="ltr"
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                placeholder="4 إلى 20 رقم/حرف"
                autoComplete="new-password"
                className="w-full text-xs font-bold font-mono tracking-widest p-3 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#004D3F] text-center transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">تأكيد الرمز الجديد</label>
              <input
                type={showPins ? 'text' : 'password'}
                dir="ltr"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value)}
                placeholder="أعد كتابة الرمز الجديد"
                autoComplete="new-password"
                className="w-full text-xs font-bold font-mono tracking-widest p-3 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#004D3F] text-center transition-all"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowPins(v => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#004D3F] transition-colors cursor-pointer"
            >
              {showPins ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{showPins ? 'إخفاء الرموز' : 'إظهار الرموز'}</span>
            </button>

            <button
              type="submit"
              disabled={isUpdatingPin || isDemoStore}
              title={isDemoStore ? 'غير متاح في وضع المعاينة التجريبي' : undefined}
              className="px-4 py-2.5 bg-[#004D3F] hover:bg-[#00372D] disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all btn-spring inline-flex items-center gap-2 cursor-pointer"
            >
              {isUpdatingPin ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              <span>{isDemoStore ? 'متاح في المتاجر الفعلية فقط' : isUpdatingPin ? 'جاري التحديث...' : 'تحديث الرمز السري'}</span>
            </button>
          </div>
        </form>
      )}

      {/* 5. Sticky Save Footer Bar */}
      <div className="sticky bottom-20 lg:bottom-4 z-30">
        <div className="bg-slate-900 text-white rounded-2xl px-4 sm:px-5 py-3.5 shadow-2xl border border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-300 font-medium">
            احفظ التعديلات لتطبيقها فوراً على رابط المتجر الحي وبطاقة المشاركة على واتساب.
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onSave}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-black text-xs px-6 py-2.5 rounded-xl shadow-md btn-spring transition-all flex items-center justify-center gap-2 cursor-pointer flex-shrink-0"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{isSaving ? 'جاري الحفظ سحابياً...' : 'حفظ كافة الإعدادات سحابياً'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
