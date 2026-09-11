import type { Database } from 'better-sqlite3';
import type { DatabaseStatus } from '../sqlitePersistence.js';

const LEGACY_KEY = 'traccion.v1.loteria.campaign';

export interface LotterySqliteRecord { id: string; value: string; updatedAt: string; campaignYear?: number; }
export interface LotterySqliteSnapshot {
  status: DatabaseStatus;
  campaigns: LotterySqliteRecord[];
  requests: LotterySqliteRecord[];
}
export interface LotterySavePayload {
  year: number;
  campaignValue: string;
  requests: Array<{ id: string; value: string }>;
  expectedCampaignUpdatedAt: string | null;
  expectedRequestUpdatedAt: Record<string, string | null>;
}
export interface LotterySaveResult {
  ok: boolean;
  status: DatabaseStatus;
  campaignUpdatedAt: string | null;
  requestUpdatedAt: Record<string, string>;
  message: string;
}

interface Dependencies {
  safeDatabaseOperation: <T>(operation: () => T, fallback: (status: DatabaseStatus, message: string) => T) => Promise<T>;
  getSqliteStatus: () => DatabaseStatus;
  requireDatabase: () => Database;
  updateRefreshMetadata: (db: Database, updatedAt: string) => void;
  enqueueLocalBackup: (reason: string) => void;
  assertDatabaseWritesAllowed: () => void;
  isDatabaseWriteBlockedByHeartbeat: () => boolean;
}

type LegacyCampaign = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractArchive(raw: string): Array<{ year: number; campaign: LegacyCampaign }> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && parsed.version === 2 && isRecord(parsed.campaigns)) {
      return Object.entries(parsed.campaigns).flatMap(([year, campaign]) => {
        const numericYear = Number(year);
        return Number.isFinite(numericYear) && isRecord(campaign)
          ? [{ year: numericYear, campaign }]
          : [];
      });
    }
    if (isRecord(parsed)) {
      const year = Number(parsed.year);
      return Number.isFinite(year) ? [{ year, campaign: parsed }] : [];
    }
  } catch { /* legacy corrupto: no migrar */ }
  return [];
}

function migrateLegacyIfNeeded(db: Database): void {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM loteria_campaign_records').get() as { count: number };
  if (existing.count > 0) return;
  const legacy = db.prepare('SELECT value_json FROM persisted_records WHERE key = ?').get(LEGACY_KEY) as { value_json?: string } | undefined;
  if (!legacy?.value_json) return;
  const entries = extractArchive(legacy.value_json);
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  const insertCampaign = db.prepare(`INSERT OR IGNORE INTO loteria_campaign_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)`);
  const insertRequest = db.prepare(`INSERT OR IGNORE INTO loteria_request_records (id, campaign_year, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`);
  for (const { year, campaign } of entries) {
    const requests = Array.isArray(campaign.requests) ? campaign.requests : [];
    const campaignValue = JSON.stringify({ ...campaign, requests: [] });
    insertCampaign.run(String(year), campaignValue, now, now);
    for (const request of requests) {
      if (!request || typeof request !== 'object' || typeof request.id !== 'string') continue;
      const createdAt = typeof request.createdAt === 'string' ? request.createdAt : now;
      const updatedAt = typeof request.updatedAt === 'string' ? request.updatedAt : now;
      insertRequest.run(request.id, year, JSON.stringify(request), createdAt, updatedAt);
    }
  }
}

