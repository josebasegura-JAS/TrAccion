import { stat } from 'node:fs/promises';
import type { Database } from 'better-sqlite3';
import { computeHeaviestTables, type TableSizeBreakdownEntry } from './maintenanceQueries.js';
import { CURRENT_SCHEMA_VERSION } from './schemaMigrations.js';

/**
 * Diagnóstico de integridad de datos, de solo lectura: nunca modifica la
 * base de datos. Piensa "detectar e informar", no "corregir automáticamente".
 * Igual que maintenanceQueries.ts, este módulo no depende de Electron para
 * poder probarse con Vitest normal.
 */

export interface DatabaseStatus {
  ready: boolean;
  phase: 'prepared' | 'active' | 'fallback' | 'error' | 'locked';
  path: string;
  schemaVersion: number;
}

export interface LocalBackupEntrySummary {
  fileName: string;
  kind: 'sqlite' | 'json';
  createdAt: string;
}

export interface SqliteIntegrityCheckResult {
  ok: boolean;
  problems: string[];
}

export interface SchemaVersionInfo {
  current: number;
  expected: number;
  upToDate: boolean;
}

export interface ExpiredLockInfo {
  module: string;
  recordId: string;
  ownerName: string;
  machineName: string;
  expiresAt: string;
}

export interface OrphanCheckResult {
  label: string;
  count: number;
  sampleIds: string[];
}

export interface DataIntegrityReport {
  generatedAt: string;
  databaseReady: boolean;
  sqliteIntegrityCheck: SqliteIntegrityCheckResult;
  schemaVersion: SchemaVersionInfo;
  databaseSizeBytes: number | null;
  heaviestTables: TableSizeBreakdownEntry[];
  expiredLocks: ExpiredLockInfo[];
  orphanChecks: OrphanCheckResult[];
  mostRecentBackup: LocalBackupEntrySummary | null;
  backupCount: number;
}

export interface DataIntegrityAuditDependencies {
  getDatabase: () => Database | null;
  getStatus: () => DatabaseStatus;
  listLocalBackups: () => Promise<
    Array<{ fileName: string; kind: 'sqlite' | 'json'; createdAt: string }>
  >;
}

const MAX_ORPHAN_SAMPLE_IDS = 10;

function emptyReport(
  generatedAt: string,
  status: DatabaseStatus,
  message: string,
): DataIntegrityReport {
  return {
    generatedAt,
    databaseReady: false,
    sqliteIntegrityCheck: { ok: false, problems: [message] },
    schemaVersion: {
      current: status.schemaVersion,
      expected: CURRENT_SCHEMA_VERSION,
      upToDate: status.schemaVersion === CURRENT_SCHEMA_VERSION,
    },
    databaseSizeBytes: null,
    heaviestTables: [],
    expiredLocks: [],
    orphanChecks: [],
    mostRecentBackup: null,
    backupCount: 0,
  };
}

function runSqliteIntegrityCheckPragma(db: Database): SqliteIntegrityCheckResult {
  try {
    const rows = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
    if (rows.length === 1 && rows[0]?.integrity_check === 'ok') {
      return { ok: true, problems: [] };
    }
    return { ok: false, problems: rows.map((row) => row.integrity_check) };
  } catch (error) {
    return {
      ok: false,
      problems: [
        error instanceof Error ? error.message : 'No se ha podido ejecutar integrity_check.',
      ],
    };
  }
}

function findExpiredLocks(db: Database, nowIso: string): ExpiredLockInfo[] {
  try {
    const rows = db
      .prepare(
        `SELECT module, record_id, owner_name, machine_name, expires_at
         FROM editing_locks
         WHERE expires_at < ?
         ORDER BY expires_at ASC`,
      )
      .all(nowIso) as Array<{
      module: string;
      record_id: string;
      owner_name: string;
      machine_name: string;
      expires_at: string;
    }>;

    return rows.map((row) => ({
      module: row.module,
      recordId: row.record_id,
      ownerName: row.owner_name,
      machineName: row.machine_name,
      expiresAt: row.expires_at,
    }));
  } catch (error) {
    console.warn('Diagnóstico de integridad: no se han podido leer los bloqueos.', error);
    return [];
  }
}

/**
 * Comprueba una relación entre dos tablas basadas en value_json: cada fila
 * activa de `tableName` debe tener un valor de `extractOwnField` que exista
 * entre los valores de `extractReferenceField` de las filas activas de
 * `referenceTableName`. Pensado para relaciones "blandas" (sin FOREIGN KEY
 * real, porque las tablas de TrAccion guardan documentos JSON) que solo se
 * detectan comparando los propios blobs.
 */
