# PR9B · Recuperación conservadora del health-check ante errores SMB

## Motivo

Dos instancias distintas registraron fallos `UNKNOWN` de `fs.stat` tras interrupción de red. Una reabrió SQLite tras recibir un error reconocido; la otra acumuló fallos en `archivo` sin entrar en recuperación. Un solo error de `stat` no demuestra que el handle SQLite esté muerto.

## Comportamiento de la PR

- **Solo** en el health-check y **solo** cuando la etapa fallida es `archivo`, observar errores Node `stat/lstat` de tipo `UNKNOWN`, `EIO`, `ETIMEDOUT`, `ENOTCONN`, `ENETDOWN`, `ENETUNREACH`, `EHOSTDOWN`, `EHOSTUNREACH`, `ECONNRESET`, `ESTALE`.
- Al **tercer fallo consecutivo** compatible con red interrumpida, activar la suspensión de acceso que ya existe mediante `suspendDatabaseAfterIoError`.
- El siguiente `database:health-check` ya serializado utiliza `recoverDatabaseAfterIoError`, con cierre, apertura, comprobación de identidad y edición bloqueada hasta finalizar.
- Un `stat` exitoso (incluso antes de la consulta SQLite) reinicia el contador. Otros errores de `stat` (como `ENOENT` o `EACCES`) no activan esta recuperación ni cuentan para el umbral.
- `sqlite-recovery-diagnostics.jsonl` incorpora `errorErrno` numérico y `errorSyscall` de una lista cerrada. Sigue sin volcar mensajes brutos, SQL, rutas, nombres ni datos de registros.

## Garantías y límites

- **No** se clasifica `UNKNOWN` como error SQLite genérico: eso podría intervenir en escrituras de resultado incierto.
- **No** se reintentan operaciones de escritura, no se abandona una operación en curso y no se libera la cola por timeout.
- **No** se modifican locks, TTL, heartbeat, backups, PR8A, PR8B, límites de espera ni `synchronous`.
- La reapertura **sigue utilizando el procedimiento de activación actual**; esta PR no aligera ese procedimiento ni cambia la limpieza de `editing_locks`. Ese comportamiento requiere una auditoría separada.
- **No resuelve** una llamada SQLite síncrona que se quede bloqueada en el hilo principal de Electron. Para garantizar disponibilidad ante esos bloqueos es necesario estudiar el aislamiento mediante `utilityProcess`.

## Verificación

- Vitest: clasificación de errores de Node `stat`, contador y reinicio ante éxito/errores no recuperables, privacidad de `errno/syscall`.
- CI: tests y TypeScript/ESLint.
- Prueba manual después de fusionar: dos instancias en base **de ensayo respaldada**, Ethernet → Wi-Fi; verificar si se registran tres fallos de `archivo`, inicio y resultado de recuperación; adjuntar `sqlite-recovery-diagnostics.jsonl` y watchdog **de la misma sesión**.
- Si el watchdog detecta nuevos bloqueos >15 s, no considerar PR9B solución definitiva; priorizar aislar llamadas SQLite síncronas.
