import React, { useEffect } from 'react';

export type ThemeIndustryGroup =
  | 'official'
  | 'grocery'
  | 'medical'
  | 'food'
  | 'boutique'
  | 'luxury'
  | 'tech';

export type StoreLayoutTemplate = 'classic' | 'compact' | 'boutique';
export type StoreCornerStyle = 'rounded' | 'sharp' | 'soft';

export interface StoreThemeCustom {
  layoutTemplate?: StoreLayoutTemplate;
  cornerStyle?: StoreCornerStyle;

  // CRO Marketing Toggles
  showStoriesBar?: boolean;
  showPromoHero?: boolean;
  showTrustBadges?: boolean;
  showFreeShippingBar?: boolean;
  freeShippingThresholdEgp?: number;
  showCartCrossSell?: boolean;
  showWhatsAppQuickOrder?: boolean;
  showWishlist?: boolean;
  showSavingsBadge?: boolean;
  showLowStockBadge?: boolean;

  // Custom Marketing Texts & Announcements
  announcementText?: string;

  // Hero Carousel Texts (Slide 1)
  heroSlide1Tag?: string;
  heroSlide1Title?: string;
  heroSlide1Highlight?: string;
  heroSlide1Subtitle?: string;
  heroSlide1Cta?: string;

  // Hero Carousel Texts (Slide 2)
  heroSlide2Tag?: string;
  heroSlide2Title?: string;
  heroSlide2Highlight?: string;
  heroSlide2Subtitle?: string;
  heroSlide2Cta?: string;

  // Hero Carousel Texts (Slide 3)
  heroSlide3Tag?: string;
  heroSlide3Title?: string;
  heroSlide3Highlight?: string;
  heroSlide3Subtitle?: string;
  heroSlide3Cta?: string;

  // Trust Badges Texts (Badges 1-4)
  trustBadge1Title?: string;
  trustBadge1Desc?: string;
  trustBadge2Title?: string;
  trustBadge2Desc?: string;
  trustBadge3Title?: string;
  trustBadge3Desc?: string;
  trustBadge4Title?: string;
  trustBadge4Desc?: string;

  // Stories Bar Texts (Stories 1-6)
  storyDealsTitle?: string;
  storyDealsBadge?: string;
  storyBestSellersTitle?: string;
  storyBestSellersBadge?: string;
  storyNewArrivalsTitle?: string;
  storyNewArrivalsBadge?: string;
  storyFreeDeliveryTitle?: string;
  storyFreeDeliveryBadge?: string;
  storyCombosTitle?: string;
  storyCombosBadge?: string;
  storyAllTitle?: string;
  storyAllBadge?: string;

  // Cart Texts
  cartCrossSellTitle?: string;
  freeShippingUnlockedText?: string;

  [cssVar: string]: any;
}

export interface LayoutTemplateOption {
  id: StoreLayoutTemplate;
  name: string;
  badge: string;
  description: string;
  bestFor: string;
}

export interface CornerStyleOption {
  id: StoreCornerStyle;
  name: string;
  cardRadius: string;
  btnRadius: string;
}

export const STORE_LAYOUT_TEMPLATES: LayoutTemplateOption[] = [
  {
    id: 'classic',
    name: 'القالب الكلاسيكي المتوازن',
    badge: 'الأكثر استخداماً',
    description: 'شبكة عرض متوازنة 3 أعمدة مع شريط أقسام جانبي واضح وبطاقات غنية بالتفاصيل.',
    bestFor: 'السوبرماركت والبقالة ومحلات التجزئة',
  },
  {
    id: 'compact',
    name: 'القالب السريع الكثيف',
    badge: 'طلب فوري',
    description: 'شبكة عرض سريعة 4 أعمدة تعرض أكبر عدد من الأصناف لطلب فوري بدون تمرير طويل.',
    bestFor: 'الهايبرماركت والصيدليات والمنظفات',
  },
  {
    id: 'boutique',
    name: 'قالب البوتيك الفاخر',
    badge: 'عرض راقي',
    description: 'بطاقات أوسع بمساحات تنفس أنيقة تبرز صور المنتجات والخصومات بلمسة عصرية.',
    bestFor: 'العطور والمحامص والحلويات والأزياء',
  },
];

