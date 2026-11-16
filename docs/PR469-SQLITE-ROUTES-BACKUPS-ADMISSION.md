# PR469 — Matriz de rutas SQLite y reservas completas para backups

## Contexto
Continuación de PR467 (auditoría NO-GO) y PR468 (inventario automatizado y freeze del guardado masivo autónomo de Tareas). Esta PR **no habilita** el escritor auxiliar ni elimina ninguna de las barreras existentes.

## Cambios funcionales de seguridad

- En `localBackupService.ts` se ha introducido una dependencia opcional `trackActivity`, suministrada **siempre en la fachada productiva** por `sqlitePersistence.ts` mediante `sqliteIndependentActivityTracker.run`.
- La copia viva `writeLocalBackupArtifacts` reserva toda su ejecución con etiqueta `sqlite:backup-live-full`, empezando antes de consultar el estado del handle y antes de crear directorios, esperar el lock o lanzar cualquier backup SQLite/SMB.
- La copia de cierre `writeShutdownLocalBackupArtifacts` hace lo mismo, con etiqueta `sqlite:backup-shutdown-full`.
- Las reservas se liberan solo cuando termina realmente la operación, incluso cuando se produce un error. El tracking es reentrante para las copias que ya pasan por `sqliteMaintenanceGate`.
- El mantenimiento y los locks existentes permanecen intactos. La aplicación **no activa** el protocolo de cesión.

## Validación
- Dos nuevos escenarios en `localBackupService.test.ts`: backup vivo y de cierre retienen la reserva durante la espera SMB; tras `beginFreeze`, nuevas actividades se rechazan y `waitForDrain` no finaliza hasta completar las copias.
- `scripts/classify-sqlite-routes.mjs` consume el inventario de PR468, genera `audit-results/sqlite-route-classification.md` y `.json` con dueño, clase, admisión y riesgo pendiente por archivo.
- Los archivos con coincidencias no clasificados se muestran **PENDIENTE**, nunca como seguros. La clasificación actual es incremental, no exhaustiva.
- CI exige que estén presentes los puntos críticos de Tareas, backups y worker, y comprueba que no se ha perdido el cableado de la reserva de backups.

## Limitaciones explícitas
1. El script detecta patrones textuales y comentarios; no demuestra cobertura de todas las llamadas dinámicas ni de dependencias externas.
2. El informe no certifica como seguros todos los archivos clasificados; varias filas siguen **EN REVISIÓN**.
3. El escritor auxiliar **no posee ni renueva** el lock SMB de producción. La cesión aún está deshabilitada.
4. El arranque, restauración, cambio de directorio, callbacks de reconexión y migraciones deben completar sus pruebas de admisión y concurrencia.
5. No se han ejecutado ensayos en dos equipos Windows ni cortes de red.

## Próximos trabajos
- Resolver los `PENDIENTE` de la matriz y revisar específicamente rutas de apertura y escritura efectiva.
- Corregir la revisión OCC de Presupuestos para incluir borrados lógicos y evitar tokens basados solo en máximo timestamp.
- Resolver flags de migración tras rollback; preparar el handoff con propiedad y heartbeat distribuidos, manteniendo NO-GO hasta prueba integral.
