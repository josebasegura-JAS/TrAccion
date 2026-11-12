# PR8B · Exclusión local entre backups y escrituras SQLite

## Evidencia previa

Las copias vivas y de cierre de `electron/persistence/localBackupService.ts` adquirían `acquireLock()` directamente. La PR7D introdujo `localOperationTails` dentro de `withDatabaseOperationLock()`, pero las adquisiciones directas conservaban semántica reentrante. Por tanto, dos operaciones locales podían compartir el mismo propietario del `.lockdir` y ejecutarse al mismo tiempo sin esperar a que la otra terminara.

No se afirma que esta situación haya provocado corrupción: SQLite ofrece mecanismos propios de consistencia para copias online. Es un incumplimiento de la exclusión local prevista y exige corregir la coordinación.

## Cambio acotado

- `writeLocalBackupArtifacts` (periódico, manual y preventivo antes de restaurar JSON) entra en `withDatabaseOperationLock()` antes de adquirir su lease de backup.
- `writeShutdownLocalBackupArtifacts` (cierre) sigue exactamente la misma cola.
- El lease reentrante interior mantiene su heartbeat durante copias largas; el wrapper garantiza exclusión hasta terminar toda la operación y liberar los recursos.
- La contención para la adquisición exterior se trata igual que la contención anterior: la copia se omite y la programación periódica conserva el reintento.
- No se modifican TTL, esquemas, journal SQLite, intervalos ni formatos de backup.

## Coste y riesgos

- Mientras una copia mantenga el lock, las escrituras del mismo proceso esperan a la finalización; una copia lenta puede aumentar temporalmente la latencia y causar timeout IPC con resultado indeterminado.
- No anidar manualmente `withDatabaseOperationLock` en la misma ruta alrededor de las funciones públicas de backup: la cola no es reentrante para callbacks exclusivos.
- La adquisición interna adicional es una reentrada del propietario y su liberación no retira el lock exterior.
- La reserva SMB remota se mantiene mientras se realiza el respaldo.

## Pruebas

En `localBackupService.test.ts` se añaden dos casos que utilizan el gestor real de locks locales y retienen determinísticamente la adquisición interior del backup. Se comprueba que una escritura concurrente no puede entrar hasta liberar el backup, tanto para copia viva como para cierre.

Las pruebas existentes de omisión, deduplicación por revisión y respaldo al cierre deben seguir pasando. Ejecutar TypeScript, ESLint, Vitest y el workflow CI.

## Validación pendiente

Las pruebas locales no equivalen a una validación del servidor SMB Windows. Ejecutar R1–R10 del protocolo PR6C, en particular R7 (guardados simultáneos), R8 (backup con dos equipos) y R9 (interrupción durante bloqueo). Realizar la prueba sobre base ficticia restaurable.

La PR8B no incorpora una reestructuración de backups ni busca acelerar su ejecución; prioriza la consistencia por encima de una posible espera adicional.
