# PR472 — Admisión SQLite durante reintentos y activación

## Riesgo comprobado en el código
`safeDatabaseOperation` invocaba `withDatabaseOperationLock` por tentativa, pero la espera `SQLITE_BUSY_RETRY_DELAYS_MS` transcurría **fuera** de la actividad instrumentada. En una cesión futura, un preflight que mirase solamente el tracker podría observarlo vacío durante el backoff, mientras una operación seguía pendiente. El coordinador también inspecciona la cola IPC, pero esa inspección no debe ser la única defensa ante rutas directas/no IPC.

En `activateDatabase`, la publicación del nuevo `database` y `status` se hacía después de resolver `sqliteIndependentActivityTracker.run`. Aunque esa ventana es muy corta, debe incluirse explícitamente en la reserva.

## Cambios
- `sqliteLifecycleAdmission.ts` encapsula la comprobación síncrona del propietario `main` y el registro de una reserva de actividad **antes del primer await**.
- `safeDatabaseOperation` mantiene ahora `sqlite:safe-operation-full` durante toda la ejecución, incluida espera de lock, SQL, manejo de errores y retrasos entre reintentos. La reserva interior `sqlite:shared-operation-lock` se conserva y es reentrante.
- `activateDatabase` no libera `sqlite:activate` hasta publicar `database` y `status`.
- `sqliteLifecycleAdmission.test.ts` prueba: congelación durante backoff con reserva exterior viva y reintento anidado; publicación de estado antes de drain; bloqueo inmediato si el main deja de ser propietario.

## Límites
- Esta PR **no constituye el cierre exhaustivo de todas las rutas** detectadas en PR468/469. Los accesos no instrumentados que pudieran quedar necesitan una revisión estática y pruebas de entrada antes de la cesión real.
- No cambia el protocolo distribuido `.lockdir`, los locks de registros, los algoritmos OCC, el SQL, backups ni el esquema.
- `getSqliteWriterHandoffReadiness()` permanece bloqueado (`ready:false`); no se activa el escritor `utilityProcess`.
- La excepción de I/O podría seguir dejando resultados inciertos: los gestiona la fase específica de reconciliación, nunca un reintento ciego.

## Validación
Requiere CI completo (Vitest/TypeScript/ESLint/E2E), especial atención a pruebas de timeout/red y evaluación de latencias. Después debe continuarse con inventario de accesos nativos, restauración/mantenimiento y ownership SMB antes del handoff.
