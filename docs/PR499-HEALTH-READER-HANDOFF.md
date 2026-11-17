# PR499 — Lector de salud SQLite bajo barrera principal, recuperación separada

## Hallazgo

La revisión de PR498 marcó `electron/persistence/sqliteHealthVerification.ts` como pendiente. Su ejecución real no crea directamente el proceso: se invoca desde `checkSqliteHealth` mediante `verifySqliteHealthInUtilityProcess` en `sqliteIntegrityWorkerBridge.ts`, que utiliza `runSqliteIntegrityWorker` y `utilityProcess.fork`.

El runner ya mantiene la promesa pendiente hasta recibir **exit** del proceso; un timeout solicita `kill`, pero no da por terminada la operación. No obstante, el puente de salud no reservaba por sí mismo `sqliteIndependentActivityTracker` antes del fork. Si el llamador cambiaba de contexto, podía iniciarse el lector fuera de la futura barrera de cesión.

## Cambios

- `IsolatedSqliteReadKind` añade `health`.
- `verifySqliteHealthInUtilityProcess` usa `runIsolatedSqliteReadUnderHandoffBarrier('health', ...)` para exigir propiedad `main` y registrar la actividad desde antes del fork hasta finalizar realmente el runner.
- `verifySqliteIntegrityInUtilityProcess` **NO** recibe esta barrera de main: sus verificaciones readonly se necesitan tras cierre/posible corrupción y deben contar con una barrera de recuperación exclusiva independiente; el supervisor real todavía está pendiente.
- Pruebas de rechazo de salud durante freeze y de drenaje sólo después de salida confirmada del proceso; se extiende la batería de todas las familias de lectores.
- Inventario de CI: valida ambas rutas separadas y falla ante regresión de la protección del lector rutinario.

## Lo que esta PR no demuestra

- El health-check completo incluye `stat` y posibles acciones de recuperación desde `sqlitePersistence.ts`; el acceso del proceso auxiliar está protegido, pero la seguridad de una futura cesión de motor requiere verificar el **contexto completo** de los IPC, no solo el puente.
- El verificador de integridad en cuarentena **NO** queda automáticamente autorizado: necesita supervisor real, EXIT previo confirmado y barrera exclusiva SMB durante todo el preflight.
- Los procesos hijos huérfanos tras caída del proceso principal no quedan resueltos por este tracker local.
- No se han ejecutado pruebas físicas de dos PC Windows / SMB con corte y reconexión de red.

**Decisión:** mantener el nuevo escritor aislado apagado. La siguiente fase debe pasar a construir el supervisor real y la barrera de recuperación, sin asumir que esta PR certifica exhaustividad de todas las rutas SQLite.
