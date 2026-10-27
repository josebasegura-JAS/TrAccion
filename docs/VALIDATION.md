# Validación integral de TrAcción

La única batería automática de PR es **TrAcción — Validación integral**, con el
check **Validación integral**. No se dispara también por push. Un nuevo commit
cancela la ejecución anterior de esa PR. No hay reintentos automáticos que
conviertan un fallo intermitente en verde ni errores tolerados.

## Ejecución local

Usar Node de `.nvmrc` (22.13.1), Python 3.11 y herramientas nativas necesarias
para better-sqlite3. Windows es la plataforma obligatoria de CI y distribución.

```sh
npm ci --include=dev
npm run playwright:install -- chromium
npm run validate
```

`validate` ejecuta tipos de pruebas (incluido E2E), ESLint sin advertencias,
Vitest completo con cobertura, build de producción (incluye TypeScript de app
+ Electron), interfaz web, reconstrucción SQLite para Electron y todos los
specs Electron. `test:all` es un alias. No ejecuta bump ni genera distribuciones.

Para ejecutar solamente la parte Node/build:

```sh
npm run validate:node
```

Después de ejecutar Electron, antes de volver a Vitest:

```sh
npm rebuild better-sqlite3
npm run test
```

`electron:rebuild` fuerza el ABI Electron: la detección incremental del antiguo
`electron-builder install-app-deps` no bastaba tras reconstruir para Node. Se
usa @electron/rebuild como dependencia explícita, fijada en el lockfile.
No compartir node_modules entre sistemas o runtimes.

En Linux, Electron necesita un servidor X. En un contenedor sin sandbox SUID
configurable puede usarse `TRACCION_E2E_NO_SANDBOX=1` **solo para el proceso de
pruebas**. No cambia el ejecutable distribuido. Si se usa Chromium del sistema,
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e` evita
una descarga, pero no acredita el Chromium fijado por Playwright en Windows.

## Evidencia y cobertura

Vitest genera `audit-results/vitest.json`, `coverage/coverage-summary.json`,
`coverage/coverage-final.json` e informe HTML. Se incluyen módulos no importados
por los tests; se excluyen tests, declaraciones de tipos y fixtures/setup de
`src/test`. El suelo global inicial procede de la referencia medida: líneas
40 %, funciones 49 %, ramas 70 %, statements 40 %. No equivale a cobertura
suficiente de comportamientos críticos. Subirlo exige métricas comparables y
nuevas pruebas, no excluir código del denominador.

Los informes Playwright se separan en `playwright-report-web` y
`playwright-report-electron`; trazas/resultados viven en `test-results`.
La acción local `.github/actions/validate/action.yml` registra cada fase y SHA
local en el resumen de Actions y conserva informes incluso al fallar.

## Distribución y commit exacto

Se conservan las tres entradas manuales EXE, EXE Lite y ZIP. Lite comparte todas
las garantías de calidad. EXE es además el workflow reutilizable llamado por
Lite y ZIP. Todos se serializan en el grupo `traccion-distribucion`; no se
cancela una ejecución activa. GitHub puede reemplazar una ejecución pendiente
por otra nueva en ese grupo; no es una cola FIFO de todas las solicitudes.

Desde main, se incrementa el contador y se crea **localmente** el commit final.
A continuación se ejecuta la misma acción de calidad, se empaqueta ese árbol y
se comprueba que ningún archivo rastreado cambió. Solo después se intenta
publicar el mismo SHA en main mediante push fast-forward, sin pull/rebase.
Si main avanzó o la política de protección rechaza al bot, falla antes de
subir el paquete. No se altera la política de protección para permitirlo.
`validated-commit.txt` acompaña al artefacto; `.piz`, `version.json` y nombres
MAJOR.MINOR mantienen su formato y SHA-256 actuales. No se reutilizan checks de
otro SHA ni se consultan ejecuciones independientes.

No lanzar workflows de distribución para validar una PR: además de generar
paquetes, actualizan el contador en main. La revisión estática con actionlint
no sustituye una prueba real del empaquetado Windows.

## Protección de main y límites

Exigir el check **Validación integral**, PR actualizada y ausencia de bypass es
una tarea del administrador. La API de protección clásica respondió 403; la
consulta de rulesets accesibles devolvió cero. Eso no prueba ausencia de reglas
clásicas o de organización. No se han modificado reglas remotas. Si la política
requiere PR también para el contador, el distribuidor fallará de forma segura;
se necesitará diseñar esa PR de versión antes de publicar.

SMB real, cable/Wi-Fi, Excel/Outlook instalados, antivirus y actualizaciones
entre versiones necesitan comprobaciones de integración en su infraestructura.
Los mocks de red y SQLite local no acreditan esos entornos.

Véanse [auditoría y resultados](TEST_AUDIT.md) e
[inventario por archivo](TEST_INVENTORY.md).
