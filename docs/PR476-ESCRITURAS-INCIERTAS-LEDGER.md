# PR476 — Registrar operaciones por generación y bloquear retorno desde cuarentena

## Riesgo
El coordinador SQLite ya exigía salida confirmada, identidad válida y un argumento booleano de «escrituras conciliadas» antes de devolver la propiedad a main, pero **no comprobaba un registro propio de operaciones realmente pendientes**. La fase de recuperación podía recibir un booleano afirmativo aunque hubiese operaciones enviadas cuyo resultado seguía incierto.

## Implementación
- Se integra en `createSqliteWriterHandoffCoordinator` un ledger privado de IDs y generación.
- Se registran operaciones con `registerWriterOperation(id,generation)` **antes** del envío. Se permite reconocer recepción con `acknowledgeWriterOperation`; reconocer no significa commit.
- Al declarar `workerUncertain` o confirmar `workerExited`, las operaciones enviadas/reconocidas pasan a `unknown`, nunca se reintentan automáticamente.
- Solo es posible invocar `reconcileWriterOperation(id,generation)` tras **salida real confirmada** de la generación en cuarentena. Cada operación debe conciliarse individualmente.
- `restoreMainAfterReconciliation` comprueba `operationLedger.hasUnsettledOperations()` ANTES de solicitar el desbloqueo de `sqliteEngineOwnershipFence`. Un booleano afirmativo externo no puede saltarse un registro pendiente.
- `hasUnsettledOperations()` contempla los estados `submitted`, `acknowledged` y `unknown`; no solo los desconocidos.
- Pruebas: caída con escritura pendiente, kill sin exit, generaciones ajenas, varias escrituras y tratamiento de todos los estados del ledger.

## Límites expresos
1. **NO está conectado a IPC ni a producción.** Esta PR fortalece el contrato del coordinador para la integración posterior; no abre todavía el escritor auxiliar ni le cede SQLite.
2. La función `reconcileWriterOperation` es una anotación tras verificación externa: **no verifica automáticamente** el contenido real del fichero SQLite. La siguiente fase debe implementar conciliación efectiva contra la base y registros duraderos que sobrevivan a reinicios.
3. El ledger reside en memoria. No permite certificar recuperación tras cerrar Electron. No es un journal en disco.
4. No hay aún lease SMB con heartbeat en el utilityProcess. El bloqueo `.lockdir` del proceso principal no es una autorización de propiedad transferible por sí solo.
5. Un resultado enviado por el hijo no debe llamarse «completado» antes de exit verificado. Por eso el coordinador no expone un método para completar escrituras durante la sesión viva.
6. El motor y su `getSqliteWriterHandoffReadiness()` permanecen con NO-GO (`ready:false`).

## Próximas fases
- Lease distribuido en el hijo, con validación de propietario/identidad y renovación; cierre confirmado del principal, bloqueo de doble escritor y recuperación si se pierde SMB.
- Journal duradero con ID de operación, intención y prueba de commit; reconciliación por lectura tras error/exit.
- Pruebas con dos equipos Windows + SMB, reconexión Wi-Fi/Ethernet, cortes durante SQL, exit ausente y backups.
- Activación gradual con feature flag solo tras evidencias de seguridad y rendimiento.
