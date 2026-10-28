import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Los tests de Electron/SQLite y scripts no necesitan un DOM de navegador.
    // El resto conserva jsdom para evitar cambios en las pruebas de interfaz.
    environmentMatchGlobs: [
      ['electron/**/*.test.ts', 'node'],
      ['scripts/**/*.test.mjs', 'node'],
      // Fase 3: pruebas de dominio puro, sin DOM ni almacenamiento del navegador.
      // Lista explícita para no alterar tests de stores ni componentes React.
      ['src/features/ticket-restaurante/domain/ticketRestaurante.test.ts', 'node'],
      ['src/features/teletrabajo/domain/semaforo.test.ts', 'node'],
      ['src/features/tareas/domain/tareas.test.ts', 'node'],
      ['src/features/loteria/domain/loteria.test.ts', 'node'],
      ['src/features/actas/domain/acta.test.ts', 'node'],
      ['src/features/sorteos/domain/sorteos.test.ts', 'node'],
      ['src/features/ayuda-escolar/domain/ayudaEscolar.test.ts', 'node'],
    ],
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
