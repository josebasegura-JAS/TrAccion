# PR9C · Primer paso de aislamiento de SQLite en utilityProcess

## Alcance y límite real

Esta PR incorpora un **proceso auxiliar experimental**, supervisado desde Electron, que solo admite mensajes de prueba `probe:ping` y `probe:shutdown`. No abre conexiones SQLite, no lee ni escribe archivos SMB y **no participa en las operaciones de la aplicación**.

Está **desactivado por defecto** y únicamente se inicia con la variable de entorno `TRACCION_SQLITE_WORKER_PROBE=1`. Ninguna consulta ni guardado de los módulos se desvía al auxiliar. En particular, esta PR **no soluciona todavía** las congelaciones del proceso principal debidas a `better-sqlite3`: prepara y valida el canal de aislamiento antes de migrar operaciones reales.

## Componentes

- `sqliteWorkerProbeProtocol.ts`: contratos de mensaje y comprobación de mensajes.
- `sqliteWorkerProbe.ts`: entrypoint del `utilityProcess`, sin SQLite ni E/S de red.
- `sqliteWorkerProbeSupervisor.ts`: supervisor de ping/respuesta y detección de timeout. En timeout solicita `kill()`, pero **no considera terminado** el proceso hasta recibir `exit`. No lanza sustitutos y no libera ningún lock.
- `main.ts`: integración opt-in en el arranque y cierre del proceso de prueba al salir de la aplicación.
- `sqliteWorkerProbeSupervisor.test.ts`: pruebas para respuestas normales, respuestas tardías o con ID inválido, timeouts, `kill` sin `exit` y cierre voluntario.

## Prueba controlada

1. Compilar Electron (`npm run build`) y ejecutar una copia de prueba con `TRACCION_SQLITE_WORKER_PROBE=1`.
2. Verificar en salida del proceso principal la transición `[sqlite-worker-probe] estado=ready` y que continúan funcionando los módulos existentes.
3. Sin alterar la base compartida, comprobar que el auxiliar existe como subproceso y termina al salir de TrAcción.
4. Ejecutar `vitest` y TypeScript/ESLint en CI. La simulación de un proceso sin respuesta se verifica mediante dependencias falsas en tests; el proceso real de prueba no expone comandos para colgarlo.
5. No confundir este resultado con una prueba completa del aislamiento de SQLite: esa prueba corresponde a PR9D tras trasladar las llamadas de BD.

## Invariantes

- No cambia `sqlitePersistence`, `sqliteIpcQueue`, recuperación PR9B, `.lockdir`, TTL, heartbeat, backups, `synchronous`, módulos, esquema ni configuración de la base.
- No hay timeout que libere una operación real de SQLite ni reintento de escritura incierta.
- La supervisión no interpreta `kill()` como confirmación de `exit`. El protocolo actual no incluye reinicio automático de ningún proceso.
- Si no arranca el proceso experimental, se registra aviso y la aplicación continúa con el comportamiento anterior.

## Fase posterior: PR9D

Antes de migrar SQLite al proceso auxiliar hay que inventariar todos los accesos (`sqlitePersistence`, conexiones secundarias de tareas, backups, exportaciones, lock manager), definir operaciones serializadas y resultados indeterminados, asegurar la gestión de identidad/owner/PID entre procesos y probar la recuperación real con dos usuarios en SMB.

**Criterio de éxito final:** una llamada SQLite síncrona bloqueada en el auxiliar no congela Electron, pero no se permite nueva escritura hasta confirmar la salida del proceso antiguo, validar la base y reconciliar el resultado incierto.
