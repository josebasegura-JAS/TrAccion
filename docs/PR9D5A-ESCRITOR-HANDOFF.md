# PR9D-5A · Preparación del traspaso exclusivo del escritor SQLite

## Diagnóstico del código actual
La conexión `better-sqlite3` principal sigue siendo una variable singleton en `electron/sqlitePersistence.ts`. La inicialización (`activateSqliteDatabase`), las migraciones, `safeDatabaseOperation`, los repositorios de todos los módulos y `closeSqlitePersistence` utilizan esa conexión. Los bloqueos compartidos y su heartbeat viven en `sqliteLockLifecycle.ts`. La cola `enqueueSqliteIpc` protege numerosas operaciones, pero existen actividades fuera de cola (backups y heartbeat, y posibles operaciones de ciclo de vida).

No es seguro enviar escrituras a un proceso auxiliar mientras cualquiera de esos caminos pueda seguir escribiendo por la conexión principal. Las PR9D-4A/B/C aíslan **solo lecturas**, desactivadas por defecto.

## Cambios implementados
1. **`sqliteWriterHandoffCoordinator.ts`**: coordinador testeable que inicia cesión solo con cola vacía, exige comprobar actividades fuera de cola, cierra la conexión de main antes de crear un worker y verifica que el worker confirma la misma generación. El fallo **antes** de intentar cerrar permite cancelar; el fallo **desde el inicio del cierre** deja la instancia bloqueada, sin fallback implícito.
2. **`sqliteWriterOperationLedger.ts`**: identificador único y generación para cada futura escritura; distingue `submitted`, `acknowledged`, `completed`, `unknown`. Ante pérdida del proceso, las solicitudes no completadas pasan a `unknown`. El ledger **nunca las retransmite**. Su conciliación requiere verificación explícita en la futura capa de persistencia.
3. **`sqlitePersistence.ts`**: incorpora `sqliteEngineOwnershipFence.assertMayEnterMain()` al inicio de `safeDatabaseOperation`, además de los guards ya instalados en `enqueueSqliteIpc`, `requireDatabase` y `activateDatabase`.
4. Tests de orden cierre→arranque, cola ocupada, fallo antes/después del cierre, generación desfasada, pérdida de worker, rechazo de operaciones inciertas y recuperación únicamente con exit/identidad/conciliación verificados.

## Precauciones e implementación pendiente
**Esta PR NO inicia ni activa un worker escritor y NO traslada ninguna operación de escritura.** `createSqliteWriterHandoffCoordinator` y `createSqliteWriterOperationLedger` son componentes de infraestructura y no se instancian desde `main.ts`. No se ha cambiado el comportamiento de producción salvo el guard de propiedad (con propiedad `main` siempre activa).

Antes de activar el coordinador en runtime es imprescindible:
- Crear una barrera de admisión real para **TODAS** las actividades fuera de cola (heartbeat SMB, backups diferidos, activación/cierre, mantenimiento y locks), y verificar que no queda E/S en curso antes de cerrar.
- Garantizar que `closeMainHandle` solo resuelve tras cierre nativo confirmado. Si falla, no suponer que el handle está cerrado.
- Montar en utilityProcess un propietario real con acceso al mismo servicio de persistencia, identidad y lock manager, con la conexión existente cerrada **antes** de abrir el handle escritor en el hijo. No hay fallback a main tras un fallo de inicio.
- Migrar **todos** los métodos de repositorios y los puntos IPC de escritura a la fachada del nuevo propietario. No activar un modo híbrido de escrituras main/worker.
- Diseñar protocolo de correlación y conciliación persistente de escrituras inciertas: los estados solo en memoria del ledger **no bastan** para resolver una caída abrupta de Electron. No repetir automáticamente acciones no idempotentes.
- Comprobar pruebas de interoperabilidad con versiones anteriores de TrAcción, dos instancias sobre SMB, cierre de aplicación, errores nativos y recuperación de red.

## Secuencia para finalizar
- **PR9D-5B:** inventario exhaustivo, bloqueo de actividades extracola y fachada de IPC/serialización para el escritor.
- **PR9D-5C+:** implementación y puesta en servicio del motor SQLite único en utilityProcess, migrando todas las operaciones de repositorios/locks/backups, con corte atómico de propiedad y pruebas por bloques.
- **PR9E:** supervisor real del proceso, reconciliación durable de resultados inciertos y recuperación con identidad comprobada.
- **PR9F:** auditoría residual de acceso síncrono y pruebas reales en dos equipos, Ethernet/Wi-Fi, cortes 60–120 s, backups, cierres y colisiones.

**Criterio de éxito final:** ninguna operación SQLite/SMB síncrona de la ruta de datos se ejecuta en main y no hay pérdidas, duplicaciones ni sobrescrituras tras interrupciones. Esta PR por sí sola no lo consigue.
