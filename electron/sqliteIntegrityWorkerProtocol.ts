/**
 * PR9D · Contrato del preflight SQLite de solo lectura en un utilityProcess.
 * El path solo viaja por IPC local a un proceso hijo; nunca va a diagnósticos.
 */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';

export type SqliteIntegrityWorkerRequest =
  | { kind: 'integrity:verify'; databasePath: string; expected: ExpectedSqliteIdentity }
  | { kind: 'integrity:shutdown' };

export type SqliteIntegrityWorkerResponse =
  | { kind: 'integrity:verified' }
  | { kind: 'integrity:rejected' };

export function isSqliteIntegrityWorkerRequest(value: unknown): value is SqliteIntegrityWorkerRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if (message.kind === 'integrity:shutdown') return true;
  if (message.kind !== 'integrity:verify') return false;
  if (typeof message.databasePath !== 'string' || !message.databasePath.trim()) return false;
  const expected = message.expected;
  if (!expected || typeof expected !== 'object') return false;
  const identity = expected as Record<string, unknown>;
  return typeof identity.databaseUuid === 'string' && identity.databaseUuid.length > 0
    && typeof identity.applicationId === 'string' && identity.applicationId.length > 0
    && typeof identity.environment === 'string' && identity.environment.length > 0
    && Number.isSafeInteger(identity.schemaVersion) && Number(identity.schemaVersion) >= 0;
}

export function isSqliteIntegrityWorkerResponse(value: unknown): value is SqliteIntegrityWorkerResponse {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'integrity:verified' || kind === 'integrity:rejected';
}
