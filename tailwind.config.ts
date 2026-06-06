import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        metro: {
          red: '#DC2626',
          dark: '#991B1B',
          topbar: '#0B1324',
          navy: '#08111F',
          slate: '#0F172A',
          bluegray: '#334155',
          surface: '#1F2937',
          app: '#374151',
          panel: '#243244',
          raised: '#273548',
          text: '#F3F4F6',
          muted: '#94A3B8',
          secondary: '#CBD5E1',
          border: 'rgba(148, 163, 184, 0.18)',
          success: '#22C55E',
          warning: '#F59E0B',
          info: '#3B82F6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 18px 48px rgba(2, 6, 23, 0.18)',
        glow: '0 0 0 1px rgba(148, 163, 184, 0.12), 0 18px 48px rgba(2, 6, 23, 0.22)',
      },
    },
  },
  plugins: [],
} satisfies Config;