function findOrphanRecords(
  db: Database,
  options: {
    label: string;
    tableName: string;
    referenceTableName: string;
    extractOwnField: (parsedRow: Record<string, unknown>) => string | null | undefined;
    extractReferenceField: (parsedRow: Record<string, unknown>) => string | null | undefined;
  },
): OrphanCheckResult {
  try {
    const referenceRows = db
      .prepare(`SELECT value_json FROM ${options.referenceTableName} WHERE deleted_at IS NULL`)
      .all() as Array<{ value_json: string }>;
    const referenceValues = new Set(
      referenceRows
        .map((row) => {
          try {
            return options.extractReferenceField(JSON.parse(row.value_json));
          } catch {
            return null;
          }
        })
        .filter((value): value is string => Boolean(value)),
    );

    const ownRows = db
      .prepare(`SELECT id, value_json FROM ${options.tableName} WHERE deleted_at IS NULL`)
      .all() as Array<{ id: string; value_json: string }>;

    const orphanIds = ownRows
      .filter((row) => {
        try {
          const ownValue = options.extractOwnField(JSON.parse(row.value_json));
          return Boolean(ownValue) && !referenceValues.has(ownValue as string);
        } catch {
          return false;
        }
      })
      .map((row) => row.id);

    return {
      label: options.label,
      count: orphanIds.length,
      sampleIds: orphanIds.slice(0, MAX_ORPHAN_SAMPLE_IDS),
    };
  } catch (error) {
    console.warn(`Diagnóstico de integridad: no se ha podido comprobar "${options.label}".`, error);
    return { label: options.label, count: 0, sampleIds: [] };
  }
}

function runOrphanChecks(db: Database): OrphanCheckResult[] {
  return [
    findOrphanRecords(db, {
      label: 'Ticket Restaurante: personas con calendario inexistente',
      tableName: 'ticket_restaurante_person_records',
      referenceTableName: 'ticket_restaurante_calendar_records',
      extractOwnField: (person) => (person.calendarId as string | undefined) ?? null,
      extractReferenceField: (calendar) => (calendar.id as string | undefined) ?? null,
    }),
    findOrphanRecords(db, {
      label: 'Ticket Restaurante: ausencias de personas sin alta activa',
      tableName: 'ticket_restaurante_absence_records',
      referenceTableName: 'ticket_restaurante_person_records',
      extractOwnField: (absence) => (absence.empleado as string | undefined) ?? null,
      extractReferenceField: (person) => (person.empleado as string | undefined) ?? null,
    }),
  ];
}

export async function runDataIntegrityAudit(
  dependencies: DataIntegrityAuditDependencies,
): Promise<DataIntegrityReport> {
  const generatedAt = new Date().toISOString();
  const status = dependencies.getStatus();
  const db = dependencies.getDatabase();

  if (!db || !status.ready || status.phase !== 'active') {
    return emptyReport(
      generatedAt,
      status,
      'La base de datos no está activa; no se ha podido diagnosticar.',
    );
  }

  const sqliteIntegrityCheck = runSqliteIntegrityCheckPragma(db);
  const schemaVersion: SchemaVersionInfo = {
    current: status.schemaVersion,
    expected: CURRENT_SCHEMA_VERSION,
    upToDate: status.schemaVersion === CURRENT_SCHEMA_VERSION,
  };
  const databaseSizeBytes = (await stat(status.path).catch(() => null))?.size ?? null;
  const heaviestTables = computeHeaviestTables(db);
  const expiredLocks = findExpiredLocks(db, generatedAt);
  const orphanChecks = runOrphanChecks(db);

  let mostRecentBackup: LocalBackupEntrySummary | null = null;
  let backupCount = 0;
  try {
    const backups = await dependencies.listLocalBackups();
    backupCount = backups.length;
    const [latest] = [...backups].sort((first, second) =>
      second.createdAt.localeCompare(first.createdAt),
    );
    if (latest) {
      mostRecentBackup = {
        fileName: latest.fileName,
        kind: latest.kind,
        createdAt: latest.createdAt,
      };
    }
  } catch (error) {
    console.warn(
      'Diagnóstico de integridad: no se han podido listar las copias de seguridad.',
      error,
    );
  }

  return {
    generatedAt,
    databaseReady: true,
    sqliteIntegrityCheck,
    schemaVersion,
    databaseSizeBytes,
    heaviestTables,
    expiredLocks,
    orphanChecks,
    mostRecentBackup,
    backupCount,
  };
}
