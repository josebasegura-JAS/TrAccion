# PR447 · Mantenimiento SQLite: serialización y actividad durante cesión

## Integrado en las rutas reales de producción
- `vacuumDatabaseNow`: la operación manual comparte la exclusión **local** por ruta `withDatabaseOperationLock` con los guardados y backups, antes de adquirir el lock SMB que ya tiene `vacuumMaintenance`. El resultado y las estadísticas del módulo permanecen intactos.
- `getVacuumStatus` y `runDataIntegrityAuditNow`: todas las lecturas directas sobre el handle principal se registran en `sqliteIndependentActivityTracker`.
- `createManualLocalBackup`, `createShutdownLocalBackup`, `listLocalBackups` y `restoreLocalBackup`: seguimiento desde antes de la primera operación hasta la finalización o el error, incluyendo E/S de fichero y cierre/reapertura en restauración.
- Una fachada genérica `sqliteMaintenanceGate` evita duplicar la política de admisión/serialización; los callbacks no se ejecutan cuando hay freeze.

## Seguridad
El tracker cuenta también la espera por la exclusión local; un timeout externo **no** libera anticipadamente el contador. No se elimina ni debilita ningún bloqueo SMB. VACUUM continúa ejecutándose en el main y no se ha activado un segundo propietario escritor.

El cambio reduce un hueco de carrera entre mantenimiento y una futura cesión, pero **no vuelve segura por sí sola** la cesión real: quedan rutas no cubiertas, en particular partes del ciclo de vida, repositorios especializados y callbacks de mantenimiento. El funcionamiento del tracker anidado durante un handoff activo requiere validación adicional antes de activarlo.

## Pruebas
- freeze rechaza nuevas auditorías, restauraciones y compactaciones;
- drenaje real de restauración y error de backup;
- VACUUM espera a que termine una escritura bajo exclusión local;
- rechazo de parámetros de mantenimiento inválidos.

## Siguiente fase
Inventariar y cerrar todas las vías del ciclo de vida y repositorios especiales; integrar la fachada única de propietario y validar cierres/reconexión SMB con dos sesiones Windows antes de encender el escritor auxiliar.
