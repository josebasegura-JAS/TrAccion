# Rendimiento CI

Baseline PR-D #551, ejecución 45565485781 (Windows, 25/11/2026):
- Vitest: 291 archivos, 1877 pruebas correctas, 234.54 s de ejecución, job ~346 s.
- Calidad: ~164 s, typecheck ~24 s, lint ~16 s, build ~38 s.
- Web: ~115 s, 1 prueba (8.6 s).
- Electron: ~218 s, 10 pruebas (~86 s).
- Trabajos paralelos: camino crítico Vitest. Los tiempos no se suman.

## E1
- Preparación de esquema vacío en una transacción para fixtures seleccionados; cada caso conserva su propio archivo, conexiones nativas y lógica de producción bajo prueba. No alterar tests de migración, apertura, durabilidad ni estrés multiproceso.
- Evitar descargar el binario Electron en lanes que no ejecutan Electron. Mantener npm ci, scripts de instalación y ABI SQLite.
- Cache Chromium por plataforma y lockfile, mantener playwright install para comprobar disponibilidad.
- Iteración local: npm run test:focused -- electron/appUpdate.test.ts (o archivo afectado). No sustituye validación integral.
- Comparar el informe de tiempos y los cuatro jobs con baseline, mantener todas las pruebas y umbrales. El helper exclusivo de fixtures no forma parte de la cobertura de producción.

## E2, si aporta valor tras medir E1
- Comparar 3/4 workers con mismo runner; no cambiar sin evidencia.
- Revisar arranques Electron y compilaciones redundantes sin reducir escenarios.
- Mantener ABI Node/Electron separados, no compartir node_modules ni desactivar fsync de las pruebas de durabilidad.

## Resultado E1 (#552, ejecución 45566475047)
- Vitest 161.90 s (-31%), job 268 s (-22%), 291 archivos y 1877 pruebas correctas.
- Calidad 157 s, web 134 s (primera creación de caché), Electron 179 s (10 pruebas). Variación de runner; no atribuir causalidad a E1 en esos jobs.
- Caracterización SQLite 78.77 -> 7.14 s; multiusuario 66.53 -> 1.39 s; integridad 37.14 -> 1.33 s; identidad 32.38 -> 0.80 s.

## E2: ensayo controlado
- CI ejecuta la misma suite con cuatro workers, el comando local conserva tres.
- npm ci prefiere caché, conserva lockfile, scripts nativos, reintentos y salida completa; la salida se muestra al terminar cada intento para evitar Tee por línea.
- Semilla de base ficticia de producción en prueba de aislamiento preparada en una transacción; primer arranque desde cero permanece intacto.
- No cambiar workers de Electron, arranque, fsync ni stress multiproceso sin evidencia. No eliminar compilación duplicada entre jobs independientes si compromete la validación autónoma.
- Comparar contra E1 y baseline D; revertir cuatro workers si la ejecución completa empeora o aparecen fallos de recursos/concurrencia.
