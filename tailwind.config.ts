import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        metro: {
          red: '#C62828',
          dark: '#9E1D1D',
          navy: '#0F1B2D',
          slate: '#1E2A3D',
          bluegray: '#3A4758',
          surface: '#FFFFFF',
          app: '#D9EDF2',
          panel: '#F4FAFC',
          text: '#1E2A3D',
          muted: '#4F5D6B',
          secondary: '#6B7C93',
          border: '#D6DEE8',
          success: '#2E7D32',
          warning: '#F59E0B',
          info: '#2563EB',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 10px 30px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config;
