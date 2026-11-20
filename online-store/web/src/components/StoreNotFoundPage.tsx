import React, { useState } from 'react';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import {
  Store,
  Search,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  MessageSquare,
  ShieldAlert,
  WifiOff,
  Compass,
  Link2Off,
  CheckCircle2,
  Monitor,
  Smartphone,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';

export interface StoreNotFoundPageProps {
  status: number;
  message?: string;
  requestedSlug?: string;
  requestedPath?: string;
  code?: string;
  onRetry?: () => void;
  supportPhone?: string;
}

function normalizeSlugInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      const firstSeg = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '';
      return firstSeg.toLowerCase().replace(/[^a-z0-9-]/g, '');
    }
  } catch {
    // Fallback to direct slug cleanup
  }
  const stripped = trimmed.replace(/^\/+/, '').split('/')[0] || '';
  return stripped.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export const StoreNotFoundPage: React.FC<StoreNotFoundPageProps> = ({
  status,
  message,
  requestedSlug,
  requestedPath,
  onRetry,
  supportPhone = '01097782965',
}) => {
  const [slugInput, setSlugInput] = useState(requestedSlug || '');
  const [inputError, setInputError] = useState('');
  const [copiedPath, setCopiedPath] = useState(false);

  const isForbidden = status === 403;
  const isNetworkError = status === 0 || status >= 500;
  const isNotFound = !isForbidden && !isNetworkError;

  const displayCode = isForbidden ? '403' : isNetworkError ? '503' : '404';
  const cleanDisplayPath =
    requestedPath && requestedPath !== '/'
      ? requestedPath
      : requestedSlug
      ? `/${requestedSlug}`
      : window.location.pathname || '/';

  const supportWhatsappUrl = buildWhatsAppUrl(
    supportPhone || '01097782965',
    isForbidden
      ? `السلام عليكم، أستفسر عن حالة المتجر الإلكتروني (${cleanDisplayPath}) على منصة رفيق.`
      : `السلام عليكم م. إسلام، أرغب في الاستفسار عن منصة رفيق للمتاجر الإلكترونية وبرنامج الكاشير.`
  );

  const headline = isForbidden
    ? 'هذا المتجر غير متاح حالياً'
    : isNetworkError
    ? 'تعذر الاتصال بخادم المتجر'
    : 'لم نتمكن من العثور على هذا المتجر';

  const subtitle =
    message ||
    (isForbidden
      ? 'تم إيقاف هذا المتجر مؤقتاً من قِبل الإدارة أو انتهت فترة الاشتراك الحالية. يرجى التواصل مع إدارة المحل.'
      : isNetworkError
      ? 'حدث انقطاع مؤقت أثناء تحميل بيانات المتجر. تأكد من اتصالك بالإنترنت ثم حاول مرة أخرى.'
      : 'الرابط الذي حاولت الوصول إليه غير مسجّل في شبكة متاجر رفيق، أو ربما تم تعديل المعرّف الإلكتروني للمتجر مؤخراً.');

  const statusBadgeLabel = isForbidden
    ? 'المتجر موقوف مؤقتاً'
    : isNetworkError
    ? 'خطأ في الاتصال'
    : 'الرابط غير موجود';

  const handleGoToStore = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeSlugInput(slugInput);
    if (!cleaned) {
      setInputError('يرجى كتابة معرّف المتجر باللغة الإنجليزية مثل: al-nour-market');
      return;
    }
    setInputError('');
    window.location.assign(`/${encodeURIComponent(cleaned)}`);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch {
      // Clipboard API may be unavailable on non-HTTPS contexts
    }
  };

  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.assign('/rafiq');
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col bg-[#F7FAFC] text-[#0F172A] relative overflow-x-hidden selection:bg-[#004D3F] selection:text-white"
    >
      {/* Architectural Subtle Dot Grid & Ambient Forest Glow */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.45]"
        style={{
          backgroundImage:
            'radial-gradient(#CBD5D0 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />
      <div
        className="pointer-events-none fixed -top-40 right-1/2 translate-x-1/2 w-[720px] h-[360px] rounded-full blur-3xl opacity-20"
        style={{
          background:
            'radial-gradient(circle, #006D41 0%, #004D3F 45%, transparent 75%)',
        }}
      />

      {/* Top Official Rafiq Brand Navigation Bar */}
      <header className="relative z-20 bg-white/85 backdrop-blur-md border-b border-[#DCE1DC]/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between gap-4">
          <a
            href="/rafiq"
            className="flex items-center gap-3 group focus:outline-none"
            title="منصة رفيق للمتاجر الإلكترونية"
          >
            <img
              src="/logo_full.png"
              alt="رفيق - Rafiq POS"
              className="h-8 sm:h-10 w-auto object-contain transition-transform duration-200 group-hover:scale-[1.02]"
            />
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-bold text-[#004D3F] bg-[#E6F2ED] border border-[#004D3F]/15 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#006D41]" />
              منصة المتاجر الإلكترونية
            </span>
          </a>

          <div className="flex items-center gap-2">
            <a
              href="/rafiq"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-[#52605D] hover:text-[#00372D] hover:bg-[#F1F5F4] px-3.5 py-2 rounded-xl transition-colors"
            >
              <Store className="w-4 h-4 text-[#006D41]" />
              <span>المتجر التجريبي</span>
            </a>
            <a
              href={supportWhatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-[#004D3F] hover:bg-[#00372D] !text-white px-3.5 sm:px-4 py-2 rounded-xl shadow-xs transition-all btn-spring"
            >
              <MessageSquare className="w-3.5 h-3.5 !text-white" />
              <span className="!text-white">الدعم الفني</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Centered Experience */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-4xl space-y-6 animate-fade-in-up">
          {/* Flagship Split Card */}
          <section className="bg-white rounded-[28px] border border-[#DCE1DC] shadow-[0_24px_60px_-24px_rgba(0,55,45,0.16)] overflow-hidden grid grid-cols-1 lg:grid-cols-12">
            {/* Right Visual Architectural Panel (Deep Rafiq Forest Green) */}
            <div
              className="lg:col-span-5 relative p-7 sm:p-9 flex flex-col justify-between text-white overflow-hidden min-h-[260px] lg:min-h-[440px]"
              style={{
                background:
                  'linear-gradient(155deg, #00372D 0%, #004D3F 52%, #006D41 100%)',
              }}
            >
              {/* Subtle Barcode & Geometric Lines Motif matching Rafiq Brand */}
              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.12]"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern
                    id="rafiq-grid"
                    width="36"
                    height="36"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 36 0 L 0 0 0 36"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="0.75"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#rafiq-grid)" />
                {/* Subtle barcode vertical bars echo */}
                <g fill="#CED46A" opacity="0.45">
                  <rect x="28" y="0" width="3" height="100%" />
                  <rect x="36" y="0" width="1.5" height="100%" />
                  <rect x="42" y="0" width="5" height="100%" />
                  <rect x="52" y="0" width="2" height="100%" />
                </g>
              </svg>

              {/* Ambient Glow Orbs */}
              <div className="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-[#CED46A]/15 blur-3xl" />
              <div className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full bg-emerald-400/20 blur-2xl" />

              {/* Top Row: Status Pill */}
              <div className="relative z-10 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[11px] font-bold px-3 py-1.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-md text-white">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isForbidden
                        ? 'bg-amber-400 animate-pulse'
                        : isNetworkError
                        ? 'bg-sky-300 animate-pulse'
                        : 'bg-[#CED46A]'
                    }`}
                  />
                  <span>{statusBadgeLabel}</span>
                </span>

                <span
                  dir="ltr"
                  className="text-[11px] font-mono font-bold tracking-wider text-white/75 bg-black/20 px-2.5 py-1 rounded-lg border border-white/10"
                >
                  HTTP {displayCode}
                </span>
              </div>

              {/* Center Emblem + Giant Editorial Error Code */}
              <div className="relative z-10 my-7 lg:my-0 flex flex-col items-center text-center">
                <div className="relative mb-4">
                  {/* Outer halo ring */}
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-[28px] bg-white/10 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-[0_18px_40px_-10px_rgba(0,0,0,0.45)] p-4">
                    <img
                      src="/rafiq_logo.png"
                      alt="شعار رفيق"
                      className="w-full h-full object-contain drop-shadow-md"
                    />
                  </div>
                  {/* Floating Contextual Mini Icon Badge */}
                  <div
                    className={`absolute -bottom-2 -left-2 w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg border-2 border-[#00372D] ${
                      isForbidden
                        ? 'bg-amber-400 text-[#00372D]'
                        : isNetworkError
                        ? 'bg-sky-400 text-[#00372D]'
                        : 'bg-[#CED46A] text-[#00372D]'
                    }`}
                  >
                    {isForbidden ? (
                      <ShieldAlert className="w-5 h-5" />
                    ) : isNetworkError ? (
                      <WifiOff className="w-5 h-5" />
                    ) : (
                      <Link2Off className="w-5 h-5" />
                    )}
                  </div>
                </div>

                {/* Big Crisp Status Numeral */}
                <div
                  dir="ltr"
                  className="text-6xl sm:text-7xl font-black tracking-tight leading-none select-none bg-gradient-to-b from-white via-white/95 to-emerald-200/70 bg-clip-text text-transparent"
                >
                  {displayCode}
                </div>
                <p className="mt-2 text-xs font-semibold text-emerald-100/85 max-w-[230px] leading-relaxed">
                  {isForbidden
                    ? 'حماية مركزية فورية عبر بوابة تراخيص رفيق'
                    : isNetworkError
                    ? 'خوادم رفيق السحابية تعمل بكفاءة — أعد المحاولة'
                    : 'شبكة متاجر رفيق السحابية المتصلة بالكاشير'}
                </p>
              </div>

              {/* Bottom Signature inside Panel */}
              <div className="relative z-10 pt-4 border-t border-white/15 flex items-center justify-between text-[11px] text-emerald-100/80">
                <span className="font-bold text-white">Rafiq Cloud Store</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#CED46A]" />
                  نظام آمن وموثوق
                </span>
              </div>
            </div>

            {/* Left Content & Recovery Workspace */}
            <div className="lg:col-span-7 p-6 sm:p-9 lg:p-10 flex flex-col justify-between gap-6">
              <div className="space-y-5">
                {/* Headline & Empathetic Copy */}
                <div className="space-y-2.5">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#006D41] bg-[#EAF5EE] border border-[#006D41]/15 px-3 py-1 rounded-full">
                    <Compass className="w-3.5 h-3.5" />
                    <span>{isForbidden ? 'تنبيه حالة المتجر' : 'دليل الوصول للمتجر'}</span>
                  </div>

                  <h1 className="text-2xl sm:text-[28px] font-black text-[#0F172A] leading-snug tracking-tight">
                    {headline}
                  </h1>

                  <p className="text-sm text-[#52605D] leading-relaxed font-medium">
                    {subtitle}
                  </p>
                </div>

                {/* Interactive Store Slug Finder (Search Safety Net) */}
                {isNotFound && (
                  <form onSubmit={handleGoToStore} className="space-y-2">
                    <label
                      htmlFor="rafiq-store-slug-finder"
                      className="block text-xs font-extrabold text-[#0F172A]"
                    >
                      تبحث عن متجر معيّن؟ اكتب معرّف المتجر للانتقال مباشرة:
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 text-[#52605D] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="rafiq-store-slug-finder"
                          type="text"
                          dir="ltr"
                          value={slugInput}
                          onChange={e => {
                            setSlugInput(e.target.value);
                            if (inputError) setInputError('');
                          }}
                          placeholder="example: rafiq"
                          className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-[#DCE1DC] bg-white text-sm font-mono text-[#0F172A] placeholder:text-[#52605D]/60 focus:outline-none focus:ring-2 focus:ring-[#004D3F]/25 focus:border-[#004D3F] transition-all text-left"
                        />
                      </div>
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#004D3F] hover:bg-[#00372D] !text-white text-xs sm:text-sm font-bold shadow-xs transition-all btn-spring cursor-pointer flex-shrink-0"
                      >
                        <span>الانتقال للمتجر</span>
                        <ArrowLeft className="w-4 h-4 !text-white" />
                      </button>
                    </div>
                    {inputError && (
                      <p className="text-xs font-bold text-[#B23A2E]">{inputError}</p>
                    )}
                  </form>
                )}

                {/* Helpful Reasons / Guidance Checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {isForbidden ? (
                    <>
                      <div className="rounded-2xl border border-[#DCE1DC] bg-[#F8FAFC] p-3.5 flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] text-[#B3720E] flex items-center justify-center flex-shrink-0">
                          <ShieldAlert className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-[#0F172A]">لعملاء المتجر</div>
                          <p className="text-[11px] text-[#52605D] mt-0.5 leading-relaxed">
                            تواصل مباشرة مع إدارة المحل للتحقق من موعد إعادة فتح الطلبات أونلاين.
                          </p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[#DCE1DC] bg-[#F8FAFC] p-3.5 flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#E6F2ED] text-[#004D3F] flex items-center justify-center flex-shrink-0">
                          <Monitor className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-[#0F172A]">لصاحب المتجر</div>
                          <p className="text-[11px] text-[#52605D] mt-0.5 leading-relaxed">
                            تأكد من تفعيل اشتراك المتجر الإلكتروني من برنامج كاشير رفيق أو عبر الدعم.
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-[#DCE1DC] bg-[#F8FAFC] p-3.5 flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#E6F2ED] text-[#004D3F] flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-[#0F172A]">تأكد من الإملاء</div>
                          <p className="text-[11px] text-[#52605D] mt-0.5 leading-relaxed">
                            راجع الأحرف والشرطات في الرابط أو اطلب الرابط الصحيح من صاحب المحل.
                          </p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[#DCE1DC] bg-[#F8FAFC] p-3.5 flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#EAF5EE] text-[#006D41] flex items-center justify-center flex-shrink-0">
                          <Store className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-[#0F172A]">جرّب المتجر التجريبي</div>
                          <p className="text-[11px] text-[#52605D] mt-0.5 leading-relaxed">
                            شاهد تجربة التسوق الحقيقية لمتاجر رفيق بكامل المميزات الآن.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Primary & Secondary Action Row */}
              <div className="pt-4 border-t border-[#DCE1DC]/80 flex flex-wrap items-center gap-2.5">
                {isForbidden || isNetworkError ? (
                  <button
                    type="button"
                    onClick={() => (onRetry ? onRetry() : window.location.reload())}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#006D41] hover:bg-[#004D3F] !text-white text-xs sm:text-sm font-bold shadow-xs transition-all btn-spring cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 !text-white" />
                    <span>إعادة المحاولة</span>
                  </button>
                ) : (
                  <a
                    href="/rafiq"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#006D41] hover:bg-[#004D3F] !text-white text-xs sm:text-sm font-bold shadow-xs transition-all btn-spring"
                  >
                    <Store className="w-4 h-4 !text-white" />
                    <span className="!text-white">تصفح المتجر التجريبي</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={handleGoBack}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#F1F5F4] hover:bg-[#E6F2ED] text-[#0F172A] hover:text-[#00372D] border border-[#DCE1DC] text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>العودة للخلف</span>
                </button>
              </div>
            </div>
          </section>

          {/* Flagship Rafiq Merchant Conversion Strip */}
          <section
            className="rounded-3xl p-5 sm:p-6 border border-[#004D3F]/20 text-white shadow-lg relative overflow-hidden"
            style={{
              background:
                'linear-gradient(125deg, #031F17 0%, #00372D 55%, #004D3F 100%)',
            }}
          >
            <div className="pointer-events-none absolute -left-12 -top-12 w-44 h-44 rounded-full bg-emerald-400/15 blur-2xl" />
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center p-2 flex-shrink-0">
                  <img
                    src="/rafiq_logo.png"
                    alt="رفيق POS"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#CED46A]/15 text-[#CED46A] border border-[#CED46A]/30 px-2.5 py-0.5 rounded-full">
                      <Sparkles className="w-3 h-3" />
                      هل لديك محل أو نشاط تجاري؟
                    </span>
                    <h2 className="text-sm sm:text-base font-black text-white">
                      امتلك متجرك الإلكتروني مربوطاً لحظياً بكاشير رفيق
                    </h2>
                  </div>
                  <p className="text-xs text-emerald-100/80 leading-relaxed max-w-2xl">
                    نظام كاشير سطح مكتب يعمل بدون إنترنت 100% مع مزامنة تلقائية للمخزون والأسعار واستقبال أوردرات العملاء أونلاين بضغطة زر.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-emerald-200/90 font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <Monitor className="w-3.5 h-3.5 text-[#CED46A]" />
                      كاشير أوفلاين سريع
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Smartphone className="w-3.5 h-3.5 text-[#CED46A]" />
                      متجر أونلاين باسم محلك
                    </span>
                  </div>
                </div>
              </div>

              <a
                href={supportWhatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full md:w-auto inline-flex items-center justify-center gap-2 bg-[#006D41] hover:bg-emerald-600 !text-white px-5 py-3 rounded-2xl text-xs font-black shadow-md border border-emerald-400/25 transition-all btn-spring flex-shrink-0"
              >
                <MessageSquare className="w-4 h-4 !text-white" />
                <span className="!text-white">اطلب متجرك الآن عبر واتساب</span>
                <ArrowLeft className="w-3.5 h-3.5 !text-white" />
              </a>
            </div>
          </section>
        </div>
      </main>

      {/* Clean Branded Footer */}
      <footer className="relative z-10 border-t border-[#DCE1DC]/80 bg-white/75 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#52605D]">
          <div className="flex items-center gap-2 font-medium">
            <img
              src="/rafiq_logo_dark.png"
              alt="رفيق"
              className="w-5 h-5 object-contain"
            />
            <span>
              جميع الحقوق محفوظة لـ <strong className="text-[#00372D]">رفيق للأنظمة والحلول البرمجية</strong> © 2026
            </span>
          </div>
          <div className="flex items-center gap-3 font-semibold">
            <span>م. إسلام خالد</span>
            <span className="text-[#DCE1DC]">|</span>
            <a
              href={`tel:${supportPhone}`}
              dir="ltr"
              className="font-mono text-[#004D3F] hover:underline"
            >
              {supportPhone}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
