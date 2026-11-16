# PR467 — Auditoría de preparación para activar el escritor SQLite en utilityProcess

**Fecha:** 2026-11-16 · **Base revisada:** `main`, después de fusionar PR466.  
**Tipo:** revisión estática del código; **no** equivale a ensayo SMB/Windows ni a prueba de ausencia de rutas no inspeccionadas.  
**Veredicto:** **NO-GO**. No habilitar la escritura auxiliar productiva todavía. Los adaptadores existen, pero no equivalen a una cesión de propiedad distribuida funcional y verificable.

## Alcance y método
Lectura directa del código vigente de:
- `electron/sqlitePersistence.ts`, `sqliteIpcQueue.ts`, `sqliteWriterHandoffCoordinator.ts`, `sqliteEngineOwnershipFence.ts`, `sqliteIndependentActivityTracker.ts`.
- `electron/persistence/databaseLockManager.ts`, `sqliteLockLifecycle.ts`, `databaseLockRecovery.ts`, `taskBatchPersistence.ts`, `simpleJsonModuleRepository.ts`, `jsonRecordRepository.ts`, `localBackupService.ts`, `vacuumMaintenance.ts`.
- Repositorios de Sorteos, Teletrabajo, Lotería, Presupuestos y sus transaction cores; `detachedCriteriaWriterWorker.ts`, `detachedCriteriaWriterBridge.ts`, runner de Presupuestos.
- El análisis identifica rutas demostradas y límites de cobertura. No se declara exhaustividad sobre todo el repositorio sin inventario automatizado de archivos ni prueba en dos equipos.

## Evidencia y bloqueantes

| ID | Severidad | Hallazgo confirmado | Evidencia | Requisito para cierre |
|---|---|---|---|---|
| G1 | **CRÍTICO** | El runtime no tiene una ruta de cesión activable. `getSqliteWriterHandoffReadiness` añade explícitamente un bloqueante y devuelve `ready:false`. El coordinador declara que no está conectado a producción. | `sqlitePersistence.ts:getSqliteWriterHandoffReadiness`, `sqliteWriterHandoffCoordinator.ts` | Un único entrypoint auditado: congelar admisión, esperar cola + actividad externa, cerrar handle, iniciar child, verificar propiedad y mantener el main bloqueado durante todo el ciclo. |
| G2 | **CRÍTICO** | El child abre `better-sqlite3` y valida identidad/esquema, pero no adquiere/renueva/verifica su propio lease SMB ni recibe una capacidad con fencing demostrable. El `ownerId` de las solicitudes se valida como cadena, no como titular del lock. | `detachedCriteriaWriterWorker.ts`, `detachedPresupuestosWriterCore.ts`, `databaseLockManager.ts` | Política consistente de lock/heartbeat distribuido, pérdida de lease => no nuevas escrituras, validación del titular por cada ciclo; ninguna apertura antes de confirmar cesión. |
| G3 | **CRÍTICO** | Existen conexiones autónomas fuera de la fachada: la escritura masiva de Tareas utiliza `batchLockLifecycle` y `openSqliteDatabase` propios. | `persistence/taskBatchPersistence.ts:saveTaskRecordsAtomically` | Bloqueo de admisión y drenaje de la ruta autónoma; preferible integrarla bajo la misma propiedad / cola. Ensayo con operación bloqueada durante handoff. |
| G4 | **ALTO** | Mantenimiento y copias usan canales y callbacks independientes: backups periódicos y de cierre, restauración, VACUUM, cambio de ruta, recuperación y heartbeat. Algunas rutas están instrumentadas, pero `getSqliteWriterHandoffReadiness` reconoce falta de cobertura exhaustiva. | `sqlitePersistence.ts`, `localBackupService.ts`, `vacuumMaintenance.ts` | Inventario de todas las entradas, barrera previa al primer await, temporizadores congelados y drenados; backup posterior al commit del child, nunca con handle main cerrado. |
| G5 | **ALTO** | Las cargas de Lotería, Sorteos y Teletrabajo pueden ejecutar migraciones SQL; repositorios JSON también preparan tablas en cargas. Los flags de migración en memoria no deben acreditar un commit si una transacción posterior hace rollback. | `loteriaRepository.ts:loadSnapshot`, `sorteosRepository.ts:loadSorteosRecordsSnapshot`, `teletrabajoRepository.ts:loadTeletrabajoRecordsSnapshot`, `simpleJsonModuleRepository.ts:ensureMigrationForDatabase` | Semántica de escritura, migración única antes de ceder; marcar migrado solo tras confirmación de commit o resetear en todos los abortos; tests de carga y fallo inducido. |
| G6 | **ALTO** | Presupuestos: OCC usa `MAX(updated_at)` de filas **activas** de las cuatro tablas. Un borrado lógico de fila que no determina ese máximo puede no cambiar el token, permitiendo reintroducción desde un snapshot antiguo. El timestamp en milisegundos tampoco constituye un contador de versiones estrictamente monotónico. | `presupuestosWriteCore.ts:readPresupuestosActiveRevision`; `presupuestosRepository.ts:latestUpdatedAtFromSnapshots` | Versión de colección transaccional monotónica (o equivalente garantizado) incrementada por **cada** insert/update/soft-delete, compatible con carga y guardado. Test que borre una fila antigua mientras otra tiene timestamp posterior. |
| G7 | **ALTO** | En el runner aislado, el timeout llama a `kill()` pero la promesa se resuelve/rechaza solo en `onExit`. Si nunca llega `exit`, la llamada permanece pendiente. Lo correcto es mantener cuarentena de la propiedad, sin dar por terminado el proceso. | `detachedPresupuestosWriterRunner.ts` (mismo patrón de otros runners) | Diseñar estado de timeout/cuarentena explícito que notifique incertidumbre sin liberar conexión ni lease hasta salida confirmada; tests cuando `exit` no llega y `kill` falla. |
| G8 | **ALTO** | Resultado incierto de guardado: no existe aún coordinación productiva completa entre journal, reconciliación de revisiones, salida del child y reapertura segura del main. El fence exige `workerExitConfirmed`, identidad y conciliación, pero no constituye por sí solo su implementación de extremo a extremo. | `sqliteEngineOwnershipFence.ts`, `sqliteWriterHandoffCoordinator.ts`, `sqliteIncidentJournal.ts` | Protocolo ejecutable de cuarentena y conciliación; reanudación solo si salida, identidad, estado de datos y ownership son verificables. |
| G9 | **MEDIO-ALTO** | Presupuestos carga cuatro repositorios en `Promise.all` y calcula la revisión sobre esa composición; no garantiza instantánea transaccional de conjunto frente a escrituras de otros equipos. El OCC dentro del commit mitiga escritura obsoleta pero no lecturas incoherentes para UI. | `presupuestosRepository.ts:loadPresupuestosRecordsSnapshot` | Carga consistente de las cuatro tablas + token en una transacción de lectura o API de snapshot versionado y compatible. |
| G10 | **MEDIO** | El diseño no demuestra aún equivalencia exacta de token refresco y política de backups para todas las operaciones del child; necesita prueba por módulo y del ciclo completo. | `detached*WriterCore.ts`, `localBackupService.ts`, `sqlitePersistence.ts` | Matriz de contratos por módulo, tests de token, backup tras éxito y no backup tras conflicto/error. |

