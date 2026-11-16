# PR452 — Auditoría de cobertura SQLite/SMB para cesión de propietario

Fecha: 2026-11-16. Base: `main` posterior a PR451.
Esta revisión **no certifica cobertura total del repositorio**: identifica rutas verificadas en los archivos nombrados, los riesgos que siguen abiertos y los criterios para una futura certificación. No habilita el escritor auxiliar.

## Hallazgo corregido (P1): liberación manual de lock

`forceReleaseDatabaseLock()` en `electron/sqlitePersistence.ts` delegaba directamente en `forceReleaseDatabaseLockWithRecovery`. Este último accede a `owner.json`/`.lockdir`, puede renombrar o eliminar metadatos y, si la conexión está cerrada, llama a `activateDatabase`. No formaba una sola reserva observable ante `beginFreeze()`.

**Cambio**: se comprueba `sqliteEngineOwnershipFence.assertMayEnterMain()` y se envuelve la operación completa en `sqliteIndependentActivityTracker.run('sqlite:force-release-lock-lifecycle', ...)` antes del primer `await`. La reentrada de `activateDatabase` conserva la reserva raíz. La validación de lock caducado, identidad de propietario y recuperación no se modifica.

## Inventario técnico revisado

| Ruta | Archivo / función | Estado para futura cesión | Evidencia o tarea pendiente |
|---|---|---|---|
| Operación SQLite ordinaria | `sqlitePersistence.ts: safeDatabaseOperation` | Protegida localmente | Pasa por `withDatabaseOperationLock`, que reserva actividad y verifica owner; auditar todas sus llamadas |
| Cola IPC | `sqliteIpcQueue.ts` y `sqliteEngineOwnershipFence.ts` | Barrera local preparada | No sustituye lock entre equipos |
| Lecturas de locks de registro | `recordLockService.ts` | Instrumentadas PR446 | `runIndependentRead` del tracker |
| Heartbeat SMB | `sqliteLockLifecycle.ts` → `databaseLockManager.ts` | Observado PR448 | Validar pausa efectiva y cierre sin carreras |
| Backups periódicos/de cierre | `localBackupService.ts` | Parte bajo lock y tracker | Drenar temporizadores y callbacks antes de cesión; medir operaciones que no llegaron a finalizar |
| Mantenimiento VACUUM | `sqliteMaintenanceGate.ts` / `vacuumDatabaseNow` | Instrumentado PR447 | Verificar ausencia de accesos directos omitidos |
| Backups manuales/restauración | `sqlitePersistence.ts`, `localBackupService.ts` | Instrumentados PR447–448 | Ensayar restauración con error/corte a mitad |
| Inicialización, recuperación y cambio de directorio | `sqlitePersistence.ts` | Instrumentados PR448 | Demostrar que no se inician durante handoff y que el handle previo terminó |
| Liberación administrativa lock caducado | `sqlitePersistence.ts: forceReleaseDatabaseLock` | **Corregido PR452** | Verificar en pruebas Windows SMB los fallos de metadatos |
| Health-check | PR442 | Lectura readonly aislada por defecto | Sigue requiriendo validación de identidad y manejo de resultado incierto |
| Polling de tokens | PR443 | Lectura readonly aislada por defecto | Confirmar que no bloquea el main tras corte SMB |
| Guardados de Tareas | `taskRepository.ts` / `detachedTaskWriterCore.ts` | Adaptador preparado PR449 | No conectado a producción: falta propietario único y lock SMB |
| Guardados simples Comité/Paritaria/Actas | `sesionesRepository.ts` / `detachedSessionWriterCore.ts` | Adaptador preparado PR451 | No usar como sustituto de un cierre atómico |
| Cierre sesión + tareas + acta | `sqlitePersistence.ts: closeSessionWorkflowAtomically` | **PENDIENTE** | PR453: misma transacción y validación OCC en child |
| Importación histórico sesiones/tareas | `sqlitePersistence.ts: importSessionHistoryAtomically` | **PENDIENTE** | PR453: rollback íntegro y deduplicación |
| Cierre / creación Coordinación | `sqlitePersistence.ts: closeCoordinationWorkflowAtomically / createCoordinationTaskAtomically` | **PENDIENTE** | Incluir en PR453; ambas son escrituras multi-tabla |
| Sorteos | `persistence/sorteosRepository.ts` | **PENDIENTE** | Dos colecciones y revisión OCC; PR454 |
| Teletrabajo | `persistence/teletrabajoRepository.ts` | **PENDIENTE** | Lotes y migración legacy; PR454 |
| Lotería | `persistence/loteriaRepository.ts` | **PENDIENTE** | Reglas append-only / cierres de caja; PR454 |
| Presupuestos | `persistence/presupuestosRepository.ts` | **PENDIENTE** | Snapshot especializado; PR454 |
| Configuración | `persistence/configuracionRepository.ts` | **PENDIENTE** | Comparación de versión y mutaciones; PR454 |
| JSON sencillo permitido | `persistence/isolatedJsonTables.ts` / `detachedJsonWriterCore.ts` | Adaptador PR444 | Confirmar equivalencia de semántica por tabla; no reemplazar lotes de dominio sin pruebas |
| Lock SMB del proceso escritor | `detachedCriteriaWriterWorker.ts` | **PENDIENTE / BLOQUEANTE** | Worker asume exclusión externa; PR455 debe poseer/validar lease y heartbeat |
| Coordinador de cesión | `sqliteWriterHandoffCoordinator.ts` | Preparado, no conectado a runtime | PR455, más cierre comprobado del main, identidad, generación, cuarentena y conciliación |
| Preparación declarada | `getSqliteWriterHandoffReadiness()` | **Bloqueo intencionado** | Devuelve siempre `ready: false`; no eliminar sin demostrar cobertura total |

