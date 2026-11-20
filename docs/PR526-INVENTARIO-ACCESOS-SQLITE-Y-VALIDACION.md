# PR526 · Inventario inicial de accesos SQLite y límites de exclusión

Fecha: 20/11/2026. Estado: revisión de rutas principales de `main`, **no inventario exhaustivo certificado**. Este documento distingue comprobaciones de código y pruebas aún pendientes.

| Ruta | Operación encontrada | Protección observada | Riesgo o tarea pendiente |
| --- | --- | --- | --- |
| `electron/sqlitePersistence.ts` → `safeDatabaseOperation` | Lecturas y escrituras ordinarias | `withDatabaseOperationLock`; omite lock externo si el contexto IPC es `readOnly` | Verificar clasificación correcta de todos los IPC, especialmente los que migran al leer. |
| `electron/sqlitePersistence.ts` → `safeDatabaseMigrationOperation` | Migraciones durante lectura | Fuerza contexto IPC a escritura antes de llamar a `safeDatabaseOperation` | Revisar call sites y efectos de migración encubiertos. |
| `electron/sqlitePersistence.ts` → `closeSessionWorkflowAtomically`, importaciones y cierre de coordinación | Escritura de varias tablas con `db.transaction` | Pasan por `safeDatabaseOperation` en el mismo proceso | Comprobar que no exista ningún IPC que se declare lectura e invoque estos métodos. |
| `electron/persistence/taskBatchPersistence.ts` → `saveTaskRecordsAtomically` | Lote de tareas con `saveTaskRecordsInTransaction` | Gestor de bloqueo propio que utiliza el mismo mapa y cola local, nueva conexión `openSqliteDatabase` y transacción SQLite | Verificar interacciones con cliente antiguo y ausencia de bypass vía otros módulos. |
| `electron/persistence/databaseActivation.ts` | Migraciones, identidad, eliminación de edición propia en arranque | `acquireStartupLock`, heartbeat temporal y liberación en `finally` lógico | Si el heartbeat falla mientras `openSqliteDatabase` bloquea el hilo, la operación síncrona no se cancela; validar en SMB real. |
| `electron/persistence/localBackupService.ts` | Copias JSON/SQLite y marcador compartido | `withDatabaseOperationLock` y `acquireLock` anidado/reentrante en rutas de backup observadas | Auditar todos los tipos de backup, restauración y cierres bajo fallos SMB. |
| `electron/persistence/vacuumMaintenance.ts` | `VACUUM`, `ANALYZE` y metadatos | Control invocado desde fachada `sqlitePersistence.ts` | Confirmar guardas desde todos los puntos de entrada. |
| `electron/persistence/databaseLockRecovery.ts` | Liberación administrativa del lock | Rename a cuarentena, lectura de identidad, `wx` en restauración, `rmdir` | La antigüedad no demuestra inactividad; no automatizar borrados. |
| `electron/persistence/localBackups.ts` y `emergencyDatabaseBackup.ts` | Copias de ficheros SQLite y purgado de backups | No son transacciones SQLite; la seguridad depende de los call sites | Verificar que no se copie un archivo SQLite vivo sin snapshot consistente y guardas de operaciones. |

## Hallazgos a validar antes de la implantación

1. El protocolo actual de `owner.json` es mutable. PR526 evita *por ruta* dos carreras concretas: adquirente tardío (`wx`) y heartbeat con archivo renombrado (handle original). No convierte el TTL en un lease distribuido perfecto.
2. Se conserva el formato del propietario para no introducir incompatibilidad inmediata con versiones antiguas. Sin embargo, **clientes antiguos todavía pueden escribir con el comportamiento previo**: el despliegue multiusuario debe coordinarse.
3. La adquisición fallida tras `mkdir` queda en estado incierto sin borrado automático inmediato. La PR524 puede retirar un directorio realmente vacío tras observación; esto **no demuestra que un escritor SMB esté muerto**.
4. `better-sqlite3` es síncrono: ninguna protección asíncrona exterior puede interrumpir una instrucción SQLite ya ejecutándose en el hilo principal.
5. La escritura sobre un handle abierto mantiene la identidad del objeto de archivo; **Windows/SMB puede denegar un rename mientras ese handle está abierto**. Es un comportamiento a comprobar antes del despliegue, no un test superado.

## Condiciones de cierre

- TypeScript, Vitest y Electron CI verde en GitHub.
- Prueba T2: escritor A retrasado y directorio recreado por B; B conserva su propietario.
- Prueba T5: archivo abierto por A, rename realizado o rechazado por servidor SMB; ninguna identidad ajena sobrescrita.
- Dos clientes Windows sobre base **de ensayo** SMB; registrar operaciones solapadas, pérdida de red, resultados inciertos y tiempos.
- Completar inventario exacto de todos los handlers IPC mediante búsqueda del repositorio y comprobar los call sites de backups y restauraciones. Este documento **no da por cerrado** ese punto.
- No usar PR526 para declarar resuelto el episodio `SQLITE_BUSY` que duró horas: requiere investigación del titular del bloqueo SQLite y sesiones SMB.

## Despliegue seguro

Mantener versiones antiguas fuera de la base compartida cuando se pruebe el nuevo protocolo. Primero probar ejecutables y actualizador en un entorno aislado. No intervenir manualmente sobre `traccion.sqlite`, `-journal` ni cuarentenas de producción.
