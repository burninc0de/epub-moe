import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  resolve: {
    alias: {
      events: 'events',
    },
  },
  define: {
    global: 'window',
    __AUTO_LOAD_EPUB__: JSON.stringify(process.env.VITE_AUTO_LOAD_EPUB || ''),
  },
});