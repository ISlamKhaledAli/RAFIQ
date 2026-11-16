/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        store: {
          primary: 'var(--store-primary, #004D3F)',
          'primary-hover': 'var(--store-primary-hover, #00372D)',
          'primary-light': 'var(--store-primary-light, #E6F2ED)',
          accent: 'var(--store-accent, #006D41)',
          bg: 'var(--store-bg, #F8FAFC)',
          card: 'var(--store-card-bg, #FFFFFF)',
          text: 'var(--store-text, #0F172A)',
          muted: 'var(--store-muted, #64748B)',
          line: 'var(--store-line, #E2E8F0)',
        },
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
