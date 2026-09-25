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
          soft: "#E1EAE5",
          dark: "#00372D",
        },
        ink: {
          DEFAULT: "#14181A",
          muted: "#5B6664",
        },
        paid: {
          DEFAULT: "#1B7A4D",
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
        },
      },
      fontFamily: {
        sans: ["Cairo", "Tajawal", "Segoe UI", "Tahoma", "sans-serif"],
        mono: ["Cairo", "Consolas", "Courier New", "monospace"],
      },
    },
  },
  plugins: [],
}
