# PR478 — Journal durable del escritor auxiliar (NO-GO productivo)

## Alcance comprobable
- Nuevo `createDurableWriterJournal(file, databaseUuid)` desacoplado de Electron. Conserva IDs/generación/estado por instantánea JSON local (archivo temporal exclusivo, sync + rename), sin datos de usuario ni payload SQL.
- Registro `submitted` **antes** de permitir que el transporte envíe una operación, `acknowledged` tras ACK, `unknown` al perder certeza, `reconciled` únicamente mediante evidencia externa explícita de verificación SQLite.
- Reinicio: el journal se vuelve a leer; registro corrupto o de UUID distinto impide continuar. IDs previos no se reutilizan.
- El coordinador acepta `durableJournal` opcional mientras siga desconectado de producción: si hay operaciones pendientes históricas, **impide comenzar un nuevo handoff**. En cuarentena exige salida real del hijo, conciliación del ledger en memoria y ausencia de entradas pendientes durables.
- Pruebas sobre filesystem temporal y fence real, incluido reinicio, truncamiento, UUID distinto, doble registro, confirmación y cuarentena.

## Límites de seguridad — NO-GO
1. **Todavía no se crea ni se inyecta el journal desde el runtime de producción.** Es una dependencia optativa para preservar compatibilidad con pruebas existentes, pero será **obligatoria al activar**. Nunca activar sin ello.
2. `sqliteVerificationReference` es una referencia registrada, **no una prueba criptográfica ni una consulta a SQLite**. No habilita reconciliación automática. El próximo cambio debe implementar verificadores específicos de módulo/transacción, ligados a identidad, revisión de filas y resultado de commit; en operaciones sin huella verificable, intervención manual y cuarentena persistente.
3. El journal JSON local no garantiza coordinación entre equipos Windows ni protección frente a procesos concurrentes que escriban **el mismo archivo**. Solo está pensado para un supervisor local con un escritor, en ruta persistente del equipo. Además de `fsync` y `rename`, la durabilidad tras fallo eléctrico en Windows depende del sistema de archivos y debe probarse.
4. Un fallo de E/S marca la instancia como inutilizable; la integración no debe recuperar de manera automática ni borrar/rotar entradas sin reconciliar.
5. No hay todavía commit-marker transaccional en la misma base SQLite. Sin él, no es posible certificar de manera general si se aplicó una escritura compleja tras desconexión.
6. Se mantiene `getSqliteWriterHandoffReadiness().ready === false`, sin habilitar handoff ni alterar SQL, backups ni flujo productivo.

## Pendiente para cerrar realmente la migración
- Integrar journal persistente obligatorio con la vida del supervisor e inicialización anterior a cualquier operación.
- Añadir trazas de commit verificables **dentro de la misma transacción** por operationId, con retención y reconciliación segura; no basta con reconocer un mensaje IPC.
- Política de generations/IDs coherente tras reinicios y distintos equipos.
- Probar recuperación frente a corte de energía/red, corrupción de archivo y concurrencia SMB con dos Windows.
- Auditar el contrato de `acknowledge`: ACK de transporte ≠ commit confirmado.
