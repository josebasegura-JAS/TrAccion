# PR9D-4A — Primera lectura funcional de módulo fuera de Electron

## Alcance comprobable

Se incorpora un proceso auxiliar de **solo lectura para Tareas**, reutilizando exactamente la función `readTaskRecords()` del repositorio actual, con filtros `all`, `active`, `historical`, `id` e `ids`. No se duplica el SQL de selección. Antes de consultar, el worker abre la base `readonly` y `fileMustExist`, y comprueba UUID, identificador de aplicación, entorno y versión del esquema. Ante error devuelve solo un estado genérico, sin rutas UNC ni contenido personal en los logs.

El flujo se activa **exclusivamente** con `TRACCION_SQLITE_ISOLATED_TASK_READ=1`; por defecto las consultas y escrituras de la aplicación permanecen como antes.

La lectura aislada se invoca a través de `safeDatabaseOperation` y mantiene la reserva de la cola IPC existente hasta que el worker **confirma `exit`**. Si se agota el tiempo, se solicita `kill`, pero no se desbloquea una nueva operación hasta recibir realmente ese evento. El protocolo prohíbe escrituras y no retransmite resultados inciertos.

## Compatibilidad con datos históricos

`loadTaskRecordsSnapshot` efectúa una migración heredada desde `traccion.v1.tareas.tasks` si aún no existe contenido en la tabla de tareas. La nueva ruta opt-in conserva este paso en el proceso principal ANTES de consultar en el worker. Esta fase **no aísla** ese trabajo de migración, ni las escrituras, ni la inicialización de SQLite.

## Pruebas y limitaciones

- Vitest: mensajes y filtros prohibidos, correlación de resultados, `exit` antes de completar, timeout y fallo del proceso.
- CI: TypeScript, ESLint y pruebas rápidas.
- Ensayo **solo sobre copia respaldada**: comparar el snapshot de Tareas con el modo anterior para los filtros, comprobar que se puede editar una tarea y recuperar el estado al reconectar Wi-Fi con dos instancias.
- En producción se mantiene desactivado hasta validar funcionamiento en Windows portable y los tiempos de arranque por operación. **Un worker por lectura** puede tener coste; si el piloto lo demuestra, introducir un worker persistente readonly supervisado, pero nunca un fallback inseguro al propietario main.
- No se prueba todavía que el proceso principal permanezca siempre responsive: todos los demás repositorios y el motor escritor siguen ejecutando operaciones síncronas en main.
- No se cambian journal, synchronous, backups, TTL ni bloqueo SMB.

## Ruta a la finalización

1. **9D-4B / 9D-4C:** inventario de accesos por cada repositorio y migración de lecturas readonly por grupos (Tareas primero, Comité/Paritaria después). Mantener condiciones de lectura/migración/identidad.
2. **9D-5:** transferencia atómica del motor **escritor** y de `safeDatabaseOperation` al worker. Requiere trasladar todas las operaciones dependientes del handle y ownership de bloqueos/heartbeat, sin dos vías de escritura dentro de una instancia.
3. **9E:** supervisor persistente con timeout, cuarentena de resultado incierto, terminación confirmada, conciliación y recuperación.
4. **9F:** auditoría de todas las llamadas nativas que quedan en main + pruebas de estrés con dos instancias, cambios Ethernet/Wi-Fi, 60–120 s sin red, backups, cierre y restauración controlada.

No hay evidencia suficiente para fijar el número exacto de PR hasta completar la enumeración de módulos y dependencias. **Esta PR es solo la primera migración funcional readonly**, no la migración integral del motor.
