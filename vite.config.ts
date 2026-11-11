import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Solo se aplica al HTML empaquetado: Vite/React Refresh necesitan scripts
// inline en desarrollo. En producción todos los scripts proceden del bundle.
export const PRODUCTION_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    react(),
    ...(command === 'build'
      ? [{
          name: 'traccion-production-content-security-policy',
          transformIndexHtml(html: string) {
            const cspTag = `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CONTENT_SECURITY_POLICY}" />`;
            return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${cspTag}`);
          },
        }]
      : []),
  ],
  optimizeDeps: { include: ['exceljs'] },
  server: {
    port: 5173,
    strictPort: true,
  },
}));
