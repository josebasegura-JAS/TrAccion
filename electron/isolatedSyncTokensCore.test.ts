import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readIsolatedSyncTokens } from './isolatedSyncTokensCore.js';
import { DIRECT_STORE_UPDATED_AT_TABLES } from './persistence/directStoreUpdatedAt.js';
import { isSyncTokensRequest, isSyncTokensResponse } from './isolatedSyncTokensProtocol.js';
import { runIsolatedSyncTokens, type SyncTokensChild } from './isolatedSyncTokensRunner.js';

afterEach(() => { vi.useRealTimers(); });

describe('Tokens multiusuario readonly', () => {
  it('lee marcas generales, tareas, sorteos y TODOS los módulos directos desde SQLite real', () => {
    const db = new Database(':memory:');
    try {
      const tables = new Set(Object.values(DIRECT_STORE_UPDATED_AT_TABLES).flat());
      // Sorteos consulta también la tabla de exclusiones, aunque no figure
      // entre los módulos directos de polling.
      tables.add('sorteos_exclusion_records');
      tables.add('persisted_records');
      for (const name of tables) db.exec(`CREATE TABLE ${name} (updated_at TEXT)`);
      db.exec('CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT)');
      db.prepare('INSERT INTO persisted_records (updated_at) VALUES (?)').run('2026-11-12T08:00:00.000Z');
      db.prepare('INSERT INTO persisted_records (updated_at) VALUES (?)').run('2026-11-13T08:00:00.000Z');
      db.prepare('INSERT INTO app_metadata (key, value) VALUES (?, ?)').run('persisted_records_refresh_token', 'refresh-test');
      db.prepare('INSERT INTO task_records (updated_at) VALUES (?)').run('2026-11-13T09:00:00.000Z');
      db.prepare('INSERT INTO sorteos_draw_records (updated_at) VALUES (?)').run('2026-11-13T10:00:00.000Z');
      db.prepare('INSERT INTO ticket_restaurante_calendar_records (updated_at) VALUES (?)').run('2026-11-13T11:00:00.000Z');
      const result = readIsolatedSyncTokens(db);
      expect(result.refreshToken).toBe('refresh-test');
      expect(result.latestUpdatedAt).toBe('2026-11-13T08:00:00.000Z');
      expect(result.taskRecordsUpdatedAt).toBe('2026-11-13T09:00:00.000Z');
      expect(result.sorteosDrawsUpdatedAt).toBe('2026-11-13T10:00:00.000Z');
      expect(result.sorteosExclusionsUpdatedAt).toBeNull();
      expect(result.directStoreUpdatedAt.tareas).toBe('2026-11-13T09:00:00.000Z');
      expect(result.directStoreUpdatedAt['ticket-restaurante']).toBe('2026-11-13T11:00:00.000Z');
      expect(Object.keys(result.directStoreUpdatedAt)).toEqual(Object.keys(DIRECT_STORE_UPDATED_AT_TABLES));
    } finally { db.close(); }
  });

  it('rechaza peticiones sin identidad y respuestas malformadas', () => {
    expect(isSyncTokensRequest({ kind: 'sync-tokens:read', databasePath: 'db.sqlite', expected: {} })).toBe(false);
    expect(isSyncTokensRequest({ kind: 'sync-tokens:sql', sql: 'DELETE FROM task_records' })).toBe(false);
    expect(isSyncTokensResponse({ kind: 'sync-tokens:result', snapshot: { refreshToken: 'x' } })).toBe(false);
  });

  it('confirma snapshot solo después de exit(0)', async () => {
    let onMessage: ((message: unknown) => void) | null = null;
    let onExit: ((code: number) => void) | null = null;
    const posted: unknown[] = [];
    const child: SyncTokensChild = {
      postMessage: message => { posted.push(message); },
      onMessage: callback => { onMessage = callback; },
      onExit: callback => { onExit = callback; },
      kill: vi.fn(),
    };
    const expected = { databaseUuid: 'db', applicationId: 'TrAccion', environment: 'production', schemaVersion: 1 };
    const job = runIsolatedSyncTokens({ createChild: () => child, databasePath: 'test.sqlite', expected });
    const emit = (message: unknown): void => { onMessage?.(message); };
    const exit = (code: number): void => { onExit?.(code); };
    const snapshot = {
      refreshToken: null, latestUpdatedAt: null, taskRecordsUpdatedAt: null,
      sorteosDrawsUpdatedAt: null, sorteosExclusionsUpdatedAt: null, directStoreUpdatedAt: {},
    };
    emit({ kind: 'sync-tokens:ready' });
    expect(posted[0]).toEqual({ kind: 'sync-tokens:read', databasePath: 'test.sqlite', expected });
    emit({ kind: 'sync-tokens:result', snapshot });
    expect(posted[1]).toEqual({ kind: 'sync-tokens:shutdown' });
    exit(0);
    expect(await job).toEqual(snapshot);
  });

  it('si el proceso sale mal no valida un resultado previo', async () => {
    let emit: (message: unknown) => void = () => undefined;
    let exit: (code: number) => void = () => undefined;
    const child: SyncTokensChild = {
      postMessage: () => undefined,
      onMessage: callback => { emit = callback; },
      onExit: callback => { exit = callback; },
      kill: () => undefined,
    };
    const job = runIsolatedSyncTokens({
      createChild: () => child,
      databasePath: 'test.sqlite',
      expected: { databaseUuid: 'db', applicationId: 'TrAccion', environment: 'production', schemaVersion: 1 },
    });
    emit({ kind: 'sync-tokens:ready' });
    emit({ kind: 'sync-tokens:rejected' });
    exit(1);
    await expect(job).rejects.toThrow('No se ha podido confirmar');
  });
});
