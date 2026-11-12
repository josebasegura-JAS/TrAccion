# Validación y distribución de TrAcción

## Validación automática de PR

El workflow vigente es `.github/workflows/build-windows.yml`. En cada `pull_request` ejecuta cuatro grupos de calidad en paralelo: **calidad**, **vitest**, **web** y **electron**, definidos mediante `.github/actions/validate/action.yml`. El job final **Validación integral** exige que todos terminen correctamente.

Actualmente no se ejecuta esta batería automáticamente por cada `push` a `main`. La distribución manual (`workflow_dispatch`) y la reutilizable (`workflow_call`) generan los artefactos sin repetir los tests completos. Por ello, **la validación de una PR debe hacerse antes de fusionarla**; generar un EXE no equivale a volver a ejecutar los tests.

## Ejecución local

Usar Node indicado en `.nvmrc` y herramientas nativas necesarias para `better-sqlite3`. Windows es la plataforma obligatoria para la distribución.

```sh
npm ci --include=dev
npm run typecheck:tests
npm run lint
npm run build
npm run test:coverage
npm run test:e2e
npm run electron:rebuild
npm run test:e2e:electron
```

La reconstrucción de `better-sqlite3` cambia su ABI entre Node y Electron: realizar la prueba Vitest antes de reconstruir para Electron, o restaurar el ABI Node antes de volver a ejecutarla. Los grupos de CI emplean instalaciones independientes para evitar esa contaminación.

También existen scripts agregados de validación en `package.json`; el workflow de PR se rige por las fases descritas arriba.

## Evidencia y cobertura

Vitest genera informes en `coverage/` y `audit-results/`; Playwright conserva trazas en `playwright-report-web`, `playwright-report-electron` y `test-results`. GitHub Actions conserva los artefactos de las cuatro fases incluso ante fallos (según `.github/actions/validate/action.yml`).

El umbral actual de `vitest.config.ts` es: líneas 40 %, statements 40 %, funciones 49 % y ramas 70 %. Un umbral superado no garantiza por sí mismo cobertura de los escenarios reales de concurrencia SMB.

## Distribución

La distribución EXE/ZIP solo puede realizarse desde `main` mediante sus workflows manuales o reutilizables. El workflow comprueba el formato solicitado, compila, empaqueta y registra el origen del paquete. La numeración de distribución se calcula con el historial de etiquetas `traccion-build/*` y `.build-version`, sin ejecutar otra vez la batería integral dentro del job de distribución. Consultar la implementación de `.github/workflows/build-windows.yml` como fuente de verdad para los detalles operativos.

No activar una distribución para comprobar cambios de una PR. Tampoco asumir que la ejecución en CI reproduce las condiciones de la red SMB, el antivirus o la instalación de Excel/Outlook de los puestos.

## Límites

Las pruebas de CI no sustituyen la verificación en los equipos reales, ni la simulación de desconexión cable/Wi-Fi o el trabajo simultáneo contra la misma base SQLite compartida.

Véanse también [auditoría y resultados](TEST_AUDIT.md) e [inventario por archivo](TEST_INVENTORY.md).
