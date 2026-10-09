from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'No se encontró patrón en {path}: {old[:100]!r}')
    if text.count(old) != 1:
        raise SystemExit(f'Patrón ambiguo en {path}: {text.count(old)} coincidencias')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# 1) Permitir que una suboperación dentro de un IPC de lectura se marque explícitamente como escritura.
replace_once(
    'electron/sqliteIpcQueue.ts',
    "export function getCurrentSqliteIpcOperationName(): string | null {\n  return sqliteIpcContext.getStore()?.operationName ?? null;\n}\n",
    "export function getCurrentSqliteIpcOperationName(): string | null {\n  return sqliteIpcContext.getStore()?.operationName ?? null;\n}\n\n/**\n * Ejecuta una suboperación SQLite con semántica de escritura aunque el IPC\n * exterior esté clasificado como solo lectura. Se usa para preparaciones\n * idempotentes (p. ej. migraciones legacy) que deben adquirir `.lockdir` sin\n * convertir las lecturas posteriores en operaciones exclusivas.\n */\nexport function runCurrentSqliteIpcAsWrite<T>(\n  operation: QueuedIpcOperation<T>,\n): Promise<Awaited<T>> {\n  const currentContext = sqliteIpcContext.getStore();\n  const operationName = currentContext\n    ? `${currentContext.operationName}:migration`\n    : 'sqlite:migration';\n\n  return sqliteIpcContext.run(\n    { operationName, readOnly: false },\n    () => Promise.resolve().then(() => operation()),\n  ) as Promise<Awaited<T>>;\n}\n",
)

# 2) La lectura del repositorio simple separa migración (write context) de lectura pura.
replace_once(
    'electron/persistence/simpleJsonModuleRepository.ts',
    "  safeDatabaseOperation: <T>(\n    operation: () => T,\n    fallback: (status: SimpleDatabaseStatus, message: string) => T,\n  ) => Promise<T>;\n",
    "  safeDatabaseOperation: <T>(\n    operation: () => T,\n    fallback: (status: SimpleDatabaseStatus, message: string) => T,\n  ) => Promise<T>;\n  safeDatabaseMigrationOperation: <T>(\n    operation: () => T,\n    fallback: (status: SimpleDatabaseStatus, message: string) => T,\n  ) => Promise<T>;\n",
)

replace_once(
    'electron/persistence/simpleJsonModuleRepository.ts',
    ") {\n  return {\n    loadSnapshot: () => deps.safeDatabaseOperation(\n      () => {\n        const currentStatus = deps.getSqliteStatus();\n        if (!currentStatus.ready || currentStatus.phase !== 'active') {\n          return { status: currentStatus, records: [] };\n        }\n\n        const db = deps.requireDatabase();\n        db.transaction(() => maybeMigrateJsonModuleRecords(db, options))();\n        return { status: currentStatus, records: readActiveJsonRecords(db, options.tableName) };\n      },\n      (nextStatus) => ({ status: nextStatus, records: [] }),\n    ),\n",
    ") {\n  // El objeto Database cambia cada vez que se activa/reabre una base. Un\n  // WeakSet por repositorio permite saber si ESTA conexión concreta ya fue\n  // preparada sin reutilizar el estado de otra base (A → B → A).\n  const migratedDatabases = new WeakSet<Database>();\n\n  const ensureMigrationForDatabase = (db: Database): void => {\n    if (migratedDatabases.has(db)) {\n      return;\n    }\n\n    maybeMigrateJsonModuleRecords(db, options);\n    migratedDatabases.add(db);\n  };\n\n  return {\n    loadSnapshot: async () => {\n      const initialStatus = deps.getSqliteStatus();\n      if (!initialStatus.ready || initialStatus.phase !== 'active') {\n        return { status: initialStatus, records: [] };\n      }\n\n      const initialDatabase = deps.requireDatabase();\n      if (!migratedDatabases.has(initialDatabase)) {\n        const migrationStatus = await deps.safeDatabaseMigrationOperation(\n          () => {\n            const currentStatus = deps.getSqliteStatus();\n            if (\n              !currentStatus.ready ||\n              currentStatus.phase !== 'active' ||\n              deps.isDatabaseWriteBlockedByHeartbeat()\n            ) {\n              return currentStatus;\n            }\n\n            deps.assertDatabaseWritesAllowed();\n            const db = deps.requireDatabase();\n            db.transaction(() => ensureMigrationForDatabase(db))();\n            return currentStatus;\n          },\n          (nextStatus) => nextStatus,\n        );\n\n        if (!migrationStatus.ready || migrationStatus.phase !== 'active') {\n          return { status: migrationStatus, records: [] };\n        }\n      }\n\n      return deps.safeDatabaseOperation(\n        () => {\n          const currentStatus = deps.getSqliteStatus();\n          if (!currentStatus.ready || currentStatus.phase !== 'active') {\n            return { status: currentStatus, records: [] };\n          }\n\n          const db = deps.requireDatabase();\n          return { status: currentStatus, records: readActiveJsonRecords(db, options.tableName) };\n        },\n        (nextStatus) => ({ status: nextStatus, records: [] }),\n      );\n    },\n",
)