export const STORE_CORNER_STYLES: CornerStyleOption[] = [
  { id: 'rounded', name: 'ناعم عصري', cardRadius: '24px', btnRadius: '14px' },
  { id: 'sharp', name: 'هندسي حاد', cardRadius: '10px', btnRadius: '8px' },
  { id: 'soft', name: 'انسيابي فخم', cardRadius: '30px', btnRadius: '20px' },
];

export const THEME_INDUSTRY_FILTERS: Array<{ id: 'all' | ThemeIndustryGroup; label: string }> = [
  { id: 'all', label: 'كل السمات' },
  { id: 'official', label: 'رفيق الرسمي' },
  { id: 'grocery', label: 'سوبرماركت وطازج' },
  { id: 'medical', label: 'صيدليات وعناية' },
  { id: 'food', label: 'كافيهات ومطاعم' },
  { id: 'boutique', label: 'حلويات وعطور' },
  { id: 'luxury', label: 'فاخر وكلاسيك' },
  { id: 'tech', label: 'إلكترونيات وتقنية' },
];

export interface ThemePresetConfig {
  id: string;
  name: string;
  category: string;
  industry: ThemeIndustryGroup;
  recommendedTemplate: StoreLayoutTemplate;
  swatches: string[];
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryContrast: string;
  secondary: string;
  secondaryHover: string;
  secondaryLight: string;
  secondaryContrast: string;
  accent: string;
  accentHover: string;
  accentLight: string;
  accentContrast: string;
  bg: string;
  cardBg: string;
  cardSubtle: string;
  headerBg: string;
  footerBg: string;
  footerCard: string;
  footerText: string;
  footerMuted: string;
  footerLine: string;
  drawerBg: string;
  drawerHeader: string;
  text: string;
  muted: string;
  line: string;
  gradient: string;
  tokens: Record<string, string>;
}

export function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `${r} ${g} ${b}`;
  }
  if (clean.length === 6) {
    const num = parseInt(clean, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `${r} ${g} ${b}`;
  }
  return '0 77 63';
}

type ThemeSeed = Omit<
  ThemePresetConfig,
  'primaryContrast' | 'secondaryContrast' | 'headerBg' | 'footerText' | 'drawerBg' | 'drawerHeader' | 'tokens'
> & {
  primaryContrast?: string;
  secondaryContrast?: string;
  footerText?: string;
};

function createThemePreset(seed: ThemeSeed): ThemePresetConfig {
  const primaryContrast = seed.primaryContrast || '#FFFFFF';
  const secondaryContrast = seed.secondaryContrast || '#FFFFFF';
  const footerText = seed.footerText || '#F8FAFC';

  const tokens: Record<string, string> = {
    '--store-primary': seed.primary,
    '--store-primary-rgb': hexToRgb(seed.primary),
    '--store-primary-hover': seed.primaryHover,
    '--store-primary-light': seed.primaryLight,
    '--store-primary-light-rgb': hexToRgb(seed.primaryLight),
    '--store-primary-contrast': primaryContrast,
    '--store-secondary': seed.secondary,
    '--store-secondary-rgb': hexToRgb(seed.secondary),
    '--store-secondary-hover': seed.secondaryHover,
    '--store-secondary-light': seed.secondaryLight,
    '--store-secondary-contrast': secondaryContrast,
    '--store-accent': seed.accent,
    '--store-accent-rgb': hexToRgb(seed.accent),
    '--store-accent-hover': seed.accentHover,
    '--store-accent-light': seed.accentLight,
    '--store-accent-contrast': seed.accentContrast,
    '--store-bg': seed.bg,
    '--store-bg-rgb': hexToRgb(seed.bg),
    '--store-card-bg': seed.cardBg,
    '--store-card-bg-rgb': hexToRgb(seed.cardBg),
    '--store-card-subtle': seed.cardSubtle,
    '--store-card-subtle-rgb': hexToRgb(seed.cardSubtle),
    '--store-header-bg': seed.cardBg,
    '--store-footer-bg': seed.footerBg,
    '--store-footer-card': seed.footerCard,
    '--store-footer-text': footerText,
    '--store-footer-muted': seed.footerMuted,
    '--store-footer-line': seed.footerLine,
    '--store-drawer-bg': seed.cardBg,
    '--store-drawer-header': seed.cardSubtle,
    '--store-text': seed.text,
    '--store-muted': seed.muted,
    '--store-line': seed.line,
    '--store-line-rgb': hexToRgb(seed.line),
    '--store-gradient': seed.gradient,
  };

  return {
    ...seed,
    primaryContrast,
    secondaryContrast,
    headerBg: seed.cardBg,
    footerText,
    drawerBg: seed.cardBg,
    drawerHeader: seed.cardSubtle,
    tokens,
  };
}

