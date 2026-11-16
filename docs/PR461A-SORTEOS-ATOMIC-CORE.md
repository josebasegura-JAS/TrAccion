# PR461A — Extracción atómica de Sorteos y Exclusiones

## Cambios
- `saveSorteosTransaction(db, snapshot, status, migrateLegacy, updateRefreshMetadata)` concentra exactamente la transacción productiva de guardado de las dos tablas: `sorteos_draw_records` y `sorteos_exclusion_records`.
- Ambas revisiones OCC se comprueban dentro de la transacción SQLite, no desde una instantánea de UI obsoleta. Una sola revisión desactualizada impide cualquier cambio en las dos colecciones.
- Se conservan `INSERT ... ON CONFLICT`, el borrado lógico y la marca de sincronización dentro de la misma transacción.
- La migración legacy se inyecta y también se ejecuta dentro de la misma transacción, tal como ocurría anteriormente.
- El repositorio productivo sigue conservando `safeDatabaseOperation`, comprobaciones de estado/heartbeat y escritura permitida, y `enqueueLocalBackup` solo tras resultado correcto.

## Pruebas
SQLite real: éxito de dos colecciones y token; conflicto separado en sorteos o exclusiones; borrado lógico; fallo SQL en exclusiones que revierte sorteos; fallo del token que revierte incluso una migración legacy realizada dentro de la transacción.

## Por qué esta fase no añade todavía el utilityProcess
El mismo repositorio ejecuta la migración legacy en `loadSorteosRecordsSnapshot()`: **una operación de carga con efectos de escritura**. No sería seguro conectar el escritor auxiliar y pasarle una migración diferente, ni suponer que todas las lecturas actuales son read-only. La fase PR461B debe aislar esa migración compartida y crear un adaptador/protocolo de worker con validación, gestión de propietario, cierre y `exit(0)`, todavía sin activación productiva.

El bloqueo general por cesión exclusiva, lock SMB, heartbeat, recuperación y backups se mantiene. La transacción extraída no es un sustituto del bloqueo distribuido.

## Próximos pasos
PR461B Sorteos en proceso auxiliar; Teletrabajo masivo; Presupuestos de cuatro tablas; inventario de migraciones/escritores en cargas y mantenimiento; handoff seguro y pruebas Windows con cortes de red.
