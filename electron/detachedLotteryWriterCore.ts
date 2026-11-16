/** Guardado de Lotería en utilityProcess, preparado sin ruta productiva.
 * Preserva la transacción única de campaña, participantes y arqueos append-only.
 */
import type { Database } from 'better-sqlite3';
import type { DatabaseStatus } from './sqlitePersistence.js';
import type { LotterySavePayload, LotterySaveResult } from './persistence/loteriaRepository.js';
import { saveLotterySnapshotTransaction } from './persistence/loteriaRepository.js';

export interface DetachedLotterySave {
  ownerId: string;
  payload: LotterySavePayload;
}
export function isDetachedLotterySave(value: unknown): value is DetachedLotterySave {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (typeof r.ownerId !== 'string' || !r.ownerId.trim() ||
      !r.payload || typeof r.payload !== 'object') return false;
  const p = r.payload as Record<string, unknown>;
  if (!Number.isSafeInteger(p.year) || Number(p.year) < 2000 || Number(p.year) > 9999 ||
      typeof p.campaignValue !== 'string' || !p.campaignValue.trim() ||
      !Array.isArray(p.requests) || p.requests.length > 10000 ||
      !p.expectedRequestUpdatedAt || typeof p.expectedRequestUpdatedAt !== 'object' ||
      Array.isArray(p.expectedRequestUpdatedAt) ||
      (p.expectedCampaignUpdatedAt !== null && typeof p.expectedCampaignUpdatedAt !== 'string')) return false;
  const versions = Object.values(p.expectedRequestUpdatedAt);
  if (versions.some(v => v !== null && typeof v !== 'string')) return false;
  const ids = new Set<string>();
  for (const candidate of p.requests) {
    if (!candidate || typeof candidate !== 'object') return false;
    const request = candidate as Record<string, unknown>;
    if (typeof request.id !== 'string' || !request.id.trim() ||
        typeof request.value !== 'string' || !request.value.trim() ||
        ids.has(request.id)) return false;
    ids.add(request.id);
  }
  return true;
}
export function saveDetachedLotterySnapshot(db: Database, request: DetachedLotterySave): LotterySaveResult {
  if (!isDetachedLotterySave(request)) throw new Error('Petición de Lotería aislada inválida.');
  const status: DatabaseStatus = {
    ready: true, engine: 'better-sqlite3', phase: 'active',
    path: ':detached-owner:', schemaVersion: 0,
    isDefaultPath: false, lockPath: ':external-smb-lock:',
  };
  return saveLotterySnapshotTransaction(db, request.payload, status, (database, updatedAt) => {
    database.prepare(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES ('persisted_records_refresh_token', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    ).run(`${updatedAt}:${request.ownerId}`, updatedAt);
  });
}
