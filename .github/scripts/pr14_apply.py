from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    if text.count(old) != 1:
        raise RuntimeError(f'{path}: se esperaba 1 coincidencia y hay {text.count(old)}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1) Repositorio genérico persisted_records: batch OCC atómico.
replace_once(
    'electron/persistence/persistedRecordsRepository.ts',
    "export interface ConditionalPersistedRecordSaveResult {\n  ok: boolean;\n  status: DatabaseStatus;\n  currentUpdatedAt: string | null;\n  message: string;\n}\n",
    "export interface ConditionalPersistedRecordSaveResult {\n  ok: boolean;\n  status: DatabaseStatus;\n  currentUpdatedAt: string | null;\n  message: string;\n}\n\nexport interface ConditionalPersistedRecordsBatchSaveResult {\n  ok: boolean;\n  status: DatabaseStatus;\n  currentUpdatedAt: string | null;\n  failedRecordKey?: string;\n  message: string;\n}\n\nclass PersistedRecordsBatchConflictError extends Error {\n  constructor(\n    readonly key: string,\n    readonly currentUpdatedAt: string | null,\n  ) {\n    super('Persisted records OCC conflict');\n  }\n}\n",
)

batch_function = r'''
  async function savePersistedRecordsIfUnchanged(
    records: ConditionalPersistedStorageRecord[],
  ): Promise<ConditionalPersistedRecordsBatchSaveResult> {
    return deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (
          !currentStatus.ready ||
          currentStatus.phase !== 'active' ||
          deps.isDatabaseWriteBlockedByHeartbeat()
        ) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt: null,
            message:
              currentStatus.message ??
              'SQLite no está activo. No se permite guardar sin base compartida.',
          };
        }

        if (records.length === 0) {
          return {
            ok: true,
            status: currentStatus,
            currentUpdatedAt: null,
            message: 'No hay datos que guardar.',
          };
        }

        const uniqueKeys = new Set(records.map((record) => record.key));
        if (uniqueKeys.size !== records.length) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt: null,
            message: 'El guardado atómico contiene claves duplicadas.',
          };
        }

        deps.assertDatabaseWritesAllowed();
        const db = deps.requireDatabase();

        try {
          const now = db.transaction(() => {
            const currentUpdatedAtByKey = new Map<string, string | null>();

            // OCC de todo el lote antes de la primera escritura. Si una sola
            // clave cambió, no se modifica ninguna de las demás.
            for (const record of records) {
              const row = db
                .prepare('SELECT updated_at FROM persisted_records WHERE key = ?')
                .get(record.key);
              const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;
              currentUpdatedAtByKey.set(record.key, currentUpdatedAt);
              if (currentUpdatedAt !== record.expectedUpdatedAt) {
                throw new PersistedRecordsBatchConflictError(record.key, currentUpdatedAt);
              }
            }

            const updatedAt = new Date().toISOString();
            for (const record of records) {
              const currentUpdatedAt = currentUpdatedAtByKey.get(record.key) ?? null;
              if (currentUpdatedAt === null) {
                db.prepare(
                  `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
                   VALUES (?, ?, 'sqlite-primary', ?, ?)`,
                ).run(record.key, record.value, updatedAt, updatedAt);
              } else {
                const updateResult = db
                  .prepare(
                    `UPDATE persisted_records
                     SET value_json = ?, source = 'sqlite-primary', updated_at = ?
                     WHERE key = ? AND updated_at = ?`,
                  )
                  .run(record.value, updatedAt, record.key, currentUpdatedAt);
                if (updateResult.changes !== 1) {
                  const latest = db
                    .prepare('SELECT updated_at FROM persisted_records WHERE key = ?')
                    .get(record.key);
                  throw new PersistedRecordsBatchConflictError(
                    record.key,
                    isUpdatedAtRow(latest) ? latest.updated_at : null,
                  );
                }
              }
            }

            updateRefreshMetadata(db, updatedAt);
            return updatedAt;
          })();

          deps.enqueueLocalBackup(`save-batch:${records.length}`);
          return {
            ok: true,
            status: currentStatus,
            currentUpdatedAt: now,
            message: 'Guardado atómico confirmado en SQLite compartido.',
          };
        } catch (error) {
          if (error instanceof PersistedRecordsBatchConflictError) {
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: error.currentUpdatedAt,
              failedRecordKey: error.key,
              message:
                'Los datos compartidos han cambiado mientras guardabas. Recarga antes de continuar para no pisar cambios de otro usuario.',
            };
          }
          throw error;
        }
      },
      (nextStatus, message) => ({
        ok: false,
        status: nextStatus,
        currentUpdatedAt: null,
        message,
      }),
    );
  }

'''
replace_once(
    'electron/persistence/persistedRecordsRepository.ts',
    '  async function migrateLocalStorageSnapshot(payload: LocalStorageBackupPayload): Promise<DatabaseStatus> {',
    batch_function + '  async function migrateLocalStorageSnapshot(payload: LocalStorageBackupPayload): Promise<DatabaseStatus> {',
)
replace_once(
    'electron/persistence/persistedRecordsRepository.ts',
    '    savePersistedRecordIfUnchanged,\n    migrateLocalStorageSnapshot,',
    '    savePersistedRecordIfUnchanged,\n    savePersistedRecordsIfUnchanged,\n    migrateLocalStorageSnapshot,',
)

# 2) Fachada SQLite: exponer el batch del repositorio.
replace_once(
    'electron/sqlitePersistence.ts',
    '  savePersistedRecordIfUnchanged,\n  migrateLocalStorageSnapshot,',
    '  savePersistedRecordIfUnchanged,\n  savePersistedRecordsIfUnchanged,\n  migrateLocalStorageSnapshot,',
)
replace_once(
    'electron/sqlitePersistence.ts',
    '  savePersistedRecordIfUnchanged,\n  migrateLocalStorageSnapshot,\n  getPersistedRecordSnapshot,',
    '  savePersistedRecordIfUnchanged,\n  savePersistedRecordsIfUnchanged,\n  migrateLocalStorageSnapshot,\n  getPersistedRecordSnapshot,',
)

# 3) IPC: una sola llamada para el lote completo.
replace_once(
    'electron/ipc/registerCoreDatabaseIpc.ts',
    '  savePersistedRecordIfUnchanged,\n  getSecondaryBackupDirectory,',
    '  savePersistedRecordIfUnchanged,\n  savePersistedRecordsIfUnchanged,\n  getSecondaryBackupDirectory,',
)

batch_ipc = r'''  ipcMain.handle('database:save-local-storage-records-if-unchanged', (_event, payload: unknown) => {
    const candidate = payload as { records?: unknown } | null;
    if (!candidate || !Array.isArray(candidate.records)) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de guardado atómico inválido.',
      };
    }

    const records = candidate.records;
    const valid = records.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const record = item as { key?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
      return (
        typeof record.key === 'string' &&
        Boolean(record.key.trim()) &&
        typeof record.value === 'string' &&
        (typeof record.expectedUpdatedAt === 'string' || record.expectedUpdatedAt === null)
      );
    });

    if (!valid) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de guardado atómico inválido.',
      };
    }

    return enqueueSqliteIpc('database:save-local-storage-records-if-unchanged', () =>
      savePersistedRecordsIfUnchanged(
        records as Array<{ key: string; value: string; expectedUpdatedAt: string | null }>,
      ),
    );
  });
'''
replace_once(
    'electron/ipc/registerCoreDatabaseIpc.ts',
    "  ipcMain.handle('recordLock:acquire', (_event, payload: unknown) => {",
    batch_ipc + "  ipcMain.handle('recordLock:acquire', (_event, payload: unknown) => {",
)

# 4) Preload: bridge batch.
replace_once(
    'electron/preload.cts',
    "  }) => ipcRenderer.invoke('database:save-local-storage-record-if-unchanged', record),\n  loadLoteriaRecords:",
    "  }) => ipcRenderer.invoke('database:save-local-storage-record-if-unchanged', record),\n  saveLocalStorageRecordsIfUnchanged: (records: Array<{\n    key: string;\n    value: string;\n    expectedUpdatedAt: string | null;\n  }>) => ipcRenderer.invoke('database:save-local-storage-records-if-unchanged', { records }),\n  loadLoteriaRecords:",
)

# 5) Tipado renderer en declaración separada para no inflar vite-env.d.ts.
Path('src/persisted-records-atomic-batch.d.ts').write_text(r'''interface TraccionConditionalStorageBatchSaveResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  currentUpdatedAt: string | null;
  failedRecordKey?: string;
  message: string;
}

interface TraccionApi {
  saveLocalStorageRecordsIfUnchanged?: (
    records: TraccionConditionalStorageRecord[],
  ) => Promise<TraccionConditionalStorageBatchSaveResult>;
}
''', encoding='utf-8')

# 6) Renderer: helper genérico de escritura compartida atómica.
renderer_helper = r'''
export interface WriteSharedStorageItemsResult extends WriteSharedStorageItemResult {
  failedKey?: string;
}

export async function writeSharedStorageItemsAtomicallyAsync(
  records: TraccionStorageRecord[],
): Promise<WriteSharedStorageItemsResult> {
  if (records.length === 0) {
    return { ok: true, message: 'No hay datos que guardar.', updatedAt: null };
  }

  if (records.some((record) => !isPersistedStorageKey(record.key))) {
    return {
      ok: false,
      message: 'El guardado atómico solo admite datos compartidos persistidos en SQLite.',
      updatedAt: null,
    };
  }

  if (import.meta.env.MODE === 'test') {
    for (const record of records) writeRendererStorageCache(record.key, record.value, 'localStorage');
    return { ok: true, message: 'Guardado local atómico en test.', updatedAt: null };
  }

  const blockReason = shouldBlockSharedWrite();
  const feedbackKey = records.map((record) => record.key).join(', ');
  if (blockReason) {
    const message = `${blockReason} Datos afectados: ${feedbackKey}.`;
    emitPersistenceFeedback({
      kind: 'error',
      updatedAt: new Date().toISOString(),
      key: feedbackKey,
      message,
    });
    return { ok: false, message, updatedAt: null };
  }

  const saver = window.traccion?.saveLocalStorageRecordsIfUnchanged;
  if (!saver) {
    const message =
      'El guardado atómico no está disponible. Recarga o reinicia TrAcción antes de continuar.';
    emitPersistenceFeedback({
      kind: 'error',
      updatedAt: new Date().toISOString(),
      key: feedbackKey,
      message,
    });
    return { ok: false, message, updatedAt: null };
  }

  emitPersistenceFeedback({
    kind: 'saving',
    updatedAt: new Date().toISOString(),
    key: feedbackKey,
    message: 'Guardando datos relacionados en SQLite...',
  });
  await waitForNextPaint();

  try {
    const recordsWithTokens = await Promise.all(
      records.map(async (record) => ({
        ...record,
        expectedUpdatedAt: await resolveExpectedUpdatedAtForWrite(
          record.key,
          window.localStorage.getItem(record.key),
        ),
      })),
    );
    const result = await saver(recordsWithTokens);
    publishDatabaseStatus(result.status);

    if (
      !result.ok ||
      !result.status.ready ||
      result.status.phase !== 'active' ||
      result.status.isDefaultPath !== false
    ) {
      throw new Error(result.message ?? 'No se ha confirmado el guardado atómico en SQLite compartido.');
    }

    for (const record of records) {
      updateSqliteRecordMetadata(record.key, result.currentUpdatedAt);
      writeRendererStorageCache(record.key, record.value, 'sqlite');
    }

    const message = `Guardado atómico en SQLite ${formatPersistenceTime()}`;
    emitPersistenceFeedback({
      kind: 'saved',
      updatedAt: new Date().toISOString(),
      key: feedbackKey,
      message,
    });
    return { ok: true, message, updatedAt: result.currentUpdatedAt };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Error de guardado SQLite: los datos relacionados no se han confirmado.';

    if (isConcurrencyConflictMessage(message)) {
      emitPersistenceFeedback({
        kind: 'saved',
        updatedAt: new Date().toISOString(),
        key: feedbackKey,
        message: 'Conflicto de versión detectado; no se ha sobrescrito ningún dato compartido.',
      });
      return {
        ok: false,
        message:
          'Cambio no guardado — otro usuario modificó estos datos. Recarga la página para ver la versión actual antes de volver a editar.',
        updatedAt: null,
      };
    }

    if (!isTemporarySqliteLockMessage(message)) {
      emitPersistenceFeedback({
        kind: 'error',
        updatedAt: new Date().toISOString(),
        key: feedbackKey,
        message: `${message} No se ha guardado ninguno de los datos relacionados.`,
      });
    }

    return {
      ok: false,
      message: `${message} No se ha guardado ninguno de los datos relacionados.`,
      updatedAt: null,
    };
  }
}

'''
replace_once(
    'src/services/persistence.ts',
    'function getRendererStorageCacheValue(key: string): string | null {',
    renderer_helper + 'function getRendererStorageCacheValue(key: string): string | null {',
)
replace_once(
    'src/services/persistence.ts',
    "export async function writeJsonStorageAsync<T>(\n  key: string,\n  value: T,\n): Promise<WriteSharedStorageItemResult> {\n  return writeSharedStorageItemAsync(key, JSON.stringify(value));\n}\n",
    "export async function writeJsonStorageAsync<T>(\n  key: string,\n  value: T,\n): Promise<WriteSharedStorageItemResult> {\n  return writeSharedStorageItemAsync(key, JSON.stringify(value));\n}\n\nexport async function writeJsonStorageItemsAtomicallyAsync(\n  entries: Array<{ key: string; value: unknown }>,\n): Promise<WriteSharedStorageItemsResult> {\n  return writeSharedStorageItemsAtomicallyAsync(\n    entries.map(({ key, value }) => ({ key, value: JSON.stringify(value) })),\n  );\n}\n",
)

# 7) Huelgas: Zonas + Áreas en una sola confirmación.
replace_once(
    'src/features/huelgas/components/useHuelgaZoneMasters.ts',
    "import { writeJsonStorageAsync } from '../../../services/persistence';",
    "import { writeJsonStorageItemsAtomicallyAsync } from '../../../services/persistence';",
)
old_save = "setSavingZones(true); const zoneResult = await writeJsonStorageAsync(ZONAS_STORAGE_KEY, normalizedZones); if (!zoneResult.ok) { setSavingZones(false); await alert(zoneResult.message || 'No se ha podido guardar el maestro de zonas.', { title: 'Error de guardado', type: 'error' }); return; } const areaResult = await writeJsonStorageAsync(AREAS_STORAGE_KEY, normalizedAreas); setSavingZones(false); if (!areaResult.ok) { await alert(areaResult.message || 'No se ha podido guardar el maestro de áreas.', { title: 'Error de guardado', type: 'error' }); return; } setZonas(normalizedZones); setAreas(normalizedAreas);"
new_save = "setSavingZones(true); const saveResult = await writeJsonStorageItemsAtomicallyAsync([{ key: ZONAS_STORAGE_KEY, value: normalizedZones }, { key: AREAS_STORAGE_KEY, value: normalizedAreas }]); setSavingZones(false); if (!saveResult.ok) { await alert(saveResult.message || 'No se han podido guardar los maestros de zonas y áreas.', { title: 'Error de guardado', type: 'error' }); return; } setZonas(normalizedZones); setAreas(normalizedAreas);"
replace_once('src/features/huelgas/components/useHuelgaZoneMasters.ts', old_save, new_save)

# 8) Regresiones backend con SQLite real.
Path('electron/persistence/persistedRecordsAtomicBatch.test.ts').write_text(r'''import { afterEach, describe, expect, it, vi } from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPersistedRecordsRepository } from './persistedRecordsRepository.js';

const tempDirectories: string[] = [];

async function createRepository() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'traccion-persisted-batch-'));
  tempDirectories.push(directory);
  const databasePath = path.join(directory, 'traccion.sqlite');
  const db = new SqliteDatabase(databasePath);
  db.exec(`
    CREATE TABLE persisted_records (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const status = {
    ready: true,
    engine: 'better-sqlite3',
    phase: 'active' as const,
    path: databasePath,
    schemaVersion: 1,
    isDefaultPath: false,
    lockPath: `${databasePath}.lockdir`,
  };
  const enqueueLocalBackup = vi.fn();
  const repository = createPersistedRecordsRepository({
    ownerId: () => 'test-owner',
    getSqliteStatus: () => status,
    requireDatabase: () => db,
    safeDatabaseOperation: async (operation) => operation(),
    isDatabaseWriteBlockedByHeartbeat: () => false,
    assertDatabaseWritesAllowed: () => undefined,
    withDatabaseOperationLock: async (_databasePath, operation) => operation(),
    enqueueLocalBackup,
    getTaskRecordsUpdatedAt: () => null,
  });
  return { db, repository, enqueueLocalBackup };
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('persisted_records batch atómico', () => {
  it('guarda todas las claves con un único timestamp de confirmación', async () => {
    const { db, repository, enqueueLocalBackup } = await createRepository();
    const result = await repository.savePersistedRecordsIfUnchanged([
      { key: 'zones', value: '[1]', expectedUpdatedAt: null },
      { key: 'areas', value: '[2]', expectedUpdatedAt: null },
    ]);

    expect(result.ok).toBe(true);
    expect(result.currentUpdatedAt).toBeTruthy();
    expect(
      db.prepare('SELECT key, value_json, updated_at FROM persisted_records ORDER BY key').all(),
    ).toEqual([
      { key: 'areas', value_json: '[2]', updated_at: result.currentUpdatedAt },
      { key: 'zones', value_json: '[1]', updated_at: result.currentUpdatedAt },
    ]);
    expect(enqueueLocalBackup).toHaveBeenCalledTimes(1);
    db.close();
  });

  it('un conflicto OCC en una clave impide modificar cualquiera del lote', async () => {
    const { db, repository } = await createRepository();
    db.prepare(
      "INSERT INTO persisted_records (key, value_json, source, created_at, updated_at) VALUES (?, ?, 'sqlite-primary', ?, ?)",
    ).run('areas', '[0]', '2026-10-09T08:00:00.000Z', '2026-10-09T08:00:00.000Z');

    const result = await repository.savePersistedRecordsIfUnchanged([
      { key: 'zones', value: '[1]', expectedUpdatedAt: null },
      { key: 'areas', value: '[2]', expectedUpdatedAt: '2026-10-09T07:59:00.000Z' },
    ]);

    expect(result.ok).toBe(false);
    expect(result.failedRecordKey).toBe('areas');
    expect(db.prepare('SELECT value_json FROM persisted_records WHERE key = ?').get('zones')).toBeUndefined();
    expect(db.prepare('SELECT value_json FROM persisted_records WHERE key = ?').get('areas')).toEqual({ value_json: '[0]' });
    db.close();
  });

  it('un fallo SQL en la segunda escritura revierte también la primera', async () => {
    const { db, repository } = await createRepository();
    db.exec(`
      CREATE TRIGGER fail_areas_insert
      BEFORE INSERT ON persisted_records
      WHEN NEW.key = 'areas'
      BEGIN
        SELECT RAISE(FAIL, 'forced batch failure');
      END;
    `);

    await expect(
      repository.savePersistedRecordsIfUnchanged([
        { key: 'zones', value: '[1]', expectedUpdatedAt: null },
        { key: 'areas', value: '[2]', expectedUpdatedAt: null },
      ]),
    ).rejects.toThrow('forced batch failure');

    expect(db.prepare('SELECT COUNT(*) AS count FROM persisted_records').get()).toEqual({ count: 0 });
    db.close();
  });
});
''', encoding='utf-8')
