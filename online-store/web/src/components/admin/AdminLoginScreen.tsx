import React, { useState } from 'react';
import type { Store } from '../../types';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  ChevronLeft,
  ShieldCheck,
  ShoppingBag,
  Camera,
  Palette,
  Loader2,
  Globe,
} from 'lucide-react';

interface Props {
  store: Store;
  isDemoStore: boolean;
  licenseKeyInput: string;
  pin: string;
  isLoggingIn: boolean;
  loginError: string | null;
  onLicenseKeyChange: (val: string) => void;
  onPinChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBackToStore: () => void;
}

export const AdminLoginScreen: React.FC<Props> = ({
  store,
  isDemoStore,
  licenseKeyInput,
  pin,
  isLoggingIn,
  loginError,
  onLicenseKeyChange,
  onPinChange,
  onSubmit,
  onBackToStore,
}) => {
  const [showPin, setShowPin] = useState(false);

  const storePublicHost = `rafiq-store-web.rafiq-store-api.workers.dev/${store.slug}`;

  return (
    <div dir="rtl" className="min-h-screen bg-[#F7FAFC] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl bg-white rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
        {/* RIGHT PANEL (RTL): Brand & Store Executive Showcase */}
        <div
          className="lg:col-span-5 relative overflow-hidden p-6 sm:p-8 flex flex-col justify-between text-white"
          style={{
            background: 'linear-gradient(155deg, #00372D 0%, #004D3F 58%, #006D41 100%)',
          }}
        >
          {/* Subtle Architectural Grid */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)',
              backgroundSize: '20px 20px',
            }}
          />

          <div className="relative z-10 space-y-6">
            {/* Official Brand Logo */}
            <div className="flex items-center justify-between gap-3">
              <img
                src="/logo_full_dark.png"
                alt="رفيق للمتاجر الإلكترونية"
                className="h-9 sm:h-10 w-auto object-contain"
              />
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-[10px] font-bold text-[#CED46A]">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>بوابة التاجر</span>
              </span>
            </div>

            {/* Active Store Identity Card */}
            <div className="p-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-white border border-white/25 p-1 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
                  <img
                    src={store.logo_url || '/rafiq_logo.png'}
                    alt={store.name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '/rafiq_logo.png';
                    }}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black text-white truncate">{store.name}</div>
                  <div className="text-[11px] text-emerald-100/80 font-medium flex items-center gap-1 mt-0.5">
                    <Globe className="w-3 h-3 flex-shrink-0" />
                    <span dir="ltr" className="truncate font-mono text-[10px]">
                      /{store.slug}
                    </span>
                  </div>
                </div>
              </div>
              <div
                dir="ltr"
                className="text-[10px] font-mono text-white/75 bg-black/20 rounded-xl px-3 py-1.5 truncate border border-white/10"
              >
                https://{storePublicHost}
              </div>
            </div>

            {/* Feature Pillars */}
            <div className="hidden lg:block space-y-3 pt-2">
              <div className="text-[11px] font-bold text-emerald-100/80">
                كل ما تحتاجه لإدارة متجرك الإلكتروني من مكان واحد:
              </div>
              {[
                {
                  icon: ShoppingBag,
                  title: 'إدارة الأوردرات لحظياً',
                  desc: 'استقبال الطلبات بالتنبيه الصوتي وطباعة البون الحراري ومتابعة التوصيل',
                },
                {
                  icon: Camera,
                  title: 'صور الأصناف والمخزون السحابي',
                  desc: 'رفع صور المنتجات المضغوطة تلقائياً والتحكم الفوري في الظهور والعروض',
                },
                {
                  icon: Palette,
                  title: 'استوديو القوالب والهوية البصرية',
                  desc: 'تخصيص قالب المتجر والألوان ومناطق التوصيل وتحديثها لحظياً',
                },
              ].map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0 text-[#CED46A]">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-white">{item.title}</div>
                      <div className="text-[11px] text-emerald-100/75 leading-relaxed">{item.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative z-10 hidden lg:flex items-center justify-between pt-6 mt-6 border-t border-white/15 text-[10px] text-emerald-100/70">
            <span>اتصال مشفّر بالكامل JWT / HTTPS</span>
            <span className="font-mono">Rafiq Cloud POS</span>
          </div>
        </div>

        {/* LEFT PANEL (RTL): Clean Login Form */}
        <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E6F2ED] text-[#004D3F] text-[11px] font-black">
                <Lock className="w-3.5 h-3.5" />
                <span>تسجيل دخول صاحب المتجر</span>
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                مرحباً بك في لوحة التحكم
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                {isDemoStore
                  ? 'أدخل الرمز السري لتجربة جميع مزايا لوحة تحكم متجر رفيق الرسمي.'
                  : `أدخل مفتاح ترخيص (${store.name}) والرمز السري لإدارة الطلبات والمنتجات والإعدادات.`}
              </p>
            </div>

            {loginError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{loginError}</span>
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              {!isDemoStore && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-[#004D3F]" />
                    <span>مفتاح ترخيص المحل (License Key)</span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={licenseKeyInput}
                    onChange={e => onLicenseKeyChange(e.target.value.toUpperCase())}
                    placeholder="RFQ-XXXX-XXXX-XXXX"
                    autoComplete="off"
                    className="w-full text-center tracking-wider text-sm font-mono font-bold px-4 py-3.5 rounded-2xl border border-slate-200 bg-slate-50/80 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#004D3F] focus:border-[#004D3F] transition-all"
                  />
                  <p className="text-[11px] text-slate-400">
                    نفس مفتاح الترخيص المفعّل على برنامج كاشير رفيق في المحل.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#004D3F]" />
                    <span>الرمز السري للدخول (PIN)</span>
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    dir="ltr"
                    value={pin}
                    onChange={e => onPinChange(e.target.value)}
                    placeholder="••••"
                    className="w-full text-center tracking-[0.35em] text-lg font-mono font-bold px-12 py-3.5 rounded-2xl border border-slate-200 bg-slate-50/80 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#004D3F] focus:border-[#004D3F] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(v => !v)}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                    title={showPin ? 'إخفاء الرمز' : 'إظهار الرمز'}
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-[#004D3F] hover:bg-[#00372D] disabled:opacity-60 text-white py-3.5 px-5 rounded-2xl text-sm font-black shadow-lg shadow-[#004D3F]/20 btn-spring transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التحقق من الجلسة...</span>
                  </>
                ) : (
                  <>
                    <span>دخول إلى لوحة التحكم</span>
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-[11px] text-slate-400 text-center">
                تظل الجلسة مفتوحة تلقائياً على هذا الجهاز لمدة 30 يوماً دون الحاجة لإعادة إدخال الرمز.
              </p>
            </form>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={onBackToStore}
                className="text-xs font-bold text-slate-500 hover:text-[#004D3F] transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>العودة إلى المتجر الإلكتروني</span>
              </button>

              <span className="text-[11px] text-slate-400 font-medium">
                دعم رفيق متاح على مدار الساعة
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