/**
 * Curated Library of 12 Flagship WCAG-AA Verified Storefront Themes
 * Every primary & secondary color guarantees >= 4.5:1 contrast with white text.
 */
export const THEME_PRESETS_CONFIG: Record<string, ThemePresetConfig> = {
  'rafiq-official': createThemePreset({
    id: 'rafiq-official',
    name: 'هوية رفيق الرسمية',
    category: 'الأخضر الغابي والزمردي المعتمد لنظام رفيق بلمسة فاخرة',
    industry: 'official',
    recommendedTemplate: 'classic',
    swatches: ['#00372D', '#004D3F', '#006D41', '#CED46A'],
    primary: '#004D3F',
    primaryHover: '#00372D',
    primaryLight: '#E6F2ED',
    secondary: '#006D41',
    secondaryHover: '#004D3F',
    secondaryLight: '#EAF5EE',
    accent: '#CED46A',
    accentHover: '#B7BE4F',
    accentLight: '#F7F8E8',
    accentContrast: '#00372D',
    bg: '#F7FAFC',
    cardBg: '#FFFFFF',
    cardSubtle: '#F1F5F4',
    footerBg: '#031F17',
    footerCard: '#082E24',
    footerMuted: '#8FB2A6',
    footerLine: '#144436',
    text: '#0F172A',
    muted: '#52605D',
    line: '#DCE1DC',
    gradient: 'linear-gradient(135deg, #00372D 0%, #004D3F 52%, #006D41 100%)',
  }),

  'royal-navy-gold': createThemePreset({
    id: 'royal-navy-gold',
    name: 'كحلي ملكي وذهبي',
    category: 'طابع فخم وهادئ يبرز جودة المعروضات ويثير الثقة الفورية',
    industry: 'luxury',
    recommendedTemplate: 'boutique',
    swatches: ['#0F1F4B', '#1E3A8A', '#D4AF37', '#F4F6FB'],
    primary: '#0F1F4B',
    primaryHover: '#091433',
    primaryLight: '#E9EEF9',
    secondary: '#1E3A8A',
    secondaryHover: '#172E6E',
    secondaryLight: '#EEF2FF',
    accent: '#EAB308',
    accentHover: '#CA8A04',
    accentLight: '#FEF9E7',
    accentContrast: '#0F1F4B',
    bg: '#F5F7FB',
    cardBg: '#FFFFFF',
    cardSubtle: '#EEF2F8',
    footerBg: '#070F26',
    footerCard: '#101D42',
    footerMuted: '#94A3C8',
    footerLine: '#1D2F66',
    text: '#0F172A',
    muted: '#53627D',
    line: '#D8E0EE',
    gradient: 'linear-gradient(135deg, #091433 0%, #0F1F4B 52%, #1E3A8A 100%)',
  }),

  'obsidian-gold': createThemePreset({
    id: 'obsidian-gold',
    name: 'فحمي ملكي وذهبي دافئ',
    category: 'مظهر بريميوم راقي ومحايد يسلط الضوء على صور المنتجات',
    industry: 'luxury',
    recommendedTemplate: 'boutique',
    swatches: ['#111827', '#334155', '#B45309', '#F59E0B'],
    primary: '#111827',
    primaryHover: '#030712',
    primaryLight: '#EFECE6',
    secondary: '#92400E',
    secondaryHover: '#78350F',
    secondaryLight: '#FEF3C7',
    accent: '#F59E0B',
    accentHover: '#D97706',
    accentLight: '#FFFBEB',
    accentContrast: '#111827',
    bg: '#F8F7F4',
    cardBg: '#FFFFFF',
    cardSubtle: '#F2EFEA',
    footerBg: '#0B0F19',
    footerCard: '#161E2E',
    footerMuted: '#9CA3AF',
    footerLine: '#273043',
    text: '#111827',
    muted: '#57534E',
    line: '#E5E0D8',
    gradient: 'linear-gradient(135deg, #090D16 0%, #1F2937 55%, #374151 100%)',
  }),

  'fresh-market': createThemePreset({
    id: 'fresh-market',
    name: 'السوق الطازج',
    category: 'أخضر حيوي ومشرق مصمم خصيصاً للسوبرماركت والخضروات والبقالة',
    industry: 'grocery',
    recommendedTemplate: 'compact',
    swatches: ['#14532D', '#15803D', '#F59E0B', '#F6FAF7'],
    primary: '#166534',
    primaryHover: '#14532D',
    primaryLight: '#E8F6EC',
    secondary: '#15803D',
    secondaryHover: '#166534',
    secondaryLight: '#DCFCE7',
    accent: '#F59E0B',
    accentHover: '#D97706',
    accentLight: '#FEF3C7',
    accentContrast: '#14532D',
    bg: '#F6FAF7',
    cardBg: '#FFFFFF',
    cardSubtle: '#EDF5EF',
    footerBg: '#0A2615',
    footerCard: '#123A22',
    footerMuted: '#93B8A0',
    footerLine: '#1D5232',
    text: '#0F1F15',
    muted: '#4B6354',
    line: '#D6E5DA',
    gradient: 'linear-gradient(135deg, #14532D 0%, #166534 50%, #15803D 100%)',
  }),

  'olive-harvest': createThemePreset({
    id: 'olive-harvest',
    name: 'زيتون وحصاد طبيعي',
    category: 'درجات عضوية دافئة مثالية للتموين والزيوت والعطارة والمنتجات الطبيعية',
    industry: 'grocery',
    recommendedTemplate: 'classic',
    swatches: ['#2D4A22', '#3F6212', '#CA8A04', '#F8F9F4'],
    primary: '#2D4A22',
    primaryHover: '#1F3617',
    primaryLight: '#ECF2E6',
    secondary: '#3F6212',
    secondaryHover: '#365314',
    secondaryLight: '#ECFCCB',
    accent: '#EAB308',
    accentHover: '#CA8A04',
    accentLight: '#FEF9C3',
    accentContrast: '#1F3617',
    bg: '#F8F9F4',
    cardBg: '#FFFFFF',
    cardSubtle: '#F0F3E8',
    footerBg: '#162410',
    footerCard: '#22361A',
    footerMuted: '#A1B398',
    footerLine: '#324D27',
    text: '#1C2617',
    muted: '#55634D',
    line: '#DDE3D4',
    gradient: 'linear-gradient(135deg, #1F3617 0%, #2D4A22 50%, #3F6212 100%)',
  }),

  'med-care-teal': createThemePreset({
    id: 'med-care-teal',
    name: 'عناية طبية وصيدلية',
    category: 'درجات تيركواز ونعناع صافية تمنح إحساساً بالنظافة والثقة الطبية',
    industry: 'medical',
    recommendedTemplate: 'compact',
    swatches: ['#0F4C5C', '#0E7490', '#10B981', '#F3F9FA'],
    primary: '#0F4C5C',
    primaryHover: '#0A3642',
    primaryLight: '#E5F3F6',
    secondary: '#0E7490',
    secondaryHover: '#155E75',
    secondaryLight: '#E0F7FA',
    accent: '#2DD4BF',
    accentHover: '#14B8A6',
    accentLight: '#CCFBF1',
    accentContrast: '#0A3642',
    bg: '#F3F9FA',
    cardBg: '#FFFFFF',
    cardSubtle: '#E9F3F5',
    footerBg: '#07242C',
    footerCard: '#0E3945',
    footerMuted: '#8DB6C0',
    footerLine: '#175261',
    text: '#0C252C',
    muted: '#4B6972',
    line: '#D3E4E8',
    gradient: 'linear-gradient(135deg, #0A3642 0%, #0F4C5C 50%, #0E7490 100%)',
  }),

  'ocean-trust': createThemePreset({
    id: 'ocean-trust',
    name: 'أزرق بحري صافي',
    category: 'واجهة واضحة ومريحة للعين مثالية للصيدليات ومستلزمات الرعاية',
    industry: 'medical',
    recommendedTemplate: 'classic',
    swatches: ['#0B3954', '#0369A1', '#38BDF8', '#F4F8FC'],
    primary: '#0B3954',
    primaryHover: '#07283B',
    primaryLight: '#E6F1F8',
    secondary: '#0369A1',
    secondaryHover: '#075985',
    secondaryLight: '#E0F2FE',
    accent: '#38BDF8',
    accentHover: '#0EA5E9',
    accentLight: '#F0F9FF',
    accentContrast: '#07283B',
    bg: '#F4F8FC',
    cardBg: '#FFFFFF',
    cardSubtle: '#EBF2F8',
    footerBg: '#061E2E',
    footerCard: '#0C314A',
    footerMuted: '#8FAEC4',
    footerLine: '#164869',
    text: '#0C2233',
    muted: '#4E677A',
    line: '#D4E2EE',
    gradient: 'linear-gradient(135deg, #07283B 0%, #0B3954 50%, #0369A1 100%)',
  }),

  'espresso-roast': createThemePreset({
    id: 'espresso-roast',
    name: 'محمصة إسبريسو وكراميل',
    category: 'درجات القهوة المحمصة الدافئة للمحامص والكافيهات والمخبوزات',
    industry: 'food',
    recommendedTemplate: 'boutique',
    swatches: ['#4A2511', '#7C2D12', '#D97706', '#FAF7F2'],
    primary: '#4A2511',
    primaryHover: '#33190B',
    primaryLight: '#F5EBE4',
    secondary: '#7C2D12',
    secondaryHover: '#61220D',
    secondaryLight: '#FFEDD5',
    accent: '#F59E0B',
    accentHover: '#D97706',
    accentLight: '#FEF3C7',
    accentContrast: '#33190B',
    bg: '#FAF7F2',
    cardBg: '#FFFFFF',
    cardSubtle: '#F3ECE4',
    footerBg: '#211007',
    footerCard: '#361B0D',
    footerMuted: '#B89E8E',
    footerLine: '#4F2915',
    text: '#24140B',
    muted: '#6E5547',
    line: '#E6DDD4',
    gradient: 'linear-gradient(135deg, #33190B 0%, #4A2511 50%, #7C2D12 100%)',
  }),

  'crimson-grill': createThemePreset({
    id: 'crimson-grill',
    name: 'لهيب المطاعم والمشويات',
    category: 'طابع شهي وجريء يحفّز الطلب الفوري للمطاعم والجزارة والوجبات',
    industry: 'food',
    recommendedTemplate: 'compact',
    swatches: ['#881337', '#B91C1C', '#F59E0B', '#FDF6F5'],
    primary: '#991B1B',
    primaryHover: '#7F1D1D',
    primaryLight: '#FEECEE',
    secondary: '#C2410C',
    secondaryHover: '#9A3412',
    secondaryLight: '#FFEDD5',
    accent: '#FBBF24',
    accentHover: '#F59E0B',
    accentLight: '#FEF3C7',
    accentContrast: '#450A0A',
    bg: '#FDF7F6',
    cardBg: '#FFFFFF',
    cardSubtle: '#F9ECEA',
    footerBg: '#260808',
    footerCard: '#3F0E0E',
    footerMuted: '#C79B9B',
    footerLine: '#5C1818',
    text: '#260C0C',
    muted: '#735353',
    line: '#EEDADA',
    gradient: 'linear-gradient(135deg, #7F1D1D 0%, #991B1B 50%, #C2410C 100%)',
  }),

  'berry-patisserie': createThemePreset({
    id: 'berry-patisserie',
    name: 'باتيسيري وتوت وردي',
    category: 'ألوان مخملية مشرقة للحلويات والتورت ومستحضرات التجميل والهدايا',
    industry: 'boutique',
    recommendedTemplate: 'boutique',
    swatches: ['#831843', '#BE185D', '#F472B6', '#FDF4F8'],
    primary: '#831843',
    primaryHover: '#631032',
    primaryLight: '#FCE7F3',
    secondary: '#BE185D',
    secondaryHover: '#9D174D',
    secondaryLight: '#FFE4E6',
    accent: '#F472B6',
    accentHover: '#EC4899',
    accentLight: '#FDF2F8',
    accentContrast: '#500724',
    bg: '#FDF5F9',
    cardBg: '#FFFFFF',
    cardSubtle: '#F8EBF2',
    footerBg: '#290715',
    footerCard: '#450D25',
    footerMuted: '#C492A9',
    footerLine: '#631637',
    text: '#2B0918',
    muted: '#754C60',
    line: '#EEDAE5',
    gradient: 'linear-gradient(135deg, #631032 0%, #831843 50%, #BE185D 100%)',
  }),

  'velvet-plum': createThemePreset({
    id: 'velvet-plum',
    name: 'مخملي بنفسجي وعطور',
    category: 'تناسق فندقي أنيق ومميز لمتاجر العطور والإكسسوارات والأزياء',
    industry: 'boutique',
    recommendedTemplate: 'boutique',
    swatches: ['#3B0764', '#6B21A8', '#EAB308', '#F9F6FC'],
    primary: '#4C1D95',
    primaryHover: '#3B0764',
    primaryLight: '#F3EBFF',
    secondary: '#6B21A8',
    secondaryHover: '#581C87',
    secondaryLight: '#F5F3FF',
    accent: '#EAB308',
    accentHover: '#CA8A04',
    accentLight: '#FEF9C3',
    accentContrast: '#3B0764',
    bg: '#F9F6FC',
    cardBg: '#FFFFFF',
    cardSubtle: '#F1EBF8',
    footerBg: '#19052B',
    footerCard: '#2B0D47',
    footerMuted: '#AE9BC2',
    footerLine: '#421969',
    text: '#1E0D33',
    muted: '#5F4E73',
    line: '#E3D9EE',
    gradient: 'linear-gradient(135deg, #2E1065 0%, #4C1D95 50%, #6B21A8 100%)',
  }),

  'modern-slate-indigo': createThemePreset({
    id: 'modern-slate-indigo',
    name: 'إنديجو تقني عصري',
    category: 'هوية حديثة حادة لمتاجر الموبايلات والإلكترونيات والأجهزة المنزلية',
    industry: 'tech',
    recommendedTemplate: 'compact',
    swatches: ['#1E1B4B', '#4338CA', '#06B6D4', '#F5F6FC'],
    primary: '#1E1B4B',
    primaryHover: '#131133',
    primaryLight: '#ECECFE',
    secondary: '#3730A3',
    secondaryHover: '#312E81',
    secondaryLight: '#E0E7FF',
    accent: '#22D3EE',
    accentHover: '#06B6D4',
    accentLight: '#ECFEFF',
    accentContrast: '#131133',
    bg: '#F5F6FC',
    cardBg: '#FFFFFF',
    cardSubtle: '#ECEDF8',
    footerBg: '#0D0B26',
    footerCard: '#191642',
    footerMuted: '#9698C2',
    footerLine: '#2B2763',
    text: '#131133',
    muted: '#52547A',
    line: '#DADCF0',
    gradient: 'linear-gradient(135deg, #131133 0%, #1E1B4B 50%, #3730A3 100%)',
  }),
};

