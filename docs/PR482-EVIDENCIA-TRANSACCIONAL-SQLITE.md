# PR482 — Recibo de commit transaccional, verificable tras EXIT del worker

## Qué garantiza esta fase (solo ruta experimental)
- Nueva tabla `detached_writer_commit_receipts` con `operation_id` único, generación, UUID de SQLite y fecha de confirmación.
- `saveWithDetachedCommitReceipt` envuelve **una operación síncrona** en la misma transacción SQLite que el recibo. Cualquier error SQL, conflicto OCC o duplicación de ID impide la confirmación; en conflicto se revierte toda la operación.
- Primera ruta cubierta: Criterios RRLL mediante la petición optativa `detached:save-criteria-receipted`. La ruta antigua mantiene compatibilidad y aún no produce recibos.
- `verifyDetachedSqliteCommitAfterExit` exige salida del proceso hijo confirmada y reabre un handle de **solo lectura**. Comprueba identidad, esquema, `PRAGMA quick_check` y existencia/consistencia de la tabla antes de devolver evidencia de commit o ausencia.
- La ausencia de la tabla de recibos NO se interpreta como que una escritura no se confirmó: el resultado sigue siendo **incierto**. Nunca se deduce un commit de un ACK IPC.

## Qué NO está resuelto
- No existe todavía una garantía global: los otros escritores (Tareas, JSON batch, Teletrabajo, Comité, etc.) NO usan este wrapper.
- El journal de PR478 mantiene su conciliación declarativa. La siguiente integración debe prohibir `sqliteVerificationReference` arbitrarios y exigir evidencia derivada exclusivamente de esta verificación para las operaciones cubiertas.
- Un registro de resultado OCC negativo no genera recibo; en una caída previa al ACK el supervisor debe usar el verificador para demostrar que no hubo commit. No volver a enviar la misma operación automáticamente.
- La prueba de ausencia es válida solo para las operaciones del protocolo con recibo; **no** extrapolar a escrituras legacy o a cargas útiles sin identificación.
- La comprobación de integridad en solo lectura debe ejecutarse bajo barreras seguras de la futura recuperación; el parámetro `exitConfirmed` debe proceder del supervisor real, no de la IU.
- Sin aumento general del número de esquema: la tabla experimental se crea dentro de la propia transacción en el primer guardado, exclusivamente tras cesión y bajo lock SMB.
- Debe evaluarse política de retención/limpieza de recibos: nunca borrar uno mientras exista posibilidad de reintento o journal pendiente.

## Condición de activación: NO-GO
No conectar con IPC productivo ni activar `utilityProcess` hasta completar verificación de commit de todos los tipos de escritura, gestión correcta de salidas y pruebas físicas SMB de dos equipos.
