# Entrega funcional · Primer escritor SQLite real en utilityProcess (ensayo aislado)

## Resultado concreto
Se incorpora `detachedCriteriaWriterWorker.ts`: un proceso auxiliar Electron que **abre una conexión SQLite escribible** con `better-sqlite3`, valida UUID/applicationId/environment/schemaVersion, conserva el handle mientras atiende operaciones y lo cierra al recibir `detached:close`.

El primer comando de dominio ejecutable es alta/edición de **Criterios RRLL** (`criterios_rrll_records`), mediante una transacción de SQLite y OCC sobre `updated_at`. SQL y tabla están fijados en código; ni la vista ni el IPC pueden enviar una sentencia arbitraria. Un mismo `operationId` no se ejecuta dos veces en la vida del proceso. Los tests de `detachedCriteriaWriterCore.test.ts` realizan INSERT y UPDATE en un **archivo SQLite real de ensayo**, lo cierran, lo reabren y comprueban la persistencia y los conflictos.

Incluye protocolo cerrado `detachedCriteriaWriterProtocol.ts` y puente `detachedCriteriaWriterBridge.ts` para crear el utilityProcess real.

## Límite de seguridad indispensable
**No está conectado a los IPC del usuario ni a `sqlitePersistence.ts` ni a la base SMB de producción.** Los tests ejercitan la función de escritura nativa que utiliza el worker, pero no son una prueba end-to-end de la comunicación real de utilityProcess en Windows portable. La implementación no invoca todavía `forkDetachedCriteriaWriter` desde producción.

Motivo: el proceso principal sigue manteniendo el handle de la base y ejecutando escrituras de muchos módulos. Activar este nuevo escritor contra el mismo archivo sin cesión completa del handle, lock SMB, backups y resto de rutas crearía dos propietarios locales y abriría un riesgo inaceptable.

Este primer escritor no asume ni renueva el lock SMB. El controlador que se integre más adelante DEBE adquirir y mantener el derecho exclusivo de escribir; también tendrá que guardar un ledger duradero para reconciliar operaciones cuyo ACK se haya perdido. El `Set` de operationId **no es una garantía entre reinicios**.

## Qué queda de la entrega de migración
- Integrar de forma **atómica** la fachada de repositorios con un único propietario en utilityProcess, nunca un híbrido de dos escritores.
- Transferir inicialización, migraciones, backups, mantenimiento, locks SMB y heartbeat al propietario elegido o una única fachada serializada que no cierre en falso.
- Integrar el coordinador de cesión con la barrera de entrada y cierre nativo confirmado.
- Añadir pruebas E2E con el proceso auxiliar real en Windows y fallo de red; ninguna escritura incierta se reintenta automáticamente.

## Criterios de aceptación
1. TrAcción mantiene tiempos de respuesta durante acceso SQLite lento/desconexión SMB.
2. Un único proceso de la misma instancia ejecuta todas las escrituras SQLite, con lock distribuido correcto entre equipos.
3. Los registros guardados siguen visibles después de cerrar/reabrir y resisten conflictos entre dos usuarios.
4. Backup, mantenimiento, restauración y cierre de sesión mantienen consistencia.
5. CI y ensayo Windows real confirman la ausencia de regresiones.

**Esta PR ofrece una primera escritura física ejecutable en el módulo auxiliar, pero todavía NO cumple el objetivo de trasladar todas las escrituras de producción.**
