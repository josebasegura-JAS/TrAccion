/** Configuración en escritor auxiliar, preparado pero desconectado de producción. */
import type { Database } from 'better-sqlite3';
import type { DatabaseStatus } from './sqlitePersistence.js';
import type { ConditionalConfiguracionRecord, ConfiguracionSaveResult } from './persistence/configuracionRepository.js';
import { saveConfiguracionTransaction } from './persistence/configuracionWriteCore.js';

export interface DetachedConfiguracionSave {
  ownerId: string;
  record: ConditionalConfiguracionRecord;
}

export function isDetachedConfiguracionSave(value: unknown): value is DetachedConfiguracionSave {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (typeof r.ownerId !== 'string' || !r.ownerId.trim() ||
      !r.record || typeof r.record !== 'object') return false;
  const record = r.record as Record<string, unknown>;
  return typeof record.value === 'string' &&
    (record.expectedUpdatedAt === null || typeof record.expectedUpdatedAt === 'string');
}

export function saveDetachedConfiguracion(
  db: Database, request: DetachedConfiguracionSave,
): ConfiguracionSaveResult {
  if (!isDetachedConfiguracionSave(request)) {
    throw new Error('Petición aislada de Configuración inválida.');
  }
  const status: DatabaseStatus = {
    ready: true, engine: 'better-sqlite3', phase: 'active',
    path: ':detached-owner:', schemaVersion: 0,
    isDefaultPath: false, lockPath: ':external-smb-lock:',
  };
  return saveConfiguracionTransaction(db, request.record, status, (database, updatedAt) => {
    database.prepare(
      `INSERT INTO app_metadata (key,value,updated_at)
       VALUES ('persisted_records_refresh_token',?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    ).run(`${updatedAt}:${request.ownerId}`, updatedAt);
  });
}
