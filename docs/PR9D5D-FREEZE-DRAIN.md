# PR9D-5D — Congelar admisión y drenar E/S SQLite/SMB instrumentada

## Cambio implementado

Se extiende `sqliteIndependentActivityTracker` con una **barrera local de admisión**:
- `beginFreeze()` marca síncronamente el estado frozen y genera un ticket monotónico.
- `run()` rechaza nuevas operaciones instrumentadas durante la congelación; las que ya estaban admitidas conservan su reserva hasta finalizar su promesa REAL.
- `waitForDrain(ticket)` espera a que todas las operaciones admitidas terminen, sin tomar un timeout de UI por cancelación.
- `assertFrozenTicket(ticket)` y `abortFreeze(ticket)` rechazan tickets obsoletos. Solo el coordinador de cesión puede autorizar el aborto **antes del cierre**.

`sqliteWriterDrainPreflight` combina esa barrera con una comprobación del estado de `enqueueSqliteIpc` y de los backups vivos, programados y pendientes. Su `prepare()` congela primero la admisión y después espera a terminar la E/S ya admitida. Si encuentra cola ocupada, timeout incierto o backups pendientes, **aborta el preflight** y mantiene main como propietario. Si todo está inactivo, mantiene frozen hasta que el coordinador decida continuar o abortar.

Los tests verifican carreras con nuevas E/S, trabajos lentos, backups pendientes, cola activa, timeouts inciertos y generaciones obsoletas.

## Límite crítico (fail closed)

**El preflight no se conecta todavía al arranque ni al coordinador de PR9D-5A.** El motor escritor permanece en Electron. Tampoco se introduce un segundo motor escritor.

El tracker actualmente cuenta heartbeat, activación/cierre y el lock compartido, pero **NO es aún una barrera global de TODOS los accesos**. Falta un protocolo explícito para detener/reanudar el temporizador del heartbeat manteniendo seguridad de la posesión del lock, y cobertura exhaustiva de restauraciones, VACUUM, inicio/cierre y métodos que acceden directamente al handle. Congelar el tracker sin ese protocolo podría causar fallos artificiales del heartbeat: por eso este PR **no activa beginFreeze en producción**.

La precondición `getSqliteWriterHandoffReadiness().ready` continúa siendo `false`. No debe cambiarse a true solo porque se hayan implementado el freeze y el drenaje.

## Validación

1. CI TypeScript Electron + tests, ESLint y Vitest.
2. Revisar comportamiento normal sin activar `beginFreeze`, incluyendo backup programado, heartbeat y recuperación de red.
3. En pruebas unitarias, garantizar que el contador solo llega a cero cuando la E/S ha concluido.
4. No ensayar una cesión real hasta cubrir todos los caminos de adquisición y cierre.

## Próximos pasos

- **PR9D-5E**: gestión explícita de pausas de heartbeat, admisión extracola y sincronización con el coordinador de cesión, con pruebas de carreras.
- **PR9D-5F+**: motor SQLite escritor único en utilityProcess, con migración completa de los repositorios de escritura, lock manager y backups. No activar una solución híbrida con dos escritores dentro de la instancia.
- **PR9E**: conciliación duradera de operaciones de resultado incierto y reinicio verificado.
- **PR9F**: auditoría residual y ensayo real de dos usuarios, cambios Ethernet/Wi-Fi y cortes de 60–120 segundos.

Esta fase es un avance en seguridad de la transferencia; **no demuestra aún menor latencia ni ausencia de bloqueos de Electron**.
