function withOpacity(variableName) {
  return ({ opacityValue }) => {
    if (opacityValue !== undefined) {
      return `rgba(var(${variableName}), ${opacityValue})`;
    }
    return `rgb(var(${variableName}))`;
  };
}

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: withOpacity('--canvas-rgb'),
        surface: {
          DEFAULT: withOpacity('--surface-rgb'),
          pure: withOpacity('--surface-pure-rgb'),
          2: withOpacity('--surface-2-rgb'),
          3: withOpacity('--surface-3-rgb'),
          dim: withOpacity('--surface-dim-rgb'),
          bright: withOpacity('--surface-bright-rgb'),
        },
        line: {
          DEFAULT: withOpacity('--line-rgb'),
          hover: withOpacity('--line-hover-rgb'),
        },
        brand: {
          DEFAULT: withOpacity('--brand-rgb'),
          hover: withOpacity('--brand-hover-rgb'),
          container: withOpacity('--brand-container-rgb'),
          soft: withOpacity('--brand-soft-rgb'),
          dark: withOpacity('--brand-dark-rgb'),
        },
        ink: {
          DEFAULT: withOpacity('--ink-rgb'),
          muted: withOpacity('--ink-muted-rgb'),
        },
        paid: {
          DEFAULT: withOpacity('--paid-rgb'),
          hover: withOpacity('--paid-hover-rgb'),
          soft: withOpacity('--paid-soft-rgb'),
          border: withOpacity('--paid-border-rgb'),
        },
        warn: {
          DEFAULT: withOpacity('--warn-rgb'),
          soft: withOpacity('--warn-soft-rgb'),
          border: withOpacity('--warn-border-rgb'),
        },
        danger: {
          DEFAULT: withOpacity('--danger-rgb'),
          soft: withOpacity('--danger-soft-rgb'),
          border: withOpacity('--danger-border-rgb'),
          ink: withOpacity('--danger-ink-rgb'),
        },
        secondary: {
          DEFAULT: withOpacity('--paid-rgb'),
          hover: withOpacity('--paid-hover-rgb'),
          soft: withOpacity('--paid-soft-rgb'),
        },
      },
      boxShadow: {
        '2xs': '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'subtle': '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        'card': '0 2px 8px 0 rgba(0, 0, 0, 0.08)',
      },
      backdropBlur: {
        xs: '2px',
      },
      spacing: {
        '0.2': '1px',
        '4.5': '1.125rem',
        '7.5': '1.875rem', // 30px
        '8.5': '2.125rem', // 34px
      },
      zIndex: {
        '60': '60',
        '70': '70',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleUp: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        'fadeIn': 'fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-up': 'scaleUp 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.95rem' }], // 11px
        'md': ['0.9375rem', { lineHeight: '1.4rem' }],   // 15px
      },
      fontFamily: {
        sans: ["'IBM Plex Sans Arabic'", "Cairo", "Tajawal", "Segoe UI", "Tahoma", "sans-serif"],
        ibm: ["'IBM Plex Sans Arabic'", "Cairo", "Tajawal", "sans-serif"],
        cairo: ["Cairo", "'IBM Plex Sans Arabic'", "Tajawal", "Segoe UI", "Tahoma", "sans-serif"],
        mono: ["'IBM Plex Sans Arabic'", "Consolas", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
}
