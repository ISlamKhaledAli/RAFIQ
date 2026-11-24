import React, { useMemo, useState } from 'react';
import type { Store } from '../../types';
import {
  THEME_PRESETS_CONFIG,
  THEME_INDUSTRY_FILTERS,
  STORE_LAYOUT_TEMPLATES,
  STORE_CORNER_STYLES,
  resolveThemePreset,
  resolveLayoutTemplate,
  resolveCornerStyle,
  type ThemeIndustryGroup,
  type StoreLayoutTemplate,
  type StoreCornerStyle,
  type StoreThemeCustom,
} from '../ThemeInjector';
import {
  Palette,
  Check,
  ExternalLink,
  Smartphone,
  Monitor,
  LayoutGrid,
  Sparkles,
  ShoppingBag,
  Plus,
  Package,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Sliders,
  Flame,
  Truck,
  MessageSquare,
  Heart,
  Tag,
  Type,
  Megaphone,
  Award,
  Percent,
} from 'lucide-react';
import { ToggleSwitch } from './ToggleSwitch';

interface Props {
  store: Store;
  storeName: string;
  selectedPreset: string;
  themeCustom: StoreThemeCustom | null;
  onSelectPreset: (presetKey: string) => void;
  onChangeThemeCustom: (nextCustom: StoreThemeCustom) => void;
  onBackToStore: () => void;
  isSaving?: boolean;
  saveStatusText?: string | null;
}