// 100% Backwards-Compatible Legacy Preset Key Map
export const LEGACY_THEME_KEY_MAP: Record<string, string> = {
  'classic-green': 'rafiq-official',
  'duo-forest-cream': 'rafiq-official',
  'duo-pine-chartreuse': 'fresh-market',
  'mat-market-quad': 'fresh-market',
  'duo-midnight-gold': 'royal-navy-gold',
  'duo-royal-mustard': 'royal-navy-gold',
  'mat-luxury-gold': 'obsidian-gold',
  'elegant-dark': 'obsidian-gold',
  'duo-ocean-mint': 'ocean-trust',
  'medical-blue': 'med-care-teal',
  'mat-medical-mint': 'med-care-teal',
  'teal-fresh': 'med-care-teal',
  'mat-tech-cyan': 'modern-slate-indigo',
  'cyan-tech': 'modern-slate-indigo',
  'duo-indigo-tangerine': 'modern-slate-indigo',
  'mat-indigo-rose': 'modern-slate-indigo',
  'duo-espresso-latte': 'espresso-roast',
  'warm-brown': 'espresso-roast',
  'mat-roastery-caramel': 'espresso-roast',
  'mat-flame-grill': 'crimson-grill',
  'vibrant-red': 'crimson-grill',
  'duo-burgundy-peach': 'berry-patisserie',
  'mat-sweet-bakery': 'berry-patisserie',
  'amber-bakery': 'berry-patisserie',
  'rose-fashion': 'berry-patisserie',
  'duo-plum-sage': 'velvet-plum',
  'purple-luxury': 'velvet-plum',
};

