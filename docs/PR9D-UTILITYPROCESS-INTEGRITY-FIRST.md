# PR9D · Primera migración real a utilityProcess: comprobación SQLite read-only

## Contexto

PR9C añadió el canal experimental de proceso auxiliar. PR9D aísla una **operación real** que hoy puede bloquear el event loop de Electron: `verifySqliteIntegrityReadOnly`, ejecutada durante la recuperación cuando un error de E/S sugiere posible corrupción. Incluye `PRAGMA quick_check`, lectura del esquema y comparación de identidad.

## Cambio concreto

- `sqlitePersistence.ts`: en `recoverDatabaseAfterIoError()`, después de `closeDatabase()`, llama a `await verifySqliteIntegrityInUtilityProcess(...)` en vez de ejecutar el preflight nativo sincrónico en main.
- `sqliteIntegrityWorkerBridge.ts`: instancia un `utilityProcess` por preflight, en el equipo local. La ruta y los valores de identidad solo viajan en memoria hacia el hijo.
- `sqliteIntegrityWorker.ts`: abre SQLite **readonly, fileMustExist**, ejecuta `quick_check` y valida identidad mediante el mismo módulo ya probado; no realiza escrituras ni cambios de esquema.
- `sqliteIntegrityWorkerProtocol.ts`: admite exclusivamente `integrity:verify` y `integrity:shutdown`; las respuestas son `ready`, `verified` o `rejected`, sin volcar rutas/SQL/errores nativos.
- `sqliteIntegrityWorkerRunner.ts`: espera el handshake `ready`, correlaciona la única petición, solicita cierre tras obtener resultado y **solo devuelve éxito al observar `exit(0)`**. Ante timeout (20 s), solicita `kill()`, pero no permite reapertura hasta observar `exit`. Un fallo o salida inesperada bloquea la recuperación, como antes.
- Tests de protocolo, respuesta positiva, rechazo, timeout con salida pendiente y exit prematuro.

## Invariantes de seguridad

1. El preflight solo ocurre tras cerrar el handle principal y dentro de `enqueueSqliteIpc('database:health-check', ...)`, que impide la coexistencia con una operación previa indeterminada.
2. Ninguna transacción de escritura se envía al proceso auxiliar; no se retransmite ni se reintenta ninguna escritura.
3. Un `quick_check` positivo **no basta** para desbloquear: la identidad debe coincidir y la recuperación normal debe reabrir y comparar de nuevo.
4. No se crea un segundo proceso mientras uno anterior no haya confirmado su salida; el runner es de un solo uso.
5. Ante falta de respuesta de la verificación readonly, si `kill()` no logra una salida confirmada, se conserva el estado bloqueado (fail closed).
6. No cambian el protocolo de locks SMB, los propietarios, TTL, heartbeat, el formato SQLite, backups, ni `synchronous`.
7. Los diagnósticos siguen sin incluir la ruta UNC ni registros de trabajadores.

## Lo que NO migra todavía

- La conexión SQLite principal, la totalidad de lecturas/escrituras y `safeDatabaseOperation`.
- `activateSqliteDatabase` (migraciones y limpieza controlada de `editing_locks`), `closeDatabase`, `database:health-check` en su fase SELECT/schema/identity y otros repositorios.
- Backups, tareas, Comité, Paritaria, teletrabajo y demás IPC de los módulos.

**Por tanto, esta PR reduce una vía de bloqueo en Electron pero NO resuelve todas las congelaciones durante SMB.** La migración completa del motor y el lock manager requiere siguientes PRs con un plan de propiedad exclusiva de la conexión y serialización de operaciones.

## Validación antes de desplegar

- TypeScript, ESLint y Vitest CI.
- En un entorno de ensayo respaldado, forzar un error compatible con corrupción y verificar `quick_check`, `exit` y rechazo seguro si falla la identidad. No provocar corrupción real de datos de trabajo.
- Verificar arranque normal, lectura/escritura de Tareas, Comité y Paritaria y shutdown sin cambio de comportamiento.
- Las pruebas de desconexión Ethernet/Wi-Fi de producción no prueban esta ruta salvo que realmente se active `sqliteSuspectedCorruption`; correlacionar `sqlite-recovery-diagnostics.jsonl` y watchdog en la misma sesión.
