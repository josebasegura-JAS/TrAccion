# Aislamiento por defecto del health-check SQLite · 13/11/2026

## Evidencia de campo
Archivos aportados: `electron-main-watchdog(4).jsonl` (180 entradas: 92 stalled y 88 recovered) y `sqlite-recovery-diagnostics(3).jsonl` (94 eventos). Estos ficheros son muestras históricas acumuladas, no una medición de la nueva versión.

El 13/11/2026 entre 11:42 y 11:46 UTC, las verificaciones rutinarias de salud fallaron repetidamente en la fase `esquema` con `SQLITE_BUSY`, incluidas duraciones alrededor de 21 segundos y una cercana a 31 segundos. Watchdog registra paradas y recuperaciones del hilo principal con `database:health-check` como operación activa o recién completada. La correlación temporal es fuerte, pero no demuestra una causa única de todas las paradas.

## Cambio de comportamiento real
`checkSqliteHealth()` ejecuta **por defecto** `verifySqliteHealthInUtilityProcess` para `SELECT 1`, revisión de versión de esquema e identidad de la base, reutilizando el worker readonly ya probado anteriormente. El proceso principal continúa realizando la comprobación de fichero mediante `stat` asíncrono y decide si levantar el bloqueo de escrituras después de obtener resultado confirmado y salida de worker. No se cambia el esquema, el contenido SQLite, el lock SMB, backups ni las escrituras de ningún repositorio.

El código anterior permanece accesible solo cuando se fija `TRACCION_SQLITE_ISOLATED_HEALTH=0` para diagnóstico controlado. No hay fallback automático a la consulta nativa en main si falla el worker: se devuelve fallo de salud y se conserva la protección.

## Qué NO resuelve
- `recoverDatabaseAfterIoError()` todavía tiene pasos de cierre, reapertura y validación que pueden ejecutar E/S nativa en main; **no se cambia su protocolo** en esta intervención.
- `database:get-persisted-records-token` y otras rutas siguen necesitando comprobación de latencia y traslado selectivo.
- Los escritores de producción permanecen en main. El proceso escritor de PR #440/#441 continúa desconectado de los guardados reales para evitar dos propietarios sin cesión exclusiva.
- El aislamiento reduce exposición del event loop a la consulta de salud; **no garantiza** ausencia total de bloqueos ni reconexión instantánea.

## Validación
1. CI TypeScript Electron/tests, ESLint, Vitest.
2. Comparar nuevos registros de watchdog y recuperación con los del 13/11/2026, prestando atención a `database:health-check` y a `SQLITE_BUSY`.
3. Probar en Windows dos usuarios y una caída de red, revisando que no se levanten bloqueos de escritura si un worker queda incierto.
4. Si hay bloqueo posterior, registrar exactamente la etapa (archivo, recuperación o invocación de worker) antes de cambiar más código.

## Siguiente intervención de la misma entrega de migración
Tras esta medida de protección basada en evidencia, el siguiente objetivo principal sigue siendo un **único propietario de todas las escrituras SQLite**, con migración de repositorios y locks SMB al proceso auxiliar; no se abrirá una hoja de ruta nueva por cada mecanismo. La recuperación en main y el token de sincronización son riesgos residuales identificados.
