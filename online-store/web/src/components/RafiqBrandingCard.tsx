import React from 'react';
import { BadgeCheck, ShieldCheck, MessageSquare, ArrowLeft, Monitor, Smartphone, CheckCircle2 } from 'lucide-react';
import { buildWhatsAppUrl } from '../utils/whatsapp';

interface Props {
  variant?: 'mobile-feed' | 'sidebar' | 'footer-banner';
  supportPhone?: string;
}

export const RafiqBrandingCard: React.FC<Props> = ({
  variant = 'mobile-feed',
  supportPhone = '01097782965',
}) => {
  const whatsappUrl = buildWhatsAppUrl(
    supportPhone || '01097782965',
    'السلام عليكم م. إسلام، أرغب في الاستفسار وتجربة برنامج كاشير رفيق والمتجر الإلكتروني لمحلي التجاري.'
  );

  // 1. Sidebar Variant (Clean, modern card on desktop sidebar)
  if (variant === 'sidebar') {
    return (
      <div className="rounded-3xl p-4 bg-store-card text-store-text shadow-xs border border-store-line space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-store-card-subtle border border-store-line flex items-center justify-center p-1.5 shadow-2xs flex-shrink-0">
            <img src="/rafiq_logo.png" alt="برنامج كاشير رفيق" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-black text-store-text flex items-center gap-1 truncate">
              <span>برنامج رفيق لإدارة نقاط البيع</span>
              <BadgeCheck className="w-3.5 h-3.5 text-store-accent flex-shrink-0" />
            </h4>
            <span className="text-[10px] text-store-secondary font-bold block truncate">كاشير محلك ومتجرك الأونلاين</span>
          </div>
        </div>

        <p className="text-[11px] text-store-muted leading-relaxed font-medium">
          عندك محل وعاوز تكبّر مبيعاتك؟ امتلك كاشير أوفلاين سريع بدون نت، ومعاه متجر أونلاين لزباينك يستقبل أوردرات الواتساب والدليفري.
        </p>

        <div className="space-y-1.5 text-[10px] text-store-text">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
            <span>طباعة فواتير وسندات سريعة بدقة</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-store-primary flex-shrink-0" />
            <span>إدارة المخزون بالباركود وحساب دقيق للأرباح</span>
          </div>
        </div>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-center gap-1.5 bg-store-primary hover:opacity-90 !text-white py-2.5 px-3 rounded-xl text-xs font-black transition-all shadow-xs btn-spring"
        >
          <MessageSquare className="w-3.5 h-3.5 !text-white" />
          <span className="!text-white">تواصل واطلب نسختك لمحلك</span>
        </a>

        <div className="text-center pt-0.5 text-[10px] text-store-muted">
          م. إسلام خالد | <span dir="ltr">01097782965</span>
        </div>
      </div>
    );
  }

  // 2. Footer Banner Variant (Prestigious promotional strip on desktop)
  if (variant === 'footer-banner') {
    return (
      <div
        className="rounded-3xl p-6 border border-white/10 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-5 my-6 text-right transition-colors duration-500"
        style={{ backgroundColor: 'var(--store-footer-card, #0F172A)' }}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center p-2 shadow-md flex-shrink-0">
            <img src="/rafiq_logo.png" alt="برنامج كاشير رفيق" className="w-full h-full object-contain" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                البرنامج المعتمد لأصحاب المحلات
              </span>
              <h3 className="text-base font-black text-white">
                برنامج رفيق لإدارة نقاط البيع والمتاجر بالتجزئة
              </h3>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              السيستم الأنسب لأصحاب السوبرماركت ومحلات التجزئة في مصر: كاشير سطح مكتب أوفلاين يشتغل بدون إنترنت على جميع أجهزة ويندوز، مع متجر إلكتروني سحابي لمضاعفة مبيعاتك واستقبال طلبات الزباين دليفري وعلى الواتساب بنفس أسعار المحل.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 !text-white px-5 py-3 rounded-2xl text-xs font-black shadow-lg shadow-black/40 transition-all btn-spring"
          >
            <MessageSquare className="w-4 h-4 !text-white" />
            <span className="!text-white">طلب البرنامج أو تجربة مجانية</span>
            <ArrowLeft className="w-3.5 h-3.5 !text-white" />
          </a>
          <span className="text-[11px] text-slate-300 font-medium">
            م. إسلام خالد • <strong className="text-emerald-400 font-mono font-bold" dir="ltr">01097782965</strong>
          </span>
        </div>
      </div>
    );
  }

  // 3. Mobile Feed Variant (Rendered elegantly right before mobile bottom nav)
  return (
    <div className="sm:hidden px-3.5 w-full my-6">
      <div
        className="relative rounded-3xl overflow-hidden border border-white/10 text-white p-5 shadow-2xl space-y-3.5 transition-colors duration-500"
        style={{ backgroundColor: 'var(--store-footer-card, #0F172A)' }}
      >
        {/* Glow ambient */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center p-1.5 shadow-sm flex-shrink-0">
              <img src="/rafiq_logo.png" alt="برنامج كاشير رفيق" className="w-full h-full object-contain" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white flex items-center gap-1">
                <span>برنامج رفيق لإدارة نقاط البيع</span>
                <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />
              </h4>
              <span className="text-[10px] text-emerald-300 font-bold">كاشير لمحلك ومتجر أونلاين لزباينك</span>
            </div>
          </div>

          <span className="text-[10px] bg-white/10 text-slate-300 px-2.5 py-1 rounded-xl font-bold border border-white/10">
            © 2026
          </span>
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-black text-white leading-snug">
            عندك محل وعاوز تريّح بالك وتكبّر مبيعاتك؟
          </h3>
          <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
            امتلك سيستم كاشير سريع لمحلك يشتغل بدون نت، ومعاه متجر أونلاين يوصل طلبات زباينك دليفري أو على الواتساب بأسعار المحل الرسمية.
          </p>
        </div>

        {/* Feature Highlights with High Contrast Icons */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-white pt-1">
          <div className="flex items-center gap-2 bg-white/10 p-2.5 rounded-xl border border-white/15 shadow-2xs">
            <Monitor className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-bold">كاشير أوفلاين بدون نت</span>
          </div>
          <div className="flex items-center gap-2 bg-white/10 p-2.5 rounded-xl border border-white/15 shadow-2xs">
            <Smartphone className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-bold">متجر أونلاين لطلباتك</span>
          </div>
        </div>

        {/* Promotional Call-to-Action Button */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 !text-white py-3 px-4 rounded-2xl text-xs font-black shadow-lg shadow-black/40 transition-all btn-spring"
        >
          <MessageSquare className="w-4 h-4 !text-white" />
          <span className="!text-white">تواصل لطلب وتجربة السيستم لمحلك</span>
          <ArrowLeft className="w-3.5 h-3.5 mr-auto !text-white" />
        </a>

        {/* Developer Offline Receipt Signature */}
        <div className="text-center pt-1.5 border-t border-white/10 space-y-0.5">
          <div className="text-[10px] text-slate-300 font-medium">
            برمجة وتطوير: <strong className="text-white">رفيق للأنظمة والحلول البرمجية</strong>
          </div>
          <div className="text-[11px] text-emerald-300 font-bold" dir="ltr">
            م. إسلام خالد | 01097782965
          </div>
        </div>
      </div>
    </div>
  );
};
