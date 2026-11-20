# Diseño previo PR525/PR526 · Exclusión SQLite sobre SMB

Estado: **propuesta para revisión; no es protocolo implementado ni validado en SMB real**. Referencia: incidente del 19–20/11/2026. Esta PR **solo añade documentación**.

## 1. Hallazgos verificados en main

- `electron/persistence/databaseLockManager.ts`: `writeLock` hace `mkdir(lockPath)` y después `writeFile(owner.json)` sin `wx` ni limpieza acotada ante fallo. Un error entre ambas operaciones puede dejar el directorio vacío (H1); la escritura tardía puede actuar sobre un directorio recreado por otro cliente (H4).
- `heartbeatDatabaseLock` lee `owner.json`, comprueba solo `ownerId` y vuelve a escribir la ruta. Una renovación tardía puede alterar un `owner.json` sustituido. **Releer tras escribir no evita la carrera**, solo puede detectarla después (H5).
- `releaseLock` y `removeStaleLock` renombran `owner.json` a archivos `owner.json.release-*` / `owner.json.reclaim-*`. Si la operación se corta, esos archivos impiden el `rmdir` de recuperación de directorios vacíos de la PR524 (H2). No deben borrarse solo por su antigüedad.
- `reclaimEmptyOwnerlessLockDirectory`: observa un directorio vacío al menos 5 s y usa `rmdir`. Es más seguro que borrar recursivamente, pero no identifica si un `mkdir` ajeno sigue pendiente de escritura. No demuestra exclusión frente a retrasos arbitrarios de SMB.
- `isLockStale`: observa inmovilidad del `updatedAt` durante >30 s con reloj monotónico del observador; **caducidad observada no equivale a muerte del titular**.
- `safeDatabaseOperation` pasa por `withDatabaseOperationLock`, pero las operaciones IPC de solo lectura se omiten del bloqueo externo. `saveTaskRecordsAtomically` abre su propia conexión SQLite y utiliza otro adaptador del gestor de bloqueo; comprobar también backups, mantenimiento y todas las vías de escritura.
- `openSqliteDatabase` usa `journal_mode=DELETE`, `synchronous=NORMAL` y `better-sqlite3` síncrono. Las transacciones SQLite y el control optimista son salvaguardas independientes, **no prueban que todos los caminos estén protegidos**.
- Las PR522–524 mejoran disponibilidad/diagnóstico, pero **no prueban** que la causa original de los `SQLITE_BUSY` persistentes esté resuelta.

## 2. Garantías y límites que debemos declarar

**Objetivo de seguridad**: una operación de escritura que ya conoce la pérdida de su reserva no debe empezar ni continuar; ante estado incierto, bloquear escrituras nuevas, mantener los archivos no verificables y registrar la incidencia. SQLite debe continuar siendo la barrera transaccional de integridad. El bloqueo externo coordina y reduce contención, pero **no es una exclusión distribuida infalible** cuando hay pausas indefinidas, retrasos SMB o pérdida de sesión.

**No afirmar**: (a) que dos titulares nunca pueden confirmar simultáneamente con TTL; (b) que una comprobación inmediatamente anterior al `COMMIT` impide toda carrera; (c) que `wx`, `rename` o una prueba de 500 iteraciones prueban seguridad en cualquier servidor SMB; (d) que `expectedUpdatedAt` cubre todas las tablas y operaciones.

**Disponibilidad**: un bloqueo de estado ambiguo debe producir un fallo explícito y recuperable por una persona, sin dejar una pantalla de carga infinita ni ejecutar reintentos permanentes que congelen el proceso principal.

## 3. Máquina de estados propuesta para revisión