## Fortalezas verificadas
1. El lock actual utiliza `.lockdir`, propietario, TTL de 30 s, heartbeat a 10 s y comprobaciones conservadoras de liberación/recuperación (`databaseLockManager.ts` y `databaseLockRecovery.ts`). **No sustituir por un protocolo inventado sin demostrar necesidad.**
2. La cola IPC conoce las operaciones con timeout incierto y no las considera finalizadas por el mero timeout (`sqliteIpcQueue.ts`).
3. `sqliteEngineOwnershipFence.ts` diferencia `main`, `draining`, `main-closed`, `worker` y `quarantine`; nunca concede fallback automático a main con escritura incierta.
4. La cesión diseñada exige freeze + drain de actividades independientes, cola vacía y cierre confirmado del handle main (`sqliteWriterHandoffCoordinator.ts`).
5. Los núcleos de SQL de módulos especializados reutilizan transacciones atomizadas; el child ejecuta peticiones en cola serial e identifica esquema/base al abrir.
6. `safeDatabaseOperation` intenta conservar el estado y bloquear edición después de fallos SMB/IO; quick_check readonly externo si hay sospecha de corrupción.

## Plan de cierre propuesto (no asignar PR nuevas sin salida medible)
**Bloque A — cobertura completa.** Inventario en CI de todos los `openSqliteDatabase`/`new Database`/`db.backup`, conexiones de lectura y escritura, timers, locks, migraciones, copias, restauración, exportaciones y operaciones fuera de IPC. Clasificar por `main`, child y externa, y decidir cómo se congela cada ruta. Entregable: matriz 100% de rutas reales, con pruebas de no admisión.

**Bloque B — consistencia y compatibilidad.** Corregir versión OCC de Presupuestos (incluye soft-delete) y estados de migración tras rollback; asegurar snapshots consistentes de carga; comprobar que ningún backup/token cambia por conflicto. Entregable: tests con dos escrituras intercaladas y DB real.

**Bloque C — propiedad distribuida.** Conectar el handoff a una fachada única de producción sin abrir dos handles escritores; coordinar lock SMB, heartbeat, generación de propietario y backup/maintenance. Primero activación por flag interno **deshabilitado por defecto**. Entregable: pruebas de doble propietario imposible incluso con cut network y callback reentrante.

**Bloque D — incertidumbre y recuperación.** Kill/exit/timeout sin falso positivo; cuarentena con reconciliación verificable; reconexión sin reintentar una operación de commit indeterminado. Entregable: pruebas de crashes en cada frontera y salida ausente.

**Bloque E — Windows SMB y despliegue.** Dos equipos (cable y Wi-Fi), latencia real, corte durante transacción y durante cierre, cambio de interfaz, bloqueos >15 s, backups y restauración. Activación gradual solo tras observación y rollback operacional probado.

## GO / NO-GO verificable
Para habilitar en un equipo piloto deben cumplirse **todos**:
- CI verde, tests de integración del writer real empaquetado y matriz de cobertura sin rutas fuera de freeze/ownership.
- Se observa inequívocamente: cola y E/S en reposo -> main close confirmado -> worker abre -> lease SMB válido -> operación -> child exit confirmado -> mantenimiento/backup/reconciliación -> reapertura segura.
- Fallo de red/heartbeat/timeout => no escritura nueva y sin segunda apertura ni reintento de commit desconocido.
- OCC de las cuatro tablas y sus borrados lógicos probado con dos clientes.
- Backups recuperables y rutas de restauración/cambio de directorio bloqueadas durante la cesión.
- Ensayos Windows SMB con dos máquinas y recuperación de desconexión sin inconsistencias.
- `getSqliteWriterHandoffReadiness()` deja de ser un `ready:false` incondicional **solo** cuando comprueba esas condiciones reales.

## Alcance de la afirmación
No hay evidencia suficiente para cuantificar un porcentaje preciso de cobertura ni declarar que el writer es seguro para producción. Esta auditoría **no ha ejecutado el EXE ni simulado cortes de red**. El inventario de rutas debe automatizarse antes de afirmar exhaustividad.
