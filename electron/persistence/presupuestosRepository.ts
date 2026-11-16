import type { Database } from 'better-sqlite3';
import type { DatabaseStatus } from '../sqlitePersistence.js';
import { readPresupuestosRevision, savePresupuestosTransaction } from './presupuestosWriteCore.js';
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
  /** Token opaco de las cuatro tablas, incluidas las filas borradas lógicamente. */
  revision: string | null;
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
    // Cada repositorio conserva la preparación/migración legacy bajo lock
    // de escritura; después, leer las cuatro tablas en una única transacción.
    await Promise.all([
      scenariosRepository.loadSnapshot(),
      manualItemsRepository.loadSnapshot(),
      ticketGroupsRepository.loadSnapshot(),
      actualsRepository.loadSnapshot(),
    ]);
    return deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active') {
          return { status: currentStatus, scenarios: [], manualItems: [], ticketGroups: [], actuals: [], revision: null };
        }
        const db = deps.requireDatabase();
        return db.transaction((): PresupuestosRecordsSnapshot => ({
          status: currentStatus,
          scenarios: readActiveJsonRecords(db, 'presupuesto_scenario_records'),
          manualItems: readActiveJsonRecords(db, 'presupuesto_manual_item_records'),
          ticketGroups: readActiveJsonRecords(db, 'presupuesto_ticket_group_records'),
          actuals: readActiveJsonRecords(db, 'presupuesto_actual_records'),
          revision: readPresupuestosRevision(db),
        }))();
      },
      (nextStatus) => ({
        status: nextStatus, scenarios: [], manualItems: [], ticketGroups: [], actuals: [], revision: '',
      }),
    );
  }

  async function savePresupuestosSnapshotIfUnchanged(
    snapshot: PresupuestosSnapshotInput,
  ): Promise<SimpleJsonSaveResult> {
    const currentSnapshot = await loadPresupuestosRecordsSnapshot();
    const currentUpdatedAt = currentSnapshot.revision;

    if (currentUpdatedAt !== snapshot.expectedUpdatedAt) {
      return {
        ok: false,
        status: currentSnapshot.status,
        currentUpdatedAt,
        message: 'Presupuestos ha sido modificado por otro usuario. Recarga antes de guardar.',
      };
    }


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
        const result = savePresupuestosTransaction(
          db, snapshot, currentStatus, deps.updateRefreshMetadata,
        );
        if (!result.ok) return result;
        deps.enqueueLocalBackup('save:presupuestos');
        return result;
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
