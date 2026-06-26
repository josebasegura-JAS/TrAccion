import type { Database } from 'better-sqlite3';
import type { DatabaseStatus } from '../sqlitePersistence.js';
import { readActiveJsonRecords } from './jsonRecordRepository.js';
import type { CreateJsonModuleRepository } from './simpleDomainRepositoryFactory.js';
import type { SimpleJsonRecordsSnapshot, SimpleJsonSaveResult } from './simpleJsonModuleRepository.js';

/**
 * Presupuestos es el único módulo de dominio que no sigue el molde
 * load/save por tabla: guarda 4 tablas (scenarios, manualItems,
 * ticketGroups, actuals) en una sola transacción SQLite, con un único
 * token de concurrencia (OCC) calculado sobre el conjunto combinado de las
 * 4 — si cualquiera de las 4 colecciones cambió desde la última carga, el
 * guardado entero se rechaza, no solo la tabla que cambió. Por eso no usa
 * createJsonModuleRepository.saveIfUnchanged/saveManyIfUnchanged como el
 * resto de módulos: la escritura es manual (INSERT ... ON CONFLICT,
 * soft-delete de las filas que ya no están presentes) dentro de
 * db.transaction(), igual que hacía en sqlitePersistence.ts.
 *
 * Como esta función de guardado sí necesita la conexión activa, el estado
 * de SQLite y el resto de la orquestación (heartbeat, lock de escritura,
 * backup local), esas piezas se inyectan como dependencias ya construidas
 * — mismo motivo que con createJsonModuleRepository en el resto de
 * módulos: evitar una dependencia circular con sqlitePersistence.ts, que
 * sigue siendo dueño de esa orquestación.
 */
export interface PresupuestosRepositoryDependencies {
  createJsonModuleRepository: CreateJsonModuleRepository;
  getSqliteStatus: () => DatabaseStatus;
  isDatabaseWriteBlockedByHeartbeat: () => boolean;
  assertDatabaseWritesAllowed: () => void;
  requireDatabase: () => Database;
  updateRefreshMetadata: (db: Database, updatedAt: string) => void;
  enqueueLocalBackup: (reason: string) => void;
  safeDatabaseOperation: <T>(
    operation: () => T,
    fallback: (status: DatabaseStatus, message: string) => T,
  ) => Promise<T>;
}

export interface PresupuestosRecordsSnapshot {
  status: DatabaseStatus;
  scenarios: SimpleJsonRecordsSnapshot['records'];
  manualItems: SimpleJsonRecordsSnapshot['records'];
  ticketGroups: SimpleJsonRecordsSnapshot['records'];
  actuals: SimpleJsonRecordsSnapshot['records'];
}

export interface PresupuestosSnapshotInput {
  scenarios: Array<{ id: string; value: string }>;
  manualItems: Array<{ id: string; value: string }>;
  ticketGroups: Array<{ id: string; value: string }>;
  actuals: Array<{ id: string; value: string }>;
  expectedUpdatedAt: string | null;
}

export interface PresupuestosRepositoryApi {
  loadPresupuestosRecordsSnapshot: () => Promise<PresupuestosRecordsSnapshot>;
  savePresupuestosSnapshotIfUnchanged: (snapshot: PresupuestosSnapshotInput) => Promise<SimpleJsonSaveResult>;
}

function latestUpdatedAtFromSnapshots(snapshots: SimpleJsonRecordsSnapshot[]): string | null {
  return snapshots
    .flatMap((snapshot) => snapshot.records)
    .reduce<string | null>((latest, record) => {
      if (!latest || record.updatedAt > latest) {
        return record.updatedAt;
      }
      return latest;
    }, null);
}

