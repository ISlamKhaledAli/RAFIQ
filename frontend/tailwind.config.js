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
          2: "#F7F8F6",
          3: "#EEF1F4",
          dim: "#D7DADD",
          bright: "#F7FAFC",
        },
        line: {
          DEFAULT: "#DCE1DC",
          hover: "#B5C0B7",
        },
        brand: {
          DEFAULT: "#0B4F42",
          hover: "#0F6A57",
          container: "#0B4F42",
          soft: "#E1EAE5",
          dark: "#00372D",
        },
        ink: {
          DEFAULT: "#14181A",
          muted: "#5B6664",
        },
        paid: {
          DEFAULT: "#1B7A4D",
          hover: "#15633E",
          soft: "#EAF5EE",
          border: "#C4E3D0",
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
          hover: "#005230",
          soft: "#E1EAE5",
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
      fontFamily: {
        sans: ["Cairo", "Tajawal", "Segoe UI", "Tahoma", "sans-serif"],
        cairo: ["Cairo", "Tajawal", "Segoe UI", "Tahoma", "sans-serif"],
        mono: ["Cairo", "Consolas", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
}