| Estado | Entrada / transición | Invariante / tratamiento |
| --- | --- | --- |
| `LIBRE` | No existe el directorio; confirmación fiable | Solo desde aquí se intenta adquirir. Error de SMB ≠ ausencia. |
| `CREANDO` | `mkdir` exclusivo completado, pendiente de metadatos | **No ejecutar operación exclusiva**; error de escritura => cierre seguro solo de objetos inequívocamente propios. Un observador remoto no debe recuperar el directorio si puede haber un creador vivo. |
| `ADQUIRIDO` | Identidad única de adquisición escrita y confirmada | Distinguir `ownerId` estable de `leaseId` único por adquisición. Nunca aceptar solo `ownerId` para confirmar titularidad. |
| `RENOVANDO` | Heartbeat de esa adquisición | Renovación no debe sobrescribir la identidad de otra adquisición. Falla/propiedad dudosa => `INCIERTO`. |
| `OPERANDO` | Entrada de callback exclusivo desde `ADQUIRIDO` | Operación serializada; SQLite conserva transacciones y defensas propias. Si se pierde propiedad antes de escritura, abortar; si el proceso está congelado durante un commit, una comprobación JS no aporta seguridad. |
| `LIBERANDO` | Operación terminó y comienza liberación | Verificar identidad completa y evitar borrar propiedad ajena; si falla, pasar a `INCIERTO`, no forzar. |
| `INCIERTO` | Error SMB, pérdida de heartbeat, dueño ausente o cuarentena no verificable | Fail closed; mostrar aviso accionable y diagnósticos. Sin recuperación destructiva automática. |
| `RECUPERABLE_VALIDADO` | Protocolo de recuperación probado en SMB y evidencia suficiente de exclusión | Reservado para un futuro diseño; no habilitar borrados de cuarentenas en PR526. |

Transiciones prohibidas: `CREANDO→OPERANDO` sin confirmación; `INCIERTO→ADQUIRIDO` por simple timeout; `LIBERANDO→LIBRE` tras un error; cualquier limpieza que borre un fichero no identificado como propio.

### Formato de lease propuesto (NO implementado)

Identidad: `owner.json` inmutable con `leaseId` UUID aleatorio por adquisición, `ownerId`, PID y fecha de creación. Renovación: fichero separado asociado a **ese leaseId** (nombre/estructura y estrategia de publicación sujetos a prueba). **Advertencia**: escribir un heartbeat separado en un directorio recreado también puede contaminar una adquisición ajena; no es aceptable que ese fichero por sí solo prolongue el TTL del propietario actual.

Compatibilidad: definir lectura de los propietarios legados (`owner.json` mutable sin `leaseId`) y protocolo de migración con clientes antiguos antes de activar la nueva escritura. **Bloqueante**: nunca desplegar un protocolo incompatible mientras un cliente antiguo siga escribiendo en la misma base. El actualizador portable y su `version.json` deben poder forzar actualización si se decide un cambio de protocolo.

## 4. Inventario obligatorio antes de escribir PR525

Auditar y clasificar cada ruta de acceso por **solo lectura**, **escritura transaccional**, **escritura no transaccional**, **mantenimiento**, **backup** y **restauración**. Registrar ruta de entrada IPC, función de persistencia, conexión SQLite utilizada, mutex local, adquisición de `.lockdir`, límite de transacción y forma de respuesta al usuario.

Puntos de partida confirmados:
- `electron/sqlitePersistence.ts`: `safeDatabaseOperation`, `safeDatabaseMigrationOperation`, transacciones de comité/paritaria/actas/coordinación, `activateDatabase`, `closeSqlitePersistence`.
- `electron/persistence/taskBatchPersistence.ts`: `saveTaskRecordsAtomically` abre conexión propia y ejecuta `saveTaskRecordsInTransaction`.
- `electron/persistence/databaseActivation.ts`: apertura inicial y locks de arranque.
- `electron/persistence/localBackupService.ts`, `localBackups.ts`, `emergencyDatabaseBackup.ts`, `vacuumMaintenance.ts`, `databaseLockRecovery.ts`.
- `electron/ipc/` y repositorios directos: verificar que ninguno se salta los límites esperados por el guard.

**Pendiente**: este documento identifica los principales lugares, **no certifica una enumeración exhaustiva** de todos los call sites. El inventario detallado es criterio de entrada para la implementación.

## 5. Decisiones para PR525 (no implementar sin revisar riesgos)

