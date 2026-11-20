# Incidente 2026-11-20 · SQLITE_BUSY y bloqueos del proceso principal

## Evidencia
- Logs aportados: 1.083 fallos del health-check en etapa `esquema` desde
  2026-11-19 23:21 UTC hasta 2026-11-20 08:21 UTC (00:21–09:21 CET).
- Duración típica de cada intento: ~22 segundos. Watchdog: 388 eventos
  `stalled` y 389 `recovered` en el tramo conservado; no significa recuperación
  de SQLite, sino que el proceso principal volvió a responder.
- `SQLITE_BUSY`, `recoveryRequired=false`, `queuedOperations=0`. El usuario
  confirmó cierre manual tras quedar la app bloqueada y ausencia de otra
  instancia abierta. Ninguno de estos datos identifica al titular del lock.

## Ruta de ejecución
`database:health-check` -> `enqueueSqliteIpc` -> `checkSqliteHealth` ->
`readCurrentSchemaVersion`. La fase `consulta` ejecuta `SELECT 1`,
que no consulta el archivo real; la fase `esquema` sí consulta
`sqlite_master`. La conexión compartida llevaba `busy_timeout=15000`, de
modo que un SQLITE_BUSY síncrono bloqueaba el proceso Electron repetidamente.

La cola IPC únicamente serializa operaciones que entran por ella.
Las copias periódicas utilizan además una cola propia y un lock local por
ruta: es un origen POSIBLE de contención, no demostrado por los dos logs.

## Medidas de esta PR
1. Solo en el health-check de SQLite, aplicar un busy_timeout de 750 ms
   durante las consultas síncronas de schema e identidad y restaurar el
   timeout original incluso si fallan.
2. Tras tres comprobaciones consecutivas que fallan por SQLITE_BUSY/LOCKED,
   mostrar el estado como bloqueado e impedir nuevas operaciones generales
   sobre esa conexión hasta comprobarla satisfactoriamente.
3. Mientras continúa la contención, limitar las comprobaciones costosas a
   una cada 90 s. Una verificación satisfactoria reactiva el funcionamiento.
4. No cerrar/reabrir automáticamente, no modificar locks, backups,
   transacciones, journal, ni reiniciar escrituras cuyo resultado sea incierto.

## Pruebas
- Vitest: conexión SQLite real bloqueada con BEGIN EXCLUSIVE, timeout acotado
  y restauración del PRAGMA; política de tres fallos y enfriamiento.
- CI: `npm run typecheck`, `npm run typecheck:tests`, `npm run lint`,
  `npm test`. Verificación manual en una copia de ensayo SMB Windows:
  bloqueo controlado, interfaz usable y recuperación al liberar el lock.
- Limitación: un bloqueo nativo del sistema de archivos/SMB que no respete
  `busy_timeout` aún podría congelar el hilo principal. El aislamiento de
  SQLite en utilityProcess sería la solución estructural y requiere una
  intervención separada. No ejecutar pruebas destructivas sobre producción.
