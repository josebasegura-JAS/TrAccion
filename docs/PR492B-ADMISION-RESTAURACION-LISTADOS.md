# PR492B — admisión de restauración, listado y poda de backups

## Corrección aplicada

El servicio de backups ya registraba el trabajo de **copias completas** (PR492A), pero los métodos públicos de **restaurar**, **listar/podar** y el ciclo manual podían entrar y ejecutar E/S antes de reservar actividad independiente. La fachada `sqlitePersistence.ts` serializa estas operaciones mediante `sqliteMaintenanceGate`, pero la reserva de la barrera del futuro escritor debe existir también para consumidores directos del servicio y para el ciclo completo que incluye operaciones anidadas.

Esta PR envuelve los puntos de entrada públicos de `createLocalBackupService` con el mismo `trackActivity` (inyectado en producción o tracker global de respaldo):
- `sqlite:backup-manual-lifecycle` — desde antes de esperar la cola hasta completar el backup.
- `sqlite:backup-list-prune` — incluye el borrado de copias rotadas y su enumeración.
- `sqlite:backup-restore-lifecycle` — incluye validación, pre-backup JSON, migración/restauración SQLite y retorno final.

El tracker mantiene la admisión de suboperaciones durante un freeze **solo cuando la operación raíz sigue activa**. No cambia SQL, esquema, reglas de restauración ni IPC.

## Pruebas y prevención de regresiones

- Con freeze activo, se rechazan listados/podas, restauraciones y backup manual antes de iniciar trabajo.
- La restauración en vuelo mantiene una reserva mientras espera una promesa real. El drenaje no finaliza hasta terminarla.
- `classify-sqlite-routes.mjs` falla si falta alguna de las tres rutas instrumentadas.
- Los tests anteriores sobre backups completos deben continuar pasando. **CI verde pendiente de verificar**.

## Lo que la PR492B NO garantiza

El alcance es **localBackupService**. No equivale a cubrir todos los accesos SQLite. Quedan por auditar / certificar como mínimo:
1. Conexiones SQLite abiertas por workers de lectura, sincronización de tokens y diagnóstico, y sus condiciones de cierre.
2. Mantenimiento, restauración y migraciones iniciados desde otros servicios o callbacks no instrumentados.
3. Heartbeats, locks SMB, exportaciones, timers y E/S por fuera de la cola.
4. Drenaje real de todos los handles, no solamente número de promesas, para poder ceder el motor.
5. Pruebas de dos instancias Electron y dos PCs sobre SMB real.

**NO-GO**: el writer detached continúa sin conectar a producción. La siguiente fase deberá inventariar y proteger las restantes entradas; la PR493 de supervisor no puede afirmar exclusividad mientras falten rutas sin clasificar.
