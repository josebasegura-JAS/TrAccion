# PR9D-5B · Visibilidad y barrera preliminar de operaciones SQLite extracola

## Problema identificado
El escritor sigue en Electron. La cola `enqueueSqliteIpc` no cubre por sí sola el trabajo diferido de `localBackupService`, la espera de locks SMB, el heartbeat ni todos los caminos de activación/cierre. Iniciar el traspaso con una cola aparentemente vacía podría provocar concurrencia con una operación extracola.

## Cambios implementados
- `sqliteIndependentActivityTracker.ts`: sigue de forma asíncrona operaciones y deja reservado el trabajo hasta que la promesa subyacente finaliza realmente, con independencia de que el renderer haya agotado el timeout.
- `sqlitePersistence.ts`: instrumenta las llamadas que pasan por `withDatabaseOperationLock`, incluida la espera SMB. Añade `getSqliteWriterHandoffReadiness()` con bloqueos de cola, operaciones extracola y backups.
- `localBackupService.ts`: informa de timer de backup programado, revisión pendiente, motivo pendiente y copia en ejecución. Sigue el tiempo real de copias periódicas y de cierre.
- Tests de trabajos simultáneos, errores y operación viva tras un timeout externo.

## Garantías y límites
Este cambio **no traslada ni inicia el escritor SQLite en utilityProcess**. Tampoco cancela tareas ni altera el flujo normal de backups, la periodicidad de 15 minutos, locks/TTL o los parámetros journal y synchronous.

`getSqliteWriterHandoffReadiness()` devuelve `ready: false` por diseño. Los criterios de admisión de la cesión NO están aún completos: hay que cubrir también heartbeat SMB, todas las operaciones de apertura/cierre/migración, actividades de mantenimiento y cualquier acceso que no pase por el lock instrumentado. El estado de backups puede ser una revisión pendiente aunque todavía no haya una tarea física en curso; **no significa que pueda ignorarse**.

El seguimiento de operaciones es observabilidad y precondición, **no una prueba de exclusividad total**. La PR9D-5A aporta el protocolo de cesión, pero se mantendrá sin uso hasta que toda la ruta de persistencia obedezca una barrera global.

## Validación
- CI: TypeScript de pruebas y Electron, ESLint, Vitest.
- Ensayo con copia respaldada: verificar que tareas, Comité, Paritaria, Ticket Restaurante y backup periódico/manual siguen guardando sin diferencias.
- Simular un bloqueo de E/S en un test controlado: la cuenta debe permanecer activa hasta la terminación real, aunque el renderer ya haya agotado el timeout.
- Medir overhead de instrumentación y revisar errores de SQLite/SMB en registros de la misma sesión.

## Plan posterior
1. **PR9D-5C**: completar la barrera global de actividad (heartbeat, cierre, restauración y mantenimiento), verificar estado de todos los productores de tareas y preparar cierre confirmado del handle.
2. **PR9D-5D+**: llevar el motor escritor y repositorios al utilityProcess **sin dos escritores locales**, con flags de lanzamiento para ensayos y sin fallback inseguro. Puede exigir varias PR.
3. **PR9E**: supervisor persistente y conciliación durable de escrituras inciertas.
4. **PR9F**: auditoría de toda E/S nativa restante y ensayo multiusuario con cortes Ethernet/Wi-Fi de 60–120 s.

No se puede afirmar todavía que los congelamientos del proceso principal hayan quedado resueltos.
