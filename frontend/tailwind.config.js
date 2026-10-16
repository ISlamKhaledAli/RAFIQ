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
        canvas: "#F3F5F2",
        surface: {
          DEFAULT: "#FFFFFF",
          pure: "#FFFFFF",
          2: "#F1F5F4",
          3: "#EBF0EE",
          dim: "#D7DADD",
          bright: "#F3F5F2",
        },
        line: {
          DEFAULT: "#DCE1DC",
          hover: "#B5C0B7",
        },
        brand: {
          DEFAULT: "#004D3F",
          hover: "#00372D",
          container: "#0B4F42",
          soft: "#E6F2ED",
          dark: "#00372D",
        },
        ink: {
          DEFAULT: "#0F172A",
          muted: "#52605D",
        },
        paid: {
          DEFAULT: "#006D41",
          hover: "#005734",
          soft: "#EAF5EE",
          border: "#C4E3D0",
          dark: "#12302A",
        },
        warn: {
          DEFAULT: "#B3720E",
          soft: "#FEF7EC",
          border: "#F5DEB4",
        },
        danger: {
          DEFAULT: "#B23A2E",
          soft: "#FDF3F2",
          border: "#F6CBC6",
          ink: "#7A1D14",
        },
        secondary: {
          DEFAULT: "#006D41",
          hover: "#005734",
          soft: "#EAF5EE",
        },
        // Dark Mode Official Design Tokens (Extracted directly from dark_mode_rafeeq/rafeeq_pos/DESIGN.md)
        'canvas-dark': '#0E1312',
        'surface-dark': {
          DEFAULT: '#151B1A',
          pure: '#151B1A',
          lowest: '#0A0F0E',
          low: '#181D1B',
          2: '#1C2423',
          3: '#243230',
          high: '#262B2A',
          highest: '#313635',
          bright: '#353A39',
        },
        'line-dark': {
          DEFAULT: '#2A3532',
          strong: '#4A5A56',
          hover: '#3E4945',
        },
        'ink-dark': {
          DEFAULT: '#E6ECEA',
          muted: '#93A19D',
          disabled: '#5A6865',
        },
        'brand-bright': '#5FBFA2',
        'brand-dark-soft': '#12302A',
        'paid-bright': '#34D399',
        'paid-bright-hover': '#10B981',
        'paid-dark-soft': '#12302A',
        'paid-dark-border': '#1E4A38',
        'warn-bright': '#FBBF24',
        'warn-dark-soft': '#33260F',
        'danger-bright': '#F87171',
        'danger-dark-soft': '#3A1D1A',
        'danger-dark-fill': '#C5483B',
        'ink-dark-muted': '#93A19D',
        'ink-muted-dark': '#93A19D',
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
