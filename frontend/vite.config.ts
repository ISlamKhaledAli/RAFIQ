import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  envDir: '../',
  build: {
    target: 'chrome109',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          // Only the cashier screen is a fixed chunk (it is always loaded); every other screen is a lazy chunk
          // that Rolldown splits on its own, so nothing but the cashier is preloaded at startup.
          if (id.includes('src/views/PosView')) {
            return 'view-pos';
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  }
})
