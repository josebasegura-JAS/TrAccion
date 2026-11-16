# PR453B · Cierre atómico Comité/Paritaria en utilityProcess (sin activación)

## Alcance
- `detachedAtomicSessionCloseCore.ts` ejecuta **la misma** `closeSessionWorkflowTransaction` compartida con main desde PR453A. No crea una segunda implementación SQL.
- `detached:close-session-atomically` transporta `ownerId`, módulo permitido (`comite`/`paritaria`), sesión, tareas y acta opcional. Rechaza solicitudes malformadas, IDs repetidos de tarea, owner vacío y módulos/tablas arbitrarios.
- El proceso hijo procesa este mensaje mediante la cola FIFO introducida en PR450 y conserva la transacción única sesión+tareas+acta+token.
- `closeSessionViaDetachedWriter` espera `ready → opened → session-closed-atomically → close → exit(0)`. En fallo, timeout o salida inesperada no confirma éxito, y no reintenta automáticamente.
- Bridge `closeSessionAtomicallyInDetachedUtilityProcess` solo disponible para coordinación futura, **sin llamadores IPC productivos**.
- Pruebas `better-sqlite3` reales para Comité y Paritaria: éxito conjunto, conflicto OCC, lock de otro usuario, rollback por fallo al insertar acta y validación del protocolo. Pruebas de secuencia y resultado incierto.

## Restricciones
El proceso hijo **no adquiere ni renueva el lock SMB**. Su invocador debe haber confirmado: barrera `freeze/drain`, cierre del handle main, propietario exclusivo, identificación de base/esquema y lock distribuido. El adaptador tampoco agenda backup; debe hacerlo el coordinador solo después de salida confirmada y conciliación. No activar el escritor hasta completar PR454–457.

## Siguientes tramos
- PR453C: importar histórico de sesiones y tareas como operación atómica.
- PR453D: cierre y creación de tareas en Coordinación.
- PR454: repositorios especializados todavía no portados.
- PR455: cesión exclusiva real, SMB, heartbeat y recuperación.
- PR456: pruebas de concurrencia/cortes en dos Windows y comprobación de integridad.
- PR457: activación gradual con métricas reales.
