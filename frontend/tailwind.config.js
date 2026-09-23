/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pos: {
          bg: "#0f172a",
          card: "#1e293b",
          border: "#334155",
          primary: "#2563eb",
          accent: "#10b981",
          warning: "#f59e0b",
          danger: "#ef4444",
        }
      },
      fontFamily: {
        arabic: ["Cairo", "Segoe UI", "Tahoma", "sans-serif"],
      }
    },
  },
  plugins: [],
}
