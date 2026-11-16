# PR473 — Doble barrera para mantenimiento SQLite antes del handoff

## Diagnóstico
Las operaciones de restauración, backups manuales y de cierre, compactación VACUUM, lectura de información de copias y auditoría de integridad ya usaban `sqliteMaintenanceGate` para reservar actividad durante toda la operación. Sin embargo, este gate **no verificaba la propiedad local del motor**. Si una futura integración descongelara accidentalmente el tracker tras ceder la propiedad, una entrada de mantenimiento podría acceder al handle del proceso principal.

La propiedad local del escritor está definida en `sqliteEngineOwnershipFence` (`main`, `draining`, `main-closed`, `worker`, `quarantine`). Es independiente de la actividad observada y del lease SMB.

## Cambio
1. `createSqliteMaintenanceGate` recibe una verificación opcional de propiedad `assertMayEnterMain`, que se ejecuta **antes de reservar actividad** y antes de pedir el lock SMB. Conserva la compatibilidad con las pruebas y dependencias que crean gates aislados sin propiedad.
2. La fachada productiva `sqlitePersistence.ts` inyecta `sqliteEngineOwnershipFence.assertMayEnterMain()` en el gate existente.
3. Por el mismo punto de entrada quedan cubiertas: `vacuumDatabaseNow`, `getVacuumStatus`, `runDataIntegrityAuditNow`, `createManualLocalBackup`, `createShutdownLocalBackup`, `listLocalBackups` y `restoreLocalBackup`.
4. Los errores de propiedad no ejecutan callbacks SQL/SMB. La comprobación no cambia el manejo existente de `freeze`, la serialización local, el protocolo `.lockdir`, la migración ni los resultados de las operaciones admitidas.
5. Nuevas pruebas: cinco familias de mantenimiento rechazadas durante `draining`, VACUUM rechazado cuando `worker` es propietario sin tomar lock SMB, restauración rechazada durante `quarantine`; tras cancelación válida antes del cierre, se permite de nuevo.

## Limitaciones y NO-GO
- Esta PR añade defensa en profundidad **al mantenimiento de la fachada**, no prueba la cobertura exhaustiva de todos los accesos nativos, callbacks, backups pendientes ni los sistemas operativos.
- Una verificación de propiedad local no es un lock distribuido: el escritor detached todavía debe poseer un lease SMB válido con heartbeat y reconciliar escrituras inciertas.
- `getSqliteWriterHandoffReadiness()` continúa en `ready:false`. Ningún cambio activa el utilityProcess escritor.
- Debe completarse un análisis de admisión de callbacks directos, timer de backup pendiente y caminos de restauración antes de conectar el coordinador a producción.

## Validación
CI completo en Windows (TypeScript, ESLint, Vitest, E2E), revisión de escenarios de backup y recuperación. Solo fusionar con CI en verde.