export function createLoteriaRepository(deps: Dependencies) {
  return {
    loadSnapshot: () => deps.safeDatabaseOperation(
      () => {
        const status = deps.getSqliteStatus();
        if (!status.ready || status.phase !== 'active') return { status, campaigns: [], requests: [] };
        const db = deps.requireDatabase();
        db.transaction(() => migrateLegacyIfNeeded(db))();
        const campaigns = db.prepare(`SELECT id, value_json AS value, updated_at AS updatedAt FROM loteria_campaign_records WHERE deleted_at IS NULL ORDER BY id`).all() as LotterySqliteRecord[];
        const requests = db.prepare(`SELECT id, campaign_year AS campaignYear, value_json AS value, updated_at AS updatedAt FROM loteria_request_records WHERE deleted_at IS NULL ORDER BY campaign_year, id`).all() as LotterySqliteRecord[];
        return { status, campaigns, requests };
      },
      (status) => ({ status, campaigns: [], requests: [] }),
    ),

    saveSnapshotIfUnchanged: (payload: LotterySavePayload) => deps.safeDatabaseOperation(
      () => {
        const status = deps.getSqliteStatus();
        if (!status.ready || status.phase !== 'active' || deps.isDatabaseWriteBlockedByHeartbeat()) {
          return { ok: false, status, campaignUpdatedAt: null, requestUpdatedAt: {}, message: status.message ?? 'SQLite no está activo.' };
        }
        deps.assertDatabaseWritesAllowed();
        const db = deps.requireDatabase();
        const result = db.transaction((): LotterySaveResult => {
          migrateLegacyIfNeeded(db);
          const campaignId = String(payload.year);
          const campaignRow = db.prepare('SELECT updated_at FROM loteria_campaign_records WHERE id = ?').get(campaignId) as { updated_at?: string } | undefined;
          const currentCampaignUpdatedAt = campaignRow?.updated_at ?? null;
          if (currentCampaignUpdatedAt !== payload.expectedCampaignUpdatedAt) {
            return { ok: false, status, campaignUpdatedAt: currentCampaignUpdatedAt, requestUpdatedAt: {}, message: 'La campaña de Lotería ha sido modificada por otro usuario. Recarga antes de guardar.' };
          }

          const existingRows = db.prepare('SELECT id, updated_at FROM loteria_request_records WHERE campaign_year = ? AND deleted_at IS NULL').all(payload.year) as Array<{ id: string; updated_at: string }>;
          const existingMap = new Map(existingRows.map((row) => [row.id, row.updated_at]));
          for (const [id, updatedAt] of existingMap) {
            if ((payload.expectedRequestUpdatedAt[id] ?? null) !== updatedAt) {
              return { ok: false, status, campaignUpdatedAt: currentCampaignUpdatedAt, requestUpdatedAt: Object.fromEntries(existingMap), message: 'Un participante de Lotería ha sido modificado por otro usuario. Recarga antes de guardar.' };
            }
          }
          for (const request of payload.requests) {
            if (!existingMap.has(request.id) && (payload.expectedRequestUpdatedAt[request.id] ?? null) !== null) {
              return { ok: false, status, campaignUpdatedAt: currentCampaignUpdatedAt, requestUpdatedAt: Object.fromEntries(existingMap), message: 'La lista de participantes ha cambiado. Recarga antes de guardar.' };
            }
          }

          const now = new Date().toISOString();
          if (currentCampaignUpdatedAt === null) {
            db.prepare(`INSERT INTO loteria_campaign_records (id, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, NULL)`).run(campaignId, payload.campaignValue, now, now);
          } else {
            db.prepare(`UPDATE loteria_campaign_records SET value_json = ?, updated_at = ?, deleted_at = NULL WHERE id = ?`).run(payload.campaignValue, now, campaignId);
          }

          const nextIds = new Set(payload.requests.map((request) => request.id));
          for (const row of existingRows) {
            if (!nextIds.has(row.id)) {
              db.prepare('UPDATE loteria_request_records SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now, now, row.id);
            }
          }

          const nextRequestUpdatedAt: Record<string, string> = {};
          for (const request of payload.requests) {
            let requestUpdatedAt = now;
            try {
              const parsed = JSON.parse(request.value);
              if (typeof parsed.updatedAt === 'string') requestUpdatedAt = parsed.updatedAt;
            } catch { /* use now */ }
            const existing = existingMap.get(request.id);
            if (existing) {
              db.prepare(`UPDATE loteria_request_records SET campaign_year = ?, value_json = ?, updated_at = ?, deleted_at = NULL WHERE id = ?`).run(payload.year, request.value, requestUpdatedAt, request.id);
            } else {
              let createdAt = requestUpdatedAt;
              try {
                const parsed = JSON.parse(request.value);
                if (typeof parsed.createdAt === 'string') createdAt = parsed.createdAt;
              } catch { /* use updated */ }
              db.prepare(`INSERT INTO loteria_request_records (id, campaign_year, value_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`).run(request.id, payload.year, request.value, createdAt, requestUpdatedAt);
            }
            nextRequestUpdatedAt[request.id] = requestUpdatedAt;
          }
          deps.updateRefreshMetadata(db, now);
          return { ok: true, status, campaignUpdatedAt: now, requestUpdatedAt: nextRequestUpdatedAt, message: 'Campaña de Lotería guardada en SQLite.' };
        })();
        if (result.ok) deps.enqueueLocalBackup('save:loteria');
        return result;
      },
      (status, message) => ({ ok: false, status, campaignUpdatedAt: null, requestUpdatedAt: {}, message }),
    ),
  };
}
