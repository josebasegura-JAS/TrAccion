# PR A — Reactivación segura tras fallo de heartbeat SQLite

## Fallo detectado
En `databaseLockManager.ts`, cinco fallos de heartbeat consecutivos bloquean las escrituras. El desbloqueo anterior dependía exclusivamente de otro heartbeat satisfactorio, pero el temporizador solo existe durante el bloqueo exclusivo de arranque/operación. Si la operación termina durante una desconexión SMB, el bloqueo puede persistir incluso cuando el health-check vuelve a validar la base.

## Cambios
- `clearHeartbeatBlock()` en el gestor de locks y fachada singleton de persistencia.
- `checkSqliteHealth()`, que se ejecuta dentro de la cola IPC y conserva la serialización actual, desbloquea **solo** tras verificar fichero compartido, SELECT, esquema y UUID/identidad de la base. Nunca desbloquea si el diagnóstico de cola señala una operación indeterminada.
- Se añade comprobación de heartbeats pendientes: una recuperación por health-check no desbloquea si todavía hay una lectura/escritura de heartbeat cuyo resultado es desconocido.
- Cada temporizador de heartbeat solo inicia una operación a la vez; evita acumulación de solicitudes SMB ante una red caída.
- Se mantiene el bloqueo preventivo tras cinco fallos, los intervalos, los TTL y la señal enviada al renderer.

## Alcance y precauciones
No se introduce ningún timeout que simule cancelación de `fs` ni se altera la cola de SQLite. No se cambia el esquema, bloqueos de registros, backups, módulos ni lógica de guardado. Sigue sin poder recuperarse una operación fs que permanezca indefinidamente bloqueada: se abordará en la fase B/C con garantías de no simultaneidad.

## Verificaciones
- Tests Vitest específicos: cinco fallos bloquean las escrituras; la limpieza explícita informa al renderer; una operación SMB pendiente impide solapamientos y evita el desbloqueo prematuro.
- Confirmar CI Windows integral.
- Probar en copia compartida con cable/Wi-Fi, provocando desconexión durante una operación exclusiva prolongada y verificando que, cuando todas las operaciones han terminado y la base conserva identidad, el monitor permite nuevas escrituras.
- Asegurar que no se desbloquea ante un cambio de UUID, error SQL o operación de escritura indeterminada.
