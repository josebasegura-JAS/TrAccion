import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { IsolatedSyncTokens } from './isolatedSyncTokensCore.js';

export type SyncTokensRequest =
  | { kind: 'sync-tokens:read'; databasePath: string; expected: ExpectedSqliteIdentity }
  | { kind: 'sync-tokens:shutdown' };

export type SyncTokensResponse =
  | { kind: 'sync-tokens:ready' }
  | { kind: 'sync-tokens:result'; snapshot: IsolatedSyncTokens }
  | { kind: 'sync-tokens:rejected' };

export function isSyncTokensRequest(value: unknown): value is SyncTokensRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if (message.kind === 'sync-tokens:shutdown') return true;
  if (message.kind !== 'sync-tokens:read' ||
    typeof message.databasePath !== 'string' || !message.databasePath.trim()) return false;
  const e = message.expected;
  if (!e || typeof e !== 'object') return false;
  const identity = e as Record<string, unknown>;
  return typeof identity.databaseUuid === 'string' && !!identity.databaseUuid &&
    typeof identity.applicationId === 'string' && !!identity.applicationId &&
    typeof identity.environment === 'string' && !!identity.environment &&
    Number.isSafeInteger(identity.schemaVersion) && Number(identity.schemaVersion) >= 0;
}

function validNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

export function isSyncTokensResponse(value: unknown): value is SyncTokensResponse {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  if (msg.kind === 'sync-tokens:ready' || msg.kind === 'sync-tokens:rejected') return true;
  if (msg.kind !== 'sync-tokens:result' || !msg.snapshot || typeof msg.snapshot !== 'object') return false;
  const s = msg.snapshot as Record<string, unknown>;
  if (!['refreshToken', 'latestUpdatedAt', 'taskRecordsUpdatedAt',
    'sorteosDrawsUpdatedAt', 'sorteosExclusionsUpdatedAt'].every(k => validNullableString(s[k]))) return false;
  if (!s.directStoreUpdatedAt || typeof s.directStoreUpdatedAt !== 'object' || Array.isArray(s.directStoreUpdatedAt)) return false;
  return Object.values(s.directStoreUpdatedAt).every(validNullableString);
}
