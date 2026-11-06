import { hostname, userInfo } from 'node:os';
import type { Database } from 'better-sqlite3';
import { recordMultiuserMetric } from '../multiuserPerformanceDiagnostics.js';
import {
  acquireRecordLockInTransaction,
  getRecordLockInTransaction,
  heartbeatRecordLockInTransaction,
  releaseRecordLockInTransaction,
  recordLockError,
  validateRecordLockPayload,
  type OwnerContext,
  type RecordLockPayload,
  type RecordLockResult,
} from './recordLocks.js';

const SQLITE_RECORD_LOCK_WAIT_MS = 750;
const TEMPORARY_RECORD_LOCK_MESSAGE =
  'Base ocupada temporalmente. Reintentando el bloqueo compartido de forma segura.';

export interface DatabaseStatus {
  ready: boolean;
  phase: 'prepared' | 'active' | 'fallback' | 'error' | 'locked';
}

export interface RecordLockServiceDependencies {
  getSqliteStatus: () => DatabaseStatus;
  requireDatabase: () => Database;
  /** Serializa esta operación frente al resto de operaciones de escritura de la base (mismo lockPath que usa savePersistedRecord, etc.). */
  withDatabaseOperationLock: <T>(
    databasePath: string,
    operation: () => Promise<T>,
    waitMs?: number,
  ) => Promise<T>;
  /** Identificador estable de esta instancia de la app, resuelto en el arranque. */
  getOwnerId: () => string;
  /** La ruta actual de la base, usada como clave de `withDatabaseOperationLock`. */
  getDatabasePath: () => string;
}

export interface RecordLockService {
  acquireRecordLock: (payload: RecordLockPayload) => Promise<RecordLockResult>;
  heartbeatRecordLock: (payload: RecordLockPayload) => Promise<RecordLockResult>;
  releaseRecordLock: (payload: RecordLockPayload) => Promise<RecordLockResult>;
  getRecordLock: (payload: RecordLockPayload) => Promise<RecordLockResult>;
}

function isTemporaryDatabaseOperationLockError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return (
    message.includes('base ocupada temporalmente') ||
    message.includes('eisdir') ||
    message.includes('no se ha podido comprobar de forma fiable el bloqueo sqlite') ||
    message.includes('directorio de bloqueo sqlite existe') ||
    message.includes('posible problema temporal de red/smb')
  );
}

/**
 * Bloqueo por registro (no confundir con el bloqueo de fichero SMB de toda
 * la base, en `databaseLockManager.ts`): coordina que solo un usuario esté
 * editando una fila concreta de un módulo a la vez ("Editando: Ana@PC-ANA").
 * Vive en la tabla `editing_locks` a través de las transacciones de
 * `recordLocks.ts`; este módulo solo orquesta esas transacciones bajo el
 * lock de operación de base de datos y con el contexto del propietario
 * actual.
 */
export function createRecordLockService(
  dependencies: RecordLockServiceDependencies,
): RecordLockService {
  const {
    getSqliteStatus,
    requireDatabase,
    withDatabaseOperationLock,
    getOwnerId,
    getDatabasePath,
  } = dependencies;

  function ensureRecordLockDatabase(): Database | null {
    const currentStatus = getSqliteStatus();
    if (!currentStatus.ready || currentStatus.phase === 'locked') {
      return null;
    }

    return requireDatabase();
  }

  function currentOwnerName(): string {
    try {
      return userInfo().username || 'desconocido';
    } catch {
      return 'desconocido';
    }
  }

  function currentOwnerContext(): OwnerContext {
    return { ownerId: getOwnerId(), ownerName: currentOwnerName(), hostname: hostname() };
  }

  function runGuarded(
    payload: RecordLockPayload,
    unavailableMessage: string,
    unexpectedErrorMessage: string,
    metricName: 'adquirir bloqueo' | 'renovar bloqueo' | 'liberar bloqueo',
    run: (db: Database) => RecordLockResult,
  ): Promise<RecordLockResult> {
    if (!validateRecordLockPayload(payload)) {
      return Promise.resolve(recordLockError('Identificador de bloqueo inválido.'));
    }

    const startedAt = Date.now();
    return withDatabaseOperationLock(
      getDatabasePath(),
      async () => {
        try {
          const db = ensureRecordLockDatabase();
          if (!db) {
            return recordLockError(unavailableMessage);
          }

          return run(db);
        } catch (error) {
          return recordLockError(error instanceof Error ? error.message : unexpectedErrorMessage);
        }
      },
      SQLITE_RECORD_LOCK_WAIT_MS,
    ).catch((error: unknown) => {
      if (isTemporaryDatabaseOperationLockError(error)) {
        return recordLockError(TEMPORARY_RECORD_LOCK_MESSAGE);
      }

      return recordLockError(error instanceof Error ? error.message : unexpectedErrorMessage);
    }).then((result) => {
      // Los nombres proceden de cadenas fijas de la propia aplicación.
      recordMultiuserMetric('record-lock', metricName, Date.now() - startedAt, !result.ok);
      return result;
    });
  }

  function readLockWithoutExclusiveSmbLease(payload: RecordLockPayload): Promise<RecordLockResult> {
    if (!validateRecordLockPayload(payload)) {
      return Promise.resolve(recordLockError('Identificador de bloqueo inválido.'));
    }
    const startedAt = Date.now();
    let result: RecordLockResult;
    try {
      // getRecordLockInTransaction utiliza únicamente SELECT. La lectura no
      // necesita adquirir .lockdir; SQLite coordina sus lecturas con los
      // escritores. El bloqueo exclusivo sigue vigente para adquirir,
      // renovar y liberar reservas.
      const db = ensureRecordLockDatabase();
      result = db
        ? getRecordLockInTransaction(db, payload, currentOwnerContext(), new Date().toISOString())
        : recordLockError('SQLite no está disponible para consultar bloqueos.');
    } catch (error) {
      result = recordLockError(error instanceof Error ? error.message : 'No se ha podido consultar el bloqueo del registro.');
    }
    recordMultiuserMetric('record-lock', 'consulta de bloqueo de registro', Date.now() - startedAt, !result.ok);
    return Promise.resolve(result);
  }

  return {
    acquireRecordLock: (payload) =>
      runGuarded(
        payload,
        'SQLite no está disponible para coordinar bloqueos.',
        'No se ha podido adquirir el bloqueo del registro.',
        'adquirir bloqueo',
        (db) => acquireRecordLockInTransaction(db, payload, currentOwnerContext()),
      ),
    heartbeatRecordLock: (payload) =>
      runGuarded(
        payload,
        'SQLite no está disponible para renovar bloqueos.',
        'No se ha podido renovar el bloqueo del registro.',
        'renovar bloqueo',
        (db) => heartbeatRecordLockInTransaction(db, payload, currentOwnerContext()),
      ),
    releaseRecordLock: (payload) =>
      runGuarded(
        payload,
        'SQLite no está disponible para liberar bloqueos.',
        'No se ha podido liberar el bloqueo del registro.',
        'liberar bloqueo',
        (db) => releaseRecordLockInTransaction(db, payload, currentOwnerContext()),
      ),
    getRecordLock: (payload) => readLockWithoutExclusiveSmbLease(payload),
  };
}
