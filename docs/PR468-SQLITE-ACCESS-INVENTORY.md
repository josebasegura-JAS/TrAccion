# PR468 — Inventario automatizado y admisión del escritor autónomo de Tareas

## Alcance
Primera fase ejecutable del plan derivado de PR467. **No conecta ni activa el utilityProcess escritor**.

1. `scripts/audit-sqlite-access.mjs` recorre todos los archivos versionados de `electron/` (excepto tests) con `git ls-files` y registra coincidencias de conexiones nativas, transacciones, SQL con escrituras, backups/restauraciones, migraciones y locks/heartbeat. Produce `audit-results/sqlite-access-inventory.json` y `.md` que se adjuntan como artefactos en el carril `calidad` de GitHub Actions.
2. El inventario es **heurístico y no exhaustivo**: puede incluir comentarios o strings sin ejecución y no demostrar llamadas indirectas. Se interpreta como mapa de trabajo, no como aprobación para activar handoff.
3. El script falla CI si detecta que la ruta autónoma ya conocida, `taskBatchPersistence.ts`, ha perdido su instrumentación explícita de admisión. No bloquea todavía otros patrones del inventario sin clasificación: la siguiente PR debe convertirlos en una lista revisada de propietarios y políticas de cesión.
4. `taskBatchPersistence.saveTaskRecordsAtomically` ya no puede entrar mientras la cesión local esté congelada. La función `runTaskBatchUnderHandoffBarrier` verifica el propietario main, reserva la actividad independiente antes del primer await (incluida la carga/migración legacy), y conserva la reserva durante la espera del lock, apertura, operación SQLite y cierre.
5. El código existente que maneja SQL, OCC, lock SMB independiente y respuestas de error **se conserva**. No se elimina ninguna conexión ni se fuerza el handoff prematuramente.

## Comprobaciones
`electron/persistence/taskBatchHandoffBarrier.test.ts`: (a) el freeze bloquea nuevas admisiones, (b) el drain no se completa hasta que realmente termina la operación previamente admitida, (c) incluso un lote vacío es rechazado tras congelar y (d) una operación fallida libera su reserva.

## Pendientes y límites
- `taskBatchPersistence.ts` sigue abriendo una conexión separada bajo su `batchLockLifecycle`. Es segura frente al freeze **local cuando esta ruta está instrumentada**, no una cesión distribuida ya demostrada.
- Completar clasificación del resto de rutas `native-open`, backups, callbacks y migraciones del informe y reforzar tests de cada punto de entrada.
- El coordinador sigue **desconectado de producción**, `getSqliteWriterHandoffReadiness()` continúa devolviendo `false`. No sustituir esa barrera por un flag prematuro.
- Validar la PR con GitHub Actions y después realizar pruebas Windows SMB antes de cualquier activación.

## Siguiente entregable (PR469)
Matriz revisada y verificable de rutas reales con responsable, modo read/write, lock distribuido, política de drain, tests de admisión y pendientes. Solo cuando no queden rutas fuera del freeze será razonable abordar la cesión de propiedad SQLite.
