import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { readCurrentSchemaVersion } from './schemaMigrations.js';
import {
  createSqliteHealthBusyTracker,
  SQLITE_HEALTH_BUSY_PROBE_INTERVAL_MS,
  withTemporarySqliteBusyTimeout,
} from './sqliteHealthContention.js';

describe('health-check SQLite: limite de contención del hilo principal', () => {
  it('restaura busy_timeout tras una consulta satisfactoria o una excepción', () => {
    const db = new Database(':memory:');
    try {
      db.pragma('busy_timeout = 15000');
      expect(withTemporarySqliteBusyTimeout(db, 500, () => {
        expect((db.pragma('busy_timeout') as Array<{ timeout: number }>)[0]?.timeout).toBe(500);
        return 42;
      })).toBe(42);
      expect((db.pragma('busy_timeout') as Array<{ timeout: number }>)[0]?.timeout).toBe(15000);
      expect(() => withTemporarySqliteBusyTimeout(db, 500, () => {
        throw new Error('fallo inyectado');
      })).toThrow('fallo inyectado');
      expect((db.pragma('busy_timeout') as Array<{ timeout: number }>)[0]?.timeout).toBe(15000);
    } finally {
      db.close();
    }
  });

  it('no espera 15 segundos cuando otra conexión retiene un bloqueo EXCLUSIVE real', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'traccion-health-busy-'));
    const file = path.join(dir, 'ensayo.sqlite');
    const writer = new Database(file);
    const reader = new Database(file);
    try {
      writer.exec("CREATE TABLE schema_migrations (version INTEGER); INSERT INTO schema_migrations VALUES (19)");
      writer.pragma('journal_mode = DELETE');
      reader.pragma('busy_timeout = 15000');
      writer.exec('BEGIN EXCLUSIVE');
      try {
        const start = performance.now();
        expect(() => withTemporarySqliteBusyTimeout(reader, 50, () =>
          readCurrentSchemaVersion(reader))).toThrow();
        expect(performance.now() - start).toBeLessThan(2_000);
        expect((reader.pragma('busy_timeout') as Array<{ timeout: number }>)[0]?.timeout).toBe(15000);
      } finally {
        writer.exec('ROLLBACK');
      }
      expect(readCurrentSchemaVersion(reader)).toBe(19);
    } finally {
      reader.close();
      writer.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('limita frecuencia tras tres SQLITE_BUSY y vuelve a probar después del intervalo', () => {
    const tracker = createSqliteHealthBusyTracker();
    expect(tracker.shouldProbe(0)).toBe(true);
    tracker.observeBusy(100);
    tracker.observeBusy(200);
    expect(tracker.isDegraded()).toBe(false);
    tracker.observeBusy(300);
    expect(tracker.consecutiveFailures()).toBe(3);
    expect(tracker.isDegraded()).toBe(true);
    expect(tracker.shouldProbe(300 + SQLITE_HEALTH_BUSY_PROBE_INTERVAL_MS - 1)).toBe(false);
    expect(tracker.shouldProbe(300 + SQLITE_HEALTH_BUSY_PROBE_INTERVAL_MS)).toBe(true);
    tracker.observeBusy(300 + SQLITE_HEALTH_BUSY_PROBE_INTERVAL_MS);
    expect(tracker.shouldProbe(300 + SQLITE_HEALTH_BUSY_PROBE_INTERVAL_MS + 1)).toBe(false);
    tracker.reset();
    expect(tracker.isDegraded()).toBe(false);
    expect(tracker.shouldProbe(0)).toBe(true);
  });

  it('rechaza un timeout inválido sin modificar la conexión', () => {
    const db = new Database(':memory:');
    try {
      db.pragma('busy_timeout = 15000');
      expect(() => withTemporarySqliteBusyTimeout(db, -1, () => null)).toThrow();
      expect((db.pragma('busy_timeout') as Array<{ timeout: number }>)[0]?.timeout).toBe(15000);
    } finally {
      db.close();
    }
  });
});