export const ThemeStudioPanel: React.FC<Props> = ({
  store,
  storeName,
  selectedPreset,
  themeCustom,
  onSelectPreset,
  onChangeThemeCustom,
  onBackToStore,
  isSaving = false,
  saveStatusText = null,
}) => {
  const [industryFilter, setIndustryFilter] = useState<'all' | ThemeIndustryGroup>('all');
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [textTab, setTextTab] = useState<'hero' | 'trust' | 'stories' | 'cart' | 'announcement'>('hero');
  const [heroSlideSubTab, setHeroSlideSubTab] = useState<1 | 2 | 3>(1);

  const activeTheme = useMemo(() => resolveThemePreset(selectedPreset), [selectedPreset]);
  const activeLayout = useMemo(() => resolveLayoutTemplate(themeCustom), [themeCustom]);
  const activeCorner = useMemo(() => resolveCornerStyle(themeCustom), [themeCustom]);

  const filteredPresets = useMemo(() => {
    const all = Object.values(THEME_PRESETS_CONFIG);
    if (industryFilter === 'all') return all;
    return all.filter(p => p.industry === industryFilter);
  }, [industryFilter]);

  const handleLayoutChange = (layoutTemplate: StoreLayoutTemplate) => {
    onChangeThemeCustom({
      ...(themeCustom || {}),
      layoutTemplate,
      cornerStyle: activeCorner.id,
    });
  };

  const handleCornerChange = (cornerStyle: StoreCornerStyle) => {
    onChangeThemeCustom({
      ...(themeCustom || {}),
      layoutTemplate: activeLayout,
      cornerStyle,
    });
  };

  const handleToggleFeature = (key: keyof StoreThemeCustom, value: any) => {
    onChangeThemeCustom({
      ...(themeCustom || {}),
      layoutTemplate: activeLayout,
      cornerStyle: activeCorner.id,
      [key]: value,
    });
  };

  const handleResetToOfficial = () => {
    onSelectPreset('rafiq-official');
    onChangeThemeCustom({
      layoutTemplate: 'classic',
      cornerStyle: 'rounded',
    });
  };

  const previewUrl = typeof window !== 'undefined' && window.location.host
    ? `${window.location.host}/${store.slug || 'rafiq'}`
    : `store.rafiqpos.workers.dev/${store.slug || 'rafiq'}`;
  const cardRadiusStyle = { borderRadius: activeCorner.cardRadius };
  const btnRadiusStyle = { borderRadius: activeCorner.btnRadius };

  const previewGridCols =
    previewDevice === 'mobile'
      ? activeLayout === 'boutique' || activeLayout === 'food'
        ? 'grid-cols-1'
        : 'grid-cols-2'
      : activeLayout === 'compact' || activeLayout === 'pharmacy'
      ? 'grid-cols-3'
      : activeLayout === 'food' || activeLayout === 'boutique'
      ? 'grid-cols-2'
      : 'grid-cols-2';

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Top Executive Studio Header */}
      <div className="bg-store-card rounded-3xl border border-store-line p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0 border border-white/20"
            style={{ background: activeTheme.gradient }}
          >
            <Palette className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-black text-store-text">
                استوديو القوالب والسمات البصرية
              </h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-store-primary-light text-store-primary border border-store-primary/15">
                <ShieldCheck className="w-3 h-3" />
                تباين لوني معتمد WCAG AA
              </span>
            </div>
            <p className="text-xs text-store-muted mt-0.5">
              اختر قالب العرض وشكل الحواف وهوية الألوان المناسبة لنشاط محلك — التحديث فوري ومتجاوب مع الموبايل والكمبيوتر.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {isSaving ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-store-muted bg-store-card-subtle px-3 py-2 rounded-xl border border-store-line">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-store-primary" />
              <span>جاري الحفظ...</span>
            </span>
          ) : saveStatusText ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{saveStatusText}</span>
            </span>
          ) : null}

          <button
            type="button"
            onClick={handleResetToOfficial}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-store-card-subtle hover:bg-store-primary-light text-store-text border border-store-line transition-colors cursor-pointer"
            title="استعادة هوية رفيق الرسمية"
          >
            <RotateCcw className="w-3.5 h-3.5 text-store-primary" />
            <span>هوية رفيق</span>
          </button>

          <button
            type="button"
            onClick={onBackToStore}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black bg-store-primary hover:opacity-90 !text-white shadow-sm transition-all btn-spring cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 !text-white" />
            <span className="!text-white">معاينة المتجر الحي</span>
          </button>
        </div>
      </div>

      {/* Main Split Studio Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* RIGHT COLUMN (RTL): Templates + Corner Style + Curated Themes Gallery */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Storefront Layout Templates */}
          <div className="bg-store-card rounded-3xl border border-store-line p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-store-line">
              <div>
                <h4 className="text-sm sm:text-base font-black text-store-text flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-store-primary" />
                  <span>قوالب تخطيط المتجر (3 قوالب جاهزة)</span>
                </h4>
                <p className="text-xs text-store-muted mt-0.5">
                  تحكّم في طريقة عرض شبكة المنتجات وكثافتها بما يناسب طبيعة أصنافك
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {STORE_LAYOUT_TEMPLATES.map(tpl => {
                const isSelected = activeLayout === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleLayoutChange(tpl.id)}
                    className={`group text-right p-3.5 rounded-2xl border transition-all btn-spring cursor-pointer flex flex-col justify-between gap-3 relative ${
                      isSelected
                        ? 'border-2 border-store-primary bg-store-primary-light/35 shadow-sm'
                        : 'border border-store-line bg-store-card hover:border-store-primary/50 hover:bg-store-card-subtle'
                    }`}
                  >
                    {/* Mini Wireframe Schematic */}
                    <div className="w-full h-16 rounded-xl bg-store-card-subtle border border-store-line/80 p-2 flex flex-col gap-1.5 overflow-hidden">
                      <div className="h-2 w-2/3 rounded-full bg-store-primary/25" />
                      {tpl.id === 'classic' && (
                        <div className="grid grid-cols-3 gap-1.5 flex-1">
                          <div className="rounded-md bg-store-primary/15 border border-store-primary/20" />
                          <div className="rounded-md bg-store-primary/15 border border-store-primary/20" />
                          <div className="rounded-md bg-store-primary/15 border border-store-primary/20" />
                        </div>
                      )}
                      {tpl.id === 'compact' && (
                        <div className="grid grid-cols-4 gap-1 flex-1">
                          <div className="rounded bg-store-primary/20" />
                          <div className="rounded bg-store-primary/20" />
                          <div className="rounded bg-store-primary/20" />
                          <div className="rounded bg-store-primary/20" />
                        </div>
                      )}
                      {tpl.id === 'boutique' && (
                        <div className="grid grid-cols-2 gap-2 flex-1">
                          <div className="rounded-lg bg-store-primary/18 border border-store-primary/25" />
                          <div className="rounded-lg bg-store-primary/18 border border-store-primary/25" />
                        </div>
                      )}
                      {tpl.id === 'food' && (
                        <div className="flex flex-col gap-1 flex-1 justify-center">
                          <div className="flex items-center gap-1.5 h-4 rounded bg-store-primary/15 border border-store-primary/20 px-1">
                            <div className="w-2.5 h-2.5 rounded bg-store-primary/30" />
                            <div className="h-1 flex-1 rounded bg-store-primary/25" />
                          </div>
                          <div className="flex items-center gap-1.5 h-4 rounded bg-store-primary/15 border border-store-primary/20 px-1">
                            <div className="w-2.5 h-2.5 rounded bg-store-primary/30" />
                            <div className="h-1 flex-1 rounded bg-store-primary/25" />
                          </div>
                        </div>
                      )}
                      {tpl.id === 'pharmacy' && (
                        <div className="grid grid-cols-3 gap-1 flex-1">
                          <div className="rounded bg-store-primary/15 border border-store-primary/20 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-store-primary/40" />
                          </div>
                          <div className="rounded bg-store-primary/15 border border-store-primary/20 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-store-primary/40" />
                          </div>
                          <div className="rounded bg-store-primary/15 border border-store-primary/20 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-store-primary/40" />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black text-store-text">{tpl.name}</span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-store-primary text-white flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-store-muted leading-relaxed">{tpl.description}</p>
                      <div className="text-[10px] font-bold text-store-primary pt-0.5">
                        مثالي لـ: {tpl.bestFor}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Corner Radius Selector Strip */}
            <div className="pt-3 border-t border-store-line/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black text-store-text">نمط حواف البطاقات والأزرار</div>
                <div className="text-[11px] text-store-muted">تخصيص فوري لطابع الزوايا في المتجر</div>
              </div>
              <div className="flex items-center gap-2">
                {STORE_CORNER_STYLES.map(cs => {
                  const selected = activeCorner.id === cs.id;
                  return (
                    <button
                      key={cs.id}
                      type="button"
                      onClick={() => handleCornerChange(cs.id)}
                      className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-bold border transition-all cursor-pointer ${
                        selected
                          ? 'bg-store-primary !text-white border-store-primary shadow-xs'
                          : 'bg-store-card-subtle text-store-text border-store-line hover:border-store-primary/50'
                      }`}
                      style={{ borderRadius: cs.btnRadius }}
                    >
                      <span
                        className={`w-3.5 h-3.5 border-2 ${selected ? 'border-white' : 'border-store-primary'}`}
                        style={{ borderRadius: cs.id === 'sharp' ? '2px' : cs.id === 'soft' ? '999px' : '5px' }}
                      />
                      <span>{cs.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 1.5. Live Storefront Components & CRO Features Controls */}
          <div className="bg-store-card rounded-3xl border border-store-line p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-store-line">
              <div>
                <h4 className="text-sm sm:text-base font-black text-store-text flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-store-primary" />
                  <span>التحكم في مكونات المتجر التسويقية الحية</span>
                </h4>
                <p className="text-xs text-store-muted mt-0.5">
                  تفعيل وإيقاف أقسام وميزات زيادة المبيعات (CRO) في واجهة المتجر بنقرة واحدة
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {/* 1. Stories Bar */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-store-card-subtle border border-store-line/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-store-text">شريط دوائر القصص والعروض (Stories Bar)</div>
                    <div className="text-[10px] text-store-muted">دوائر تفاعلية متحركة أعلى المتجر للتصفية السريعة للأصناف</div>
                  </div>
                </div>
                <ToggleSwitch
                  checked={themeCustom?.showStoriesBar !== false}
                  onChange={val => handleToggleFeature('showStoriesBar', val)}
                  size="sm"
                />
              </div>

              {/* 2. Hero Promo Banner */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-store-card-subtle border border-store-line/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-store-primary/10 text-store-primary flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-store-text">سلايدر وبنر العروض الترويجية (Hero Carousel)</div>
                    <div className="text-[10px] text-store-muted">بنر عروض متجاوب يدعم السحب باللمس والتبديل التلقائي الذكي</div>
                  </div>
                </div>
                <ToggleSwitch
                  checked={themeCustom?.showPromoHero !== false}
                  onChange={val => handleToggleFeature('showPromoHero', val)}
                  size="sm"
                />
              </div>

              {/* 3. Trust Badges Strip */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-store-card-subtle border border-store-line/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-store-text">شريط الطمأنينة وشارات الثقة (Trust Strip)</div>
                    <div className="text-[10px] text-store-muted">تأكيد أسعار المحل الرسمية، وسرعة التوصيل، والدفع الآمن، والمعاينة</div>
                  </div>
                </div>
                <ToggleSwitch
                  checked={themeCustom?.showTrustBadges !== false}
                  onChange={val => handleToggleFeature('showTrustBadges', val)}
                  size="sm"
                />
              </div>

              {/* 4. Free Shipping Progress Bar */}
              <div className="p-3 rounded-2xl bg-store-card-subtle border border-store-line/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 flex items-center justify-center">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-store-text">شريط التوصيل المجاني التحفيزي بالسلة</div>
                      <div className="text-[10px] text-store-muted">شريط تقدم ديناميكي يحفز العميل على زيادة مشترياته لكسب شحن مجاني</div>
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={themeCustom?.showFreeShippingBar !== false}
                    onChange={val => handleToggleFeature('showFreeShippingBar', val)}
                    size="sm"
                  />
                </div>
                {themeCustom?.showFreeShippingBar !== false && (
                  <div className="pt-2 border-t border-store-line flex items-center justify-between gap-3 text-xs">
                    <label className="text-store-muted font-bold">الحد الأدنى للشحن المجاني (بالجنيه):</label>
                    <div className="flex items-center gap-1.5 w-32">
                      <input
                        type="number"
                        min="50"
                        step="10"
                        value={themeCustom?.freeShippingThresholdEgp ?? 250}
                        onChange={e => handleToggleFeature('freeShippingThresholdEgp', Math.max(1, Number(e.target.value) || 250))}
                        className="w-full text-center text-xs font-bold p-1.5 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                      />
                      <span className="text-[10px] font-bold text-store-muted">ج.م</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Cart Cross-Selling Suggestions */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-store-card-subtle border border-store-line/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-store-text">اقتراحات إكمال الطلب في السلة (Cross-Sell)</div>
                    <div className="text-[10px] text-store-muted">عرض قسم "يكتمل طلبك بهذه الأصناف" أسفل السلة لرفع متوسط الفاتورة</div>
                  </div>
                </div>
                <ToggleSwitch
                  checked={themeCustom?.showCartCrossSell !== false}
                  onChange={val => handleToggleFeature('showCartCrossSell', val)}
                  size="sm"
                />
              </div>

              {/* 6. WhatsApp Direct Order */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-store-card-subtle border border-store-line/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-store-text">زر الطلب الفوري عبر واتساب في السلة</div>
                    <div className="text-[10px] text-store-muted">إتاحة خيار إرسال تفاصيل السلة كرسالة واتساب منسقة مباشرة لرقم المحل</div>
                  </div>
                </div>
                <ToggleSwitch
                  checked={themeCustom?.showWhatsAppQuickOrder !== false}
                  onChange={val => handleToggleFeature('showWhatsAppQuickOrder', val)}
                  size="sm"
                />
              </div>

              {/* 7. Wishlist Favorites */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-store-card-subtle border border-store-line/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                    <Heart className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-store-text">أيقونة وقائمة المفضلة (Wishlist)</div>
                    <div className="text-[10px] text-store-muted">تمكين العملاء من حفظ أصنافهم المفضلة للعودة إليها لاحقاً</div>
                  </div>
                </div>
                <ToggleSwitch
                  checked={themeCustom?.showWishlist !== false}
                  onChange={val => handleToggleFeature('showWishlist', val)}
                  size="sm"
                />
              </div>

              {/* 8. Savings Value Badge */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-store-card-subtle border border-store-line/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-paid flex items-center justify-center">
                    <Tag className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-store-text">شارة قيمة التوفير المالي (وفر X ج.م)</div>
                    <div className="text-[10px] text-store-muted">إبراز التوفير بالجنيه داخل شارة الخصم بدلاً من النسبة المئوية فقط</div>
                  </div>
                </div>
                <ToggleSwitch
                  checked={themeCustom?.showSavingsBadge !== false}
                  onChange={val => handleToggleFeature('showSavingsBadge', val)}
                  size="sm"
                />
              </div>

              {/* 9. Scarcity & Low-Stock Urgency Badge */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-store-card-subtle border border-store-line/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <Flame className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-store-text">شارة نفاد المخزون العاجل (متبقي X فقط)</div>
                    <div className="text-[10px] text-store-muted">تنبيه تحفيزي عند اقتراب نفاد كمية الصنف لدفع العميل للشراء الفوري</div>
                  </div>
                </div>
                <ToggleSwitch
                  checked={themeCustom?.showLowStockBadge !== false}
                  onChange={val => handleToggleFeature('showLowStockBadge', val)}
                  size="sm"
                />
              </div>
            </div>
          </div>

          {/* 2. Marketing Texts & Copywriting Customizer (Every Word is Editable) */}
          <div className="bg-store-card rounded-3xl border border-store-line p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-store-line">
              <div>
                <h4 className="text-sm sm:text-base font-black text-store-text flex items-center gap-2">
                  <Type className="w-4 h-4 text-store-primary" />
                  <span>تخصيص نصوص ورسائل المتجر الترويجية (Store Texts & Copywriting)</span>
                </h4>
                <p className="text-xs text-store-muted mt-0.5">
                  تحكم كامل في كل كلمة وعنوان وشرح في المتجر (بنرات العروض، شارات الثقة، دوائر الستوري، ونصوص السلة)
                </p>
              </div>
            </div>

            {/* Content Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {[
                { id: 'hero', label: 'بنرات العروض (Hero)', icon: Flame },
                { id: 'trust', label: 'شارات الثقة (4)', icon: ShieldCheck },
                { id: 'stories', label: 'دوائر القصص (6)', icon: Sparkles },
                { id: 'cart', label: 'السلة والتوصيل', icon: ShoppingBag },
                { id: 'announcement', label: 'شريط الإعلانات العلوي', icon: Megaphone },
              ].map(tab => {
                const active = textTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTextTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 transition-all cursor-pointer border flex items-center gap-1.5 ${
                      active
                        ? 'bg-store-primary !text-white border-store-primary shadow-xs'
                        : 'bg-store-card-subtle text-store-muted hover:text-store-text border-store-line'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab 1: Hero Carousel Texts */}
            {textTab === 'hero' && (
              <div className="space-y-3.5 bg-store-card-subtle/70 p-3.5 rounded-2xl border border-store-line">
                <div className="flex items-center justify-between pb-2 border-b border-store-line/60">
                  <span className="text-xs font-black text-store-text">اختيار شريحة البنر لتعديل نصوصها:</span>
                  <div className="inline-flex bg-white rounded-xl p-1 border border-store-line gap-1">
                    {[1, 2, 3].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setHeroSlideSubTab(num as any)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          heroSlideSubTab === num
                            ? 'bg-store-primary text-white shadow-2xs'
                            : 'text-store-muted hover:text-store-text'
                        }`}
                      >
                        شريحة {num}
                      </button>
                    ))}
                  </div>
                </div>

                {heroSlideSubTab === 1 && (
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <label className="block font-bold text-store-muted mb-1">الوسم الترويجي الصغير (Tag):</label>
                      <input
                        type="text"
                        value={themeCustom?.heroSlide1Tag ?? ''}
                        onChange={e => handleToggleFeature('heroSlide1Tag', e.target.value)}
                        placeholder="عروض وتخفيضات خاصة"
                        className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-store-muted mb-1">العنوان الرئيسي (Title):</label>
                        <input
                          type="text"
                          value={themeCustom?.heroSlide1Title ?? ''}
                          onChange={e => handleToggleFeature('heroSlide1Title', e.target.value)}
                          placeholder="تسوق أفضل منتجات"
                          className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-store-muted mb-1">الكلمة المميزة باللون الأصفر:</label>
                        <input
                          type="text"
                          value={themeCustom?.heroSlide1Highlight ?? ''}
                          onChange={e => handleToggleFeature('heroSlide1Highlight', e.target.value)}
                          placeholder={storeName || 'المتجر'}
                          className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold text-store-muted mb-1">الوصف الترويجي (Subtitle):</label>
                      <textarea
                        rows={2}
                        value={themeCustom?.heroSlide1Subtitle ?? ''}
                        onChange={e => handleToggleFeature('heroSlide1Subtitle', e.target.value)}
                        placeholder="خصومات حصرية على تشكيلة واسعة من الأصناف واحتياجات المنزل اليومية."
                        className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary resize-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-store-muted mb-1">نص زر الإجراء (CTA Button):</label>
                      <input
                        type="text"
                        value={themeCustom?.heroSlide1Cta ?? ''}
                        onChange={e => handleToggleFeature('heroSlide1Cta', e.target.value)}
                        placeholder="استكشف التخفيضات"
                        className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                      />
                    </div>
                  </div>
                )}

                {heroSlideSubTab === 2 && (
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <label className="block font-bold text-store-muted mb-1">الوسم الترويجي الصغير (Tag):</label>
                      <input
                        type="text"
                        value={themeCustom?.heroSlide2Tag ?? ''}
                        onChange={e => handleToggleFeature('heroSlide2Tag', e.target.value)}
                        placeholder="توصيل فوري لباب البيت"
                        className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-store-muted mb-1">العنوان الرئيسي (Title):</label>
                        <input
                          type="text"
                          value={themeCustom?.heroSlide2Title ?? ''}
                          onChange={e => handleToggleFeature('heroSlide2Title', e.target.value)}
                          placeholder="طلبك يوصلك أينما كنت"
                          className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-store-muted mb-1">الكلمة المميزة باللون الأصفر:</label>
                        <input
                          type="text"
                          value={themeCustom?.heroSlide2Highlight ?? ''}
                          onChange={e => handleToggleFeature('heroSlide2Highlight', e.target.value)}
                          placeholder="بسرعة وأمان تام"
                          className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold text-store-muted mb-1">الوصف الترويجي (Subtitle):</label>
                      <textarea
                        rows={2}
                        value={themeCustom?.heroSlide2Subtitle ?? ''}
                        onChange={e => handleToggleFeature('heroSlide2Subtitle', e.target.value)}
                        placeholder="فريق دليفري محترف لتسليم طلبك طازجاً مع دعم الدفع عند الاستلام أو إلكترونياً بإنستاباي ومحافظ الكاش."
                        className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary resize-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-store-muted mb-1">نص زر الإجراء (CTA Button):</label>
                      <input
                        type="text"
                        value={themeCustom?.heroSlide2Cta ?? ''}
                        onChange={e => handleToggleFeature('heroSlide2Cta', e.target.value)}
                        placeholder="ابدأ طلبك الآن"
                        className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                      />
                    </div>
                  </div>
                )}

                {heroSlideSubTab === 3 && (
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <label className="block font-bold text-store-muted mb-1">الوسم الترويجي الصغير (Tag):</label>
                      <input
                        type="text"
                        value={themeCustom?.heroSlide3Tag ?? ''}
                        onChange={e => handleToggleFeature('heroSlide3Tag', e.target.value)}
                        placeholder="ضمان الأسعار والجودة"
                        className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-store-muted mb-1">العنوان الرئيسي (Title):</label>
                        <input
                          type="text"
                          value={themeCustom?.heroSlide3Title ?? ''}
                          onChange={e => handleToggleFeature('heroSlide3Title', e.target.value)}
                          placeholder="أسعار الكاشير الرسمية"
                          className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-store-muted mb-1">الكلمة المميزة باللون الأصفر:</label>
                        <input
                          type="text"
                          value={themeCustom?.heroSlide3Highlight ?? ''}
                          onChange={e => handleToggleFeature('heroSlide3Highlight', e.target.value)}
                          placeholder="بدون أي زيادات خفية"
                          className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold text-store-muted mb-1">الوصف الترويجي (Subtitle):</label>
                      <textarea
                        rows={2}
                        value={themeCustom?.heroSlide3Subtitle ?? ''}
                        onChange={e => handleToggleFeature('heroSlide3Subtitle', e.target.value)}
                        placeholder="نظام رفيق يربط المتجر لحظياً بمخزن المحل لضمان توفر البضاعة ودقة الأسعار وجودة كل صنف."
                        className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary resize-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-store-muted mb-1">نص زر الإجراء (CTA Button):</label>
                      <input
                        type="text"
                        value={themeCustom?.heroSlide3Cta ?? ''}
                        onChange={e => handleToggleFeature('heroSlide3Cta', e.target.value)}
                        placeholder="تصفح كافة الأصناف"
                        className="w-full text-xs font-medium p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Trust Badges Texts */}
            {textTab === 'trust' && (
              <div className="space-y-3 bg-store-card-subtle/70 p-3.5 rounded-2xl border border-store-line">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Badge 1 */}
                  <div className="p-3 bg-white rounded-xl border border-store-line space-y-2">
                    <div className="font-bold text-store-text flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>الشارة 1 (التوصيل السريع):</span>
                    </div>
                    <input
                      type="text"
                      value={themeCustom?.trustBadge1Title ?? ''}
                      onChange={e => handleToggleFeature('trustBadge1Title', e.target.value)}
                      placeholder="توصيل فوري سريع"
                      className="w-full text-xs font-bold p-1.5 rounded-lg border border-store-line"
                    />
                    <input
                      type="text"
                      value={themeCustom?.trustBadge1Desc ?? ''}
                      onChange={e => handleToggleFeature('trustBadge1Desc', e.target.value)}
                      placeholder="من رف المحل لباب بيتك"
                      className="w-full text-xs p-1.5 rounded-lg border border-store-line text-store-muted"
                    />
                  </div>

                  {/* Badge 2 */}
                  <div className="p-3 bg-white rounded-xl border border-store-line space-y-2">
                    <div className="font-bold text-store-text flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-store-primary" />
                      <span>الشارة 2 (ضمان الأسعار):</span>
                    </div>
                    <input
                      type="text"
                      value={themeCustom?.trustBadge2Title ?? ''}
                      onChange={e => handleToggleFeature('trustBadge2Title', e.target.value)}
                      placeholder="أسعار الكاشير الرسمية"
                      className="w-full text-xs font-bold p-1.5 rounded-lg border border-store-line"
                    />
                    <input
                      type="text"
                      value={themeCustom?.trustBadge2Desc ?? ''}
                      onChange={e => handleToggleFeature('trustBadge2Desc', e.target.value)}
                      placeholder="نفس أسعار المحل بدون أي زيادة"
                      className="w-full text-xs p-1.5 rounded-lg border border-store-line text-store-muted"
                    />
                  </div>

                  {/* Badge 3 */}
                  <div className="p-3 bg-white rounded-xl border border-store-line space-y-2">
                    <div className="font-bold text-store-text flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                      <span>الشارة 3 (الدفع المرن):</span>
                    </div>
                    <input
                      type="text"
                      value={themeCustom?.trustBadge3Title ?? ''}
                      onChange={e => handleToggleFeature('trustBadge3Title', e.target.value)}
                      placeholder="دفع مرن وسهل"
                      className="w-full text-xs font-bold p-1.5 rounded-lg border border-store-line"
                    />
                    <input
                      type="text"
                      value={themeCustom?.trustBadge3Desc ?? ''}
                      onChange={e => handleToggleFeature('trustBadge3Desc', e.target.value)}
                      placeholder="كاش عند الاستلام أو إنستاباي ومحافظ"
                      className="w-full text-xs p-1.5 rounded-lg border border-store-line text-store-muted"
                    />
                  </div>

                  {/* Badge 4 */}
                  <div className="p-3 bg-white rounded-xl border border-store-line space-y-2">
                    <div className="font-bold text-store-text flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                      <span>الشارة 4 (المعاينة عند الاستلام):</span>
                    </div>
                    <input
                      type="text"
                      value={themeCustom?.trustBadge4Title ?? ''}
                      onChange={e => handleToggleFeature('trustBadge4Title', e.target.value)}
                      placeholder="معاينة عند الاستلام"
                      className="w-full text-xs font-bold p-1.5 rounded-lg border border-store-line"
                    />
                    <input
                      type="text"
                      value={themeCustom?.trustBadge4Desc ?? ''}
                      onChange={e => handleToggleFeature('trustBadge4Desc', e.target.value)}
                      placeholder="حق مراجعة طلبك قبل الاستلام"
                      className="w-full text-xs p-1.5 rounded-lg border border-store-line text-store-muted"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Stories Bar Texts & Individual Toggles */}
            {textTab === 'stories' && (
              <div className="space-y-3 bg-store-card-subtle/70 p-3.5 rounded-2xl border border-store-line text-xs">
                <div className="p-2.5 bg-blue-50/70 border border-blue-200/60 rounded-xl text-[11px] text-blue-900 font-medium">
                  يمكنك تفعيل أو إيقاف أي دائرة قصة بشكل منفرد بمفتاح التشغيل، وتعديل عنوانها وشارتها لتناسب نشاط محلك:
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {/* Story 1: Deals */}
                  <div
                    className={`p-3 rounded-2xl border transition-all ${
                      themeCustom?.showStoryDeals !== false
                        ? 'bg-white border-store-line shadow-2xs'
                        : 'bg-slate-100/70 border-dashed border-slate-300 opacity-65'
                    } space-y-2`}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-store-line/60">
                      <div className="flex items-center gap-1.5 font-bold text-store-text">
                        <Flame className="w-3.5 h-3.5 text-rose-500" />
                        <span>قصة 1 (العروض)</span>
                      </div>
                      <ToggleSwitch
                        checked={themeCustom?.showStoryDeals !== false}
                        onChange={v => handleToggleFeature('showStoryDeals', v)}
                        size="sm"
                      />
                    </div>
                    {themeCustom?.showStoryDeals !== false ? (
                      <>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">العنوان:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyDealsTitle ?? ''}
                            onChange={e => handleToggleFeature('storyDealsTitle', e.target.value)}
                            placeholder="عروض حصرية"
                            className="w-full p-1.5 rounded-lg border border-store-line text-xs font-bold bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">الشارة المصغرة:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyDealsBadge ?? ''}
                            onChange={e => handleToggleFeature('storyDealsBadge', e.target.value)}
                            placeholder="خصومات"
                            className="w-full p-1 rounded-lg border border-store-line text-[11px] text-store-muted bg-white"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-500 font-medium py-2 text-center">
                        هذه القصة معطلة حالياً ولن تظهر في المتجر
                      </div>
                    )}
                  </div>

                  {/* Story 2: Best Sellers */}
                  <div
                    className={`p-3 rounded-2xl border transition-all ${
                      themeCustom?.showStoryBestSellers !== false
                        ? 'bg-white border-store-line shadow-2xs'
                        : 'bg-slate-100/70 border-dashed border-slate-300 opacity-65'
                    } space-y-2`}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-store-line/60">
                      <div className="flex items-center gap-1.5 font-bold text-store-text">
                        <Award className="w-3.5 h-3.5 text-indigo-500" />
                        <span>قصة 2 (الأكثر طلباً)</span>
                      </div>
                      <ToggleSwitch
                        checked={themeCustom?.showStoryBestSellers !== false}
                        onChange={v => handleToggleFeature('showStoryBestSellers', v)}
                        size="sm"
                      />
                    </div>
                    {themeCustom?.showStoryBestSellers !== false ? (
                      <>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">العنوان:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyBestSellersTitle ?? ''}
                            onChange={e => handleToggleFeature('storyBestSellersTitle', e.target.value)}
                            placeholder="الأكثر طلباً"
                            className="w-full p-1.5 rounded-lg border border-store-line text-xs font-bold bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">الشارة المصغرة:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyBestSellersBadge ?? ''}
                            onChange={e => handleToggleFeature('storyBestSellersBadge', e.target.value)}
                            placeholder="رائج"
                            className="w-full p-1 rounded-lg border border-store-line text-[11px] text-store-muted bg-white"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-500 font-medium py-2 text-center">
                        هذه القصة معطلة حالياً ولن تظهر في المتجر
                      </div>
                    )}
                  </div>

                  {/* Story 3: New Arrivals */}
                  <div
                    className={`p-3 rounded-2xl border transition-all ${
                      themeCustom?.showStoryNewArrivals !== false
                        ? 'bg-white border-store-line shadow-2xs'
                        : 'bg-slate-100/70 border-dashed border-slate-300 opacity-65'
                    } space-y-2`}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-store-line/60">
                      <div className="flex items-center gap-1.5 font-bold text-store-text">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        <span>قصة 3 (وصل حديثاً)</span>
                      </div>
                      <ToggleSwitch
                        checked={themeCustom?.showStoryNewArrivals !== false}
                        onChange={v => handleToggleFeature('showStoryNewArrivals', v)}
                        size="sm"
                      />
                    </div>
                    {themeCustom?.showStoryNewArrivals !== false ? (
                      <>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">العنوان:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyNewArrivalsTitle ?? ''}
                            onChange={e => handleToggleFeature('storyNewArrivalsTitle', e.target.value)}
                            placeholder="وصل حديثاً"
                            className="w-full p-1.5 rounded-lg border border-store-line text-xs font-bold bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">الشارة المصغرة:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyNewArrivalsBadge ?? ''}
                            onChange={e => handleToggleFeature('storyNewArrivalsBadge', e.target.value)}
                            placeholder="جديد"
                            className="w-full p-1 rounded-lg border border-store-line text-[11px] text-store-muted bg-white"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-500 font-medium py-2 text-center">
                        هذه القصة معطلة حالياً ولن تظهر في المتجر
                      </div>
                    )}
                  </div>

                  {/* Story 4: Free Delivery */}
                  <div
                    className={`p-3 rounded-2xl border transition-all ${
                      themeCustom?.showStoryFreeDelivery !== false
                        ? 'bg-white border-store-line shadow-2xs'
                        : 'bg-slate-100/70 border-dashed border-slate-300 opacity-65'
                    } space-y-2`}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-store-line/60">
                      <div className="flex items-center gap-1.5 font-bold text-store-text">
                        <Truck className="w-3.5 h-3.5 text-cyan-500" />
                        <span>قصة 4 (شحن مجاني)</span>
                      </div>
                      <ToggleSwitch
                        checked={themeCustom?.showStoryFreeDelivery !== false}
                        onChange={v => handleToggleFeature('showStoryFreeDelivery', v)}
                        size="sm"
                      />
                    </div>
                    {themeCustom?.showStoryFreeDelivery !== false ? (
                      <>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">العنوان:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyFreeDeliveryTitle ?? ''}
                            onChange={e => handleToggleFeature('storyFreeDeliveryTitle', e.target.value)}
                            placeholder="شحن مجاني"
                            className="w-full p-1.5 rounded-lg border border-store-line text-xs font-bold bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">الشارة المصغرة:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyFreeDeliveryBadge ?? ''}
                            onChange={e => handleToggleFeature('storyFreeDeliveryBadge', e.target.value)}
                            placeholder="توفير"
                            className="w-full p-1 rounded-lg border border-store-line text-[11px] text-store-muted bg-white"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-500 font-medium py-2 text-center">
                        هذه القصة معطلة حالياً ولن تظهر في المتجر
                      </div>
                    )}
                  </div>

                  {/* Story 5: Combos */}
                  <div
                    className={`p-3 rounded-2xl border transition-all ${
                      themeCustom?.showStoryCombos !== false
                        ? 'bg-white border-store-line shadow-2xs'
                        : 'bg-slate-100/70 border-dashed border-slate-300 opacity-65'
                    } space-y-2`}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-store-line/60">
                      <div className="flex items-center gap-1.5 font-bold text-store-text">
                        <Percent className="w-3.5 h-3.5 text-pink-500" />
                        <span>قصة 5 (توفير العائلة)</span>
                      </div>
                      <ToggleSwitch
                        checked={themeCustom?.showStoryCombos !== false}
                        onChange={v => handleToggleFeature('showStoryCombos', v)}
                        size="sm"
                      />
                    </div>
                    {themeCustom?.showStoryCombos !== false ? (
                      <>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">العنوان:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyCombosTitle ?? ''}
                            onChange={e => handleToggleFeature('storyCombosTitle', e.target.value)}
                            placeholder="توفير العائلة"
                            className="w-full p-1.5 rounded-lg border border-store-line text-xs font-bold bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">الشارة المصغرة:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyCombosBadge ?? ''}
                            onChange={e => handleToggleFeature('storyCombosBadge', e.target.value)}
                            placeholder="حزم توفير"
                            className="w-full p-1 rounded-lg border border-store-line text-[11px] text-store-muted bg-white"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-500 font-medium py-2 text-center">
                        هذه القصة معطلة حالياً ولن تظهر في المتجر
                      </div>
                    )}
                  </div>

                  {/* Story 6: All Items */}
                  <div
                    className={`p-3 rounded-2xl border transition-all ${
                      themeCustom?.showStoryAll !== false
                        ? 'bg-white border-store-line shadow-2xs'
                        : 'bg-slate-100/70 border-dashed border-slate-300 opacity-65'
                    } space-y-2`}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-store-line/60">
                      <div className="flex items-center gap-1.5 font-bold text-store-text">
                        <LayoutGrid className="w-3.5 h-3.5 text-slate-700" />
                        <span>قصة 6 (كافة الأصناف)</span>
                      </div>
                      <ToggleSwitch
                        checked={themeCustom?.showStoryAll !== false}
                        onChange={v => handleToggleFeature('showStoryAll', v)}
                        size="sm"
                      />
                    </div>
                    {themeCustom?.showStoryAll !== false ? (
                      <>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">العنوان:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyAllTitle ?? ''}
                            onChange={e => handleToggleFeature('storyAllTitle', e.target.value)}
                            placeholder="كافة الأصناف"
                            className="w-full p-1.5 rounded-lg border border-store-line text-xs font-bold bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-store-muted mb-0.5 font-medium">الشارة المصغرة:</label>
                          <input
                            type="text"
                            value={themeCustom?.storyAllBadge ?? ''}
                            onChange={e => handleToggleFeature('storyAllBadge', e.target.value)}
                            placeholder="الكل"
                            className="w-full p-1 rounded-lg border border-store-line text-[11px] text-store-muted bg-white"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] text-slate-500 font-medium py-2 text-center">
                        هذه القصة معطلة حالياً ولن تظهر في المتجر
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 4: Cart Texts & Cross-Sell Source Control */}
            {textTab === 'cart' && (
              <div className="space-y-3.5 bg-store-card-subtle/70 p-3.5 rounded-2xl border border-store-line text-xs">
                {/* Cross-Sell Source Selector */}
                <div className="p-3 bg-white rounded-xl border border-store-line space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-store-line/60">
                    <div>
                      <span className="font-black text-store-text text-xs">مصدر أصناف اقتراحات السلة (Cross-Sell Source)</span>
                      <p className="text-[11px] text-store-muted">اختر كيف يحدد النظام الأصناف التي تُقترح للعميل داخل سلة الشراء</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleToggleFeature('crossSellSource', 'featured')}
                      className={`p-2.5 rounded-xl border text-right cursor-pointer transition-all ${
                        (themeCustom?.crossSellSource || 'featured') === 'featured'
                          ? 'border-2 border-store-primary bg-store-primary-light/40 shadow-xs'
                          : 'border-store-line bg-slate-50 hover:bg-slate-100 text-store-muted'
                      }`}
                    >
                      <div className="font-bold text-xs text-store-text flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>الأصناف المميزة بنجمة (مُوصى به)</span>
                      </div>
                      <p className="text-[10px] text-store-muted mt-1 leading-relaxed">
                        يقترح فقط الأصناف التي حددتها كـ "صنف مميز" في شاشة إدارة الأصناف بنقرة زر على النجمة.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleFeature('crossSellSource', 'all')}
                      className={`p-2.5 rounded-xl border text-right cursor-pointer transition-all ${
                        themeCustom?.crossSellSource === 'all'
                          ? 'border-2 border-store-primary bg-store-primary-light/40 shadow-xs'
                          : 'border-store-line bg-slate-50 hover:bg-slate-100 text-store-muted'
                      }`}
                    >
                      <div className="font-bold text-xs text-store-text flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-store-primary" />
                        <span>تلقائي من كافة أصناف المحل</span>
                      </div>
                      <p className="text-[10px] text-store-muted mt-1 leading-relaxed">
                        يقترح أصنافاً متوفرة بالمخزن تلقائياً دون الحاجة لتحديدها مسبقاً.
                      </p>
                    </button>
                  </div>

                  <div className="p-2.5 bg-amber-50/80 border border-amber-200/60 rounded-xl text-[10px] text-amber-900 leading-relaxed flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>تلميح تحسين المبيعات:</strong> عند اختيار "الأصناف المميزة"، كل ما عليك هو فتح تبويب "إدارة الأصناف والمنتجات" والضغط على أيقونة النجمة بجوار أي صنف (كالمشروبات أو الحلويات) ليظهر فوراً كاقتراح شراء للزبائن في السلة!
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-store-muted mb-1">
                    عنوان قسم اقتراحات زيادة السلة (Cross-Sell Title):
                  </label>
                  <input
                    type="text"
                    value={themeCustom?.cartCrossSellTitle ?? ''}
                    onChange={e => handleToggleFeature('cartCrossSellTitle', e.target.value)}
                    placeholder="يكتمل طلبك بهذه الأصناف:"
                    className="w-full text-xs font-bold p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                  />
                </div>
                <div>
                  <label className="block font-bold text-store-muted mb-1">
                    رسالة تحقيق التوصيل المجاني بالسلة:
                  </label>
                  <input
                    type="text"
                    value={themeCustom?.freeShippingUnlockedText ?? ''}
                    onChange={e => handleToggleFeature('freeShippingUnlockedText', e.target.value)}
                    placeholder="مبروك! حصلت على توصيل مجاني لطلبك"
                    className="w-full text-xs font-bold p-2 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                  />
                </div>
              </div>
            )}

            {/* Tab 5: Top Announcement Ticker */}
            {textTab === 'announcement' && (
              <div className="space-y-3 bg-store-card-subtle/70 p-3.5 rounded-2xl border border-store-line text-xs">
                <div>
                  <label className="block font-bold text-store-muted mb-1">
                    نص الشريط الإعلاني الترويجي أعلى الصفحة (Announcement Bar):
                  </label>
                  <input
                    type="text"
                    value={themeCustom?.announcementText ?? ''}
                    onChange={e => handleToggleFeature('announcementText', e.target.value)}
                    placeholder={store.welcome_message || 'توصيل مجاني للطلبات فوق 250 ج.م | أسعار رسمية بضمان الكاشير'}
                    className="w-full text-xs font-bold p-2.5 rounded-xl border border-store-line bg-white focus:outline-none focus:ring-2 focus:ring-store-primary"
                  />
                  <p className="text-[10px] text-store-muted mt-1">
                    يظهر كشريط مميز أعلى رأس المتجر يلفت انتباه الزائر فور دخوله (اتركه فارغاً للاعتماد على رسالة الترحيب العامة).
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 3. Curated Color Themes Library */}
          <div className="bg-store-card rounded-3xl border border-store-line p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-store-line">
              <div>
                <h4 className="text-sm sm:text-base font-black text-store-text flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-store-primary" />
                  <span>مكتبة السمات اللونية المعتمدة ({Object.keys(THEME_PRESETS_CONFIG).length} سمة احترافية)</span>
                </h4>
                <p className="text-xs text-store-muted mt-0.5">
                  كل سمة مصممة بتباين مدروس يضمن وضوح الأسعار والأزرار في جميع الإضاءات
                </p>
              </div>
            </div>

            {/* Industry Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {THEME_INDUSTRY_FILTERS.map(f => {
                const active = industryFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setIndustryFilter(f.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 transition-all cursor-pointer border ${
                      active
                        ? 'bg-store-primary !text-white border-store-primary shadow-xs'
                        : 'bg-store-card-subtle text-store-muted hover:text-store-text border-store-line'
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            {/* Theme Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredPresets.map(preset => {
                const isSelected = activeTheme.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSelectPreset(preset.id)}
                    className={`group p-3.5 rounded-2xl border cursor-pointer transition-all btn-spring text-right space-y-2.5 relative ${
                      isSelected
                        ? 'border-2 border-store-primary bg-store-primary-light/35 shadow-md'
                        : 'border border-store-line hover:border-store-primary/60 bg-store-card hover:bg-store-card-subtle'
                    }`}
                  >
                    {/* Status Badge */}
                    {isSelected ? (
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-store-primary !text-white flex items-center gap-1 shadow-xs">
                        <Check className="w-3 h-3 !text-white stroke-[3]" />
                        <span className="!text-white">مُفعّلة</span>
                      </div>
                    ) : preset.id === 'rafiq-official' ? (
                      <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#00372D] text-[#CED46A] shadow-xs">
                        الهوية الرسمية
                      </div>
                    ) : null}

                    {/* 4-Color Swatch Strip */}
                    <div className="h-8 rounded-xl overflow-hidden flex shadow-2xs border border-black/10">
                      {preset.swatches.map((color, idx) => (
                        <div
                          key={idx}
                          className="h-full flex-1 transition-transform duration-300 group-hover:scale-105"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>

                    <div className="space-y-0.5">
                      <div className="font-black text-xs text-store-text group-hover:text-store-primary transition-colors">
                        {preset.name}
                      </div>
                      <div className="text-[11px] text-store-muted font-medium line-clamp-1">
                        {preset.category}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* LEFT COLUMN (RTL): Sticky Live Interactive Sandbox with Mobile / Desktop Toggle */}
        <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
          {/* Device Toggle & Active Theme Summary */}
          <div className="bg-store-card rounded-3xl border border-store-line p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs border border-white/20 flex-shrink-0"
                  style={{ background: activeTheme.gradient }}
                >
                  <Palette className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-store-text truncate">{activeTheme.name}</div>
                  <div className="text-[10px] text-store-muted truncate">
                    {STORE_LAYOUT_TEMPLATES.find(t => t.id === activeLayout)?.name} • {activeCorner.name}
                  </div>
                </div>
              </div>

              {/* Mobile / Desktop Preview Switcher */}
              <div className="inline-flex items-center bg-store-card-subtle border border-store-line p-1 rounded-xl flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    previewDevice === 'mobile'
                      ? 'bg-store-primary !text-white shadow-2xs'
                      : 'text-store-muted hover:text-store-text'
                  }`}
                  title="معاينة الموبايل"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>موبايل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    previewDevice === 'desktop'
                      ? 'bg-store-primary !text-white shadow-2xs'
                      : 'text-store-muted hover:text-store-text'
                  }`}
                  title="معاينة الديسكتوب"
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>كمبيوتر</span>
                </button>
              </div>
            </div>

            {/* Live Sandbox Frame */}
            <div className="flex justify-center pt-1">
              <div
                className={`w-full transition-all duration-300 border shadow-xl overflow-hidden ${
                  previewDevice === 'mobile' ? 'max-w-[320px] rounded-[28px]' : 'rounded-2xl'
                }`}
                style={{
                  borderColor: activeTheme.line,
                  backgroundColor: activeTheme.bg,
                }}
              >
                {/* Browser / Phone Top Chrome */}
                <div
                  className="px-3 py-2 border-b flex items-center justify-between gap-2 text-[10px]"
                  style={{
                    backgroundColor: activeTheme.cardSubtle,
                    borderColor: activeTheme.line,
                    color: activeTheme.muted,
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </div>
                  <div
                    dir="ltr"
                    className="px-2.5 py-0.5 rounded-md border text-[9px] font-mono truncate max-w-[190px]"
                    style={{
                      backgroundColor: activeTheme.cardBg,
                      borderColor: activeTheme.line,
                      color: activeTheme.text,
                    }}
                  >
                    {previewUrl}
                  </div>
                </div>

                {/* Mini Store Header */}
                <div
                  className="px-3 py-2.5 border-b flex items-center justify-between gap-2"
                  style={{
                    backgroundColor: activeTheme.cardBg,
                    borderColor: activeTheme.line,
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-7 h-7 bg-white border border-[#DCE1DC] flex items-center justify-center shadow-2xs overflow-hidden p-0.5 flex-shrink-0"
                      style={{
                        borderRadius: activeCorner.btnRadius,
                      }}
                    >
                      <img
                        src={store.logo_url || '/rafiq_logo.png'}
                        alt={storeName}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = '/rafiq_logo.png';
                        }}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-black truncate" style={{ color: activeTheme.text }}>
                        {storeName}
                      </div>
                      <div className="text-[9px] flex items-center gap-1 font-bold" style={{ color: activeTheme.secondary }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeTheme.secondary }} />
                        <span>مفتوح الآن</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-black shadow-2xs flex-shrink-0"
                    style={{
                      background: activeTheme.gradient,
                      color: activeTheme.primaryContrast,
                      borderRadius: activeCorner.btnRadius,
                    }}
                  >
                    <ShoppingBag className="w-3 h-3" />
                    <span>السلة (2)</span>
                  </div>
                </div>

                {/* Mini Announcement Ticker (Reactive Preview) */}
                {(themeCustom?.announcementText || store.welcome_message) && (
                  <div
                    className="py-1 px-2 text-[8px] font-bold text-center truncate flex items-center justify-center gap-1"
                    style={{
                      background: activeTheme.gradient,
                      color: activeTheme.primaryContrast,
                    }}
                  >
                    <Megaphone className="w-2.5 h-2.5 flex-shrink-0" />
                    <span className="truncate">{themeCustom?.announcementText || store.welcome_message}</span>
                  </div>
                )}

                {/* Mini Stories Bar (Reactive Preview) */}
                {themeCustom?.showStoriesBar !== false && (() => {
                  const previewStories = [
                    { show: themeCustom?.showStoryDeals !== false, title: themeCustom?.storyDealsTitle || 'عروض حصرية' },
                    { show: themeCustom?.showStoryBestSellers !== false, title: themeCustom?.storyBestSellersTitle || 'الأكثر طلباً' },
                    { show: themeCustom?.showStoryNewArrivals !== false, title: themeCustom?.storyNewArrivalsTitle || 'وصل حديثاً' },
                    { show: themeCustom?.showStoryFreeDelivery !== false, title: themeCustom?.storyFreeDeliveryTitle || 'شحن مجاني' },
                    { show: themeCustom?.showStoryCombos !== false, title: themeCustom?.storyCombosTitle || 'توفير' },
                    { show: themeCustom?.showStoryAll !== false, title: themeCustom?.storyAllTitle || 'الكل' },
                  ].filter(s => s.show);

                  if (previewStories.length === 0) return null;

                  return (
                    <div className="px-2.5 pt-2 flex items-center gap-1.5 overflow-hidden">
                      {previewStories.slice(0, 4).map((story, sIdx) => (
                        <div
                          key={sIdx}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold border flex-shrink-0"
                          style={{
                            borderColor: activeTheme.line,
                            backgroundColor: activeTheme.cardBg,
                            color: activeTheme.text,
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeTheme.primary }} />
                          <span>{story.title}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Mini Hero Strip (Reactive Preview) */}
                {themeCustom?.showPromoHero !== false && (
                  <div className="p-2.5 pb-0">
                    <div
                      className="p-3 text-white flex items-center justify-between gap-2"
                      style={{
                        background: activeTheme.gradient,
                        borderRadius: activeCorner.cardRadius,
                      }}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <span
                          className="inline-block text-[8px] font-black px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: activeTheme.accent,
                            color: activeTheme.accentContrast,
                          }}
                        >
                          {themeCustom?.heroSlide1Tag || 'عروض اليوم'}
                        </span>
                        <div className="text-[11px] font-black truncate">
                          {themeCustom?.heroSlide1Title || storeName}
                        </div>
                        <div className="text-[9px] text-white/80 truncate">
                          {themeCustom?.heroSlide1Subtitle || 'توصيل سريع بأسعار المحل الرسمية'}
                        </div>
                      </div>
                      <div
                        className="px-2 py-1 text-[9px] font-black flex-shrink-0"
                        style={{
                          backgroundColor: activeTheme.accent,
                          color: activeTheme.accentContrast,
                          borderRadius: activeCorner.btnRadius,
                        }}
                      >
                        {themeCustom?.heroSlide1Cta || 'تسوّق الآن'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Mini Trust Strip (Reactive Preview) */}
                {themeCustom?.showTrustBadges !== false && (
                  <div
                    className="mx-2.5 mt-2 px-2 py-1 rounded-xl flex items-center justify-between text-[7px] border"
                    style={{
                      borderColor: activeTheme.line,
                      backgroundColor: activeTheme.cardSubtle,
                      color: activeTheme.muted,
                    }}
                  >
                    <span className="flex items-center gap-0.5 font-bold truncate">
                      <ShieldCheck className="w-2.5 h-2.5 text-emerald-600 flex-shrink-0" />
                      <span className="truncate">{themeCustom?.trustBadge2Title || 'أسعار رسمية'}</span>
                    </span>
                    <span className="flex items-center gap-0.5 font-bold truncate">
                      <Truck className="w-2.5 h-2.5 flex-shrink-0" style={{ color: activeTheme.primary }} />
                      <span className="truncate">{themeCustom?.trustBadge1Title || 'توصيل سريع'}</span>
                    </span>
                    <span className="flex items-center gap-0.5 font-bold truncate">
                      <CheckCircle2 className="w-2.5 h-2.5 text-amber-500 flex-shrink-0" />
                      <span className="truncate">{themeCustom?.trustBadge4Title || 'معاينة الاستلام'}</span>
                    </span>
                  </div>
                )}

                {/* Mini Product Grid Reflecting Active Template & Corner Style */}
                <div className={`p-2.5 grid gap-2 ${previewGridCols}`}>
                  {[
                    { name: 'أرز مصري فاخر 1 كجم', price: '35.00', tag: '-15%', savings: 5, isAccent: false, isLowStock: false },
                    { name: 'زيت عباد الشمس 800 مل', price: '75.00', tag: 'مميز', isAccent: true, isLowStock: true },
                    ...(previewDevice === 'desktop' && activeLayout === 'compact'
                      ? [{ name: 'جبنة فيتا 500 جم', price: '42.00', tag: 'طازج', isAccent: false, isLowStock: false }]
                      : []),
                  ].map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2 border shadow-2xs flex flex-col justify-between gap-1.5"
                      style={{
                        backgroundColor: activeTheme.cardBg,
                        borderColor: activeTheme.line,
                        ...cardRadiusStyle,
                      }}
                    >
                      <div
                        className={`relative flex items-center justify-center border ${
                          activeLayout === 'boutique' ? 'h-20' : activeLayout === 'compact' ? 'h-12' : 'h-14'
                        }`}
                        style={{
                          backgroundColor: activeTheme.cardSubtle,
                          borderColor: activeTheme.line,
                          borderRadius: activeCorner.btnRadius,
                        }}
                      >
                        <Package className="w-5 h-5 opacity-45" style={{ color: activeTheme.primary }} />
                        <span
                          className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-black"
                          style={{
                            backgroundColor: item.isAccent ? activeTheme.accent : activeTheme.secondary,
                            color: item.isAccent ? activeTheme.accentContrast : activeTheme.secondaryContrast,
                          }}
                        >
                          {themeCustom?.showSavingsBadge !== false && item.savings ? `وفر ${item.savings} ج.م` : item.tag}
                        </span>

                        {themeCustom?.showLowStockBadge !== false && item.isLowStock && (
                          <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-amber-500 text-white text-[7px] font-bold">
                            متبقي 3 فقط
                          </span>
                        )}

                        {themeCustom?.showWishlist !== false && (
                          <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white/90 flex items-center justify-center text-rose-500 shadow-2xs">
                            <Heart className="w-2.5 h-2.5 fill-current" />
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="text-[10px] font-bold truncate" style={{ color: activeTheme.text }}>
                          {item.name}
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] font-black font-mono" style={{ color: activeTheme.primary }}>
                            {item.price} ج.م
                          </span>
                          <div
                            className="w-5 h-5 flex items-center justify-center shadow-2xs"
                            style={{
                              backgroundColor: activeTheme.primary,
                              color: activeTheme.primaryContrast,
                              ...btnRadiusStyle,
                            }}
                          >
                            <Plus className="w-3 h-3" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mini Branded Footer */}
                <div
                  className="px-3 py-2 border-t text-center text-[9px]"
                  style={{
                    backgroundColor: activeTheme.footerBg,
                    color: activeTheme.footerText,
                    borderColor: activeTheme.footerLine,
                  }}
                >
                  <div className="font-bold truncate">{storeName} • مشغّل بواسطة رفيق</div>
                </div>
              </div>
            </div>

            {/* Active Palette Tokens Readout */}
            <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-store-line">
              {[
                { label: 'الأساسي', hex: activeTheme.primary },
                { label: 'الثانوي', hex: activeTheme.secondary },
                { label: 'اللمسة', hex: activeTheme.accent },
                { label: 'الخلفية', hex: activeTheme.bg },
                { label: 'البطاقات', hex: activeTheme.cardBg },
                { label: 'الفوتر', hex: activeTheme.footerBg },
              ].map((sw, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 p-1.5 rounded-xl bg-store-card-subtle border border-store-line"
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/15 flex-shrink-0"
                    style={{ backgroundColor: sw.hex }}
                  />
                  <div className="min-w-0">
                    <div className="text-[9px] text-store-muted truncate">{sw.label}</div>
                    <div className="font-mono text-[9px] font-bold text-store-text" dir="ltr">
                      {sw.hex}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
