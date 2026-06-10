import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: { include: ['exceljs'] },
  server: {
    port: 5173,
    strictPort: true,
  },
});
