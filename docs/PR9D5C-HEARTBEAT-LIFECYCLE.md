# PR9D-5C · Seguimiento del heartbeat SMB y ciclo de vida SQLite

## Cambios implementados
- El gestor de locks acepta un observador opcional del **heartbeat**. Cada tick conserva exactamente los mecanismos de no solapamiento, comprobación de propietario y manejo de error anteriores, pero la promesa de read/write SMB queda contada hasta su terminación real en el rastreador de E/S independiente.
- `createSqliteLockLifecycle` inyecta el observador al gestor de locks; su uso es opcional para que las pruebas y consumidores existentes no cambien.
- `sqlitePersistence.ts` conecta el observador con `sqliteIndependentActivityTracker`, e instrumenta también la activación y el cierre normal de la conexión nativa.
- `getSqliteWriterHandoffReadiness()` conserva **`ready: false` de forma deliberada**. Refleja actividad detectada, pero no garantiza que no nazca una nueva operación extracola en medio de la cesión.

## Invariantes conservadas
- Misma frecuencia de heartbeat, mismo bloqueo temporal de escrituras ante pérdida de conectividad, mismas comprobaciones de identidad y propiedad del lock.
- Sin cambios en copias de seguridad, archivos SQLite, journal mode, TTL, migrations, módulos o escritura de registros.
- No se inicia un segundo motor escritor. El motor SQLite principal continúa en Electron; las lecturas aisladas previas siguen opt-in.
- El timeout observado en el renderer no da por terminado un heartbeat: el rastreador espera a la resolución/rechazo real del callback.

## Riesgos y límites pendientes
El seguimiento del heartbeat **no es una barrera completa de admisión**: durante una futura cesión habrá que detener nuevos heartbeats de forma coordinada, pero sin abandonar prematuramente un lock aún válido. La preparación de ese protocolo requiere asegurar un período de cierre/transferencia más corto que el TTL y comprobar que no hay callbacks pendientes; un `clearInterval` aislado no detiene una E/S ya iniciada.

Los flujos de restauración, VACUUM y mantenimiento, la apertura por rutas alternativas y los locks de edición deben formar parte del inventario completo. Varias rutas todavía llaman al gestor SQLite directamente, por lo que una comprobación de cola vacía **no demuestra exclusividad**.

## Cómo validar
- GitHub Actions: typecheck de Electron y pruebas, ESLint y Vitest.
- En un entorno de ensayo con dos equipos: comprobar que heartbeats, bloqueos y recuperación de red mantienen su comportamiento previo.
- Verificar que el nuevo rastreador cuenta el tiempo real durante un bloqueo SMB y que un timeout externo no lo libera.
- No habilitar cesión ni declarar eliminadas las congelaciones de Electron hasta haber migrado las escrituras reales.

## Siguiente secuencia
- **PR9D-5D:** barrera de admisión global de tareas extracola y cierre/drenaje del heartbeat, con pruebas explícitas de carreras; tras ella, verificar readiness y conectar el coordinador de cesión.
- **PR9D-5E+**: proceso auxiliar **propietario único** de la conexión, transacciones y repositorios, manteniendo locks SMB y backups; puesta en servicio por fases solo cuando no quede camino escritor paralelo.
- **PR9E**: persistencia y conciliación de resultados indeterminados.
- **PR9F**: auditoría exhaustiva de acceso nativo y pruebas de desconexiones reales.

Esta fase completa observabilidad de rutas importantes, **no** la migración efectiva ni la barrera global.
