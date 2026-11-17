# PR492A · Admisión obligatoria de backups SQLite en la barrera de handoff

## Cambio probado
El servicio `createLocalBackupService` mantenía dos rutas de escritura de backups que, **si el consumidor no inyectaba** `trackActivity`, ejecutaban las tareas directamente sin reservar `sqliteIndependentActivityTracker`. El consumidor productivo actual lo inyecta, pero la ruta alternativa podía ser usada por otros consumidores o cambios futuros y saltarse el freeze.

Esta PR asegura que los backups completos en vivo y de cierre **siempre** realizan admisión previa:
- Si hay tracker inyectado, utiliza ese tracker, conservando el flujo actual de producción.
- Si no se inyecta, utiliza el tracker global del proceso principal en vez de ejecutar trabajo sin registrar.
- Durante `beginFreeze`, un backup nuevo es rechazado, antes de acceder a SQLite/SMB.
- El registro de actividad se mantiene hasta que termina **realmente** la promesa de trabajo.

## Pruebas añadidas
- Sin inyector: un backup manual no puede comenzar durante el freeze global.
- Con inyector: preserva la reserva del tracker proporcionado.
- El script `classify-sqlite-routes.mjs` comprueba en CI que ambos backups completos llaman a `trackActivity` y existe reserva por defecto. Esta validación es **estática**, no prueba por sí misma cobertura total.

## Limitaciones: aún NO-GO
Esta es una parte de la PR492, no una auditoría ni un cierre total de todos los handles SQLite. Las rutas de restauración, listado y poda de backups, tareas programadas y migraciones, lectores dedicados, exportaciones, heartbeats y módulos que abren conexiones propias necesitan revisión individual de admisión. Además falta un supervisor y la cesión real del handle productivo.

**Siguiente fase**: PR492B inventario exhaustivo y bloqueo de más accesos fuera de cola. Después PR493 supervisor del worker, PR494 transporte productivo/journal, PR495 recuperación integral, PR496 ensayos, PR497 auditoría final. El número de PR puede aumentar ante nuevos hallazgos.

No activar el nuevo escritor ni considerar probada la resiliencia SMB mediante este cambio.
