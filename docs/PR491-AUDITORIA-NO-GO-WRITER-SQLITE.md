# PR491 — Auditoría de salida del escritor aislado SQLite

Fecha de revisión: 17-11-2026. Base: `main` tras PR490, código consultado en GitHub.

## Decisión: **NO-GO para activar el writer detached en producción**

La migración experimental ya cubre recibos transaccionales en diversas familias (Criterios, lotes JSON, Configuración, Presupuestos, Tareas, Comité/Paritaria/Actas, Lotería, Sorteos, Teletrabajo y flujos atómicos). Esto **no** equivale a que la aplicación de producción use ni supervise dichas variantes. Las pruebas CI no demuestran comportamiento ante una pérdida real del servidor SMB.

### Hallazgos priorizados (observados en código)

**BLOQUEANTE 1 — Falsa prueba de confirmación por referencia aportada por caller.** `sqliteWriterHandoffCoordinator.reconcileWriterOperation` aceptaba un `SqliteReconciliationEvidence` externo con un texto arbitrario cuando hay journal durable. `durableWriterJournal.reconcileVerified` verifica formato básico, no origen criptográfico ni lectura SQLite. Una referencia inventada podía borrar una operación desconocida y permitir restaurar main si los otros controles eran afirmativos. **Corregido en PR491 para el coordinador durable:** solo se permite la ruta `reconcileReceiptedWriterOperation`, que consulta SQLite real tras EXIT confirmado. El journal de nivel inferior sigue siendo una primitiva y no es una API de autorización para IPC/UI.

**BLOQUEANTE 2 — Interpretar la ausencia de recibo de una operación legacy como no commit.** `reconcileReceiptedWriterOperation` no verificaba `receiptBacked` del journal. Si la tabla de recibos existía por otra escritura, una operación anterior sin recibo podía interpretarse falsamente como `not-committed`. **Corregido en PR491:** registrar explícitamente procedencia `receiptBacked` y rechazar conciliación por recibos si no consta; por defecto false. **Pendiente:** la futura integración productiva debe determinar este valor del tipo de mensaje realmente enviado por el transporte confiable, no de la UI.

**BLOQUEANTE 3 — Supervisor de reinicio todavía abstracto.** `orphanedWriterJournalRecovery` exige callbacks `assertPreviousWriterTerminated` y `withExclusiveRecoveryBarrier`, pero no existe integración productiva que certifique fin del proceso previo y exclusión durante TODA la conciliación. No admitir callbacks vacíos ni un booleano de supuesta terminación.

**BLOQUEANTE 4 — Cesión de todos los accesos SQLite sin demostrar.** `sqliteIndependentActivityTracker` reconoce explícitamente que todavía no incluye todos los accesos. Deben quedar instrumentados y drenados: IPC, backups, tareas fuera de cola, heartbeat, migraciones, handles de solo lectura, exportaciones e importaciones. El cierre real y el bloqueo de nuevos accesos deben estar garantizados antes de arrancar el worker.

**BLOQUEANTE 5 — Ensayos reales SMB pendientes.** La PR490 prueba dos handles sobre archivo local, no dos procesos Electron reales ni dos equipos Windows. No se dispone de evidencia de Wi-Fi ↔ cable, caída del recurso SMB, contención cruzada, cierre abrupto/reinicio con journal y resultado incierto.

**BLOQUEANTE 6 — Recuperación y reactivación todavía no unificadas.** La función de PR489 devuelve informe y conserva estado; no restaura fence. Se necesita diseñar y probar la transición completa con comprobación de identidad, operación por operación, barrera real y rollback operativo. Mantener ruta de producción actual sin habilitar el worker.

### Condiciones obligatorias para cambiar a GO

| Control | Evidencia necesaria | Estado |
|---|---|---|
| Todos los IPC de escritura optan por mensajes con recibo y registro pre-envío | Inventario completo de rutas, tests por módulo e inspección del transporte | **No demostrado** |
| `receiptBacked` confiable y no falsificable por renderer | Test de contrato, clasificación en main por kind y prueba de spoofing | **No implementado** |
| Un solo propietario de SQLite por equipo y lock SMB por escritura | Pruebas de carrera en inicio/salida y dos procesos reales | **Parcial** |
| Fin del worker anterior tras caída/reinicio | Supervisor real con prueba independiente, manejo de PID reutilizado y carreras | **No implementado** |
| Barrera de E/S completa y exclusividad durante conciliación | Inventario automático + inspección manual + tests contra nuevas entradas | **No demostrado** |
| Commit y ausencia de commit contrastados con SQLite | Receipts, esquema/UUID y quick_check con worker fuera | **Cubierto por pruebas unitarias; falta integración** |
| Operaciones ambiguas no reintentadas y sin falso éxito | Fault injection entre COMMIT y ACK; journal durable | **Parcial** |
| Dos instancias Electron y dos equipos Windows/SMB | Acta de ensayos PR490, logs y hashes de base aislada | **No ejecutado** |
| Plan de reversión y recuperación administrativa | Ejercicio real con copia de ensayo | **No ejecutado** |

### Riesgos que permanecen abiertos

- `durableWriterJournal` utiliza un archivo local con reemplazo por rename y `fsync`; faltan evidencias de durabilidad, exclusión de dos productores y recuperación tras reinicio Windows.
- Primera escritura fallida puede hacer rollback de la creación de la tabla de recibos: la ausencia de tabla **debe seguir siendo incierta**, no interpretarse como ausencia de commit. No eliminar esta restricción sin una estrategia de aprovisionamiento y verificación.
- Los recibos identifican la operación confirmada en SQLite; por sí solos no demuestran que se haya entregado ACK ni que el cliente haya actualizado su UI.
- Una puntuación alta de cobertura Vitest no sustituye pruebas de fallos físicos y de configuración real.

### Secuencia mínima posterior

1. Implementar integrador productivo detrás de feature flag **apagado por defecto**, con bloqueo de todos los accesos y registro durable ligado a cada mensaje receipted.
2. Construir y comprobar supervisor fiable de proceso anterior y barrera exclusiva de recuperación sobre SMB.
3. Probar dos instancias Electron, primero en mismo PC y después dos equipos Windows, usando base ficticia desechable, cortes/reconexiones reales y chequeos de integridad.
4. Añadir diagnóstico, política operativa de cuarentena y recuperación asistida; revisar reintentos, backups y locks.
5. Nueva auditoría independiente. Solo después considerar activación progresiva con rollback documentado.

**Conclusión:** PR491 corrige dos vías potenciales de falsa conciliación y registra las evidencias faltantes. No equivale a una aprobación GO ni activa el motor experimental.
