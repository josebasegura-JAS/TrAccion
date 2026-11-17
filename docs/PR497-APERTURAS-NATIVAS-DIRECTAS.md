# PR497 · Aperturas SQLite directas: identidad y validación de respaldos

## Diagnóstico del código

La PR496 protegió `openSqliteDatabase`, pero existen constructores nativos que no pasan por él. Dos usos del proceso principal requieren protección explícita:

1. `inspectAndEnsureDatabaseIdentity` en `persistence/databaseIdentity.ts`: abre `better-sqlite3` con `readonly: false` y puede asignar identidad a una base legacy mediante una transacción.
2. `validateSqliteBackupForRestore` en `persistence/sqliteBackupValidation.ts`: abre un handle readonly independiente para validar un respaldo. Aunque una lectura sea readonly, su apertura durante el handoff no es admisible sin la coordinación adecuada.

## Correcciones
- Ambas funciones ejecutan `sqliteEngineOwnershipFence.assertMayEnterMain()` antes del constructor nativo, impidiendo que abran handles cuando main está en `draining`, `main-closed`, `worker` o `quarantine`.
- Las comprobaciones son de defensa en profundidad y **no sustituyen** la admisión al tracker en el caller ni el drenaje de operaciones activas.
- Pruebas: bloqueo durante handoff, ausencia de bootstrap legacy antes de autorización y funcionamiento normal tras cancelar una cesión todavía reversible.
- `scripts/classify-sqlite-routes.mjs` vigila ambas rutas en CI.

## Rutas que deben permanecer deliberadamente separadas

- `verifySqliteIntegrityReadOnly` y `verifyDetachedSqliteCommitAfterExit` pueden ejecutar verificaciones estrictamente readonly durante recuperación/cuaren­tena, tras confirmar salida del writer y con una barrera externa de exclusión. **No añadir automáticamente el guard `assertMayEnterMain` a estos verificadores**: rompería la conciliación. Su autorización específica por supervisor sigue pendiente.
- Los workers readonly tienen contratos de ciclo de vida propios, supervisados por los puentes protegidos en PR494.
- El worker escritor experimental también tiene una política distinta de propiedad; no debe reutilizar indiscriminadamente el guard de main.

## Estado restante: NO-GO

El inventario `sqlite-access-inventory` es heurístico. La existencia de `require('better-sqlite3')`, otros constructores nativos y conexiones creadas por procesos hijos exige revisión individual. Esta PR cierra dos aperturas directas verificadas; **no certifica exhaustividad** y no habilita el escritor aislado en producción.

Siguientes requisitos: terminar la clasificación de todos los accesos por proceso y contexto, implantar supervisor real de terminación, demostrar exclusividad y drenaje, vincular journal/recibos al transporte y ejecutar pruebas Windows SMB en dos equipos.
