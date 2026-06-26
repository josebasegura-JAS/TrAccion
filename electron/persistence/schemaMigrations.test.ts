import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyMigrations,
  CONFIGURACION_STATE_ID,
  CURRENT_SCHEMA_VERSION,
  isConfiguracionStateRow,
  readCurrentSchemaVersion,
} from './schemaMigrations';

/**
 * Tests directos sobre las migraciones de schema, contra un better-sqlite3
 * real (no mockeado) — mismo motivo que recordLocks.test.ts y
 * maintenanceQueries.test.ts: este módulo se extrajo sin ningún import de
 * 'electron' precisamente para poder probarlo así, aislado del resto de
 * sqlitePersistence.ts (arranque, locks, backups).
 *
 * No prueban la protección contra downgrade ni la orquestación de apertura
 * de la base de datos: esas piezas siguen viviendo en sqlitePersistence.ts
 * y usan CURRENT_SCHEMA_VERSION/readCurrentSchemaVersion importadas de aquí.
 * Aquí se aísla solo "qué tablas/columnas crea cada versión y que
 * applyMigrations las aplica todas en orden sin reventar al repetirse".
 */
describe('schemaMigrations', () => {
  let tempDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'traccion-schema-test-'));
    db = new Database(path.join(tempDir, 'test.sqlite'));
  });

  afterEach(() => {
    db?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('aplica todas las migraciones sin errores sobre una base nueva', () => {
    expect(() => applyMigrations(db)).not.toThrow();
  });

  it('deja la versión de schema en CURRENT_SCHEMA_VERSION tras aplicar todas las migraciones', () => {
    applyMigrations(db);

    expect(readCurrentSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('es idempotente: aplicar las migraciones dos veces sobre la misma base no falla ni duplica versiones', () => {
    applyMigrations(db);
    applyMigrations(db);

    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: number }>;
    const distinctVersions = new Set(versions.map((row) => row.version));

    expect(versions).toHaveLength(distinctVersions.size);
    expect(readCurrentSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('crea las tablas base de la versión 1 (schema_migrations, persisted_records, local_storage_backups, app_metadata)', () => {
    applyMigrations(db);

    const tableNames = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
    ).map((row) => row.name);

    expect(tableNames).toContain('schema_migrations');
    expect(tableNames).toContain('persisted_records');
    expect(tableNames).toContain('local_storage_backups');
    expect(tableNames).toContain('app_metadata');
  });

  it('crea editing_locks (versión 2), usado por el sistema de bloqueo de registros', () => {
    applyMigrations(db);

    const tableNames = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
    ).map((row) => row.name);

    expect(tableNames).toContain('editing_locks');
  });

  it('readCurrentSchemaVersion devuelve 0 sobre una base sin ninguna migración aplicada', () => {
    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    expect(readCurrentSchemaVersion(db)).toBe(0);
  });

  it('ensureConfiguracionStateShape (vía las migraciones que la llaman) migra la fila legacy "configuracion" al id fijo "main"', () => {
    applyMigrations(db);

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO configuracion_state (id, value_json, created_at, updated_at, deleted_at)
       VALUES ('configuracion', '{"foo":"bar"}', ?, ?, NULL)`,
    ).run(now, now);

    // Reaplicar las migraciones (idempotentes) es lo que dispara
    // ensureConfiguracionStateShape de nuevo sobre la fila legacy insertada.
    applyMigrations(db);

    const mainRow = db
      .prepare('SELECT value_json FROM configuracion_state WHERE id = ?')
      .get(CONFIGURACION_STATE_ID) as { value_json: string } | undefined;

    expect(mainRow?.value_json).toBe('{"foo":"bar"}');
  });

  it('isConfiguracionStateRow distingue filas válidas de inválidas', () => {
    expect(isConfiguracionStateRow({ value_json: '{}', updated_at: '2026-01-01T00:00:00.000Z' })).toBe(
      true,
    );
    expect(isConfiguracionStateRow({ value_json: '{}' })).toBe(false);
    expect(isConfiguracionStateRow(null)).toBe(false);
    expect(isConfiguracionStateRow(undefined)).toBe(false);
  });
});
