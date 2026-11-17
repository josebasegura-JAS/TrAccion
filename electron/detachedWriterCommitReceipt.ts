/**
 * PR482: SQLite evidence written in the SAME transaction as the data.
 * Experimental only: do not connect to production until all write paths
 * are covered and the durable journal uses this verifier after child EXIT.
 */
import { createRequire } from 'node:module';
import type { Database, DatabaseConstructor } from 'better-sqlite3';
import { readDatabaseIdentity } from './persistence/databaseIdentity.js';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import { readCurrentSchemaVersion } from './persistence/schemaMigrations.js';

const TABLE = 'detached_writer_commit_receipts';
const require = createRequire(import.meta.url);

export interface DetachedCommitIdentity {
  operationId: string;
  generation: number;
  databaseUuid: string;
}
export type DetachedCommitStatus = 'committed' | 'not-committed';
export interface DetachedCommitReceipt extends DetachedCommitIdentity {
  committedAt: string;
}
class RejectedWrite<T> extends Error {
  constructor(readonly result: T) { super('Escritura OCC no confirmada'); }
}
export interface DetachedCommitEvidence {
  outcome: 'committed' | 'not-committed';
  sqliteVerificationReference: string;
}

/** A missing row is evidence only if the receipt table and identity were read reliably. */
function assertIdentity(db: Database, uuid: string): void {
  if (!uuid.trim() || readDatabaseIdentity(db)?.databaseUuid !== uuid) {
    throw new Error('No se puede verificar un commit contra otra identidad SQLite.');
  }
}
function assertId(input: DetachedCommitIdentity): void {
  if (!input.operationId.trim() || !Number.isSafeInteger(input.generation) ||
      input.generation <= 0 || !input.databaseUuid.trim()) {
    throw new Error('Identificador/generación de commit SQLite inválidos.');
  }
}
function tableExists(db: Database): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(TABLE));
}
function createTable(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS ${TABLE} (
    operation_id TEXT PRIMARY KEY NOT NULL,
    generation INTEGER NOT NULL,
    database_uuid TEXT NOT NULL,
    committed_at TEXT NOT NULL
  )`);
}

/**
 * Wrap a synchronous transactional core. If successful, the receipt and the
 * data commit atomically; if the core fails or returns ok:false, neither
 * data nor receipt is committed. Never retry an operationId.
 */
export function saveWithDetachedCommitReceipt<T extends { ok: boolean }>(
  db: Database,
  input: DetachedCommitIdentity,
  save: () => T,
): T {
  assertId(input);
  assertIdentity(db, input.databaseUuid);
  try {
    return db.transaction((): T => {
      createTable(db);
      const duplicate = db.prepare(`SELECT operation_id FROM ${TABLE} WHERE operation_id = ?`)
        .get(input.operationId);
      if (duplicate) throw new Error('Operación SQLite ya confirmada: prohibido repetir operationId.');
      const result = save();
      // Roll back even if a future core mutates before reporting a conflict.
      if (!result.ok) throw new RejectedWrite(result);
      db.prepare(`INSERT INTO ${TABLE} (operation_id, generation, database_uuid, committed_at)
        VALUES (?, ?, ?, ?)`).run(input.operationId, input.generation, input.databaseUuid,
        new Date().toISOString());
      return result;
    })();
  } catch (error) {
    if (error instanceof RejectedWrite) return error.result as T;
    throw error;
  }
}

/**
 * Run ONLY after child EXIT was confirmed, using a separate read-only handle.
 * The caller must hold a trusted read barrier and verify expected identity.
 * Missing table is NOT absence proof (older databases or uninitialized paths).
 */
export function verifyDetachedSqliteCommit(
  db: Database,
  expected: ExpectedSqliteIdentity,
  input: DetachedCommitIdentity,
): DetachedCommitEvidence {
  assertId(input);
  if (input.databaseUuid !== expected.databaseUuid) {
    throw new Error('El journal no corresponde a la identidad SQLite esperada.');
  }
  const identity = readDatabaseIdentity(db);
  if (!identity || identity.databaseUuid !== expected.databaseUuid ||
      identity.applicationId !== expected.applicationId ||
      identity.environment !== expected.environment ||
      readCurrentSchemaVersion(db) !== expected.schemaVersion) {
    throw new Error('No se ha comprobado identidad/esquema SQLite: commit incierto.');
  }
  const quick = db.pragma('quick_check') as Array<{ quick_check?: unknown }>;
  if (quick.length !== 1 || quick[0]?.quick_check !== 'ok' || !tableExists(db)) {
    throw new Error('No se puede demostrar la integridad/tabla de recibos: commit incierto.');
  }
  const receipt = db.prepare(`SELECT operation_id, generation, database_uuid, committed_at
    FROM ${TABLE} WHERE operation_id = ?`).get(input.operationId) as
    | { operation_id: string; generation: number; database_uuid: string; committed_at: string }
    | undefined;
  if (receipt && (receipt.generation !== input.generation ||
      receipt.database_uuid !== input.databaseUuid || !receipt.committed_at)) {
    throw new Error('Marcador SQLite contradictorio: intervención obligatoria.');
  }
  const outcome: DetachedCommitStatus = receipt ? 'committed' : 'not-committed';
  return {
    outcome,
    sqliteVerificationReference: `sqlite-commit-receipt:${input.databaseUuid}:${input.generation}:${input.operationId}:${outcome}`,
  };
}

/**
 * High-level evidence for an interrupted child. Refuses to inspect SQLite
 * before a confirmed EXIT; NEVER accepts an IPC ACK as proof of commit.
 * Reopening is strictly read-only and must be protected by the supervisor's
 * independent-activity barrier before production integration.
 */
export function verifyDetachedSqliteCommitAfterExit(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  input: DetachedCommitIdentity,
  exitConfirmed: boolean,
): DetachedCommitEvidence {
  if (!exitConfirmed || !databasePath.trim()) {
    throw new Error('Verificación de commit exige EXIT confirmado y ruta SQLite fiable.');
  }
  const Ctor = require('better-sqlite3') as DatabaseConstructor;
  const db = new Ctor(databasePath, { readonly: true, fileMustExist: true });
  try {
    return verifyDetachedSqliteCommit(db, expected, input);
  } finally {
    db.close();
  }
}
