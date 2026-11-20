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
} from 'lucide-react';

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

  const handleResetToOfficial = () => {
    onSelectPreset('rafiq-official');
    onChangeThemeCustom({
      layoutTemplate: 'classic',
      cornerStyle: 'rounded',
    });
  };

  const previewUrl = `rafiq-store-web.rafiq-store-api.workers.dev/${store.slug || 'rafiq'}`;
  const cardRadiusStyle = { borderRadius: activeCorner.cardRadius };
  const btnRadiusStyle = { borderRadius: activeCorner.btnRadius };

  const previewGridCols =
    previewDevice === 'mobile'
      ? activeLayout === 'boutique'
        ? 'grid-cols-1'
        : 'grid-cols-2'
      : activeLayout === 'compact'
      ? 'grid-cols-3'
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

          {/* 2. Curated Color Themes Library */}
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

                {/* Mini Hero Strip */}
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
                        عروض اليوم
                      </span>
                      <div className="text-[11px] font-black truncate">{storeName}</div>
                      <div className="text-[9px] text-white/80 truncate">توصيل سريع بأسعار المحل الرسمية</div>
                    </div>
                    <div
                      className="px-2 py-1 text-[9px] font-black flex-shrink-0"
                      style={{
                        backgroundColor: activeTheme.accent,
                        color: activeTheme.accentContrast,
                        borderRadius: activeCorner.btnRadius,
                      }}
                    >
                      تسوّق الآن
                    </div>
                  </div>
                </div>

                {/* Mini Product Grid Reflecting Active Template & Corner Style */}
                <div className={`p-2.5 grid gap-2 ${previewGridCols}`}>
                  {[
                    { name: 'أرز مصري فاخر 1 كجم', price: '35.00', tag: '-15%', isAccent: false },
                    { name: 'زيت عباد الشمس 800 مل', price: '75.00', tag: 'مميز', isAccent: true },
                    ...(previewDevice === 'desktop' && activeLayout === 'compact'
                      ? [{ name: 'جبنة فيتا 500 جم', price: '42.00', tag: 'طازج', isAccent: false }]
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
                          {item.tag}
                        </span>
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
