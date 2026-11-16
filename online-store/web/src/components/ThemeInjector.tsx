import React, { useEffect } from 'react';

export const THEME_PRESETS_CONFIG: Record<
  string,
  {
    name: string;
    category: string;
    primary: string;
    tokens: Record<string, string>;
  }
> = {
  'classic-green': {
    name: 'أخضر كلاسيك',
    category: 'سوبرماركت وبقالة تموينية',
    primary: '#004D3F',
    tokens: {
      '--store-primary': '#004D3F',
      '--store-primary-hover': '#00372D',
      '--store-primary-light': '#E6F2ED',
      '--store-accent': '#006D41',
    },
  },
  'medical-blue': {
    name: 'أزرق طبي',
    category: 'صيدليات ومستلزمات علاجية',
    primary: '#0284C7',
    tokens: {
      '--store-primary': '#0284C7',
      '--store-primary-hover': '#0369A1',
      '--store-primary-light': '#E0F2FE',
      '--store-accent': '#0284C7',
    },
  },
  'warm-brown': {
    name: 'بني دافئ',
    category: 'محامص وبن وكافيهات',
    primary: '#78350F',
    tokens: {
      '--store-primary': '#78350F',
      '--store-primary-hover': '#582509',
      '--store-primary-light': '#FEF3C7',
      '--store-accent': '#B45309',
    },
  },
  'vibrant-red': {
    name: 'أحمر حيوي',
    category: 'مطاعم ومأكولات سريعة ومشاوي',
    primary: '#B91C1C',
    tokens: {
      '--store-primary': '#B91C1C',
      '--store-primary-hover': '#991B1B',
      '--store-primary-light': '#FEE2E2',
      '--store-accent': '#DC2626',
    },
  },
  'purple-luxury': {
    name: 'بنفسجي ملكي',
    category: 'عطور ومستحضرات تجميل وبوتيك',
    primary: '#6D28D9',
    tokens: {
      '--store-primary': '#6D28D9',
      '--store-primary-hover': '#5B21B6',
      '--store-primary-light': '#EDE9FE',
      '--store-accent': '#7C3AED',
    },
  },
  'amber-bakery': {
    name: 'كراميل عسلي',
    category: 'مخابز وحلويات وشوكولاتة',
    primary: '#D97706',
    tokens: {
      '--store-primary': '#D97706',
      '--store-primary-hover': '#B45309',
      '--store-primary-light': '#FEF3C7',
      '--store-accent': '#F59E0B',
    },
  },
  'rose-fashion': {
    name: 'وردي فاخر',
    category: 'أزياء وملابس وإكسسوارات',
    primary: '#E11D48',
    tokens: {
      '--store-primary': '#E11D48',
      '--store-primary-hover': '#BE123C',
      '--store-primary-light': '#FFE4E6',
      '--store-accent': '#F43F5E',
    },
  },
  'teal-fresh': {
    name: 'تركواز طبيعي',
    category: 'خضار وفواكه وأغذية صحية',
    primary: '#0D9488',
    tokens: {
      '--store-primary': '#0D9488',
      '--store-primary-hover': '#0F766E',
      '--store-primary-light': '#CCFBF1',
      '--store-accent': '#14B8A6',
    },
  },
  'cyan-tech': {
    name: 'سيان عصري',
    category: 'إلكترونيات وموبايل وأجهزة ذكية',
    primary: '#0891B2',
    tokens: {
      '--store-primary': '#0891B2',
      '--store-primary-hover': '#0E7490',
      '--store-primary-light': '#CFFAFE',
      '--store-accent': '#06B6D4',
    },
  },
  'elegant-dark': {
    name: 'فحمي أنيق',
    category: 'ساعات وهدايا وبوتيكات راقية',
    primary: '#1E293B',
    tokens: {
      '--store-primary': '#1E293B',
      '--store-primary-hover': '#0F172A',
      '--store-primary-light': '#F1F5F9',
      '--store-accent': '#334155',
    },
  },
};

interface Props {
  preset: string;
  custom?: Record<string, string> | null;
}

export const ThemeInjector: React.FC<Props> = ({ preset, custom }) => {
  useEffect(() => {
    const root = document.documentElement;
    const config = THEME_PRESETS_CONFIG[preset] || THEME_PRESETS_CONFIG['classic-green'];

    // Apply preset CSS variables
    Object.entries(config.tokens).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });

    // Update browser theme color meta tag
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', config.primary);
    }

    // Apply custom overrides if any
    if (custom) {
      Object.entries(custom).forEach(([key, val]) => {
        root.style.setProperty(key, val);
      });
    }
  }, [preset, custom]);

  return null;
};
