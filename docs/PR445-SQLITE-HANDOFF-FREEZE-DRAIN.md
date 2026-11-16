# PR445 · Barrera de actividad para cesión exclusiva SQLite

## Problema resuelto en el contrato de cesión
El coordinador de handoff bloqueaba la cola IPC y comprobaba que no hubiese actividad independiente, pero esa comprobación era asíncrona y **no impedía** que entrase un heartbeat, backup o lector readonly después del preflight y antes de cerrar el handle de main.

## Cambios
- `sqliteWriterHandoffCoordinator` **requiere** una barrera `independentActivity` con `beginFreeze`, `waitForDrain`, `assertFrozenTicket` y `abortFreeze`.
- Se bloquean las nuevas entradas instrumentadas en el mismo tramo síncrono en que la barrera de propietario impide nuevos IPC, antes de cualquier `await`.
- Se espera la conclusión **real** de las operaciones admitidas anteriormente, aunque el renderer haya agotado un timeout.
- Se vuelve a validar la generación congelada y el estado de cola antes de cerrar la conexión del main.
- Si falla **antes** de intentar cerrar, se revierte el freeze y se recupera main; después del intento de cierre, se conserva congelado y bloqueado (sin fallback automático).
- La vuelta a main solo descongela tras observar salida del worker, identidad verificada y escrituras inciertas reconciliadas.
- Tests de espera de lecturas activas, rechazo de nuevos heartbeats y backups, fallos de preflight y cierre, generaciones y cuarentena.

## Límites de seguridad
**NO activa todavía el escritor en producción**: el coordinador sigue siendo un contrato no conectado al arranque real. En runtime, el tracker actual todavía no abarca todas las vías de E/S SQLite/SMB; la barrera no puede utilizarse para una cesión productiva hasta instrumentarlas todas y migrar los repositorios especializados, locks, heartbeat y backups. No usar `utilityProcess` como un segundo escritor mientras main mantenga su handle.

## Próximos pasos
1. Instrumentar exhaustivamente E/S y temporizadores para que el drenaje incluya todos los trabajos.
2. Pasar los repositorios especializados y los servicios de lock, migración, backup y recuperación a un único propietario de SQLite.
3. Activar la cesión en el arranque, con reconciliación y fail-closed.
4. Validar dos usuarios Windows, cortes y reconexiones SMB, cierres durante escritura y latencias con registros reales.
