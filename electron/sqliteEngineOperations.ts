import type * as Persistence from './sqlitePersistence.js';
import type { EngineOperation } from './sqliteEngineTransport.js';

// Explicit contract: no arbitrary SQL, module lookup or renderer-controlled imports.
export const SQLITE_ENGINE_OPERATIONS = [
  'clearDailyLocalBackupDirectory',
  'clearSecondaryBackupDirectory',
  'clearUpdatesDirectory',
  'getDailyLocalBackupSettings',
  'getSecondaryBackupDirectory',
  'getUpdatesDirectory',
  'setDailyLocalBackupDirectory',
  'setDailyLocalBackupEnabled',
  'setDailyLocalBackupRetentionDays',
  'setSecondaryBackupDirectory',
  'setUpdatesDirectory',
  'savePersistedRecord',
  'savePersistedRecordIfUnchanged',
  'savePersistedRecordsIfUnchanged',
  'migrateLocalStorageSnapshot',
  'getPersistedRecordSnapshot',
  'loadPersistedRecordsHydrationSnapshot',
  'loadPersistedRecordsSnapshot',
  'getPersistedRecordsTokenSnapshot',
  'loadTeletrabajoRecordsSnapshot',
  'saveTeletrabajoRecordIfUnchanged',
  'saveTeletrabajoRecordsIfUnchanged',
  'loadComiteSessionRecordsSnapshot',
  'saveComiteSessionRecordIfUnchanged',
  'loadParitariaSessionRecordsSnapshot',
  'saveParitariaSessionRecordIfUnchanged',
  'loadActaRecordsSnapshot',
  'saveActaRecordIfUnchanged',
  'loadTaskRecordsSnapshot',
  'saveTaskRecordIfUnchanged',
  'loadEmployeeRecordsSnapshot',
  'saveEmployeeRecordIfUnchanged',
  'saveEmployeeRecordsIfUnchanged',
  'loadSorteosRecordsSnapshot',
  'saveSorteosSnapshotIfUnchanged',
  'loadVinculogramaRecordsSnapshot',
  'saveVinculogramaRecordIfUnchanged',
  'loadLicenciaSinSueldoRecordsSnapshot',
  'saveLicenciaSinSueldoRecordIfUnchanged',
  'loadCriteriosRrllRecordsSnapshot',
  'saveCriteriosRrllRecordIfUnchanged',
  'saveCriteriosRrllRecordsIfUnchanged',
  'loadActaTypeRecordsSnapshot',
  'saveActaTypeRecordIfUnchanged',
  'saveActaTypeRecordsIfUnchanged',
  'loadTicketRestauranteCalendarRecordsSnapshot',
  'saveTicketRestauranteCalendarRecordIfUnchanged',
  'saveTicketRestauranteCalendarRecordsIfUnchanged',
  'loadTicketRestaurantePersonRecordsSnapshot',
  'saveTicketRestaurantePersonRecordIfUnchanged',
  'saveTicketRestaurantePersonRecordsIfUnchanged',
  'loadTicketRestauranteAbsenceRecordsSnapshot',
  'saveTicketRestauranteAbsenceRecordIfUnchanged',
  'saveTicketRestauranteAbsenceRecordsIfUnchanged',
  'loadTicketRestauranteConfigRecordsSnapshot',
  'saveTicketRestauranteConfigRecordIfUnchanged',
  'loadTicketRestauranteManutencionRecordsSnapshot',
  'saveTicketRestauranteManutencionRecordIfUnchanged',
  'saveTicketRestauranteManutencionRecordsIfUnchanged',
  'loadEspecialesRecipientRecordsSnapshot',
  'saveEspecialesRecipientRecordIfUnchanged',
  'loadTeletrabajoPuestoRecordsSnapshot',
  'saveTeletrabajoPuestoRecordIfUnchanged',
  'loadTeletrabajoGrupoCoberturaRecordsSnapshot',
  'saveTeletrabajoGrupoCoberturaRecordIfUnchanged',
  'loadJobPositionTranslationRecordsSnapshot',
  'saveJobPositionTranslationRecordIfUnchanged',
  'loadLoteriaRecordsSnapshot',
  'saveLoteriaSnapshotIfUnchanged',
  'loadPresupuestosRecordsSnapshot',
  'savePresupuestosSnapshotIfUnchanged',
  'loadConfiguracionSnapshot',
  'saveConfiguracionIfUnchanged',
  'vacuumDatabaseNow',
  'getVacuumStatus',
  'runDataIntegrityAuditNow',
  'getCurrentDatabaseLockInfo',
  'forceReleaseDatabaseLock',
  'initializeSqlitePersistence',
  'checkSqliteHealth',
  'createShutdownLocalBackup',
  'createManualLocalBackup',
  'createLocalStorageBackup',
  'listLocalBackups',
  'restoreLocalBackup',
  'closeSessionWorkflowAtomically',
  'importSessionHistoryAtomically',
  'closeCoordinationWorkflowAtomically',
  'createCoordinationTaskAtomically',
  'getSqliteSyncTokensSnapshot',
  'acquireRecordLock',
  'heartbeatRecordLock',
  'releaseRecordLock',
  'getRecordLock',
  'listOtherTaskLocks',
  'changeSqliteDirectory',
  'resetSqliteDirectory',
  'closeSqlitePersistence',
  'getSqliteStatus',
  'getSqliteRestartBackupSnapshot',
] as const satisfies readonly (keyof typeof Persistence)[];

export type SqliteEngineOperationName = typeof SQLITE_ENGINE_OPERATIONS[number];

export function createPersistenceOperations(persistence: typeof Persistence): Map<string, EngineOperation> {
  const operations = new Map<string, EngineOperation>();
  for (const name of SQLITE_ENGINE_OPERATIONS) {
    const handler = persistence[name] as unknown as EngineOperation;
    operations.set(name, (...args) => handler(...args));
  }
  return operations;
}

// Solo consultas verificadas sin migraciones ni mantenimiento.
// Una operación nueva es exclusiva por defecto, aunque se llame get/load.
const VERIFIED_READ_ONLY = new Set<string>([
  'getPersistedRecordSnapshot',
  'getPersistedRecordsTokenSnapshot',
  'loadPersistedRecordsHydrationSnapshot',
]);

export function isEngineReadOnlyOperation(name: string): boolean {
  return VERIFIED_READ_ONLY.has(name);
}
