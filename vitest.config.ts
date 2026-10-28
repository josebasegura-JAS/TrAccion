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
      // Fase 4: ampliación auditada a tests sin APIs de navegador.
      ['src/features/teletrabajo/domain/puestosTeletrabajo.test.ts', 'node'],
      ['src/features/teletrabajo/domain/gruposCobertura.test.ts', 'node'],
      ['src/features/ticket-restaurante/domain/ticketConfig.history.test.ts', 'node'],
      ['src/features/ticket-restaurante/domain/importPeople.test.ts', 'node'],
      ['src/features/criterios-rrll/domain/criteriosRrll.test.ts', 'node'],
      ['src/features/vinculograma/domain/vinculograma.test.ts', 'node'],
      ['src/features/loteria/domain/matchLotteryPeople.test.ts', 'node'],
      ['src/features/tareas/domain/tareas.filters-sort-historico.test.ts', 'node'],
      ['src/features/presupuestos/domain/presupuestos.test.ts', 'node'],
      ['src/features/configuracion/domain/taskCatalogIntegrity.test.ts', 'node'],
      ['src/features/huelgas/components/huelgasZones.test.ts', 'node'],
      ['src/shared/import/delimitedText.test.ts', 'node'],
      ['src/utils/dateOnly.test.ts', 'node'],
      ['src/shared/sessions/session.test.ts', 'node'],
      ['src/features/licencias-sin-sueldo/domain/licenciaSinSueldo.test.ts', 'node'],
      ['src/features/coordinacion/domain/coordinacion.coverage.test.ts', 'node'],
      // Pruebas de dominio/regresión auditadas: solo operaciones sobre datos, fechas y mocks.
      // Mantener los tests de stores, React y localStorage en jsdom.
      ['src/features/ticket-restaurante/domain/ticketCalculation.regression.test.ts', 'node'],
      ['src/features/ticket-restaurante/domain/importManutenciones.regression.test.ts', 'node'],
      ['src/features/ticket-restaurante/domain/importManutencionesPdf.regression.test.ts', 'node'],
      ['src/features/configuracion/domain/taskStates.test.ts', 'node'],
      ['src/features/configuracion/domain/taskPhases.test.ts', 'node'],
      ['src/features/loteria/domain/importLotteryPeople.test.ts', 'node'],
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
