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
      // Baseline Windows CI #546: 1852 tests; 50.60/50.60/54.07/74.88.
      // Los umbrales por glob se calculan conjuntamente para los archivos
      // coincidentes, sin exigir el mismo porcentaje a cada archivo.
      thresholds: {
        lines: 50, statements: 50, functions: 53, branches: 74,
        'electron/persistence/**': { lines: 75, statements: 75, functions: 84, branches: 82 },
        'electron/ipc/**': { lines: 77, statements: 77, functions: 79, branches: 90 },
        'electron/main.ts': { lines: 74, statements: 74, functions: 81, branches: 74 },
        'electron/appUpdate.ts': { lines: 93, statements: 93, functions: 98, branches: 81 },
        'electron/persistence/recordLocks.ts': { lines: 96, statements: 96, functions: 91, branches: 94 },
        'electron/persistence/localBackups.ts': { lines: 97, statements: 97, functions: 98, branches: 95 },
        'src/components/task-editor/**': { lines: 66, statements: 66, functions: 49, branches: 67 },
      },
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
