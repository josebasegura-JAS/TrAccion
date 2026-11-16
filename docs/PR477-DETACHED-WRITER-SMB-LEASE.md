# PR477 — Lease SMB obligatorio en cada escritura del utilityProcess

## Riesgo verificado
`detachedCriteriaWriterWorker.ts` abría la conexión SQLite e invocaba los distintos núcleos de escritura sin adquirir ningún lock externo `.lockdir`. El proceso principal sí utiliza `databaseLockManager`. Eso impedía afirmar que el escritor auxiliar y un segundo equipo no pudieran escribir simultáneamente. El auxiliar seguía sin activarse en producción.

## Corrección
- `detachedWriterSmbLease.ts` utiliza el **mismo** `DatabaseLockManager` y por tanto el mismo protocolo `<databasePath>.lockdir/owner.json` que Electron.
- Antes de invocar cualquier núcleo SQL detached, se adquiere el lock, se inicia el heartbeat, se valida el propietario `ownerId/PID/createdAt` y se comprueba el estado del heartbeat.
- Al terminar se vuelve a verificar la identidad del propietario, se drena el heartbeat en curso, se libera el lock y **solo entonces** se entrega la respuesta al proceso padre.
- Si falla la adquisición, el heartbeat, la lectura del propietario o la liberación, no se confirma éxito. El child cierra la sesión y termina con código 1 para forzar cuarentena del supervisor.
- El `ownerId` del proceso hijo es único por sesión (`detached-writer:PID:UUID`) y no reutiliza el identificador de main.
- La barrera se aplica a las 12 clases de escritura del worker; el protocolo de mensajes no cambia.

## Pruebas
`detachedWriterSmbLease.test.ts` utiliza el gestor SMB real sobre directorios temporales: lock en el callback, exclusión frente a segundo propietario, propagación de error tras release, ausencia de SQL sin lock y rechazo si la identidad del lease cambia durante el callback.

## Límites críticos
- **Esta PR no autoriza ni activa el handoff productivo.** `getSqliteWriterHandoffReadiness().ready` sigue siendo falso.
- Se protege cada **escritura**, no la apertura inicial del handle ni la propiedad exclusiva continua de toda una sesión. Queda por verificar la coordinación de adquisición/liberación del lease entre el cierre del main y el inicio del child; no se ha demostrado yet un propietario global único durante todo el ciclo.
- El heartbeat del gestor actual verifica estado mediante E/S asíncrona. Una escritura SQL síncrona muy larga o un corte SMB pueden impedir detectar pérdida de propiedad en tiempo real. Esto debe tratarse explícitamente antes de autorizar la cesión.
- Falta el journal de operaciones **persistente** y la conciliación tras reinicio. El ledger actual de PR476 es volátil.
- Las pruebas de GitHub Actions sobre filesystem local no equivalen a una prueba SMB con dos equipos Windows y cortes de red controlados.
- El entorno de producción no debe usar una versión de worker que no incluya este cambio.

## Siguiente fase
PR478: registro durable de operaciones `submitted/unknown` y reconciliación real contra la base; después coordinación de la exclusividad durante handoff, pruebas dos Windows, latencia y activación bajo feature flag. No activar el auxiliar mientras haya un solo bloqueo crítico sin demostrar.
