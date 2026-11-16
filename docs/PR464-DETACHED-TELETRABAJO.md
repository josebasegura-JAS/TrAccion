# PR464 — Teletrabajo masivo en utilityProcess (preparado, NO productivo)

## Cambios
- Adaptador de lote sobre el **mismo núcleo SQL** de PR463, migración legacy mediante `maybeMigrateJsonArrayRecordsFromPersistedRecord` dentro de la transacción y OCC por solicitud.
- Validación estricta: ownerId no vacío, 1–1000 registros, ID único, `value` y `expectedUpdatedAt` válidos.
- Mensajes `detached:save-teletrabajo-batch` y `detached:teletrabajo-batch-saved`; procesado serial FIFO en child, runner y bridge sin uso desde IPC de producción.
- Conflictos devuelven `failedRecordId` y un resultado sin commit; errores SQL no se reintentan automáticamente. Confirmación de resultado solo tras `exit(0)`.
- Se invalida el flag en memoria `teletrabajoMigrationDone` al abortar una transacción masiva. Antes de esta corrección, un rollback podía dejar el flag en true y causar que se saltase una migración todavía pendiente en la siguiente carga.

## Pruebas
SQLite real: lote + token, conflicto en segunda solicitud, migración legacy y conflicto con rollback, fallo SQL con rollback de migración, protocolos inválidos y secuencia `ready/open/save/close/exit` con proceso hijo.

## Bloqueantes
No conectado al main/IPC productivo. No existe todavía propiedad exclusiva SQLite transferida de manera general ni lock distribuido renovado por el child. La ruta de carga main de Teletrabajo puede realizar migraciones con escrituras. Antes del handoff hay que cerrar **todas** las rutas de escritura en main y coordinar backups, importaciones, reconexión, y estados inciertos.

## Siguientes pasos
Presupuestos, revisión integral de rutas restantes, coordinador propietario único/SMB/heartbeat, pruebas de desconexión y ensayo controlado Windows.
