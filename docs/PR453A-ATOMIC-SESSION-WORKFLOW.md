# PR453A — Extraer cierre transaccional de Comité y Paritaria

## Alcance
`closeSessionWorkflowTransaction` contiene sin modificación funcional la transacción SQL que antes estaba embebida en `sqlitePersistence.closeSessionWorkflowAtomically`. El proceso principal la invoca después de comprobar estado, heartbeat y permisos; conserva `safeDatabaseOperation`, el lock SMB y la programación del backup únicamente cuando el resultado es `ok`.

La transacción conjunta conserva:
- Comprobación OCC de versión de la sesión y todas las tareas afectadas.
- Comprobación de `editing_locks` de otro propietario, incluido bloqueo de módulo para tareas.
- Comprobación de acta ya vinculada con `sourceSessionId`.
- Actualización de sesión, tareas y, si procede, inserción del acta en la **misma** transacción.
- Actualización del token de sincronización dentro de la transacción.
- Rollback SQLite ante errores durante cualquier escritura.

## Validación
Pruebas con `better-sqlite3` real para Comité y Paritaria: éxito, conflicto OCC, lock ajeno y fallo forzado durante inserción del acta (rollback de sesión/tareas/token). TypeScript, lint, Vitest y Electron en CI.

## Seguridad y próximos pasos
**NO se conecta este core al proceso auxiliar aún.** Un helper SQL no adquiere por sí solo la exclusividad distribuida. El guardado real sigue en main y con la coordinación previa. Antes de mover esta operación al worker deben existir: protocolo validado con `ownerId`, runner con `close/exit(0)`, exclusión SMB y cesión segura. Las importaciones de históricos y los workflows de Coordinación siguen pendientes para PR453B/C/D. No introducir escrituras separadas por tabla.
