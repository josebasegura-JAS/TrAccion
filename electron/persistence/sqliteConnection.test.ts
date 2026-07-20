import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, readCurrentSchemaVersion } from './schemaMigrations';
import { openSqliteDatabase } from './sqliteConnection';

/**
 * Tests directos sobre openSqliteDatabase() — la orquestación real de
 * apertura de la base de datos (pragmas, protección contra downgrade,
 * migraciones), que hasta ahora no tenía tests propios (ver comentario en
 * schemaMigrations.test.ts). No importa 'electron', así que es testable con
 * Vitest normal igual que schemaMigrations.test.ts/maintenanceQueries.test.ts.
 */
describe('sqliteConnection — openSqliteDatabase', () => {
  let tempDir: string;
  let databasePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'traccion-sqlite-connection-test-'));
    databasePath = path.join(tempDir, 'traccion.sqlite');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('abre sin errores un fichero de base de datos que todavía no existe (primer arranque en una máquina nueva)', () => {
    // Regresión: antes de que readCurrentSchemaVersion() tolerase la
    // ausencia de schema_migrations, esta llamada lanzaba "no such table:
    // schema_migrations" en el primer arranque de TrAccion en una máquina
    // sin traccion.sqlite previo, forzando el arranque en modo "sin SQLite
    // activo" (cambios solo en localStorage) desde el primer minuto.
    let db;
    expect(() => {
      db = openSqliteDatabase(databasePath, { busyTimeoutMs: 5_000 });
    }).not.toThrow();

    expect(readCurrentSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    db.close();
  });

  it('reabre sin errores una base de datos ya existente y migrada', () => {
    const first = openSqliteDatabase(databasePath, { busyTimeoutMs: 5_000 });
    first.close();

    let reopened;
    expect(() => {
      reopened = openSqliteDatabase(databasePath, { busyTimeoutMs: 5_000 });
    }).not.toThrow();

    expect(readCurrentSchemaVersion(reopened)).toBe(CURRENT_SCHEMA_VERSION);
    reopened.close();
  });
});
