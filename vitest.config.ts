import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      all: true,
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.ts', 'scripts/*.mjs'],
      exclude: ['**/*.d.ts', '**/*.{test,spec}.{ts,tsx,mjs}', 'src/test/**'],
      reporter: ['text', 'json', 'json-summary', 'html'],
      // Suelo medido en df62803d; no imponer un porcentaje ficticio del 80 %.
      thresholds: { lines: 40, statements: 40, functions: 49, branches: 70 },
    },
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.{ts,tsx}', 'electron/**/*.test.ts', 'scripts/**/*.test.mjs'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-electron/**',
      '**/release/**',
      '**/build/**',
      '**/coverage/**',
      '**/e2e/**',
      '**/tests/e2e/**',
      '**/*.e2e.*',
      '**/*.spec.e2e.*',
      '**/*.pw.*',
      '**/playwright.config.*',
    ],
  },
});
