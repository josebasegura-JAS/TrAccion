import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDataIntegrityAudit, type DatabaseStatus } from './dataIntegrityAudit';
import { CURRENT_SCHEMA_VERSION } from './schemaMigrations';

/**
 * Tests directos sobre electron/persistence/dataIntegrityAudit.ts, contra un
 * better-sqlite3 real. Igual que maintenanceQueries.test.ts, se crean las
 * tablas mínimas necesarias a mano (no se ejecutan las migraciones
 * completas) para mantener el test rápido y aislado de cambios de schema
 * que no afectan a este módulo.
 */
describe('dataIntegrityAudit — auditoría de solo lectura', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'traccion-integrity-test-'));
    dbPath = path.join(tempDir, 'test.sqlite');
    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE editing_locks (
        module TEXT NOT NULL,
        record_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        machine_name TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (module, record_id)
      );

      CREATE TABLE ticket_restaurante_calendar_records (
        id TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE ticket_restaurante_person_records (
        id TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE ticket_restaurante_absence_records (
        id TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
    `);
  });

  afterEach(() => {
    db?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function buildStatus(overrides: Partial<DatabaseStatus> = {}): DatabaseStatus {
    return {
      ready: true,
      phase: 'active',
      path: dbPath,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      ...overrides,
    };
  }

  it('informa de base de datos no activa sin lanzar excepciones', async () => {
    const report = await runDataIntegrityAudit({
      getDatabase: () => null,
      getStatus: () => buildStatus({ ready: false, phase: 'error' }),
      listLocalBackups: async () => [],
    });

    expect(report.databaseReady).toBe(false);
    expect(report.sqliteIntegrityCheck.ok).toBe(false);
    expect(report.heaviestTables).toEqual([]);
  });

  it('devuelve integrity_check ok y versión de schema al día cuando todo está bien', async () => {
    const report = await runDataIntegrityAudit({
      getDatabase: () => db,
      getStatus: () => buildStatus({ schemaVersion: CURRENT_SCHEMA_VERSION }),
      listLocalBackups: async () => [],
    });

    expect(report.databaseReady).toBe(true);
    expect(report.sqliteIntegrityCheck).toEqual({ ok: true, problems: [] });
    expect(report.schemaVersion.upToDate).toBe(true);
    expect(report.databaseSizeBytes).not.toBeNull();
  });

  it('marca la versión de schema como desactualizada cuando no coincide con la esperada', async () => {
    const report = await runDataIntegrityAudit({
      getDatabase: () => db,
      getStatus: () => buildStatus({ schemaVersion: 12 }),
      listLocalBackups: async () => [],
    });

    expect(report.schemaVersion.upToDate).toBe(false);
    expect(report.schemaVersion.current).toBe(12);
  });

  it('detecta bloqueos caducados en editing_locks', async () => {
    const insertLock = db.prepare(
      `INSERT INTO editing_locks (module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insertLock.run(
      'teletrabajo',
      'sol-1',
      'owner-1',
      'Ana',
      'PC-ANA',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:30.000Z',
    );
    insertLock.run(
      'actas',
      '__module__',
      'owner-2',
      'Luis',
      'PC-LUIS',
      '2099-01-01T00:00:00.000Z',
      '2099-01-01T00:00:30.000Z',
    );

    const report = await runDataIntegrityAudit({
      getDatabase: () => db,
      getStatus: () => buildStatus(),
      listLocalBackups: async () => [],
    });

    expect(report.expiredLocks).toHaveLength(1);
    expect(report.expiredLocks[0]?.module).toBe('teletrabajo');
    expect(report.expiredLocks[0]?.recordId).toBe('sol-1');
  });

  it('detecta personas de Ticket Restaurante con calendario inexistente', async () => {
    const insertPerson = db.prepare(
      `INSERT INTO ticket_restaurante_person_records (id, value_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)`,
    );
    insertPerson.run(
      '00001',
      JSON.stringify({ empleado: '00001', calendarId: 'calendario-inexistente' }),
    );
    insertPerson.run('00002', JSON.stringify({ empleado: '00002', calendarId: 'calendario-real' }));

    db.prepare(
      `INSERT INTO ticket_restaurante_calendar_records (id, value_json, created_at, updated_at, deleted_at)
       VALUES ('calendario-real', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)`,
    ).run(JSON.stringify({ id: 'calendario-real' }));

    const report = await runDataIntegrityAudit({
      getDatabase: () => db,
      getStatus: () => buildStatus(),
      listLocalBackups: async () => [],
    });

    const calendarCheck = report.orphanChecks.find((check) => check.label.includes('calendario'));
    expect(calendarCheck?.count).toBe(1);
    expect(calendarCheck?.sampleIds).toEqual(['00001']);
  });

  it('detecta ausencias de personas sin alta activa', async () => {
    db.prepare(
      `INSERT INTO ticket_restaurante_person_records (id, value_json, created_at, updated_at, deleted_at)
       VALUES ('00001', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)`,
    ).run(JSON.stringify({ empleado: '00001' }));

    const insertAbsence = db.prepare(
      `INSERT INTO ticket_restaurante_absence_records (id, value_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)`,
    );
    insertAbsence.run('absence-1', JSON.stringify({ empleado: '00001' }));
    insertAbsence.run('absence-2', JSON.stringify({ empleado: '99999' }));

    const report = await runDataIntegrityAudit({
      getDatabase: () => db,
      getStatus: () => buildStatus(),
      listLocalBackups: async () => [],
    });

    const absenceCheck = report.orphanChecks.find((check) => check.label.includes('ausencias'));
    expect(absenceCheck?.count).toBe(1);
    expect(absenceCheck?.sampleIds).toEqual(['absence-2']);
  });

  it('resume la copia de seguridad más reciente y el número total', async () => {
    const report = await runDataIntegrityAudit({
      getDatabase: () => db,
      getStatus: () => buildStatus(),
      listLocalBackups: async () => [
        {
          fileName: 'backup-antiguo.sqlite',
          kind: 'sqlite',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
        {
          fileName: 'backup-reciente.sqlite',
          kind: 'sqlite',
          createdAt: '2026-07-10T00:00:00.000Z',
        },
      ],
    });

    expect(report.backupCount).toBe(2);
    expect(report.mostRecentBackup?.fileName).toBe('backup-reciente.sqlite');
  });
});
