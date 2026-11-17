# PR480 — Reserva de sesión por equipo para el escritor aislado

## Diseño: no bloquear a los otros equipos
En TrAcción trabajan varios PCs simultáneamente sobre SQLite por SMB. Mantener el `traccion.sqlite.lockdir` global durante toda una sesión impediría que otros clientes guardasen. Por ello **se conserva ese lock por escritura** (PR477) y se añade una reserva distinta por *base de datos + ámbito estable de equipo*:

`traccion.sqlite.writer-session.<hash de equipo>.lockdir`

El nombre del equipo se codifica con SHA-256 para no introducir separadores de ruta. El lock de sesión tiene heartbeat usando el gestor de locks existente y se verifica leyendo el propietario real del SMB, incluyendo `ownerId`, equipo, PID y `createdAt`.

## Cambios
- Nuevo `detachedWriterSessionLease.ts`: adquisición, comprobación, envenenamiento ante propiedad incierta y cierre idempotente.
- El `detachedCriteriaWriterWorker` de **ensayo** adquiere la reserva antes de abrir SQLite, verifica tras la apertura y antes/después de cada escritura y la libera tras cerrar el handle. Si falla el arranque o la propiedad, no reintenta y sale con error.
- Pruebas de compatibilidad con escrituras entre equipos, rechazo de un segundo escritor del mismo equipo, pérdida de propietario y claves de ámbito estables.

## Garantías y limitaciones
1. El lock de sesión **no sustituye** el lock breve de cada escritura ni el fence `main/worker`, ni bloquea otros PC.
2. Un PID que sufre un corte SMB durante SQL síncrono puede haber confirmado físicamente su transacción. La sesión se invalida en la siguiente verificación, pero **no hay garantía de exactamente una escritura**. El journal PR478 todavía necesita marcadores transaccionales verificables en SQLite.
3. El protocolo del controlador de sesión sigue sin conectarse a producción. El verificador PR479 comprueba actualmente el lock global, que no es persistente; habrá que adaptar su contrato a la nueva reserva de sesión antes de habilitar `handoff`.
4. Un proceso finalizado de forma abrupta puede dejar un lock de sesión que deba agotarse o revisarse; no se borra automáticamente por el supervisor.
5. Falta validar dos equipos Windows reales, pérdidas de Wi-Fi, bloqueo prolongado, reboot y recuperación.

**NO-GO:** mantener `getSqliteWriterHandoffReadiness().ready === false`; no activar la cesión en producción.
