# PR488 — Flujos complejos y recibos SQLite atómicos

## Alcance
- Cierre atómico Comité/Paritaria: sesión, tareas, acta opcional, token y recibo de confirmación comparten una transacción.
- Importación histórica Comité/Paritaria: tareas, sesiones vinculadas, token y recibo se confirman en una única transacción; errores de referencias implican rollback.
- Coordinación: cierres y creación atómica de tareas con token y recibo.
- Mensajes optativos `detached:close-session-atomically-receipted`, `detached:import-session-history-receipted` y `detached:coordination-workflow-receipted`; validación estricta de `operationId`, `generation`, `databaseUuid` y payload.
- El worker compara la generación/UUID del mensaje con los de la sesión realmente abierta, conserva la exclusión SMB por operación y usa `saveWithDetachedCommitReceipt`. No hay cambio de IPC productivo.

## Pruebas
- Cada flujo tiene casos de SQLite real con confirmación y lectura de recibo.
- Casos de fallo/conflicto que no deben dejar recibos falsos.
- Se preservan pruebas anteriores de migración, rollback, OCC, edición ajena, no duplicación e integridad del vínculo histórico.
- Pruebas específicas de protocolo y rechazos de identidad/generación.

## Pendientes imprescindibles
- Recuperación duradera de un journal huérfano tras reinicio del proceso Electron y comprobación por SQLite real, sin permitir evidencias arbitrarias.
- Integración y drenaje de TODOS los handles SQLite, IPC, backups y operaciones fuera de cola antes de una cesión efectiva.
- Pruebas reales de dos instancias y preferentemente dos ordenadores Windows compartiendo SMB, pérdida de Wi-Fi, paso a cable, caída del worker, recuperaciones y reinicios.
- Auditoría final con criterios GO/NO-GO y retroceso seguro.

**NO-GO**: no se activa el worker en producción. Los nuevos recibos solo protegen los mensajes optativos preparados; el protocolo legacy no garantiza reconciliación transaccional.