replace_once(
    'electron/persistence/simpleJsonModuleRepository.ts',
    "          maybeMigrateJsonModuleRecords(db, options);\n          const saveResult = saveJsonModuleRecordInTransaction(db, record, currentStatus, options, deps);",
    "          ensureMigrationForDatabase(db);\n          const saveResult = saveJsonModuleRecordInTransaction(db, record, currentStatus, options, deps);",
)
replace_once(
    'electron/persistence/simpleJsonModuleRepository.ts',
    "            maybeMigrateJsonModuleRecords(db, options);\n            return records.map((record) => {",
    "            ensureMigrationForDatabase(db);\n            return records.map((record) => {",
)

# 3) Fachada SQLite: la preparación de migración fuerza contexto write y luego vuelve a read-only.
replace_once(
    'electron/sqlitePersistence.ts',
    "import { stat } from 'node:fs/promises';\nimport path from 'node:path';\n",
    "import { stat } from 'node:fs/promises';\nimport path from 'node:path';\nimport { runCurrentSqliteIpcAsWrite } from './sqliteIpcQueue.js';\n",
)

replace_once(
    'electron/sqlitePersistence.ts',
    "async function safeDatabaseOperation<T>(\n  operation: () => T,\n  fallback: (status: DatabaseStatus, message: string) => T,\n): Promise<T> {",
    "async function safeDatabaseOperation<T>(\n  operation: () => T,\n  fallback: (status: DatabaseStatus, message: string) => T,\n): Promise<T> {",
)

# Insertar wrapper justo después de safeDatabaseOperation, antes de checkSqliteHealth.
marker = "\nexport async function checkSqliteHealth(): Promise<DatabaseHealthCheckResult> {"
wrapper = "\nasync function safeDatabaseMigrationOperation<T>(\n  operation: () => T,\n  fallback: (status: DatabaseStatus, message: string) => T,\n): Promise<T> {\n  return runCurrentSqliteIpcAsWrite(() => safeDatabaseOperation(operation, fallback));\n}\n"
replace_once('electron/sqlitePersistence.ts', marker, wrapper + marker)

replace_once(
    'electron/sqlitePersistence.ts',
    "      safeDatabaseOperation,\n      getSqliteStatus,",
    "      safeDatabaseOperation,\n      safeDatabaseMigrationOperation,\n      getSqliteStatus,",
)

# 4) Test del contexto IPC anidado.
replace_once(
    'electron/sqliteIpcQueue.test.ts',
    "  isSqliteIpcReadOnlyOperation,\n  resolveSqliteIpcTimeoutMs,",
    "  isSqliteIpcReadOnlyOperation,\n  resolveSqliteIpcTimeoutMs,\n  runCurrentSqliteIpcAsWrite,",
)

insert_test = r'''

  it('permite que una migración dentro de un load adquiera semántica de escritura y restaura después el contexto read-only', async () => {
    const operation = enqueueSqliteIpc('tasks:load-records', async () => {
      const before = isCurrentSqliteIpcReadOnly();
      const during = await runCurrentSqliteIpcAsWrite(async () => {
        await Promise.resolve();
        return isCurrentSqliteIpcReadOnly();
      });
      const after = isCurrentSqliteIpcReadOnly();
      return { before, during, after };
    });

    await vi.runAllTimersAsync();
    await expect(operation).resolves.toEqual({ before: true, during: false, after: true });
  });
'''
replace_once(
    'electron/sqliteIpcQueue.test.ts',
    "\n  it('informa el timeout al llamador sin afirmar que la operación se haya cancelado', async () => {",
    insert_test + "\n  it('informa el timeout al llamador sin afirmar que la operación se haya cancelado', async () => {",
)

