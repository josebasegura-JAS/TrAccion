import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyMigrations } from './schemaMigrations';
import {
  DIRECT_STORE_UPDATED_AT_TABLES,
  getDirectStoreUpdatedAtSnapshot,
  getJsonRecordTableUpdatedAt,
} from './directStoreUpdatedAt';

/**
 * Regresión directa del bug real encontrado en julio de 2026: Licencias sin
 * sueldo y Especiales no escriben en el layer genérico persisted_records
 * (ni como espejo), así que sin una entrada aquí el polling multiusuario
 * (externalDataSync.ts, cada ~12s) nunca detectaba sus cambios — otro
 * usuario no veía una solicitud o un destinatario nuevo hasta recargar la
 * app entera. Ver docs/DECISIONS.md.
 */
describe('directStoreUpdatedAt', () => {
  let tempDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'traccion-direct-store-test-'));
    db = new Database(path.join(tempDir, 'test.sqlite'));
    applyMigrations(db);
  });

  afterEach(() => {
    db?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('incluye licencias-sin-sueldo y especiales (regresión: antes no se detectaban sus cambios en el polling)', () => {
    expect(DIRECT_STORE_UPDATED_AT_TABLES['licencias-sin-sueldo']).toBe('licencia_sin_sueldo_records');
    expect(DIRECT_STORE_UPDATED_AT_TABLES.especiales).toBe('especiales_recipient_records');
  });

  it('getJsonRecordTableUpdatedAt devuelve null en una tabla vacía, sin reventar', () => {
    expect(getJsonRecordTableUpdatedAt(db, 'licencia_sin_sueldo_records')).toBeNull();
  });

  it('getJsonRecordTableUpdatedAt devuelve el updated_at más reciente insertado', () => {
    const insert = db.prepare(
      'INSERT INTO licencia_sin_sueldo_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)',
    );
    insert.run('rec-1', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    insert.run('rec-2', '{}', '2026-01-01T00:00:00.000Z', '2026-06-15T10:30:00.000Z');
    insert.run('rec-3', '{}', '2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');

    expect(getJsonRecordTableUpdatedAt(db, 'licencia_sin_sueldo_records')).toBe('2026-06-15T10:30:00.000Z');
  });

  it('getDirectStoreUpdatedAtSnapshot consulta las tablas de todos los módulos registrados sobre un schema nuevo, sin reventar', () => {
    const snapshot = getDirectStoreUpdatedAtSnapshot(db);

    expect(Object.keys(snapshot).sort()).toEqual(Object.keys(DIRECT_STORE_UPDATED_AT_TABLES).sort());
    // Base recién creada: todas las tablas están vacías.
    Object.values(snapshot).forEach((value) => {
      expect(value).toBeNull();
    });
  });

  it('getDirectStoreUpdatedAtSnapshot refleja un cambio en una sola tabla sin tocar las demás', () => {
    db.prepare(
      'INSERT INTO especiales_recipient_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)',
    ).run('dest-1', '{}', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z');

    const snapshot = getDirectStoreUpdatedAtSnapshot(db);

    expect(snapshot.especiales).toBe('2026-07-01T00:00:00.000Z');
    expect(snapshot['licencias-sin-sueldo']).toBeNull();
    expect(snapshot.tareas).toBeNull();
  });
});
