# PR479 — Verificación obligatoria de titularidad SMB antes de confirmar el worker

## Cambio
- `sqliteWriterHandoffCoordinator` exige `verifyWorkerSmbOwnership(generation)` como dependencia obligatoria. La señal `READY` de IPC no acredita la propiedad: el coordinador sigue en `main-closed` hasta que finalice esa verificación.
- `verifyDetachedWorkerSmbOwner` contrasta `ownerId`, equipo, PID y fecha de creación con los metadatos **reales** leídos del bloqueo compartido `.lockdir/owner.json` y bloquea ante lectura SMB fallida, ausencia o identidad distinta.
- La comprobación se ejecuta después de cerrar main e iniciar el proceso auxiliar y antes de anunciar que el worker es el propietario.
- Si falla tras intentar cerrar main, no hay fallback ni descongelación. Se protege además el orden de restauración: no cambia el propietario al principal si falta el ticket de actividad independiente.
- Tests de condiciones de titularidad y de transición del coordinador.

## Advertencias y NO-GO
1. El verificador es una comprobación puntual, **no asegura titularidad continua ni sustituye el heartbeat**. El lock de PR477 sigue siendo de cada escritura y **puede estar ausente entre operaciones**. Por tanto la implementación actual del worker no supera todavía el nuevo requisito de sesión.
2. El verificador aún no está conectado al runtime productivo (la cesión permanece deshabilitada). Para integrarlo, el worker debe mantener el mismo lease exclusivo durante toda la cesión, exponiendo la identidad confirmada para contrastar; no se debe fabricar un callback que siempre devuelva éxito.
3. La prueba del owner del SMB no es garantía de recuperación frente a pérdida del lease durante SQL síncrono. Faltan protocolo de fencing y ensayos de desconexión.
4. Persiste la necesidad de registrar un marcador de commit transaccional y conciliar las escrituras inciertas con datos SQLite reales. La PR478 aporta el journal local pero no permite deducir el resultado de SQL a partir de un ACK.
5. Mantener `ready:false` y **no activar el worker hasta cobertura íntegra, CI verde y pruebas de dos Windows**.

## Siguiente fase
PR480: contrato de lease de sesión y supervisión continua ante pérdida de lock; después prueba de recuperación/quarantena y verificación de commits. No confundir un guard extra con una migración terminada.
