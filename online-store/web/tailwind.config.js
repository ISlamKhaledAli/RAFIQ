/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        store: {
          primary: 'rgb(var(--store-primary-rgb, 0 77 63) / <alpha-value>)',
          'primary-hover': 'var(--store-primary-hover, #00372D)',
          'primary-light': 'rgb(var(--store-primary-light-rgb, 230 242 237) / <alpha-value>)',
          'primary-contrast': 'var(--store-primary-contrast, #FFFFFF)',
          secondary: 'rgb(var(--store-secondary-rgb, 0 109 65) / <alpha-value>)',
          'secondary-hover': 'var(--store-secondary-hover, #004D3F)',
          'secondary-light': 'var(--store-secondary-light, #E6F2ED)',
          'secondary-contrast': 'var(--store-secondary-contrast, #FFFFFF)',
          accent: 'rgb(var(--store-accent-rgb, 206 212 106) / <alpha-value>)',
          'accent-hover': 'var(--store-accent-hover, #B7BE4F)',
          'accent-light': 'var(--store-accent-light, #FEF3C7)',
          'accent-contrast': 'var(--store-accent-contrast, #0F172A)',
          bg: 'rgb(var(--store-bg-rgb, 248 250 252) / <alpha-value>)',
          card: 'rgb(var(--store-card-bg-rgb, 255 255 255) / <alpha-value>)',
          'card-subtle': 'rgb(var(--store-card-subtle-rgb, 248 250 252) / <alpha-value>)',
          header: 'rgb(var(--store-card-bg-rgb, 255 255 255) / <alpha-value>)',
          'footer-bg': 'var(--store-footer-bg, #0F172A)',
          'footer-card': 'var(--store-footer-card, #1E293B)',
          'footer-text': 'var(--store-footer-text, #F8FAFC)',
          'footer-muted': 'var(--store-footer-muted, #94A3B8)',
          'footer-line': 'var(--store-footer-line, #334155)',
          'drawer-bg': 'var(--store-drawer-bg, #FFFFFF)',
          'drawer-header': 'var(--store-drawer-header, #F8FAFC)',
          text: 'var(--store-text, #0F172A)',
          muted: 'var(--store-muted, #64748B)',
          line: 'rgb(var(--store-line-rgb, 226 232 240) / <alpha-value>)',
        },
      },
      backgroundImage: {
        'store-gradient': 'var(--store-gradient, linear-gradient(135deg, var(--store-primary, #004D3F) 0%, var(--store-secondary, #006D41) 100%))',
      },
      fontFamily: {
        sans: ['Readex Pro', 'IBM Plex Sans Arabic', 'Cairo', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
      animation: {
        'pop': 'pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'bounce-subtle': 'bounceSubtle 2.5s ease-in-out infinite',
        'float': 'float 4s ease-in-out infinite',
        'pulse-slow': 'pulseGlow 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite linear',
        'fade-in-up': 'fadeInUp 0.35s ease-out forwards',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'toast-in': 'toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        pop: {
          '0%': { transform: 'scale(0.85)' },
          '50%': { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.04)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeInUp: {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.92)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        toastIn: {
          '0%': { transform: 'translateY(-20px) scale(0.9)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
