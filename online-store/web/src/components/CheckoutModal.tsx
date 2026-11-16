import React, { useState, useEffect, useMemo } from 'react';
import type { CartItem, Store } from '../types';
import { useModalAnimation } from '../hooks/useModalAnimation';
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
  const { mounted, visible } = useModalAnimation(isOpen, 300);

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

  // Delivery Notes & Quick Pills
  const [notes, setNotes] = useState('');
  const [selectedQuickNotes, setSelectedQuickNotes] = useState<string[]>([]);

  // Payment Method & Proof of Payment State
  const isCashEnabled = store.accept_cash ?? true;
  const isInstapayEnabled = store.accept_instapay ?? true;
  const isVodafoneEnabled = store.accept_vodafone_cash ?? true;

  const defaultMethod = isCashEnabled ? 'cash' : isInstapayEnabled ? 'instapay' : isVodafoneEnabled ? 'vodafone_cash' : 'cash';
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'instapay' | 'vodafone_cash'>(defaultMethod);
  const [senderPhone, setSenderPhone] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // When modal opens, sync from localStorage if state was empty
  useEffect(() => {
    if (isOpen) {
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
  };

  // Browser Geolocation capture
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setErrorMessage('خاصية تحديد الموقع الجغرافي غير مدعومة في متصفحك');
      return;
    }
    setIsLocating(true);
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      pos => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        const gmapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
        setMapsUrl(gmapsLink);
        setLocationSuccess(true);
      },
      err => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setErrorMessage('تم رفض إذن الوصول للموقع الجغرافي. يمكنك كتابة تفاصيل العنوان يدوياً.');
        } else {
          setErrorMessage('تعذر التقاط موقعك الجغرافي حالياً، يرجى كتابة تفاصيل العنوان.');
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
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
    'اتصل قبل الوصول بخمس دقائق',
    'رن الجرس بهدوء',
    'اترك الطلب عند البواب / الأمن',
    'معايا فكة كبيرة (محتاج فكة)',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage('يرجى كتابة اسم المستلم بالكامل');
      return;
    }
    const cleanPhone = phone.trim().replace(/\s+/g, '');
    if (cleanPhone.length < 10) {
      setErrorMessage('يرجى كتابة رقم هاتف صحيح للتواصل والتأكيد');
      return;
    }

    if (deliveryMethod === 'delivery') {
      if (!street.trim()) {
        setErrorMessage('يرجى كتابة اسم الشارع لتسليم الطلب');
        return;
      }
      if (!building.trim()) {
        setErrorMessage('يرجى كتابة رقم أو اسم العمارة / المبنى');
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
      paymentNote = `طريقة الدفع: إنستاباي (InstaPay)${senderPhone.trim() ? ` | الحساب المحوّل منه: ${senderPhone.trim()}` : ''}${paymentRef.trim() ? ` | كود المرجع: ${paymentRef.trim()}` : ''}${receiptImage ? ' | إيصال السداد: [مرفق]' : ''}`;
    } else if (paymentMethod === 'vodafone_cash') {
      paymentNote = `طريقة الدفع: فودافون كاش ومحافظ المحمول${senderPhone.trim() ? ` | المحفظة المحوّل منها: ${senderPhone.trim()}` : ''}${paymentRef.trim() ? ` | كود المرجع: ${paymentRef.trim()}` : ''}${receiptImage ? ' | إيصال السداد: [مرفق]' : ''}`;
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
            ? 'إنستاباي (InstaPay)'
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

  const instapayHandle = store.instapay_handle || store.phone || 'souq-elkhair@instapay';
  const vodafoneNumber = store.vodafone_cash_phone || store.whatsapp || store.phone || '01012345678';
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
    const reader = new FileReader();
    reader.onload = () => {
      setReceiptImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const hasRestoredData = Boolean(name || phone || street);

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 transition-all duration-300 ease-in-out ${
        visible ? 'opacity-100 backdrop-blur-md' : 'opacity-0 backdrop-blur-none pointer-events-none'
      }`}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`relative w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-store-line overflow-hidden flex flex-col max-h-[92vh] transition-all duration-300 ease-in-out ${
          visible
            ? 'translate-y-0 sm:scale-100 opacity-100'
            : 'translate-y-full sm:translate-y-6 sm:scale-95 opacity-0'
        }`}
      >
        {/* Mobile Swipe Handle Pill */}
        <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto my-2.5 flex-shrink-0"></div>

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-store-line flex items-center justify-between bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-store-primary" />
            <div>
              <h2 className="text-base sm:text-lg font-black text-store-text">تأكيد بيانات العميل وعنوان التوصيل</h2>
              <p className="text-[11px] text-slate-500 font-medium">بياناتك محفوظة تلقائياً لسرعة تأكيد طلباتك دائماً</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors btn-spring"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-right">
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
                <span>تم استرجاع وحفظ بياناتك وعنوانك تلقائياً لراحتك</span>
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
            <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
              <User className="w-3.5 h-3.5 text-store-primary" />
              <span>بيانات المستلم والتواصل</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Name Field */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  اسم المستلم بالكامل <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد محمد علي"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-slate-50 focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-white transition-all font-semibold"
                />
              </div>

              {/* Primary Phone */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-store-primary" /> رقم الموبايل الأساسي <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  placeholder="01012345678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-slate-50 text-right focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-white transition-all font-semibold"
                />
              </div>
            </div>

            {/* Alternative Phone / WhatsApp */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center justify-between">
                <span>رقم بديل أو واتساب (اختياري - في حال تعذر الوصول للأول)</span>
              </label>
              <input
                type="tel"
                dir="ltr"
                placeholder="01x xxxx xxxx"
                value={altPhone}
                onChange={e => setAltPhone(e.target.value)}
                className="w-full text-xs sm:text-sm p-2.5 rounded-2xl border border-store-line bg-slate-50 text-right focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-white transition-all font-semibold"
              />
            </div>
          </div>

          {/* Section 2: Detailed Delivery Address (Only if Delivery) */}
          {deliveryMethod === 'delivery' ? (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <h3 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-store-primary" />
                  <span>عنوان التوصيل الدقيق للكابتن</span>
                </h3>
                {selectedDeliveryZone && (
                  <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg">
                    المنطقة: {selectedDeliveryZone}
                  </span>
                )}
              </div>

              {/* GPS Location Button */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-store-primary flex-shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold text-slate-800">تحديد موقعك الدقيق على الخريطة:</span>
                    <span className="block text-[10px] text-slate-500">يسهل على الكابتن الوصول لك بدون أسئلة</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGetLocation}
                  disabled={isLocating}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all btn-spring ${
                    locationSuccess
                      ? 'bg-store-primary text-white shadow-2xs'
                      : 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-100'
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
                      <span>تم حفظ موقعك</span>
                    </>
                  ) : (
                    <>
                      <Navigation className="w-3.5 h-3.5 text-store-primary" />
                      <span>تحديد موقعي</span>
                    </>
                  )}
                </button>
              </div>

              {/* Street & Building */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    اسم الشارع <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: شارع التحرير، متفرع من..."
                    value={street}
                    onChange={e => setStreet(e.target.value)}
                    className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-slate-50 focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-white transition-all font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Building className="w-3 h-3 text-slate-500" />
                    رقم أو اسم العمارة <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: عمارة 15، أو برج النور"
                    value={building}
                    onChange={e => setBuilding(e.target.value)}
                    className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-slate-50 focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-white transition-all font-semibold"
                  />
                </div>
              </div>

              {/* Floor & Apartment and Landmark */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Home className="w-3 h-3 text-slate-500" />
                    رقم الدور والشقة
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: الدور الرابع - شقة 12"
                    value={floorApt}
                    onChange={e => setFloorApt(e.target.value)}
                    className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-slate-50 focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-white transition-all font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Compass className="w-3 h-3 text-store-primary" />
                    علامة مميزة قريبة
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: بجوار صيدلية كذا، أمام مدرسة..."
                    value={landmark}
                    onChange={e => setLandmark(e.target.value)}
                    className="w-full text-xs sm:text-sm p-3 rounded-2xl border border-store-line bg-slate-50 focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-white transition-all font-semibold"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700">
              <span className="font-bold text-slate-900 block mb-0.5">الاستلام من الفرع:</span>
              سيتم تجهيز طلبك في المحل وتستلمه فور وصولك بالاسم ورقم الطلب.
            </div>
          )}

          {/* Section 3: Delivery Instructions & Quick Tags */}
          <div className="space-y-2 pt-2">
            <label className="block text-[11px] font-bold text-slate-700 flex items-center gap-1">
              <FileText className="w-3 h-3 text-slate-500" />
              تعليمات خاصة بالتسليم (اختر ما يناسبك):
            </label>

            <div className="flex flex-wrap gap-1.5">
              {quickDeliveryPills.map(pill => {
                const isSelected = selectedQuickNotes.includes(pill);
                return (
                  <button
                    key={pill}
                    type="button"
                    onClick={() => toggleQuickNote(pill)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all btn-spring ${
                      isSelected
                        ? 'bg-store-primary text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {pill}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              placeholder="ملاحظة إضافية للطلب أو الكابتن إن وجدت..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full text-xs p-2.5 rounded-2xl border border-store-line bg-slate-50 focus:outline-none focus:ring-2 focus:ring-store-primary focus:bg-white transition-all font-medium mt-1"
            />
          </div>

          {/* Section 4: Payment Method Selection */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-black text-slate-800">
                طريقة الدفع المفضلة:
              </label>
              <span className="text-[10px] text-slate-500 font-medium">اختر طريقة السداد المناسبة لك</span>
            </div>

            {/* Dynamic Payment Options: Cash, InstaPay, Vodafone Cash */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Cash on Delivery */}
              {isCashEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-2.5 sm:p-3 rounded-2xl border text-center sm:text-right transition-all flex flex-col sm:flex-row items-center sm:items-start gap-2 btn-spring ${
                    paymentMethod === 'cash'
                      ? 'border-store-primary bg-store-primary-light/70 ring-2 ring-store-primary/20 shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-xl flex-shrink-0 ${paymentMethod === 'cash' ? 'bg-store-primary text-white' : 'bg-slate-100 text-slate-600'}`}>
                    <Banknote className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900 truncate">كاش عند الاستلام</div>
                    <div className="text-[10px] text-slate-500 hidden sm:block">تدفع بعد فحص طلبك</div>
                  </div>
                </button>
              )}

              {/* InstaPay */}
              {isInstapayEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('instapay')}
                  className={`p-2.5 sm:p-3 rounded-2xl border text-center sm:text-right transition-all flex flex-col sm:flex-row items-center sm:items-start gap-2 btn-spring ${
                    paymentMethod === 'instapay'
                      ? 'border-purple-600 bg-purple-50/70 ring-2 ring-purple-500/20 shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-xl flex-shrink-0 ${paymentMethod === 'instapay' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900 truncate">إنستاباي (InstaPay)</div>
                    <div className="text-[10px] text-slate-500 hidden sm:block">تحويل بنكي لحظي</div>
                  </div>
                </button>
              )}

              {/* Vodafone Cash & Wallets */}
              {isVodafoneEnabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('vodafone_cash')}
                  className={`p-2.5 sm:p-3 rounded-2xl border text-center sm:text-right transition-all flex flex-col sm:flex-row items-center sm:items-start gap-2 btn-spring ${
                    paymentMethod === 'vodafone_cash'
                      ? 'border-rose-600 bg-rose-50/70 ring-2 ring-rose-500/20 shadow-2xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-xl flex-shrink-0 ${paymentMethod === 'vodafone_cash' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900 truncate">فودافون كاش</div>
                    <div className="text-[10px] text-slate-500 hidden sm:block">محافظ المحمول الذكية</div>
                  </div>
                </button>
              )}
            </div>

            {/* InstaPay Details & Verification Box */}
            {paymentMethod === 'instapay' && (
              <div className="p-4 bg-purple-50/70 rounded-3xl border border-purple-200/90 space-y-3 text-xs animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black text-xs shadow-2xs">
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
                    className="flex items-center gap-1 text-[11px] font-black bg-white hover:bg-purple-100 text-purple-800 px-3 py-1.5 rounded-xl border border-purple-200 shadow-2xs btn-spring"
                  >
                    {copiedType === 'instapay' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'instapay' ? 'تم النسخ!' : 'نسخ الحساب'}</span>
                  </button>
                </div>

                <div className="p-3 bg-white rounded-2xl border border-purple-200 flex items-center justify-between shadow-2xs">
                  <span className="text-sm sm:text-base font-black text-purple-950 tracking-wider font-mono" dir="ltr">
                    {instapayHandle}
                  </span>
                  <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-lg font-bold">
                    حساب رسمي معتمد
                  </span>
                </div>

                {/* Proof of Payment Upload & Verification */}
                <div className="pt-2 border-t border-purple-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-slate-800 flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>توثيق وتأكيد التحويل (موصى به لتجهيز أسرع):</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-medium">رفع إيصال أو إرساله واتساب</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="رقم الهاتف أو عنوان IPA المحوّل منه"
                      value={senderPhone}
                      onChange={e => setSenderPhone(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-purple-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="الرقم المرجعي للتحويل (اختياري)"
                      value={paymentRef}
                      onChange={e => setPaymentRef(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-purple-600 focus:outline-none"
                    />
                  </div>

                  {/* Receipt Image Upload */}
                  <div>
                    {receiptImage ? (
                      <div className="p-3 bg-white rounded-2xl border-2 border-store-primary/40 flex items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={receiptImage}
                            alt="إيصال التحويل"
                            className="w-12 h-12 object-cover rounded-xl border border-slate-200 flex-shrink-0 shadow-2xs"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-black text-store-primary flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
                              تم إرفاق إيصال التحويل بنجاح!
                            </span>
                            <span className="text-[10px] text-slate-500 truncate block">
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
                      <label className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-purple-300 hover:border-purple-600 rounded-2xl bg-white/90 hover:bg-white cursor-pointer transition-colors group">
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
                        <span className="text-[10px] text-slate-400 mt-0.5">
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
                    <div className="w-7 h-7 rounded-xl bg-rose-600 text-white flex items-center justify-center font-black text-xs shadow-2xs">
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
                    className="flex items-center gap-1 text-[11px] font-black bg-white hover:bg-rose-100 text-rose-800 px-3 py-1.5 rounded-xl border border-rose-200 shadow-2xs btn-spring"
                  >
                    {copiedType === 'vodafone' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedType === 'vodafone' ? 'تم النسخ!' : 'نسخ الرقم'}</span>
                  </button>
                </div>

                <div className="p-3 bg-white rounded-2xl border border-rose-200 flex items-center justify-between shadow-2xs flex-wrap gap-2">
                  <span className="text-sm sm:text-base font-black text-rose-950 tracking-wider font-mono" dir="ltr">
                    {vodafoneNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(ussdCode, 'ussd')}
                    className="text-[11px] bg-rose-100 hover:bg-rose-200 text-rose-900 px-2.5 py-1 rounded-xl font-bold flex items-center gap-1 btn-spring"
                    title="كود التحويل السريع لعملاء فودافون كاش"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-rose-700" />
                    <span>{copiedType === 'ussd' ? 'تم نسخ الكود!' : 'كود التحويل المباشر'}</span>
                  </button>
                </div>

                {/* Proof of Payment Upload & Verification */}
                <div className="pt-2 border-t border-rose-200/80 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="font-black text-slate-800 flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>توثيق وتأكيد التحويل (موصى به لتجهيز أسرع):</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-medium">رفع إيصال أو إرساله واتساب</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="رقم المحفظة التي قمت بالتحويل منها"
                      value={senderPhone}
                      onChange={e => setSenderPhone(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-rose-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="كود رسالة تأكيد فودافون كاش (اختياري)"
                      value={paymentRef}
                      onChange={e => setPaymentRef(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-rose-600 focus:outline-none"
                    />
                  </div>

                  {/* Receipt Image Upload */}
                  <div>
                    {receiptImage ? (
                      <div className="p-3 bg-white rounded-2xl border-2 border-store-primary/40 flex items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={receiptImage}
                            alt="إيصال التحويل"
                            className="w-12 h-12 object-cover rounded-xl border border-slate-200 flex-shrink-0 shadow-2xs"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-black text-store-primary flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
                              تم إرفاق إيصال التحويل بنجاح!
                            </span>
                            <span className="text-[10px] text-slate-500 truncate block">
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
                      <label className="flex flex-col items-center justify-center p-3.5 border-2 border-dashed border-rose-300 hover:border-rose-600 rounded-2xl bg-white/90 hover:bg-white cursor-pointer transition-colors group">
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
                        <span className="text-[10px] text-slate-400 mt-0.5">
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
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-store-line space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>قيمة الأصناف ({cartItems.length}):</span>
              <span className="font-bold text-slate-900">{(subtotal / 100).toFixed(2)} ج.م</span>
            </div>
            {deliveryMethod === 'delivery' && (
              <div className="flex justify-between text-slate-600">
                <span>رسوم التوصيل ({selectedDeliveryZone || 'عادي'}):</span>
                <span className="font-bold text-slate-900">{(deliveryFee / 100).toFixed(2)} ج.م</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black text-store-primary pt-1.5 border-t border-slate-200">
              <span>الإجمالي النهائي للدفع:</span>
              <span className="text-base">{(grandTotal / 100).toFixed(2)} ج.م</span>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2 bottom-safe">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-store-primary hover:bg-store-primary-hover disabled:bg-slate-300 text-white py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-store-primary/20 transition-all btn-spring"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري تأكيد وإرسال طلبك...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>تأكيد إرسال الطلب الآن</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
