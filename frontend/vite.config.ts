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
          if (id.includes('src/views/PosView')) {
            return 'view-pos';
          }
          if (id.includes('src/views/ProductsView') || id.includes('src/components/ProductFormModal')) {
            return 'view-products';
          }
          if (id.includes('src/views/PurchasesView')) {
            return 'view-purchases';
          }
          if (id.includes('src/views/SettingsView')) {
            return 'view-settings';
          }
          if (id.includes('src/views/pharma/')) {
            return 'view-pharma';
          }
          if (id.includes('src/views/insurance/')) {
            return 'view-insurance';
          }
          if (id.includes('src/views/cafe/')) {
            return 'view-cafe';
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
