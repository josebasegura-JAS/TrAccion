import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createSimpleJsonModuleRepository, type SimpleJsonModuleRepositoryDependencies } from './simpleJsonModuleRepository.js';
import { transactionWithMigrationReset, withMigrationFlagRollback } from './migrationRollbackGuard.js';

describe('PR471: migración legacy y rollback real de SQLite', () => {
  it('si una importación falla DESPUÉS de migrar filas, la siguiente carga vuelve a migrarlas', async () => {
    const db = new Database(':memory:');
    try {
      db.exec(`
        CREATE TABLE persisted_records (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE sample_json_records (
          id TEXT PRIMARY KEY, value_json TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
        );
      `);
      db.prepare('INSERT INTO persisted_records VALUES (?, ?, ?)').run(
        'legacy.sample', JSON.stringify([{ id:'legacy', createdAt:'2026-01-01', updatedAt:'2026-01-01' }]), '2026-01-01',
      );
      let migrationDone = false;
      const status: ReturnType<SimpleJsonModuleRepositoryDependencies['getSqliteStatus']> = {
        ready:true,engine:'better-sqlite3',phase:'active',path:':memory:',
        schemaVersion:19,isDefaultPath:false,lockPath:'test.lockdir',
      };
      const deps: SimpleJsonModuleRepositoryDependencies = {
        safeDatabaseOperation: async operation => await operation(),
        safeDatabaseMigrationOperation: async operation => operation(),
        getSqliteStatus: () => status,
        requireDatabase: () => db,
        isUpdatedAtRow: (row: unknown): row is { updated_at: string } =>
          Boolean(row && typeof row === 'object' &&
            typeof (row as { updated_at?: unknown }).updated_at === 'string'),
        updateRefreshMetadata: () => undefined,
        enqueueLocalBackup: () => undefined,
        assertDatabaseWritesAllowed: () => undefined,
        isDatabaseWriteBlockedByHeartbeat: () => false,
      };
      const repository = createSimpleJsonModuleRepository({
        tableName:'sample_json_records',legacyKey:'legacy.sample',moduleLabel:'ejemplo',
        getMigrationDone:()=>migrationDone,
        setMigrationDone:value=>{migrationDone=value;},
      },deps);
      // La primera operación migra 'legacy', pero después falla al insertar 'fail'.
      db.exec(`CREATE TRIGGER fail_later BEFORE INSERT ON sample_json_records
        WHEN NEW.id = 'fail' BEGIN SELECT RAISE(ABORT, 'forced after migration'); END;`);
      await expect(repository.saveManyIfUnchanged([{
        id:'fail',value:'{"id":"fail"}',expectedUpdatedAt:null,
      }])).rejects.toThrow('forced after migration');

      expect((db.prepare('SELECT count(*) AS n FROM sample_json_records').get() as {n:number}).n).toBe(0);
      expect(migrationDone).toBe(false);
      db.exec('DROP TRIGGER fail_later');
      const loaded=await repository.loadSnapshot();
      expect(loaded.records.map(item=>item.id)).toEqual(['legacy']);
      expect(migrationDone).toBe(true);
    } finally {
      db.close();
    }
  });

  it('una transacción fallida invalida el marcador y no deja las filas parcialmente migradas', () => {
    const db = new Database(':memory:');
    let migrated=false;
    try {
      db.exec('CREATE TABLE sample (id TEXT PRIMARY KEY)');
      expect(() => transactionWithMigrationReset(db,()=>{migrated=false;},()=>{
        db.prepare('INSERT INTO sample VALUES (?)').run('a');
        migrated=true;
        throw new Error('forced rollback');
      })()).toThrow('forced rollback');
      expect(migrated).toBe(false);
      expect((db.prepare('SELECT count(*) AS n FROM sample').get() as {n:number}).n).toBe(0);
      expect(transactionWithMigrationReset(db,()=>{migrated=false;},()=>{
        db.prepare('INSERT INTO sample VALUES (?)').run('a');
        migrated=true;
        return 'committed';
      })()).toBe('committed');
      expect(migrated).toBe(true);
    } finally {
      db.close();
    }
  });

  it('también invalida el flag cuando falla un núcleo SQL compartido', () => {
    let done=true;
    expect(() => withMigrationFlagRollback(()=>{done=false;},()=>{
      throw new Error('simulated detached-core failure');
    })).toThrow('simulated detached-core failure');
    expect(done).toBe(false);
  });
});