export function createPresupuestosRepository(
  deps: PresupuestosRepositoryDependencies,
): PresupuestosRepositoryApi {
  let scenariosMigrationDone = false;
  let manualItemsMigrationDone = false;
  let ticketGroupsMigrationDone = false;
  let actualsMigrationDone = false;

  const scenariosRepository = deps.createJsonModuleRepository(
    'presupuesto_scenario_records',
    'traccion.v1.presupuestos.scenarios',
    'Escenario de presupuesto',
    () => scenariosMigrationDone,
    (value) => {
      scenariosMigrationDone = value;
    },
  );

  const manualItemsRepository = deps.createJsonModuleRepository(
    'presupuesto_manual_item_records',
    'traccion.v1.presupuestos.manualItems',
    'Partida manual de presupuesto',
    () => manualItemsMigrationDone,
    (value) => {
      manualItemsMigrationDone = value;
    },
  );

  const ticketGroupsRepository = deps.createJsonModuleRepository(
    'presupuesto_ticket_group_records',
    'traccion.v1.presupuestos.ticketGroups',
    'Grupo ticket de presupuesto',
    () => ticketGroupsMigrationDone,
    (value) => {
      ticketGroupsMigrationDone = value;
    },
  );

  const actualsRepository = deps.createJsonModuleRepository(
    'presupuesto_actual_records',
    'traccion.v1.presupuestos.actuals',
    'Real de presupuesto',
    () => actualsMigrationDone,
    (value) => {
      actualsMigrationDone = value;
    },
  );

  async function loadPresupuestosRecordsSnapshot(): Promise<PresupuestosRecordsSnapshot> {
    const [scenarios, manualItems, ticketGroups, actuals] = await Promise.all([
      scenariosRepository.loadSnapshot(),
      manualItemsRepository.loadSnapshot(),
      ticketGroupsRepository.loadSnapshot(),
      actualsRepository.loadSnapshot(),
    ]);

    return {
      status: scenarios.status as DatabaseStatus,
      scenarios: scenarios.records,
      manualItems: manualItems.records,
      ticketGroups: ticketGroups.records,
      actuals: actuals.records,
    };
  }

  async function savePresupuestosSnapshotIfUnchanged(
    snapshot: PresupuestosSnapshotInput,
  ): Promise<SimpleJsonSaveResult> {
    const currentSnapshot = await loadPresupuestosRecordsSnapshot();
    const currentUpdatedAt = latestUpdatedAtFromSnapshots([
      { status: currentSnapshot.status, records: currentSnapshot.scenarios },
      { status: currentSnapshot.status, records: currentSnapshot.manualItems },
      { status: currentSnapshot.status, records: currentSnapshot.ticketGroups },
      { status: currentSnapshot.status, records: currentSnapshot.actuals },
    ]);

    if (currentUpdatedAt !== snapshot.expectedUpdatedAt) {
      return {
        ok: false,
        status: currentSnapshot.status,
        currentUpdatedAt,
        message: 'Presupuestos ha sido modificado por otro usuario. Recarga antes de guardar.',
      };
    }

    const updatedAt = new Date().toISOString();

    return deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (
          !currentStatus.ready ||
          currentStatus.phase !== 'active' ||
          deps.isDatabaseWriteBlockedByHeartbeat()
        ) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt: null,
            message:
              currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
          };
        }

        deps.assertDatabaseWritesAllowed();
        const db = deps.requireDatabase();
        db.transaction(() => {
          const collections = [
            ['presupuesto_scenario_records', snapshot.scenarios],
            ['presupuesto_manual_item_records', snapshot.manualItems],
            ['presupuesto_ticket_group_records', snapshot.ticketGroups],
            ['presupuesto_actual_records', snapshot.actuals],
          ] as const;

          for (const [tableName, records] of collections) {
            const ids = new Set(records.map((record) => record.id));
            const existingRows = readActiveJsonRecords(db, tableName);
            for (const row of existingRows) {
              if (!ids.has(row.id)) {
                db.prepare(`UPDATE ${tableName} SET updated_at = ?, deleted_at = ? WHERE id = ?`).run(
                  updatedAt,
                  updatedAt,
                  row.id,
                );
              }
            }

            for (const record of records) {
              db.prepare(
                `INSERT INTO ${tableName} (id, value_json, created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, NULL)
                 ON CONFLICT(id) DO UPDATE SET
                   value_json = excluded.value_json,
                   updated_at = excluded.updated_at,
                   deleted_at = NULL`,
              ).run(record.id, record.value, updatedAt, updatedAt);
            }
          }
          deps.updateRefreshMetadata(db, updatedAt);
        })();
        deps.enqueueLocalBackup('save:presupuestos');
        return {
          ok: true,
          status: currentStatus,
          currentUpdatedAt: updatedAt,
          message: 'Presupuestos guardado en SQLite.',
        };
      },
      (nextStatus, message) => ({
        ok: false,
        status: nextStatus,
        currentUpdatedAt: null,
        message,
      }),
    );
  }

  return { loadPresupuestosRecordsSnapshot, savePresupuestosSnapshotIfUnchanged };
}
