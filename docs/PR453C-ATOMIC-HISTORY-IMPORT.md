# PR453C · Extraer importación atómica de históricos Comité/Paritaria

## Cambio
`importSessionHistoryTransaction` encapsula **la misma transacción SQL productiva** que estaba en `sqlitePersistence.importSessionHistoryAtomically`; no se ha reescrito el algoritmo. `sqlitePersistence` conserva `safeDatabaseOperation`, el lock SMB y las comprobaciones de heartbeat/estado/propiedad, la captura de errores y el backup posterior al éxito.

La transacción:
- Decide desde SQLite qué sesiones son nuevas: `ImportKey` y combinación código/fecha.
- Reserva claves dentro del mismo lote para descartar duplicados.
- Solo crea tareas vinculadas a sesiones realmente importadas; reutiliza tareas existentes por `ImportKey`.
- Exige resolver todas las referencias de tareas antes de incorporar una sesión.
- Actualiza `items`, `treatedTaskIds`, `untreatedTaskIds` y el token en la misma transacción.
- Ante fallo SQL o referencia no resuelta deshace todos los cambios.

## Pruebas
Vitest con SQLite real para Comité y Paritaria: importación enlazada, segunda ejecución sin duplicaciones, duplicados dentro del lote, rollback por referencia irresoluble y error SQL inyectado después de insertar tareas.

## Límite
**Sin conexión al escritor auxiliar, sin nueva ruta IPC ni cambio de comportamiento de producción.** Este tramo prepara un core reutilizable con pruebas; el próximo PR integrará protocolo/worker/runner y exigirá el lock SMB, propiedad única y reconexión segura antes de activarlo.

## Etapas siguientes
PR453C-2: protocolo y ejecución aislada de histórico. PR453D: operaciones atómicas de Coordinación. PR454 especializadas. PR455 propiedad/SMB. PR456 ensayos de red. PR457 activación controlada.
