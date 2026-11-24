import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { CartItem, Store } from '../types';
import { useModalAnimation } from '../hooks/useModalAnimation';
import { useSwipeDownDismiss } from '../hooks/useSwipeDownDismiss';
import {
  X,
  CheckCircle,
  MapPin,
  Phone,
  User,
  FileText,
  Loader2,
  Banknote,
  ShieldCheck,
  Navigation,
  Building,
  Home,
  Compass,
  CreditCard,
  Check,
  Copy,
  Trash2,
  Smartphone,
  Upload,
  CheckCircle2,
  AlertCircle,
  QrCode,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  store: Store;
  deliveryMethod: 'delivery' | 'pickup';
  selectedDeliveryZone: string;
  onOrderCompleted: (orderNumber: number, total: number, paymentMethod?: string, receiptImage?: string | null) => void;
  createOrderApi: (orderData: any) => Promise<{ order_number: number; total: number }>;
}

const STORAGE_KEY = 'rafiq_customer_saved_profile_v1';

function getStoredProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const CheckoutModal: React.FC<Props> = ({
  isOpen,
  onClose,
  cartItems,
  store,
  deliveryMethod,
  selectedDeliveryZone,
  onOrderCompleted,
  createOrderApi,
}) => {
  const { mounted, visible } = useModalAnimation(isOpen, 280);
  const { dragHandleProps, sheetStyle } = useSwipeDownDismiss({
    onClose,
    threshold: 80,
  });
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const streetInputRef = useRef<HTMLInputElement>(null);
  const buildingInputRef = useRef<HTMLInputElement>(null);

  const focusAndRevealField = (ref: React.RefObject<HTMLInputElement | null>) => {
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => el.focus({ preventScroll: true }), 180);
  };

  // Cached initial profile from localStorage
  const initialProfile = useMemo(() => getStoredProfile() || {}, []);

  // Customer Identity State (Pre-filled automatically if saved)
  const [name, setName] = useState<string>(initialProfile.name || '');
  const [phone, setPhone] = useState<string>(initialProfile.phone || '');
  const [altPhone, setAltPhone] = useState<string>(initialProfile.altPhone || '');

  // Structured Address State (for Delivery - Pre-filled automatically)
  const [street, setStreet] = useState<string>(initialProfile.street || '');
  const [building, setBuilding] = useState<string>(initialProfile.building || '');
  const [floorApt, setFloorApt] = useState<string>(initialProfile.floorApt || '');
  const [landmark, setLandmark] = useState<string>(initialProfile.landmark || '');
  const [mapsUrl, setMapsUrl] = useState<string | null>(initialProfile.mapsUrl || null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationSuccess, setLocationSuccess] = useState(Boolean(initialProfile.mapsUrl));
  const [locationError, setLocationError] = useState<string | null>(null);

  // Delivery Notes & Quick Pills
  const [notes, setNotes] = useState('');
  const [selectedQuickNotes, setSelectedQuickNotes] = useState<string[]>([]);

  // Payment Method & Proof of Payment State (synced dynamically from Desktop POS digital_accounts)
  const walletAccounts = useMemo(() => {
    const list = (store.digital_accounts || []).filter(a => a.type === 'wallet' && a.account_number?.trim());
    if (list.length > 0) return list;
    if (store.vodafone_cash_phone?.trim()) {
      return [{
        id: 'default-wallet',
        name: store.vodafone_cash_name || 'فودافون كاش',
        type: 'wallet',
        provider: store.vodafone_cash_provider || 'vodafone_cash',
        account_number: store.vodafone_cash_phone.trim(),
        holder_name: store.vodafone_cash_name || undefined,
        is_default: true,
      }];
    }
    return [];
  }, [store.digital_accounts, store.vodafone_cash_phone, store.vodafone_cash_name, store.vodafone_cash_provider]);

  const instapayAccounts = useMemo(() => {
    const list = (store.digital_accounts || []).filter(a => (a.type === 'instapay' || a.provider === 'instapay') && a.account_number?.trim());
    if (list.length > 0) return list;
    if (store.instapay_handle?.trim()) {
      return [{
        id: 'default-instapay',
        name: store.instapay_name || 'إنستاباي',
        type: 'instapay',
        provider: 'instapay',
        account_number: store.instapay_handle.trim(),
        holder_name: store.instapay_name || undefined,
        is_default: true,
      }];
    }
    return [];
  }, [store.digital_accounts, store.instapay_handle, store.instapay_name]);

  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const activeWallet = walletAccounts.find(w => w.id === selectedWalletId) || walletAccounts.find(w => w.is_default) || walletAccounts[0] || null;

  const resolvedInstapay = instapayAccounts[0]?.account_number || '';
  const resolvedInstapayName = instapayAccounts[0]?.holder_name || '';

  const resolvedVodafone = activeWallet?.account_number || '';
  const resolvedVodafoneName = activeWallet?.holder_name || '';

  const isCashEnabled = store.accept_cash ?? true;
  const isInstapayEnabled = (store.accept_instapay ?? true) && instapayAccounts.length > 0;
  const isVodafoneEnabled = (store.accept_vodafone_cash ?? true) && walletAccounts.length > 0;

  const defaultMethod = isCashEnabled ? 'cash' : isInstapayEnabled ? 'instapay' : isVodafoneEnabled ? 'vodafone_cash' : 'cash';
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'instapay' | 'vodafone_cash'>(defaultMethod);
  const [senderPhone, setSenderPhone] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showInstapayQr, setShowInstapayQr] = useState(false);
  const [showWalletQr, setShowWalletQr] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // When modal opens, sync from localStorage if state was empty and reset transient errors
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setLocationError(null);
      const p = getStoredProfile();
      if (p) {
        if (p.name && !name) setName(p.name);
        if (p.phone && !phone) setPhone(p.phone);
        if (p.altPhone && !altPhone) setAltPhone(p.altPhone);
        if (p.street && !street) setStreet(p.street);
        if (p.building && !building) setBuilding(p.building);
        if (p.floorApt && !floorApt) setFloorApt(p.floorApt);
        if (p.landmark && !landmark) setLandmark(p.landmark);
        if (p.mapsUrl && !mapsUrl) {
          setMapsUrl(p.mapsUrl);
          setLocationSuccess(true);
        }
      }
    }
  }, [isOpen]);

  // Live Auto-Save to localStorage on every change so data is NEVER lost!
  useEffect(() => {
    if (name || phone || street || building || landmark || altPhone || floorApt) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            name,
            phone,
            altPhone,
            street,
            building,
            floorApt,
            landmark,
            mapsUrl,
          })
        );
      } catch {
        // Ignore storage errors
      }
    }
  }, [name, phone, altPhone, street, building, floorApt, landmark, mapsUrl]);

  // Clear saved address helper
  const handleClearSavedAddress = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    setName('');
    setPhone('');
    setAltPhone('');
    setStreet('');
    setBuilding('');
    setFloorApt('');
    setLandmark('');
    setMapsUrl(null);
    setLocationSuccess(false);
    setLocationError(null);
  };

  // Browser Geolocation capture (isolated inline feedback + graceful low-accuracy fallback)
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('تحديد الموقع الجغرافي غير متاح على هذا المتصفح، يمكنك كتابة العنوان يدوياً.');
      return;
    }
    setIsLocating(true);
    setLocationError(null);

    const onPositionSuccess = (pos: GeolocationPosition) => {
      setIsLocating(false);
      const { latitude, longitude } = pos.coords;
      const gmapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
      setMapsUrl(gmapsLink);
      setLocationSuccess(true);
      setLocationError(null);
    };

    const onPositionFinalError = (err: GeolocationPositionError) => {
      setIsLocating(false);
      if (err.code === err.PERMISSION_DENIED) {
        setLocationError('لم يتم السماح بالوصول للموقع — لا مشكلة، اكتب الشارع والعمارة بالأسفل.');
      } else {
        setLocationError('تعذر التقاط موقعك تلقائياً الآن — يمكنك المتابعة بكتابة الشارع والعمارة بالأسفل.');
      }
    };

    navigator.geolocation.getCurrentPosition(
      onPositionSuccess,
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          onPositionFinalError(err);
          return;
        }
        // Fallback to network/Wi-Fi location for desktop & indoor devices
        navigator.geolocation.getCurrentPosition(
          onPositionSuccess,
          onPositionFinalError,
          { timeout: 10000, enableHighAccuracy: false, maximumAge: 300000 }
        );
      },
      { timeout: 6000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  };

  const toggleQuickNote = (pill: string) => {
    setSelectedQuickNotes(prev =>
      prev.includes(pill) ? prev.filter(p => p !== pill) : [...prev, pill]
    );
  };

  if (!mounted) return null;

  // Safe integer calculations
  let subtotal = 0;
  cartItems.forEach(i => {
    subtotal += i.product.price_piasters * i.quantity;
  });

  let deliveryFee = 0;
  if (deliveryMethod === 'delivery' && selectedDeliveryZone && store.delivery_zones) {
    const zone = store.delivery_zones.find(z => z.name === selectedDeliveryZone);
    if (zone) deliveryFee = zone.fee;
  }
  const grandTotal = subtotal + deliveryFee;

  const quickDeliveryPills = [
    'اتصل قبل الوصول بـ 5 دقائق',
    'رن الجرس بهدوء',
    'سيب الأوردر عند البواب / الأمن',
    'معايا فكة 200 (محتاج فكة)',
    'معايا فكة 100',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('يرجى كتابة اسم المستلم بالكامل أعلى النموذج');
      focusAndRevealField(nameInputRef);
      return;
    }
    const cleanPhone = phone.trim().replace(/\s+/g, '');
    if (cleanPhone.length < 10) {
      setErrorMessage('يرجى كتابة رقم هاتف صحيح (10 أرقام على الأقل) أعلى النموذج');
      focusAndRevealField(phoneInputRef);
      return;
    }

    if (store.min_order_amount > 0 && subtotal < store.min_order_amount) {
      setErrorMessage(`الحد الأدنى للطلب من هذا المتجر هو ${(store.min_order_amount / 100).toFixed(2)} ج.م`);
      return;
    }

    if (deliveryMethod === 'delivery') {
      if (!street.trim()) {
        setErrorMessage('يرجى كتابة اسم الشارع في بيانات التوصيل أعلاه');
        focusAndRevealField(streetInputRef);
        return;
      }
      if (!building.trim()) {
        setErrorMessage('يرجى كتابة رقم أو اسم العمارة في بيانات التوصيل أعلاه');
        focusAndRevealField(buildingInputRef);
        return;
      }
    }

    // Build structured full address string for POS and delivery courier
    let formattedAddress = '';
    if (deliveryMethod === 'delivery') {
      const parts = [
        selectedDeliveryZone ? `المنطقة: ${selectedDeliveryZone}` : '',
        `الشارع: ${street.trim()}`,
        `عمارة: ${building.trim()}`,
        floorApt.trim() ? `دور/شقة: ${floorApt.trim()}` : '',
        landmark.trim() ? `علامة مميزة: ${landmark.trim()}` : '',
        altPhone.trim() ? `هاتف بديل: ${altPhone.trim()}` : '',
        mapsUrl ? `رابط الموقع على الخريطة: ${mapsUrl}` : '',
      ].filter(Boolean);
      formattedAddress = parts.join(' • ');
    } else {
      formattedAddress = 'استلام شخصي من فرع المحل';
    }

    // Format payment notes
    let paymentNote = '';
    if (paymentMethod === 'cash') {
      paymentNote = 'طريقة الدفع: كاش عند الاستلام (الدفع نقداً)';
    } else if (paymentMethod === 'instapay') {
      paymentNote = `طريقة الدفع: إنستاباي (${resolvedInstapay})${resolvedInstapayName ? ` [المستلم: ${resolvedInstapayName}]` : ''}${senderPhone.trim() ? ` | الحساب المحوّل منه: ${senderPhone.trim()}` : ''}${paymentRef.trim() ? ` | كود المرجع: ${paymentRef.trim()}` : ''}${receiptImage ? ' | إيصال السداد: [مرفق]' : ''}`;
    } else if (paymentMethod === 'vodafone_cash') {
      paymentNote = `طريقة الدفع: محفظة ذكية (${activeWallet?.name || 'فودافون كاش'} - ${resolvedVodafone})${resolvedVodafoneName ? ` [المستلم: ${resolvedVodafoneName}]` : ''}${senderPhone.trim() ? ` | المحفظة المحوّل منها: ${senderPhone.trim()}` : ''}${paymentRef.trim() ? ` | كود العملية: ${paymentRef.trim()}` : ''}${receiptImage ? ' | إيصال السداد: [مرفق]' : ''}`;
    }

    // Combine notes
    const combinedNotes = [
      ...selectedQuickNotes,
      notes.trim(),
      paymentNote,
    ]
      .filter(Boolean)
      .join(' | ');

    try {
      setIsSubmitting(true);
      const res = await createOrderApi({
        customer_name: name.trim(),
        customer_phone: cleanPhone,
        customer_address: formattedAddress,
        delivery_method: deliveryMethod,
        delivery_zone: selectedDeliveryZone || undefined,
        notes: combinedNotes || undefined,
        payment_method:
          paymentMethod === 'cash'
            ? 'كاش عند الاستلام'
            : paymentMethod === 'instapay'
            ? 'إنستاباي'
            : 'فودافون كاش ومحافظ المحمول',
        sender_phone: senderPhone || undefined,
        payment_ref: paymentRef || undefined,
        receipt_image: receiptImage || undefined,
        items: cartItems.map(i => ({
          product_id: i.product.id,
          product_name: i.product.name,
          unit_name: i.product.unit_name,
          unit_price: i.product.price_piasters,
          quantity: i.quantity * 1000,
        })),
      });

      // Save receipt to localStorage if uploaded for instant display in order tracker
      if (receiptImage) {
        try {
          localStorage.setItem(`rafiq_receipt_order_${res.order_number}`, receiptImage);
        } catch {
          // Ignore quota error if storage is full
        }
      }

      onOrderCompleted(res.order_number, res.total, paymentMethod, receiptImage);
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى');
    } finally {
      setIsSubmitting(false);
    }
  };

  const instapayHandle = resolvedInstapay;
  const vodafoneNumber = resolvedVodafone;
  const grandTotalPounds = ((subtotal + deliveryFee) / 100).toFixed(0);
  const ussdCode = `*9*7*${vodafoneNumber}*${grandTotalPounds}#`;

  const handleCopyText = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('يرجى اختيار ملف صورة صالح (JPG أو PNG)');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrorMessage('حجم الصورة كبير، يرجى اختيار صورة أقل من 8 ميجابايت');
      return;
    }
    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 960;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            const scale = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            setReceiptImage(canvas.toDataURL('image/jpeg', 0.72));
            return;
          }
        } catch {}
        setReceiptImage(rawDataUrl);
      };
      img.onerror = () => setReceiptImage(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const hasRestoredData = Boolean(name || phone || street);

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 transition-opacity duration-200 ease-out ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`relative w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-store-line overflow-hidden flex flex-col max-h-[92vh] transition-[transform,opacity] duration-[280ms] ease-out ${
          visible
            ? 'translate-y-0 sm:scale-100 opacity-100'
            : 'translate-y-full sm:translate-y-6 sm:scale-95 opacity-0'
        }`}
        style={{
          backgroundColor: 'var(--store-card-bg, #FFFFFF)',
          ...sheetStyle,
        }}
      >
        {/* Mobile Swipe Handle Pill with Touch Physics */}
        <div
          {...dragHandleProps}
          className="sm:hidden w-full py-2.5 flex items-center justify-center cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        >
          <div className="w-12 h-1.5 bg-store-line rounded-full"></div>
        </div>

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-store-line flex items-center justify-between bg-store-drawer-header flex-shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-store-primary" />
            <div>
              <h2 className="text-base sm:text-lg font-black text-store-text">تأكيد الأوردر وبيانات التوصيل</h2>
              <p className="text-[11px] text-store-muted font-medium">بياناتك وعنوانك محفوظين لسرعة تأكيد أي أوردر</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-store-primary-light/40 text-store-muted hover:text-store-text transition-colors btn-spring"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-right">
          {errorMessage && (
            <div className="p-3 text-xs font-bold text-rose-800 bg-rose-50 rounded-2xl border border-rose-200">
              {errorMessage}
            </div>
          )}

          {/* Saved Data Notice Banner */}
          {hasRestoredData && (
            <div className="p-3 bg-store-primary-light/70 rounded-2xl border border-store-primary/20 flex items-center justify-between text-xs animate-in fade-in">
              <div className="flex items-center gap-2 text-store-primary font-bold">
                <CheckCircle className="w-4 h-4 text-store-primary flex-shrink-0" />
                <span>بياناتك وعنوانك جاهزين ومحفوظين لراحتك</span>
              </div>
              <button
                type="button"
                onClick={handleClearSavedAddress}
                className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline px-2 py-0.5 btn-spring"
              >
                <Trash2 className="w-3 h-3" />
                <span>مسح وكتابة عنوان جديد</span>
              </button>
            </div>
          )}

          {/* Section 1: Customer Contact Info */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-store-text flex items-center gap-1.5 border-b border-store-line pb-1.5">
              <User className="w-3.5 h-3.5 text-store-primary" />
              <span>بياناتك للتواصل وتوصيل الأوردر</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Name Field */}
              <div>
                <label className="block text-[11px] font-bold text-store-text mb-1">
                  اسم المستلم بالكامل <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  placeholder="مثال: أحمد محمد علي"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-store-card-subtle text-store-text focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-colors font-semibold"
                />
              </div>

              {/* Primary Phone */}
              <div>
                <label className="block text-[11px] font-bold text-store-text mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-store-primary" /> رقم الموبايل الأساسي <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={phoneInputRef}
                  type="tel"
                  dir="ltr"
                  placeholder="01012345678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-store-card-subtle text-store-text text-right focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-colors font-semibold"
                />
              </div>
            </div>

            {/* Alternative Phone / WhatsApp */}
            <div>
              <label className="block text-[11px] font-bold text-store-muted mb-1 flex items-center justify-between">
                <span>رقم بديل أو واتساب (اختياري - في حال تعذر الوصول للأول)</span>
              </label>
              <input
                type="tel"
                dir="ltr"
                placeholder="01x xxxx xxxx"
                value={altPhone}
                onChange={e => setAltPhone(e.target.value)}
                className="w-full text-xs sm:text-sm p-2.5 rounded-2xl border border-store-line bg-store-card-subtle text-store-text text-right focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-all font-semibold"
              />
            </div>
          </div>

          {/* Section 2: Detailed Delivery Address (Only if Delivery) */}
          {deliveryMethod === 'delivery' ? (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-store-line pb-1.5">
                <h3 className="text-xs font-black text-store-text flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-store-primary" />
                  <span>عنوان التوصيل لدليفري المحل</span>
                </h3>
                {selectedDeliveryZone && (
                  <span className="text-[11px] font-bold bg-store-primary-light text-store-primary px-2.5 py-0.5 rounded-lg">
                    المنطقة: {selectedDeliveryZone}
                  </span>
                )}
              </div>

              {/* GPS Location Button */}
              <div className="p-3 bg-store-card-subtle rounded-2xl border border-store-line space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Compass className="w-4 h-4 text-store-primary flex-shrink-0" />
                    <div className="text-xs min-w-0">
                      <span className="font-bold text-store-text">لوكيشن بيتك على الخريطة:</span>
                      <span className="block text-[10px] text-store-muted">يسهل على مندوب الدليفري يوصلك فوراً (اختياري)</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={isLocating}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-colors flex-shrink-0 btn-spring ${
                      locationSuccess
                        ? 'bg-store-primary text-store-primary-contrast shadow-sm'
                        : 'bg-store-card text-store-text border border-store-line hover:bg-store-card-subtle'
                    }`}
                  >
                    {isLocating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>جاري التحديد...</span>
                      </>
                    ) : locationSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>اللوكيشن متحدد</span>
                      </>
                    ) : (
                      <>
                        <Navigation className="w-3.5 h-3.5 text-store-primary" />
                        <span>تحديد اللوكيشن</span>
                      </>
                    )}
                  </button>
                </div>

                {locationError && (
                  <div className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{locationError}</span>
                  </div>
                )}
              </div>

              {/* Street & Building */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-store-text mb-1">
                    اسم الشارع <span className="text-rose-500">*</span>
                  </label>
                  <input
                    ref={streetInputRef}
                    type="text"
                    placeholder="مثال: شارع التحرير، متفرع من..."
                    value={street}
                    onChange={e => {
                      setStreet(e.target.value);
                      if (locationError) setLocationError(null);
                    }}
                    className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-store-card-subtle text-store-text focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-colors font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-store-text mb-1 flex items-center gap-1">
                    <Building className="w-3 h-3 text-store-muted" />
                    رقم أو اسم العمارة <span className="text-rose-500">*</span>
                  </label>
                  <input
                    ref={buildingInputRef}
                    type="text"
                    placeholder="مثال: عمارة 15، أو برج النور"
                    value={building}
                    onChange={e => setBuilding(e.target.value)}
                    className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-store-card-subtle text-store-text focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-colors font-semibold"
                  />
                </div>
              </div>

              {/* Floor & Apartment and Landmark */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-store-text mb-1 flex items-center gap-1">
                    <Home className="w-3 h-3 text-store-muted" />
                    رقم الدور والشقة
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: الدور الرابع - شقة 12"
                    value={floorApt}
                    onChange={e => setFloorApt(e.target.value)}
                    className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-store-card-subtle text-store-text focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-colors font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-store-text mb-1 flex items-center gap-1">
                    <Compass className="w-3 h-3 text-store-primary" />
                    علامة مميزة قريبة
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: بجوار صيدلية كذا، أمام مدرسة..."
                    value={landmark}
                    onChange={e => setLandmark(e.target.value)}
                    className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-store-card-subtle text-store-text focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-colors font-semibold"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-store-card-subtle rounded-2xl border border-store-line text-xs text-store-text">
              <span className="font-bold text-store-text block mb-0.5">الاستلام من الفرع:</span>
              هنجهزلك الأوردر في المحل وتستلمه أول ما توصل برقم الأوردر.
            </div>
          )}

          {/* Section 3: Delivery Instructions & Quick Tags */}
          <div className="space-y-2 pt-2">
            <label className="block text-[11px] font-bold text-store-text flex items-center gap-1">
              <FileText className="w-3 h-3 text-store-muted" />
              ملاحظات للدليفري (اختار اللي يناسبك):
            </label>

            <div className="flex flex-wrap gap-1.5">
              {quickDeliveryPills.map(pill => {
                const isSelected = selectedQuickNotes.includes(pill);
                return (
                  <button
                    key={pill}
                    type="button"
                    onClick={() => toggleQuickNote(pill)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors btn-spring ${
                      isSelected
                        ? 'bg-store-primary text-store-primary-contrast shadow-sm'
                        : 'bg-store-card-subtle text-store-text hover:bg-store-line border border-store-line'
                    }`}
                  >
                    {pill}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              placeholder="أي ملاحظة إضافية للدليفري (معايا فكة، رن الجرس...)..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full text-xs p-2.5 rounded-2xl border border-store-line bg-store-card-subtle text-store-text focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-store-card transition-colors font-medium mt-1"
            />
          </div>

          {/* Section 4: Payment Method Selection */}
          <div className="space-y-3 pt-2 border-t border-store-line">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-store-text">
                طريقة دفع الأوردر:
              </label>
              <span className="text-[10px] text-store-muted font-medium">اختار طريقة السداد المناسبة ليك</span>
            </div>

            {/* Dynamic Payment Options: Cash, InstaPay, Vodafone Cash */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Cash on Delivery */}
              {isCashEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-2.5 sm:p-3 rounded-2xl border text-center sm:text-right transition-colors flex flex-col sm:flex-row items-center gap-2 btn-spring ${
                    paymentMethod === 'cash'
                      ? 'border-2 border-store-primary bg-store-primary-light/70 shadow-sm'
                      : 'border-store-line bg-store-card-subtle hover:bg-store-card'
                  }`}
                >
                  <div className={`p-2 rounded-xl flex-shrink-0 ${paymentMethod === 'cash' ? 'bg-store-primary text-store-primary-contrast' : 'bg-store-line text-store-muted'}`}>
                    <Banknote className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-store-text whitespace-nowrap">كاش مع الدليفري</div>
                    <div className="text-[10px] text-store-muted hidden sm:block leading-tight mt-0.5">ادفع عند الاستلام</div>
                  </div>
                </button>
              )}

              {/* InstaPay */}
              {isInstapayEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('instapay')}
                  className={`p-2.5 sm:p-3 rounded-2xl border text-center sm:text-right transition-colors flex flex-col sm:flex-row items-center gap-2 btn-spring ${
                    paymentMethod === 'instapay'
                      ? 'border-2 border-purple-600 bg-purple-50/70 shadow-sm'
                      : 'border-store-line bg-store-card-subtle hover:bg-store-card'
                  }`}
                >
                  <div className={`p-2 rounded-xl flex-shrink-0 ${paymentMethod === 'instapay' ? 'bg-purple-600 text-white' : 'bg-store-line text-store-muted'}`}>
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-store-text whitespace-nowrap">إنستاباي</div>
                    <div className="text-[10px] text-store-muted hidden sm:block leading-tight mt-0.5">تحويل بنكي لحظي</div>
                  </div>
                </button>
              )}

              {/* Vodafone Cash & Wallets */}
              {isVodafoneEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('vodafone_cash')}
                  className={`p-2.5 sm:p-3 rounded-2xl border text-center sm:text-right transition-colors flex flex-col sm:flex-row items-center gap-2 btn-spring ${
                    paymentMethod === 'vodafone_cash'
                      ? 'border-2 border-rose-600 bg-rose-50/70 shadow-sm'
                      : 'border-store-line bg-store-card-subtle hover:bg-store-card'
                  }`}
                >
                  <div className={`p-2 rounded-xl flex-shrink-0 ${paymentMethod === 'vodafone_cash' ? 'bg-rose-600 text-white' : 'bg-store-line text-store-muted'}`}>
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-store-text whitespace-nowrap">فودافون كاش</div>
                    <div className="text-[10px] text-store-muted hidden sm:block leading-tight mt-0.5">محافظ المحمول الذكية</div>
                  </div>
                </button>
              )}
            </div>

            {/* InstaPay Details & Verification Box */}
            {paymentMethod === 'instapay' && (
              <div className="p-4 bg-purple-50/70 rounded-3xl border border-purple-200/90 space-y-3 text-xs animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                      IP
                    </div>
                    <div>
                      <span className="font-black text-purple-950 block">حساب إنستاباي المعتمد للمتجر:</span>
                      <span className="text-[10px] text-purple-700 font-medium">عنوان الدفع اللحظي (IPA) أو رقم الهاتف</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText(instapayHandle, 'instapay')}
                    className="flex items-center gap-1 text-[11px] font-black bg-store-card hover:bg-purple-100 text-purple-800 px-3 py-1.5 rounded-xl border border-purple-200 shadow-sm btn-spring"
                  >
                    {copiedType === 'instapay' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'instapay' ? 'تم النسخ!' : 'نسخ الحساب'}</span>
                  </button>
                </div>

                <div className="p-3 bg-store-card rounded-2xl border border-purple-200 flex items-center justify-between shadow-sm flex-wrap gap-2">
                  <div>
                    <span className="text-sm sm:text-base font-black text-purple-950 tracking-wider font-mono block" dir="ltr">
                      {instapayHandle}
                    </span>
                    {resolvedInstapayName && (
                      <div className="text-[11px] text-purple-800 font-bold mt-0.5">
                        اسم المستلم: <span className="text-purple-950">{resolvedInstapayName}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowInstapayQr(!showInstapayQr)}
                      className="flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-100 hover:bg-purple-200 px-2.5 py-1 rounded-xl transition-colors btn-spring cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>{showInstapayQr ? 'إخفاء QR' : 'كود QR'}</span>
                    </button>
                    <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-lg font-bold">
                      حساب رسمي معتمد
                    </span>
                  </div>
                </div>

                {showInstapayQr && (
                  <div className="p-3 bg-store-card rounded-2xl border border-purple-200 text-center space-y-2 animate-in fade-in">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(instapayHandle)}`}
                      alt="InstaPay QR Code"
                      className="w-32 h-32 mx-auto rounded-xl border border-purple-200 p-1.5 bg-white shadow-2xs"
                      loading="lazy"
                    />
                    <p className="text-[10px] text-purple-900 font-bold">
                      امسح الكود بكاميرا الموبايل الآخر أو من داخل تطبيق إنستاباي للتحويل الفوري
                    </p>
                  </div>
                )}

                {/* Proof of Payment Upload & Verification */}
                <div className="pt-2 border-t border-purple-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-store-text flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="w-4 h-4 text-paid flex-shrink-0" />
                      <span>توثيق وتأكيد التحويل (موصى به لتجهيز أسرع):</span>
                    </label>
                    <span className="text-[10px] text-store-muted font-medium">يظهر مباشرة للوحة المحل والكاشير</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="رقم الهاتف أو عنوان IPA المحوّل منه"
                      value={senderPhone}
                      onChange={e => setSenderPhone(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-store-line bg-store-card text-store-text font-medium focus:ring-2 focus:ring-purple-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="الرقم المرجعي للتحويل (اختياري)"
                      value={paymentRef}
                      onChange={e => setPaymentRef(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-store-line bg-store-card text-store-text font-medium focus:ring-2 focus:ring-purple-600 focus:outline-none"
                    />
                  </div>

                  {/* Receipt Image Upload */}
                  <div>
                    {receiptImage ? (
                      <div className="p-3 bg-store-card rounded-2xl border-2 border-store-primary/40 flex items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={receiptImage}
                            alt="إيصال التحويل"
                            className="w-12 h-12 object-cover rounded-xl border border-store-line flex-shrink-0 shadow-sm"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-black text-store-primary flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
                              تم إرفاق إيصال التحويل بنجاح!
                            </span>
                            <span className="text-[10px] text-store-muted truncate block">
                              سيظهر الإيصال مباشرة لصاحب المحل والكاشير للتأكيد الفوري
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReceiptImage(null)}
                          className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 btn-spring flex-shrink-0"
                          title="حذف وإعادة الرفع"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-purple-300 hover:border-purple-600 rounded-2xl bg-store-card/90 hover:bg-store-card cursor-pointer transition-colors group">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleReceiptUpload}
                          className="hidden"
                        />
                        <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
                          <Upload className="w-4 h-4 text-purple-600 flex-shrink-0 group-hover:scale-110 transition-transform" />
                          <span>انقر لإرفاق لقطة شاشة التحويل أو إيصال السداد</span>
                        </div>
                        <span className="text-[10px] text-store-muted mt-0.5">
                          يقبل لقطات الشاشة والصور من المعرض أو الكاميرا (PNG, JPG)
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Vodafone Cash & Wallets Details & Verification Box */}
            {paymentMethod === 'vodafone_cash' && (
              <div className="p-4 bg-rose-50/70 rounded-3xl border border-rose-200/90 space-y-3 text-xs animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                      VF
                    </div>
                    <div>
                      <span className="font-black text-rose-950 block">رقم محفظة فودافون كاش للمتجر:</span>
                      <span className="text-[10px] text-rose-700 font-medium">يقبل التحويل من كافة المحافظ الذكية</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText(vodafoneNumber, 'vodafone')}
                    className="flex items-center gap-1 text-[11px] font-black bg-store-card hover:bg-rose-100 text-rose-800 px-3 py-1.5 rounded-xl border border-rose-200 shadow-sm btn-spring"
                  >
                    {copiedType === 'vodafone' ? <Check className="w-3.5 h-3.5 text-paid" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'vodafone' ? 'تم النسخ!' : 'نسخ الرقم'}</span>
                  </button>
                </div>

                {/* Multi-wallet selector pills if store has multiple wallets */}
                {walletAccounts.length > 1 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {walletAccounts.map(w => {
                      const isSel = (activeWallet?.id === w.id);
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => setSelectedWalletId(w.id)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all btn-spring ${
                            isSel
                              ? 'bg-rose-600 text-white shadow-sm'
                              : 'bg-white/80 text-rose-900 hover:bg-rose-100 border border-rose-200'
                          }`}
                        >
                          {w.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="p-3 bg-store-card rounded-2xl border border-rose-200 flex items-center justify-between shadow-sm flex-wrap gap-2">
                  <div>
                    <span className="text-sm sm:text-base font-black text-rose-950 tracking-wider font-mono block" dir="ltr">
                      {vodafoneNumber}
                    </span>
                    {resolvedVodafoneName && (
                      <div className="text-[11px] text-rose-800 font-bold mt-0.5">
                        اسم المستلم: <span className="text-rose-950">{resolvedVodafoneName}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowWalletQr(!showWalletQr)}
                      className="flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-100 hover:bg-rose-200 px-2.5 py-1 rounded-xl transition-colors btn-spring cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>{showWalletQr ? 'إخفاء QR' : 'كود QR'}</span>
                    </button>
                    {activeWallet?.provider === 'vodafone_cash' && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(ussdCode, 'ussd')}
                        className="text-[11px] bg-rose-100 hover:bg-rose-200 text-rose-900 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1 btn-spring cursor-pointer"
                        title="كود التحويل السريع لعملاء فودافون كاش"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-rose-700" />
                        <span>{copiedType === 'ussd' ? 'تم نسخ الكود!' : 'كود التحويل المباشر'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {showWalletQr && (
                  <div className="p-3 bg-store-card rounded-2xl border border-rose-200 text-center space-y-2 animate-in fade-in">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(vodafoneNumber)}`}
                      alt="Wallet QR Code"
                      className="w-32 h-32 mx-auto rounded-xl border border-rose-200 p-1.5 bg-white shadow-2xs"
                      loading="lazy"
                    />
                    <p className="text-[10px] text-rose-900 font-bold">
                      امسح الكود من تطبيق محفظتك الإلكترونية للتحويل الفوري
                    </p>
                  </div>
                )}

                {/* Proof of Payment Upload & Verification */}
                <div className="pt-2 border-t border-rose-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-store-text flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="w-4 h-4 text-paid flex-shrink-0" />
                      <span>توثيق وتأكيد التحويل (موصى به لتجهيز أسرع):</span>
                    </label>
                    <span className="text-[10px] text-store-muted font-medium">يظهر مباشرة للوحة المحل والكاشير</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="رقم المحفظة التي قمت بالتحويل منها"
                      value={senderPhone}
                      onChange={e => setSenderPhone(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-store-line bg-store-card text-store-text font-medium focus:ring-2 focus:ring-rose-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="كود رسالة تأكيد فودافون كاش (اختياري)"
                      value={paymentRef}
                      onChange={e => setPaymentRef(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-store-line bg-store-card text-store-text font-medium focus:ring-2 focus:ring-rose-600 focus:outline-none"
                    />
                  </div>

                  {/* Receipt Image Upload */}
                  <div>
                    {receiptImage ? (
                      <div className="p-3 bg-store-card rounded-2xl border-2 border-store-primary/40 flex items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={receiptImage}
                            alt="إيصال التحويل"
                            className="w-12 h-12 object-cover rounded-xl border border-store-line flex-shrink-0 shadow-sm"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-black text-store-primary flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
                              تم إرفاق إيصال التحويل بنجاح!
                            </span>
                            <span className="text-[10px] text-store-muted truncate block">
                              سيظهر الإيصال مباشرة لصاحب المحل والكاشير للتأكيد الفوري
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReceiptImage(null)}
                          className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 btn-spring flex-shrink-0"
                          title="حذف وإعادة الرفع"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-rose-300 hover:border-rose-600 rounded-2xl bg-store-card/90 hover:bg-store-card cursor-pointer transition-colors group">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleReceiptUpload}
                          className="hidden"
                        />
                        <div className="flex items-center gap-2 text-rose-900 font-bold text-xs">
                          <Upload className="w-4 h-4 text-rose-600 flex-shrink-0 group-hover:scale-110 transition-transform" />
                          <span>انقر لإرفاق لقطة شاشة التحويل أو إيصال السداد</span>
                        </div>
                        <span className="text-[10px] text-store-muted mt-0.5">
                          يقبل لقطات الشاشة والصور من المعرض أو الكاميرا (PNG, JPG)
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Financial Recap Card */}
          <div className="p-3.5 rounded-2xl bg-store-card-subtle border border-store-line space-y-1.5 text-xs">
            <div className="flex justify-between text-store-muted">
              <span>حساب الأصناف ({cartItems.length}):</span>
              <span className="font-bold text-store-text">{(subtotal / 100).toFixed(2)} ج.م</span>
            </div>
            {deliveryMethod === 'delivery' && (
              <div className="flex justify-between text-store-muted">
                <span>مصاريف الدليفري ({selectedDeliveryZone || 'عادي'}):</span>
                <span className="font-bold text-store-text">{(deliveryFee / 100).toFixed(2)} ج.م</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black text-store-primary pt-1.5 border-t border-store-line">
              <span>إجمالي الأوردر المطلوب:</span>
              <span className="text-base">{(grandTotal / 100).toFixed(2)} ج.م</span>
            </div>
          </div>

          {/* Inline Error Alert right above Submit Button so it's ALWAYS visible without scrolling */}
          {errorMessage && (
            <div className="p-3 text-xs font-bold text-rose-800 bg-rose-50 rounded-2xl border border-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2 bottom-safe">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-store-primary hover:opacity-90 disabled:bg-slate-300 !text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-store-primary/20 transition-all btn-spring cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin !text-white" />
                  <span className="!text-white">ثواني.. بنبعت الأوردر للمحل...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 !text-white" />
                  <span className="!text-white">تأكيد وإرسال الأوردر الآن</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