1. Bloquear sobrescritura de `owner.json` por adquirentes tardíos. Validar `wx` y comportamiento al caer `writeFile` tras `mkdir`, sin limpiar información ajena.
2. Evitar heartbeats que reescriban `owner.json` de otra adquisición. Evaluar identidad inmutable + renovación por lease y su compatibilidad con clientes antiguos, preferiblemente tras ensayo SMB.
3. Introducir diagnóstico local acotado por rotación: `acquire-start/success/failure`, `renew-success/failure`, `release-success/failure`, `owner-mismatch`, `owner-metadata-missing`, cuarentena. Datos: fecha ISO, `leaseId` opaco, transición, duración, código de error; sin ruta UNC, hostname, username ni registros de negocio. Evitar logs en cada heartbeat sano si hay ruido.
4. A la mínima propiedad ambigua, impedir nuevas escrituras. Examinar operaciones ya iniciadas y transacciones síncronas: no prometer cancelación de una llamada nativa que no puede interrumpirse.
5. **No introducir** en la misma PR borrado automático de cuarentenas, `rename` de directorios como nuevo árbitro, cambio de `busy_timeout` global ni migración estructural a `utilityProcess`.

## 6. Decisiones para PR526

- Detectar directorio sin `owner.json` pero con `owner.json.release-*` / `owner.json.reclaim-*`, así como contenido inesperado; distinguirlo de directorio verdaderamente vacío.
- Abortar reintentos prolongados para el mismo estado estable, indicar carpeta y tipo de bloqueo en UI y ofrecer instrucciones para administración **solo con todas las instancias cerradas y el servidor verificado**.
- No borrar ningún archivo por edad. No dar por segura una recuperación automática basada solo en dos observaciones o un TTL.

## 7. Pruebas y gates

| Prueba | Entorno | Criterio |
| --- | --- | --- |
| Fallo entre `mkdir` y `owner.json` | Unitario con inyección | Nunca informar adquisición; limpieza solo si se demuestra propia. |
| Escritura A retrasada; B recupera y recrea directorio | Unitario con E/S controlada | No aceptar doble propietario, ninguna limpieza ajena. |
| Heartbeat retrasado de lease A al aparecer lease B | Unitario + integración | A no modifica la identidad de B; la pérdida de titularidad suspende futuras escrituras. |
| Cuarentena `release-*` / `reclaim-*` | Integración | Diagnóstico claro; ningún borrado automático. |
| Dos procesos compiten por la misma carpeta | Windows y SMB real | Detectar cualquier solape de operaciones críticas; 0 solapes observados, no equivalentes a prueba matemática. |
| Red cortada durante creación / operación / liberación | Dos equipos + SMB ensayo | Estado incierto bloquea nuevas escrituras; no existen resultados confirmados no persistidos. |
| Equipo con versión antigua durante transición | Ensayo controlado | No debe poder usar un protocolo incompatible para escribir en la misma base. |
| `SQLITE_BUSY` persistente | Ensayo separado | No confundir lock SQLite con `.lockdir`; recopilar `Get-SmbOpenFile`/`Get-SmbSession` y logs del otro cliente antes de cerrar. |

**Gates**: revisión de inventario, TypeScript, Vitest, e2e Electron y al menos dos clientes Windows contra **SQLite de ensayo independiente** sobre SMB. Sin ensayos SMB reales, las PR pueden fusionarse para evaluación si se decide, pero **no se deben desplegar como garantía de producción**.

## 8. Cuestiones abiertas

- ¿Qué archivo de heartbeat y qué operación de escritura/renovación evita de verdad modificar el lease ajeno bajo `rename/rmdir/recreate`?
- ¿Qué mecanismo impide que una versión antigua siga usando el protocolo viejo durante el despliegue?
- ¿Qué rutas de escritura carecen de protección o de transacción SQLite real?
- ¿Cómo instrumentar el servidor SMB (sesiones, handles) en la siguiente incidencia sin comprometer información personal?
- ¿Es viable detener una escritura en curso si el hilo principal queda bloqueado dentro de `better-sqlite3`? **No asumir que sí**.

## 9. Resultado de esta fase

Esta fase entrega una base de diseño y criterios de aceptación **sin cambiar código de producción**. El siguiente trabajo debe cerrar el inventario y decidir la compatibilidad/garantías del nuevo lease **antes** de implementar PR525.
