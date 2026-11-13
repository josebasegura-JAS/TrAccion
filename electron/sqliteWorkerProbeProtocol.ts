/**
 * PR9C · Protocolo aislado de prueba para un futuro proceso SQLite.
 * Importante: todavía NO envía consultas, conexiones ni escrituras SQLite.
 */
export type SqliteWorkerProbeRequest =
  | { kind: 'probe:ping'; id: number }
  | { kind: 'probe:shutdown' };

export type SqliteWorkerProbeResponse =
  | { kind: 'probe:ready' }
  | { kind: 'probe:pong'; id: number };

export function isSqliteWorkerProbeRequest(value: unknown): value is SqliteWorkerProbeRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (message.kind === 'probe:ping' && Number.isSafeInteger(message.id) && Number(message.id) > 0)
    || message.kind === 'probe:shutdown';
}

export function isSqliteWorkerProbeResponse(value: unknown): value is SqliteWorkerProbeResponse {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return message.kind === 'probe:ready'
    || (message.kind === 'probe:pong' && Number.isSafeInteger(message.id) && Number(message.id) > 0);
}
