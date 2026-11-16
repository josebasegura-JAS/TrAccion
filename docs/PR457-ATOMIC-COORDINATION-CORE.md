# PR457 — Core compartido de operaciones atómicas de Coordinación

## Alcance
Se extraen **sin reescribir su semántica SQL** las dos transacciones antes embebidas en `sqlitePersistence.ts`:
- `closeCoordinationWorkflowTransaction`: cierre de reunión, índice de Coordinación, tareas relacionadas y token de sincronización en una sola transacción SQLite.
- `createCoordinationTaskTransaction`: creación de tarea nueva, reunión, índice y token en una sola transacción.

La fachada productiva continúa usando `safeDatabaseOperation`, guardas de estado/heartbeat, lock SMB, y `enqueueLocalBackup` únicamente tras éxito. No cambia el resultado IPC ni el flujo de la interfaz.

## Pruebas SQLite reales
Cierre y creación: éxito, conflicto OCC, identificador duplicado y fallo SQL inyectado al final de la transacción, con comprobación de rollback de los cambios anteriores.

## Limitaciones y riesgo pendiente
Este PR **no mueve** Coordinación al proceso auxiliar ni conecta un nuevo escritor productivo. Sus funciones SQL no poseen el lock SMB. Para completar Coordinación habrá que añadir adaptador `utilityProcess`, validación rigurosa de payload, protocolo, runner con `exit(0)` y backup después de resultado confirmado. La protección frente a locks de edición de Tareas debe revisarse como requisito de la migración, sin alterar el comportamiento actual de esta extracción.

## Siguientes etapas
1. PR de conexión auxiliar para los dos workflows de Coordinación.
2. Repositorios especializados restantes.
3. Propietario único y lock SMB/heartbeat en el coordinador.
4. Pruebas con dos equipos y cortes SMB; activación progresiva basada en métricas.

Documentar cualquier cambio funcional adicional en Ayudas y Documento de funcionamiento por módulo si se llega a activar en producción.
