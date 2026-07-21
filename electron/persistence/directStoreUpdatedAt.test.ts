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
 * Regresión directa de dos rondas de bugs reales encontrados en julio de
 * 2026 (ver docs/DECISIONS.md):
 *
 * 1. Licencias sin sueldo y Especiales no escribían en absoluto en el layer
 *    genérico persisted_records (ni como fuente de verdad ni como espejo).
 * 2. Criterios RRLL, Ticket Restaurante, Vinculograma, tipos de Acta y
 *    Configuración sí tenían un mirror-write al layer genérico, pero solo
 *    en la rama de fallback (SQLite no disponible) — en un despliegue
 *    normal con SQLite activo, esa rama nunca se ejecuta, así que el
 *    polling multiusuario tampoco los detectaba en la práctica.
 *
 * En ambos casos, el síntoma era el mismo: un usuario guardaba algo y el
 * resto no lo veía hasta recargar la app entera.
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

  it('incluye todos los módulos cuyo mirror-write resultó no dispararse en el camino de éxito real', () => {
    expect(DIRECT_STORE_UPDATED_AT_TABLES['licencias-sin-sueldo']).toBe('licencia_sin_sueldo_records');
    expect(DIRECT_STORE_UPDATED_AT_TABLES.especiales).toBe('especiales_recipient_records');
    expect(DIRECT_STORE_UPDATED_AT_TABLES['criterios-rrll']).toBe('criterios_rrll_records');
    expect(DIRECT_STORE_UPDATED_AT_TABLES.vinculograma).toBe('vinculograma_records');
    expect(DIRECT_STORE_UPDATED_AT_TABLES.configuracion).toBe('configuracion_state');
    expect(DIRECT_STORE_UPDATED_AT_TABLES.actas).toEqual(['acta_records', 'acta_type_records']);
    expect(DIRECT_STORE_UPDATED_AT_TABLES['ticket-restaurante']).toEqual([
      'ticket_restaurante_calendar_records',
      'ticket_restaurante_person_records',
      'ticket_restaurante_absence_records',
      'ticket_restaurante_config_records',
      'ticket_restaurante_manutencion_records',
    ]);
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

  it('un storeId con varias tablas (Ticket Restaurante) refleja el cambio más reciente entre todas ellas', () => {
    db.prepare(
      'INSERT INTO ticket_restaurante_calendar_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)',
    ).run('cal-1', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    db.prepare(
      'INSERT INTO ticket_restaurante_manutencion_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)',
    ).run('manu-1', '{}', '2026-01-01T00:00:00.000Z', '2026-05-20T00:00:00.000Z');

    const snapshot = getDirectStoreUpdatedAtSnapshot(db);

    // El más reciente de las 5 tablas gana, no solo el de la primera insertada.
    expect(snapshot['ticket-restaurante']).toBe('2026-05-20T00:00:00.000Z');
  });

  it('un storeId con varias tablas (Actas) refleja un cambio en acta_type_records aunque acta_records esté vacía', () => {
    db.prepare(
      'INSERT INTO acta_type_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)',
    ).run('tipo-1', '{}', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');

    const snapshot = getDirectStoreUpdatedAtSnapshot(db);

    expect(snapshot.actas).toBe('2026-02-01T00:00:00.000Z');
  });
});