# 5) Regresión de migración: primera carga prepara bajo write; siguientes son lecturas puras; B vuelve a prepararse.
Path('electron/persistence/simpleJsonModuleRepository.migration.test.ts').write_text(r'''import { describe, expect, it, vi } from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import { createSimpleJsonModuleRepository, type SimpleDatabaseStatus } from './simpleJsonModuleRepository.js';

const LEGACY_KEY = 'legacy.records';
const TABLE = 'sample_records';

function createDatabase(recordId: string): InstanceType<typeof SqliteDatabase> {
  const db = new SqliteDatabase(':memory:');
  db.exec(`
    CREATE TABLE persisted_records (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE ${TABLE} (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);
  const now = '2026-10-09T10:00:00.000Z';
  const value = JSON.stringify([{ id: recordId, createdAt: now, updatedAt: now, deletedAt: null }]);
  db.prepare(
    `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
     VALUES (?, ?, 'legacy', ?, ?)`,
  ).run(LEGACY_KEY, value, now, now);
  return db;
}

function activeStatus(path: string): SimpleDatabaseStatus {
  return {
    ready: true,
    engine: 'better-sqlite3',
    phase: 'active',
    path,
    schemaVersion: 1,
    isDefaultPath: false,
    lockPath: `${path}.lockdir`,
  };
}

describe('simpleJsonModuleRepository migration/read separation', () => {
  it('migra una sola vez por conexión y deja las lecturas posteriores como operaciones puras', async () => {
    const db = createDatabase('A-1');
    const status = activeStatus('A.sqlite');
    let migrationDone = false;
    const safeReads = vi.fn(async <T>(operation: () => T) => operation());
    const safeMigrations = vi.fn(async <T>(operation: () => T) => operation());

    const repository = createSimpleJsonModuleRepository(
      {
        tableName: TABLE,
        legacyKey: LEGACY_KEY,
        moduleLabel: 'Módulo prueba',
        getMigrationDone: () => migrationDone,
        setMigrationDone: (value) => { migrationDone = value; },
      },
      {
        safeDatabaseOperation: safeReads,
        safeDatabaseMigrationOperation: safeMigrations,
        getSqliteStatus: () => status,
        requireDatabase: () => db,
        isUpdatedAtRow: (row): row is { updated_at: string } =>
          Boolean(row && typeof row === 'object' && typeof (row as { updated_at?: unknown }).updated_at === 'string'),
        updateRefreshMetadata: vi.fn(),
        enqueueLocalBackup: vi.fn(),
        assertDatabaseWritesAllowed: vi.fn(),
        isDatabaseWriteBlockedByHeartbeat: () => false,
      },
    );

    const first = await repository.loadSnapshot();
    expect(first.records.map((record) => record.id)).toEqual(['A-1']);
    expect(safeMigrations).toHaveBeenCalledTimes(1);
    expect(safeReads).toHaveBeenCalledTimes(1);

    migrationDone = false; // simula la invalidación histórica de la factoría.
    const second = await repository.loadSnapshot();
    expect(second.records.map((record) => record.id)).toEqual(['A-1']);
    expect(safeMigrations).toHaveBeenCalledTimes(1);
    expect(safeReads).toHaveBeenCalledTimes(2);

    db.close();
  });

  it('vuelve a preparar la migración al cambiar a otra conexión SQLite', async () => {
    const dbA = createDatabase('A-1');
    const dbB = createDatabase('B-1');
    let currentDb = dbA;
    let currentStatus = activeStatus('A.sqlite');
    let migrationDone = false;
    const safeMigrations = vi.fn(async <T>(operation: () => T) => operation());

    const repository = createSimpleJsonModuleRepository(
      {
        tableName: TABLE,
        legacyKey: LEGACY_KEY,
        moduleLabel: 'Módulo prueba',
        getMigrationDone: () => migrationDone,
        setMigrationDone: (value) => { migrationDone = value; },
      },
      {
        safeDatabaseOperation: async <T>(operation: () => T) => operation(),
        safeDatabaseMigrationOperation: safeMigrations,
        getSqliteStatus: () => currentStatus,
        requireDatabase: () => currentDb,
        isUpdatedAtRow: (row): row is { updated_at: string } =>
          Boolean(row && typeof row === 'object' && typeof (row as { updated_at?: unknown }).updated_at === 'string'),
        updateRefreshMetadata: vi.fn(),
        enqueueLocalBackup: vi.fn(),
        assertDatabaseWritesAllowed: vi.fn(),
        isDatabaseWriteBlockedByHeartbeat: () => false,
      },
    );

    expect((await repository.loadSnapshot()).records.map((record) => record.id)).toEqual(['A-1']);

    currentDb = dbB;
    currentStatus = activeStatus('B.sqlite');
    migrationDone = false;
    expect((await repository.loadSnapshot()).records.map((record) => record.id)).toEqual(['B-1']);
    expect(safeMigrations).toHaveBeenCalledTimes(2);

    dbA.close();
    dbB.close();
  });
});
''', encoding='utf-8')
