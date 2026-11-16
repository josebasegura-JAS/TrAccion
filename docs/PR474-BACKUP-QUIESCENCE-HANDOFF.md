# PR474 — Quiescencia reversible de copias pendientes antes de la cesión SQLite

## Diagnóstico y alcance

La auditoría de PR467 y el estado `getSqliteWriterHandoffReadiness()` señalan que no puede cerrarse el handle mientras haya copias temporizadas o revisiones pendientes. `localBackupService` programaba copias vivas cada 15 minutos y `flushPendingLocalBackup` podía descartar el motivo de un backup no confirmado tras un fallo de lock o error de E/S.

## Implementación

- El servicio de backups ofrece `pauseSchedulingForHandoff()` **síncrono**: cancela el temporizador pendiente y suspende nuevas programaciones. No descarta `backupRevision`, `pendingLocalBackupReason`, operaciones ya iniciadas ni trabajos esperando en cola.
- `resumeSchedulingAfterAbortedHandoff()` habilita de nuevo el temporizador cuando se cancela la preparación y hay revisiones sin copia confirmada.
- `flushPendingLocalBackup()` conserva el motivo tanto si la copia devuelve `false` por contención SMB como si lanza una excepción de E/S. Sigue habiendo revisión pendiente hasta copia confirmada, y se programan operaciones nuevas si hubo guardados concurrentes durante el vaciado. Nunca se programa nuevo timer si la pausa sigue activa.
- Tests en `localBackupService.test.ts`: pausa sin pérdida de datos y reanudación; fallo de lock SMB + reintento con causa pendiente preservada.

## Contrato necesario para futura integración

1. No basta con cancelar el temporizador: una copia ya iniciada puede tener una promesa viva. El handoff debe esperar su terminación real mediante el tracker, y después comprobar `getActivitySnapshot()`.
2. La secuencia de futuro handoff deberá **parar nuevas escrituras / admitir sólo trabajos ya iniciados**, vaciar copias confirmadas y bloquear toda ruta directa; un nuevo guardado concurrente invalida la quiescencia.
3. Si el backup falla, la revisión sigue pendiente y el preflight debe bloquear la cesión, sin silenciar el fallo.
4. El coordinador de cesión **aún no invoca** estas nuevas funciones. Integrar el protocolo exige cubrir el lock distribuido SMB, ownership del child y estados inciertos.

## Seguridad

El escritor auxiliar permanece deshabilitado; `getSqliteWriterHandoffReadiness().ready` sigue en **false**. No se cambia el esquema, los datos de dominio ni el lock .lockdir. Solo fusionar si CI está verde.
