import React from 'react';
import { ShieldCheck, Sparkles, MessageSquare, ArrowLeft, Monitor, Smartphone, CheckCircle2, Zap } from 'lucide-react';

interface Props {
  variant?: 'mobile-feed' | 'sidebar' | 'footer-banner';
  supportPhone?: string;
}

export const RafiqBrandingCard: React.FC<Props> = ({
  variant = 'mobile-feed',
  supportPhone = '01012345678',
}) => {
  const cleanPhone = supportPhone.replace(/^0+/, '');
  const promoWhatsappMsg = encodeURIComponent(
    'مرحباً، أرغب في معرفة تفاصيل وشروط الاشتراك في نظام رفيق لإدارة نقاط البيع والمتجر الإلكتروني لمحلي التجاري.'
  );
  const whatsappUrl = `https://wa.me/2${cleanPhone}?text=${promoWhatsappMsg}`;

  // 1. Sidebar Variant (Clean, modern card on desktop sidebar)
  if (variant === 'sidebar') {
    return (
      <div className="rounded-3xl p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-md border border-slate-700/60 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center p-1.5 shadow-sm flex-shrink-0">
            <img src="/logo_white.png" alt="رفيق POS" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-black text-white flex items-center gap-1 truncate">
              <span>نظام رفيق POS الذكي</span>
              <Sparkles className="w-3 h-3 text-amber-400 flex-shrink-0" />
            </h4>
            <span className="text-[10px] text-amber-300 font-bold block truncate">لإدارة المتاجر ونقاط البيع</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
          هل تمتلك محلاً أو متجراً؟ امتلك كاشير أوفلاين ومتجراً إلكترونياً متكاملاً بدون إنترنت وبأعلى سرعة.
        </p>

        <div className="space-y-1 text-[10px] text-slate-300">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-store-primary flex-shrink-0" />
            <span>طباعة فواتير حرارية وسندات قبض</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3 h-3 text-store-primary flex-shrink-0" />
            <span>إدارة أرباح وجرد مخزون بالباركود</span>
          </div>
        </div>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-center gap-1.5 bg-store-primary hover:bg-store-primary-hover text-white py-2 px-3 rounded-xl text-xs font-black transition-all shadow-xs btn-spring"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>اطلب نسختك لمحلك الآن</span>
        </a>
      </div>
    );
  }

  // 2. Footer Banner Variant (Prestigious promotional strip on desktop)
  if (variant === 'footer-banner') {
    return (
      <div className="rounded-3xl p-6 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-5 my-6 text-right">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center p-2.5 shadow-md flex-shrink-0">
            <img src="/logo_white.png" alt="رفيق POS" className="w-full h-full object-contain" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-black bg-white/10 text-amber-300 border border-white/15 px-2.5 py-0.5 rounded-full">
                المنصة الرسمية المعتمدة
              </span>
              <img src="/logo_full_white.png" alt="Rafiq POS" className="h-6 object-contain hidden lg:block" />
              <h3 className="text-base font-black text-white">
                منظومة رفيق لإدارة المتاجر ونقاط البيع (Rafiq POS Platform)
              </h3>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              الحل الهندسي الأقوى لأصحاب محلات التجزئة والسوبرماركت في مصر: كاشير سطح مكتب أوفلاين يعمل بدون إنترنت على جميع أجهزة ويندوز مع متجر إلكتروني ذكي لمضاعفة مبيعاتك واستقبال الطلبات فورياً.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-store-primary hover:bg-store-primary-hover text-white px-5 py-3 rounded-2xl text-xs font-black shadow-lg shadow-black/40 transition-all btn-spring"
          >
            <MessageSquare className="w-4 h-4" />
            <span>طلب النظام أو تجربة مجانية</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  // 3. Mobile Feed Variant (Rendered elegantly right before mobile bottom nav)
  return (
    <div className="sm:hidden px-3.5 w-full my-6">
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white p-5 border border-slate-700/80 shadow-xl space-y-3.5">
        {/* Glow ambient */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-store-primary/20 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center p-2 shadow-sm flex-shrink-0">
              <img src="/logo_white.png" alt="رفيق POS" className="w-full h-full object-contain" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white flex items-center gap-1">
                <span>نظام رفيق POS الذكي</span>
                <Sparkles className="w-3 h-3 text-amber-400" />
              </h4>
              <span className="text-[10px] text-amber-300 font-bold">منظومة كاشير ومتاجر إلكترونية</span>
            </div>
          </div>

          <span className="text-[10px] bg-white/10 text-slate-300 px-2.5 py-1 rounded-xl font-bold border border-white/10">
            © 2026
          </span>
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-black text-white leading-snug">
            هل تمتلك محلاً أو نشاطاً تجارياً؟
          </h3>
          <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
            امتلك كاشير محلك أوفلاين مع متجر إلكتروني ذكي لزيادة مبيعاتك واستقبال الطلبات بالدليفري والواتساب بأسعار رسمية وجودة مضمونة.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300 pt-1">
          <div className="flex items-center gap-1.5 bg-white/5 p-2 rounded-xl border border-white/5">
            <Monitor className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
            <span>كاشير أوفلاين بدون نت</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/5 p-2 rounded-xl border border-white/5">
            <Smartphone className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
            <span>متجر سحابي لحظي</span>
          </div>
        </div>

        {/* Promotional Call-to-Action Button */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-store-primary via-store-primary-hover to-store-primary hover:brightness-110 text-white py-3 px-4 rounded-2xl text-xs font-black shadow-lg shadow-black/40 transition-all btn-spring"
        >
          <MessageSquare className="w-4 h-4" />
          <span>تواصل لطلب نظام رفيق لمحلك الآن</span>
          <ArrowLeft className="w-3.5 h-3.5 mr-auto" />
        </a>

        <div className="text-center pt-1">
          <span className="text-[10px] text-slate-400 font-medium">
            مدعوم بنظام رفيق الذكي لنقاط البيع وإدارة التجزئة • موثوق ومعتمد
          </span>
        </div>
      </div>
    </div>
  );
};
