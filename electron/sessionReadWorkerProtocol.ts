/** PR9D-4B: contrato cerrado para lecturas de Comité y Paritaria. */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { SqliteComiteSessionRecord } from './persistence/sesionesRepository.js';

export type SessionReadKind = 'comite' | 'paritaria';
export type SessionReadRequest =
 | { kind: 'session:read'; databasePath: string; expected: ExpectedSqliteIdentity; module: SessionReadKind; id?: string }
 | { kind: 'session:shutdown' };
export type SessionReadResponse =
 | { kind: 'session:ready' }
 | { kind: 'session:result'; records: SqliteComiteSessionRecord[] }
 | { kind: 'session:rejected' };

export function isSessionReadRequest(value: unknown): value is SessionReadRequest {
 if (!value || typeof value !== 'object') return false;
 const v = value as Record<string, unknown>;
 if (v.kind === 'session:shutdown') return true;
 if (v.kind !== 'session:read' || !['comite','paritaria'].includes(String(v.module))
     || typeof v.databasePath !== 'string' || !v.databasePath.trim()
     || (v.id !== undefined && (typeof v.id !== 'string' || !v.id || v.id.length > 512))) return false;
 const identity = v.expected as Record<string, unknown> | null;
 return !!identity && typeof identity === 'object'
   && typeof identity.databaseUuid === 'string' && !!identity.databaseUuid
   && typeof identity.applicationId === 'string' && !!identity.applicationId
   && typeof identity.environment === 'string' && !!identity.environment
   && Number.isSafeInteger(identity.schemaVersion) && Number(identity.schemaVersion) >= 0;
}

export function isSessionReadResponse(value: unknown): value is SessionReadResponse {
 if (!value || typeof value !== 'object') return false;
 const v = value as Record<string, unknown>;
 if (v.kind === 'session:ready' || v.kind === 'session:rejected') return true;
 if (v.kind !== 'session:result' || !Array.isArray(v.records)) return false;
 return v.records.every((entry: unknown) => {
   if (!entry || typeof entry !== 'object') return false;
   const r = entry as Record<string, unknown>;
   return typeof r.id === 'string' && typeof r.value === 'string' &&
     typeof r.createdAt === 'string' && typeof r.updatedAt === 'string' &&
     (r.deletedAt === null || typeof r.deletedAt === 'string');
 });
}
