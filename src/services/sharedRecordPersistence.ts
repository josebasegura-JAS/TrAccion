import { publishDatabaseStatus } from './databaseStatus';
export interface SaveSharedArrayRecordOptions<TRecord> {
  storageKey: string;
  recordId: string;
  expectedUpdatedAt: string | null;
  parseRecords: (storageValue: string | null) => TRecord[];
  getRecordId: (record: TRecord) => string;
  getRecordUpdatedAt: (record: TRecord) => string | null | undefined;
  updateRecord: (latestRecord: TRecord) => TRecord;
  missingMessage?: string;
  conflictMessage?: string;
}

export interface SaveSharedArrayRecordResult<TRecord> {
  records: TRecord[];
  updatedRecord: TRecord;
}

export async function saveSharedArrayRecord<TRecord>({
  storageKey,
  recordId,
  expectedUpdatedAt,
  parseRecords,
  getRecordId,
  getRecordUpdatedAt,
  updateRecord,
  missingMessage = 'El registro ya no existe en la base compartida. Recarga antes de continuar.',
  conflictMessage = 'El registro ha sido modificado por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
}: SaveSharedArrayRecordOptions<TRecord>): Promise<SaveSharedArrayRecordResult<TRecord>> {
  const loadPersistedRecords = window.traccion?.loadPersistedRecords;
  const saveLocalStorageRecordIfUnchanged = window.traccion?.saveLocalStorageRecordIfUnchanged;

  if (!loadPersistedRecords || !saveLocalStorageRecordIfUnchanged) {
    throw new Error('SQLite compartido no disponible. No se permite guardar sin base compartida.');
  }

  const snapshot = await loadPersistedRecords();
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    throw new Error(
      snapshot.status.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
    );
  }

  const latestStorageRecord = snapshot.records.find((record) => record.key === storageKey) ?? null;
  const latestStorageValue = latestStorageRecord?.value ?? null;
  const expectedStorageUpdatedAt = latestStorageRecord?.updatedAt ?? null;
  const latestRecords = parseRecords(latestStorageValue);
  const latestRecord = latestRecords.find((record) => getRecordId(record) === recordId);

  if (!latestRecord) {
    throw new Error(missingMessage);
  }

  const latestUpdatedAt = getRecordUpdatedAt(latestRecord) ?? null;
  if (expectedUpdatedAt && latestUpdatedAt !== expectedUpdatedAt) {
    throw new Error(conflictMessage);
  }

  const updatedRecord = updateRecord(latestRecord);
  const nextRecords = latestRecords.map((record) =>
    getRecordId(record) === recordId ? updatedRecord : record,
  );
  const serialized = JSON.stringify(nextRecords);
  const result = await saveLocalStorageRecordIfUnchanged({
    key: storageKey,
    value: serialized,
    expectedUpdatedAt: expectedStorageUpdatedAt,
  });
  publishDatabaseStatus(result.status);

  if (!result.ok || !result.status.ready || result.status.phase !== 'active') {
    throw new Error(result.message ?? 'No se ha confirmado el guardado en SQLite compartido.');
  }

  window.localStorage.setItem(storageKey, serialized);
  return { records: nextRecords, updatedRecord };
}

export interface SaveNewSharedArrayRecordOptions<TRecord> {
  storageKey: string;
  newRecord: TRecord;
  parseRecords: (storageValue: string | null) => TRecord[];
  getRecordId: (record: TRecord) => string;
  duplicateMessage?: string;
}

export interface SaveNewSharedArrayRecordResult<TRecord> {
  records: TRecord[];
  newRecord: TRecord;
}

export async function saveNewSharedArrayRecord<TRecord>({
  storageKey,
  newRecord,
  parseRecords,
  getRecordId,
  duplicateMessage = 'El registro ya existe en la base compartida. Recarga antes de continuar.',
}: SaveNewSharedArrayRecordOptions<TRecord>): Promise<SaveNewSharedArrayRecordResult<TRecord>> {
  const loadPersistedRecords = window.traccion?.loadPersistedRecords;
  const saveLocalStorageRecordIfUnchanged = window.traccion?.saveLocalStorageRecordIfUnchanged;

  if (!loadPersistedRecords || !saveLocalStorageRecordIfUnchanged) {
    throw new Error('SQLite compartido no disponible. No se permite guardar sin base compartida.');
  }

  const snapshot = await loadPersistedRecords();
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    throw new Error(
      snapshot.status.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
    );
  }

  const latestStorageRecord = snapshot.records.find((record) => record.key === storageKey) ?? null;
  const latestStorageValue = latestStorageRecord?.value ?? null;
  const expectedStorageUpdatedAt = latestStorageRecord?.updatedAt ?? null;
  const latestRecords = parseRecords(latestStorageValue);
  const newRecordId = getRecordId(newRecord);

  if (latestRecords.some((record) => getRecordId(record) === newRecordId)) {
    throw new Error(duplicateMessage);
  }

  const nextRecords = [...latestRecords, newRecord];
  const serialized = JSON.stringify(nextRecords);
  const result = await saveLocalStorageRecordIfUnchanged({
    key: storageKey,
    value: serialized,
    expectedUpdatedAt: expectedStorageUpdatedAt,
  });
  publishDatabaseStatus(result.status);

  if (!result.ok || !result.status.ready || result.status.phase !== 'active') {
    throw new Error(result.message ?? 'No se ha confirmado el guardado en SQLite compartido.');
  }

  window.localStorage.setItem(storageKey, serialized);
  return { records: nextRecords, newRecord };
}
