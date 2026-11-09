import type { Database } from 'better-sqlite3';

/**
 * Sin dependencias de Electron a propósito (mismo motivo que
 * electron/persistence/maintenanceQueries.ts): solo lógica SQL pura sobre
 * la tabla editing_locks, que recibe el Database ya abierto y el contexto
 * del propietario (ownerId/ownerName/hostname) como parámetros explícitos
 * en vez de leerlos de variables de módulo o de os.hostname()/os.userInfo().
 * Esto permite probar con Vitest normal (proceso Node) sin necesitar el
 * binario de Electron instalado, y sin acoplar el test al hostname real
 * de la máquina que ejecuta los tests.
 *
 * No incluye el lock de archivo entre procesos (withDatabaseOperationLock,
 * basado en mkdir) ni la resolución de la ruta de la base de datos: esas
 * piezas coordinan entre equipos distintos de la red y son responsabilidad
 * de electron/sqlitePersistence.ts, no de la lógica de negocio del lock de
 * registro en sí.
 */

// El editor renueva cada 20s; 75s permiten tolerar dos renovaciones fallidas
// y variaciones de latencia SMB sin perder el lock por una sola demora.
export const RECORD_LOCK_TTL_MS = 75 * 1000;
export const MODULE_LOCK_RECORD_ID = '__module__';

export interface OwnerContext {
  ownerId: string;
  ownerName: string;
  hostname: string;
}

export interface RecordLockOwnerInfo {
  ownerId: string;
  ownerName: string;
  machineName: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface RecordLockPayload {
  module: string;
  recordId: string;
}

export interface RecordLockResult {
  ok: boolean;
  status: 'acquired' | 'released' | 'locked' | 'idle' | 'error';
  lock: RecordLockOwnerInfo | null;
  message: string;
}

interface EditingLockRow {
  module: string;
  record_id: string;
  owner_id: string;
  owner_name: string;
  machine_name: string;
  acquired_at: string;
  expires_at: string;
}

function isEditingLockRow(value: unknown): value is EditingLockRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<EditingLockRow>;
  return (
    typeof candidate.module === 'string' &&
    typeof candidate.record_id === 'string' &&
    typeof candidate.owner_id === 'string' &&
    typeof candidate.owner_name === 'string' &&
    typeof candidate.machine_name === 'string' &&
    typeof candidate.acquired_at === 'string' &&
    typeof candidate.expires_at === 'string'
  );
}

function lockOwnerFromRow(row: EditingLockRow): RecordLockOwnerInfo {
  return {
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    machineName: row.machine_name,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
  };
}

export function validateRecordLockPayload(payload: RecordLockPayload): boolean {
  return payload.module.trim().length > 0 && payload.recordId.trim().length > 0;
}

export function recordLockError(message: string): RecordLockResult {
  return { ok: false, status: 'error', lock: null, message };
}

function deleteExpiredRecordLocks(db: Database, now: string): void {
  db.prepare('DELETE FROM editing_locks WHERE expires_at <= ?').run(now);
}

function readRecordLockRow(db: Database, moduleName: string, recordId: string, asOf?: string): EditingLockRow | null {
  const row = db
    .prepare(
      'SELECT module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at FROM editing_locks WHERE module = ? AND record_id = ? AND (? IS NULL OR expires_at > ?)',
    )
    .get(moduleName, recordId, asOf ?? null, asOf ?? null);
  return isEditingLockRow(row) ? row : null;
}

function readConflictingEditingLock(
  db: Database,
  moduleName: string,
  recordId: string,
  ownerId: string,
  asOf?: string,
): EditingLockRow | null {
  const normalizedRecordId = recordId.trim();

  if (normalizedRecordId === MODULE_LOCK_RECORD_ID) {
    const row = db
      .prepare(
        `SELECT module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at
         FROM editing_locks
         WHERE module = ? AND owner_id <> ?
           AND (? IS NULL OR expires_at > ?)
         ORDER BY record_id = ? DESC, expires_at DESC
         LIMIT 1`,
      )
      .get(moduleName, ownerId, asOf ?? null, asOf ?? null, MODULE_LOCK_RECORD_ID);
    return isEditingLockRow(row) ? row : null;
  }

  const row = db
    .prepare(
      `SELECT module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at
       FROM editing_locks
       WHERE module = ?
         AND owner_id <> ?
         AND record_id IN (?, ?)
         AND (? IS NULL OR expires_at > ?)
       ORDER BY record_id = ? DESC, expires_at DESC
       LIMIT 1`,
    )
    .get(moduleName, ownerId, normalizedRecordId, MODULE_LOCK_RECORD_ID, asOf ?? null, asOf ?? null, MODULE_LOCK_RECORD_ID);
  return isEditingLockRow(row) ? row : null;
}