## Riesgos específicos y orden

1. **P0** — No activar dos handles escritores: falta coordinación de propietario único y verificación del lock distribuido; los adaptadores de escritura aislada omiten deliberadamente las guardas que debería proporcionar el controlador.
2. **P0** — Persisten workflows atómicos de varias tablas en el main. Migrarlos como escrituras independientes introduciría cierres parciales.
3. **P1** — Comprobar cobertura de todas las rutas físicas mediante búsqueda sobre el árbol actual: `new Database`, `new Ctor`, `createRequire('better-sqlite3')`, `.transaction(`, `.backup(`, `readFile/writeFile/rename/unlink/rmdir` sobre metadatos SMB, temporizadores y callbacks. Excluir readonly *solo* si su proceso nunca escribe; registrar cada excepción por ruta. Este documento no equivale a esa comprobación completa.
4. **P1** — Las actividades ya admitidas deben drenarse completamente; un timeout no acredita terminación. El rollback anterior al cierre es distinto de la cuarentena posterior.
5. **P1** — `ready: false` debe mantenerse hasta completar pruebas de dos equipos Windows y cortes reales reproducibles en una base no productiva.
6. **P2** — Medir P50/P95/máximo de guardados, health-check, polling, tiempo de respuesta del main y bloqueos antes/después para demostrar mejora.

## Etapas siguientes

- **PR453a–c**: portar y probar las operaciones atómicas de sesión, histórico y Coordinación manteniendo transacciones completas.
- **PR454a–d**: portar repositorios especializados restantes; comparar resultados y conflictos contra el main.
- **PR455a–c**: propietario único, lock SMB del child/coordinador, heartbeat, freeze/drenaje, cierre/verificación y reconciliación.
- **PR456**: matriz de pruebas automatizadas + dos clientes Windows, cortes de cable/Wi-Fi, kill del child, `SQLITE_BUSY`, backups e integridad (`quick_check`).
- **PR457**: activación bajo flag de diagnóstico, gradual y reversible solo antes de iniciar la cesión. No fallback silencioso después de cierre incierto.

## Condición de salida de PR452
La ruta administrativa identificada queda cubierta antes de `await` y el inventario identifica explícitamente qué no está demostrado. **No se afirma ni habilita preparación para handoff**.