export function resolveThemePreset(presetKey: string | null | undefined): ThemePresetConfig {
  if (presetKey && THEME_PRESETS_CONFIG[presetKey]) {
    return THEME_PRESETS_CONFIG[presetKey];
  }
  if (presetKey) {
    const mappedKey = LEGACY_THEME_KEY_MAP[presetKey];
    if (mappedKey && THEME_PRESETS_CONFIG[mappedKey]) {
      return THEME_PRESETS_CONFIG[mappedKey];
    }
  }
  return THEME_PRESETS_CONFIG['rafiq-official'];
}

export function resolveLayoutTemplate(custom?: StoreThemeCustom | null): StoreLayoutTemplate {
  const val = custom?.layoutTemplate;
  if (val === 'compact' || val === 'boutique' || val === 'classic') return val;
  return 'classic';
}

export function resolveCornerStyle(custom?: StoreThemeCustom | null): CornerStyleOption {
  const id = custom?.cornerStyle;
  return STORE_CORNER_STYLES.find(c => c.id === id) || STORE_CORNER_STYLES[0];
}

interface Props {
  preset: string;
  custom?: StoreThemeCustom | null;
}

export const ThemeInjector: React.FC<Props> = ({ preset, custom }) => {
  const config = resolveThemePreset(preset);
  const layoutTemplate = resolveLayoutTemplate(custom);
  const cornerStyle = resolveCornerStyle(custom);

  // Apply synchronously so there is zero paint flash
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    Object.entries(config.tokens).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
    root.style.setProperty('--store-radius-card', cornerStyle.cardRadius);
    root.style.setProperty('--store-radius-btn', cornerStyle.btnRadius);
    root.dataset.layoutTemplate = layoutTemplate;
    root.dataset.cornerStyle = cornerStyle.id;

    if (custom) {
      Object.entries(custom).forEach(([key, val]) => {
        if (key.startsWith('--') && typeof val === 'string') {
          root.style.setProperty(key, val);
        }
      });
    }
  }

  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', config.primary);
    }
  }, [preset, config.primary]);

  return null;
};
