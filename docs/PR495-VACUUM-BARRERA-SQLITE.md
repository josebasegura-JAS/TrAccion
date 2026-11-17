# PR495 — VACUUM siempre bajo barrera de admisión SQLite

## Hallazgo

La fachada `sqlitePersistence.ts` invoca `vacuumDatabaseNow` y `getVacuumStatus` bajo `sqliteMaintenanceGate`, que ya mantiene reserva de actividad y lock de mantenimiento. Sin embargo, `electron/persistence/vacuumMaintenance.ts` exportaba tres operaciones directamente reutilizables: `vacuumDatabase`, `runScheduledVacuumIfDue` y `getVacuumStatus`. Si otro consumidor las llamaba directamente, podía iniciar operaciones SQL/SMB sin participar en la congelación del futuro handoff.

## Cambios

- Los tres puntos de entrada públicos ahora comprueban `sqliteEngineOwnershipFence.assertMayEnterMain()` y reservan `sqliteIndependentActivityTracker` **antes de la primera lectura o await**.
- El VACUUM programado reserva todo su ciclo, desde la lectura de metadatos hasta la finalización del VACUUM y liberación del lock SMB, sin tener ventanas desprotegidas entre ambas fases.
- Las rutas existentes de la fachada siguen protegidas por `sqliteMaintenanceGate` y pueden reentrar en el tracker con su reserva principal vigente.
- No se modifica ninguna sentencia SQL, frecuencia de VACUUM, esquema o IPC de producción.

## Pruebas y controles

- Freeze activo: llamadas directas a VACUUM, programado y consulta de estado rechazadas sin abrir base ni adquirir lock.
- VACUUM ya admitido esperando adquirir lock: la congelación espera a su finalización, incluso si la espera de SMB es lenta.
- `scripts/classify-sqlite-routes.mjs` confirma la presencia de la barrera en las tres rutas exportadas y falla si desaparecen.

## Limitaciones

- **NO-GO**: no se considera completa la admisión global. Deben seguir revisándose otros servicios directos de diagnóstico/exportaciones, llamadas de mantenimiento no catalogadas, temporizadores y conexiones nativas que se abran fuera de la fachada.
- La barrera es local al proceso Electron: no sustituye el lock SMB entre equipos.
- No se activa el worker experimental ni se cambia la arquitectura productiva de escrituras.
- El resultado de CI y las pruebas físicas con dos instancias siguen pendientes de confirmación.

## Siguiente paso

Tras merge y CI verde, concluir inventario de entradas SQLite pendientes de categorizar y demostrar que ningún handle autónomo evade el freeze. Solo después avanzar en el supervisor real del escritor.