/**
 * Intenta adquirir (o renovar, si ya es del mismo owner) el lock de un
 * registro. Si otro owner tiene el módulo completo bloqueado, o el mismo
 * registro, devuelve status 'locked' con la info de quién lo tiene.
 */
export function acquireRecordLockInTransaction(
  db: Database,
  payload: RecordLockPayload,
  owner: OwnerContext,
): RecordLockResult {
  const moduleName = payload.module.trim();
  const recordId = payload.recordId.trim();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + RECORD_LOCK_TTL_MS).toISOString();

  type AcquireTxResult = { conflictingLock: EditingLockRow } | { acquiredLock: EditingLockRow | null };

  const txResult = db.transaction((): AcquireTxResult => {
    deleteExpiredRecordLocks(db, nowIso);
    const conflicting = readConflictingEditingLock(db, moduleName, recordId, owner.ownerId);
    if (conflicting) {
      return { conflictingLock: conflicting };
    }
    const existingLock = readRecordLockRow(db, moduleName, recordId);
    if (existingLock) {
      db.prepare(
        `UPDATE editing_locks
         SET owner_name = ?, machine_name = ?, expires_at = ?
         WHERE module = ? AND record_id = ? AND owner_id = ?`,
      ).run(owner.ownerName, owner.hostname, expiresAt, moduleName, recordId, owner.ownerId);
    } else {
      db.prepare(
        `INSERT INTO editing_locks
         (module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(moduleName, recordId, owner.ownerId, owner.ownerName, owner.hostname, nowIso, expiresAt);
    }
    return { acquiredLock: readRecordLockRow(db, moduleName, recordId) };
  })();

  if ('conflictingLock' in txResult) {
    const { conflictingLock } = txResult;
    const isModuleLock = conflictingLock.record_id === MODULE_LOCK_RECORD_ID;
    return {
      ok: false,
      status: 'locked',
      lock: lockOwnerFromRow(conflictingLock),
      message: isModuleLock
        ? `Módulo bloqueado por ${conflictingLock.owner_name}@${conflictingLock.machine_name}.`
        : `Registro bloqueado por ${conflictingLock.owner_name}@${conflictingLock.machine_name}.`,
    };
  }

  return {
    ok: true,
    status: 'acquired',
    lock: txResult.acquiredLock ? lockOwnerFromRow(txResult.acquiredLock) : null,
    message: 'Bloqueo adquirido.',
  };
}

/**
 * Renueva un lock ya propio, o lo adquiere si no existía (y nadie más lo
 * tiene). A diferencia de acquire, si existe un lock de otro owner para el
 * mismo registro exacto, también se considera conflicto incluso antes de
 * mirar el lock de módulo.
 */
export function heartbeatRecordLockInTransaction(
  db: Database,
  payload: RecordLockPayload,
  owner: OwnerContext,
): RecordLockResult {
  const moduleName = payload.module.trim();
  const recordId = payload.recordId.trim();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + RECORD_LOCK_TTL_MS).toISOString();

  type HeartbeatTxResult = { conflictingLock: EditingLockRow } | { acquiredLock: EditingLockRow | null };

  const txResult = db.transaction((): HeartbeatTxResult => {
    const existingLock = readRecordLockRow(db, moduleName, recordId);
    // Las renovaciones habituales no hacen una limpieza global de expirados.
    // La limpieza se hace solo al re-adquirir un lock desaparecido/caducado;
    // así una tarea abierta no provoca DELETE de toda la tabla cada 20s.
    if (existingLock && existingLock.owner_id !== owner.ownerId && existingLock.expires_at > nowIso) {
      return { conflictingLock: existingLock };
    }

    const ownLockIsActive = existingLock?.owner_id === owner.ownerId && existingLock.expires_at > nowIso;
    if (!ownLockIsActive) {
      // Lease caducada: comprobar también los bloqueos de módulo activos,
      // nunca resucitar una reserva mientras otro usuario tiene el módulo.
      const conflicting = readConflictingEditingLock(db, moduleName, recordId, owner.ownerId, nowIso);
      if (conflicting) return { conflictingLock: conflicting };
      // Quitar únicamente la reserva caducada del mismo registro antes de
      // insertar. No barrer todas las reservas de la base.
      db.prepare('DELETE FROM editing_locks WHERE module = ? AND record_id = ? AND expires_at <= ?')
        .run(moduleName, recordId, nowIso);
      db.prepare(
        `INSERT INTO editing_locks
         (module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(moduleName, recordId, owner.ownerId, owner.ownerName, owner.hostname, nowIso, expiresAt);
    } else {
      db.prepare(
        `UPDATE editing_locks
         SET owner_name = ?, machine_name = ?, expires_at = ?
         WHERE module = ? AND record_id = ? AND owner_id = ?`,
      ).run(owner.ownerName, owner.hostname, expiresAt, moduleName, recordId, owner.ownerId);
    }
    return { acquiredLock: readRecordLockRow(db, moduleName, recordId) };
  })();

  if ('conflictingLock' in txResult) {
    const { conflictingLock } = txResult;
    return {
      ok: false,
      status: 'locked',
      lock: lockOwnerFromRow(conflictingLock),
      message: `Registro bloqueado por ${conflictingLock.owner_name}@${conflictingLock.machine_name}.`,
    };
  }

  return {
    ok: true,
    status: 'acquired',
    lock: txResult.acquiredLock ? lockOwnerFromRow(txResult.acquiredLock) : null,
    message: 'Bloqueo renovado.',
  };
}

/** Libera el lock, solo si pertenece al owner indicado (no borra el de otros). */
export function releaseRecordLockInTransaction(
  db: Database,
  payload: RecordLockPayload,
  owner: OwnerContext,
): RecordLockResult {
  db.prepare('DELETE FROM editing_locks WHERE module = ? AND record_id = ? AND owner_id = ?').run(
    payload.module.trim(),
    payload.recordId.trim(),
    owner.ownerId,
  );

  return { ok: true, status: 'released', lock: null, message: 'Bloqueo liberado.' };
}

/** Consulta si hay un lock activo para el registro, sin adquirirlo ni modificarlo. */
export function getRecordLockInTransaction(
  db: Database,
  payload: RecordLockPayload,
  owner: OwnerContext,
  now: string,
): RecordLockResult {
  const moduleName = payload.module.trim();
  const recordId = payload.recordId.trim();
  // Consulta estrictamente de solo lectura: los locks caducados no deben
  // provocar un DELETE (y con ello un lock de escritura) solo por consultar.
  // La limpieza física permanece a cargo de acquire/heartbeat.
  const conflictingLock = readConflictingEditingLock(db, moduleName, recordId, owner.ownerId, now);

  if (conflictingLock) {
    return {
      ok: false,
      status: 'locked',
      lock: lockOwnerFromRow(conflictingLock),
      message:
        conflictingLock.record_id === MODULE_LOCK_RECORD_ID
          ? 'Bloqueo global de módulo activo.'
          : 'Bloqueo de registro activo.',
    };
  }

  const existingLock = readRecordLockRow(db, moduleName, recordId, now);

  return existingLock
    ? {
        ok: existingLock.owner_id === owner.ownerId,
        status: 'acquired',
        lock: lockOwnerFromRow(existingLock),
        message: 'Bloqueo activo.',
      }
    : { ok: true, status: 'idle', lock: null, message: 'Sin bloqueo activo.' };
}

/** Consulta agrupada, exclusivamente SELECT, de los bloqueos de otros usuarios. */
export function listOtherRecordLocks(db: Database, moduleName: string, owner: OwnerContext, now: string): Record<string, RecordLockOwnerInfo> {
  const rows = db.prepare(`SELECT module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at FROM editing_locks WHERE module = ? AND owner_id <> ? AND expires_at > ?`).all(moduleName, owner.ownerId, now);
  const result: Record<string, RecordLockOwnerInfo> = Object.create(null);
  for (const row of rows) if (isEditingLockRow(row)) result[row.record_id] = lockOwnerFromRow(row);
  return result;
}
