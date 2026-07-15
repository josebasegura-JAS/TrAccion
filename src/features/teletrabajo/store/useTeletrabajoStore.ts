import { create } from 'zustand';
import type { Employee } from '../../plantilla/domain/employee';
import { EMPTY_TELETRABAJO_FILTERS, type TeletrabajoFilters } from '../domain/filters';
import {
  importEncuestaFromFile,
  importHistoricoTeletrabajoFromFile,
  type EncuestaParseOptions,
  type ImportEncuestaResult,
  type ImportHistoricoTeletrabajoResult,
} from '../domain/importEncuesta';
import {
  normalizeGrupoCoberturaDraft,
  normalizeGrupoCoberturaNombre,
  type GrupoCobertura,
  type GrupoCoberturaDraft,
} from '../domain/gruposCobertura';
import {
  importTeletrabajoPuestosFromFile,
  normalizeTeletrabajoPuesto,
  normalizeTeletrabajoPuestoDraft,
  type TeletrabajoPuesto,
  type TeletrabajoPuestoDraft,
  type TeletrabajoPuestoImportRow,
} from '../domain/puestosTeletrabajo';
import {
  saveNewSharedArrayRecord,
  saveSharedArrayRecord,
} from '../../../services/sharedRecordPersistence';
import {
  deleteTeletrabajoSolicitudInSqlite,
  hasTeletrabajoSqliteRepository,
  loadTeletrabajoRecordsFromSqlite,
  saveTeletrabajoSolicitudesToSqlite,
  saveTeletrabajoSolicitudToSqlite,
} from './teletrabajoSqliteRepository';
import { enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import { type TeletrabajoDraft, type TeletrabajoSolicitud } from '../domain/solicitud';
import {
  STORAGE_KEY,
  areSolicitudesEquivalent,
  buildSolicitudesForNewPeriodo,
  buildTeletrabajoState,
  createSolicitudId,
  firstVisibleSolicitudId,
  hasTeletrabajoDraftChanges,
  loadSolicitudesFromSqliteOrStorage,
  logTeletrabajoPersistenceError,
  normalizeDraft,
  parseSingleSolicitud,
  parseSolicitudes,
  persistSolicitudes,
  readSolicitudes,
  registerTeletrabajoUpdateAudit,
  withTeletrabajoBusy,
  type CreateTeletrabajoPeriodoOptions,
} from './teletrabajoSolicitudes.helpers';
import {
  arePuestosTeletrabajoEquivalent,
  loadPuestosYGruposConMigracion,
  persistPuestoTeletrabajoRecord,
  persistPuestosTeletrabajo,
  readPuestosTeletrabajo,
  resolveGrupoCoberturaNombresToIds,
  upsertPuestosTeletrabajo,
} from './teletrabajoPuestos.helpers';
import {
  areGruposCoberturaEquivalent,
  createGrupoCoberturaId,
  persistGrupoCoberturaRecord,
  persistGruposCobertura,
  readGruposCobertura,
} from './teletrabajoGruposCobertura.helpers';

interface TeletrabajoUpdateResult {
  ok: boolean;
  message: string;
  recordId?: string;
}

interface TeletrabajoPeriodoCreationResult extends TeletrabajoUpdateResult {
  created: number;
  ignored: number;
}

export interface PendingHistoricoImport extends ImportHistoricoTeletrabajoResult {
  /** Solicitudes existentes en el momento de calcular la previsualización, usadas para auditoría/concurrencia al confirmar. */
  baseSolicitudes: TeletrabajoSolicitud[];
}

interface TeletrabajoStateStore {
  solicitudes: TeletrabajoSolicitud[];
  puestosTeletrabajo: TeletrabajoPuesto[];
  gruposCobertura: GrupoCobertura[];
  selectedSolicitudId: string;
  filters: TeletrabajoFilters;
  pendingHistoricoImport: PendingHistoricoImport | null;
  load: () => void;
  reloadFromStorage: () => void;
  createWithConcurrencyCheck: (draft: TeletrabajoDraft) => Promise<TeletrabajoUpdateResult>;
  updateWithConcurrencyCheck: (
    id: string,
    draft: TeletrabajoDraft,
    expectedUpdatedAt: string | null,
  ) => Promise<TeletrabajoUpdateResult>;
  importEncuesta: (
    file: File,
    employees: readonly Employee[],
    options?: EncuestaParseOptions,
  ) => Promise<ImportEncuestaResult>;
  previewImportHistorico: (
    file: File,
    employees: readonly Employee[],
  ) => Promise<ImportHistoricoTeletrabajoResult>;
  confirmImportHistorico: () => Promise<ImportHistoricoTeletrabajoResult>;
  cancelImportHistorico: () => void;
  createPeriodo: (
    options: CreateTeletrabajoPeriodoOptions,
  ) => Promise<TeletrabajoPeriodoCreationResult>;
  createPuestoTeletrabajo: (draft: TeletrabajoPuestoDraft) => Promise<TeletrabajoUpdateResult>;
  updatePuestoTeletrabajo: (
    id: string,
    draft: TeletrabajoPuestoDraft,
  ) => Promise<TeletrabajoUpdateResult>;
  removePuestoTeletrabajo: (id: string) => Promise<TeletrabajoUpdateResult>;
  importPuestosTeletrabajo: (file: File) => Promise<number>;
  importPuestosTeletrabajoDrafts: (rows: readonly TeletrabajoPuestoImportRow[]) => number;
  createGrupoCobertura: (draft: GrupoCoberturaDraft) => Promise<TeletrabajoUpdateResult>;
  updateGrupoCobertura: (
    id: string,
    draft: GrupoCoberturaDraft,
  ) => Promise<TeletrabajoUpdateResult>;
  removeGrupoCobertura: (id: string) => Promise<TeletrabajoUpdateResult>;
  setPuestoGrupoCobertura: (
    puestoId: string,
    grupoCoberturaId: string | null,
  ) => Promise<TeletrabajoUpdateResult>;
  removeWithConcurrencyCheck: (
    id: string,
    expectedUpdatedAt: string | null,
  ) => Promise<TeletrabajoUpdateResult>;
  selectSolicitud: (solicitudId: string) => void;
  setFilter: <K extends keyof TeletrabajoFilters>(key: K, value: TeletrabajoFilters[K]) => void;
}

export const useTeletrabajoStore = create<TeletrabajoStateStore>((set, get) => ({
  solicitudes: [],
  puestosTeletrabajo: [],
  gruposCobertura: [],
  selectedSolicitudId: '',
  filters: EMPTY_TELETRABAJO_FILTERS,
  pendingHistoricoImport: null,
  load: () => {
    const solicitudes = readSolicitudes();
    const puestosTeletrabajo = readPuestosTeletrabajo().puestos;
    const gruposCobertura = readGruposCobertura();
    set(buildTeletrabajoState(solicitudes, puestosTeletrabajo, gruposCobertura));
    void loadPuestosYGruposConMigracion()
      .then(({ puestos, gruposCobertura: nextGruposCobertura }) => {
        set((state) =>
          buildTeletrabajoState(
            state.solicitudes,
            puestos,
            nextGruposCobertura,
            state.selectedSolicitudId,
          ),
        );
      })
      .catch((error) =>
        console.warn('Puestos/grupos de cobertura no cargados desde SQLite.', error),
      );
    void loadSolicitudesFromSqliteOrStorage()
      .then((nextSolicitudes) =>
        set((state) =>
          buildTeletrabajoState(
            nextSolicitudes,
            state.puestosTeletrabajo,
            state.gruposCobertura,
            state.selectedSolicitudId,
          ),
        ),
      )
      .catch((error) => logTeletrabajoPersistenceError('loadTeletrabajo', error));
  },
  reloadFromStorage: () => {
    void Promise.all([loadSolicitudesFromSqliteOrStorage(), loadPuestosYGruposConMigracion()])
      .then(
        ([
          nextSolicitudes,
          { puestos: nextPuestosTeletrabajo, gruposCobertura: nextGruposCobertura },
        ]) => {
          set((state) => {
            const hasSolicitudesChanged = !areSolicitudesEquivalent(
              state.solicitudes,
              nextSolicitudes,
            );
            const hasPuestosChanged = !arePuestosTeletrabajoEquivalent(
              state.puestosTeletrabajo,
              nextPuestosTeletrabajo,
            );
            const hasGruposChanged = !areGruposCoberturaEquivalent(
              state.gruposCobertura,
              nextGruposCobertura,
            );

            if (!hasSolicitudesChanged && !hasPuestosChanged && !hasGruposChanged) {
              return state;
            }

            return buildTeletrabajoState(
              nextSolicitudes,
              nextPuestosTeletrabajo,
              nextGruposCobertura,
              state.selectedSolicitudId,
            );
          });
        },
      )
      .catch((error) => logTeletrabajoPersistenceError('reloadTeletrabajoFromStorage', error));
  },
  createWithConcurrencyCheck: async (draft) => {
    const now = new Date().toISOString();
    const solicitud: TeletrabajoSolicitud = {
      id: createSolicitudId(),
      ...normalizeDraft(draft),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    try {
      return await withTeletrabajoBusy('Guardando solicitud de Teletrabajo...', async () => {
        if (hasTeletrabajoSqliteRepository()) {
          const records = await loadTeletrabajoRecordsFromSqlite();
          if (records !== null) {
            if (records.some((record) => record.id === solicitud.id)) {
              throw new Error(
                'La solicitud ya existe en la base compartida. Recarga antes de continuar.',
              );
            }

            const saveResult = await saveTeletrabajoSolicitudToSqlite(solicitud, null);
            if (!saveResult?.ok) {
              throw new Error(saveResult?.message ?? 'No se ha podido crear la solicitud.');
            }

            enqueueAuditEvent({
              module: 'teletrabajo',
              entityId: solicitud.id,
              action: 'created',
              summary: 'Registro creado',
              changes: [],
            });

            const solicitudes = [
              ...records.flatMap((record) => parseSolicitudes(`[${record.value}]`)),
              solicitud,
            ];
            set({ solicitudes, selectedSolicitudId: solicitud.id });
            return { ok: true, message: 'Solicitud creada.', recordId: solicitud.id };
          }
        }

        const result = await saveNewSharedArrayRecord<TeletrabajoSolicitud>({
          storageKey: STORAGE_KEY,
          newRecord: solicitud,
          parseRecords: parseSolicitudes,
          getRecordId: (record) => record.id,
          duplicateMessage:
            'La solicitud ya existe en la base compartida. Recarga antes de continuar.',
        });

        enqueueAuditEvent({
          module: 'teletrabajo',
          entityId: result.newRecord.id,
          action: 'created',
          summary: 'Registro creado',
          changes: [],
        });

        set({ solicitudes: result.records, selectedSolicitudId: result.newRecord.id });
        return { ok: true, message: 'Solicitud creada.', recordId: result.newRecord.id };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se ha podido crear la solicitud.';
      return { ok: false, message };
    }
  },
  updateWithConcurrencyCheck: async (id, draft, expectedUpdatedAt) => {
    const normalizedDraft = normalizeDraft(draft);
    const currentSolicitud = get().solicitudes.find((solicitud) => solicitud.id === id);

    if (currentSolicitud && !hasTeletrabajoDraftChanges(currentSolicitud, normalizedDraft)) {
      return { ok: true, message: 'Sin cambios que guardar.' };
    }

    try {
      return await withTeletrabajoBusy('Guardando solicitud de Teletrabajo...', async () => {
        if (hasTeletrabajoSqliteRepository()) {
          const records = await loadTeletrabajoRecordsFromSqlite();
          if (records !== null) {
            const currentRecord = records.find((record) => record.id === id);
            const latestSolicitud = currentRecord
              ? parseSingleSolicitud(currentRecord.value)
              : null;
            if (!currentRecord || !latestSolicitud) {
              throw new Error(
                'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
              );
            }

            if (expectedUpdatedAt && currentRecord.updatedAt !== expectedUpdatedAt) {
              throw new Error(
                'Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
              );
            }

            registerTeletrabajoUpdateAudit(latestSolicitud, normalizedDraft);
            const updatedSolicitud: TeletrabajoSolicitud = {
              ...latestSolicitud,
              ...normalizedDraft,
              updatedAt: new Date().toISOString(),
            };
            const saveResult = await saveTeletrabajoSolicitudToSqlite(
              updatedSolicitud,
              currentRecord.updatedAt,
            );
            if (!saveResult?.ok) {
              throw new Error(saveResult?.message ?? 'No se ha podido guardar la solicitud.');
            }

            const solicitudes = records.flatMap((record) =>
              record.id === id ? [updatedSolicitud] : parseSolicitudes(`[${record.value}]`),
            );
            set({ solicitudes, selectedSolicitudId: id });
            return { ok: true, message: 'Solicitud guardada.' };
          }
        }

        const result = await saveSharedArrayRecord<TeletrabajoSolicitud>({
          storageKey: STORAGE_KEY,
          recordId: id,
          expectedUpdatedAt,
          parseRecords: parseSolicitudes,
          getRecordId: (solicitud) => solicitud.id,
          getRecordUpdatedAt: (solicitud) => solicitud.updatedAt,
          updateRecord: (latestSolicitud) => {
            registerTeletrabajoUpdateAudit(latestSolicitud, normalizedDraft);
            return {
              ...latestSolicitud,
              ...normalizedDraft,
              updatedAt: new Date().toISOString(),
            };
          },
          missingMessage:
            'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
        });
        set({ solicitudes: result.records, selectedSolicitudId: id });
        return { ok: true, message: 'Solicitud guardada.' };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se ha podido guardar la solicitud.';
      return { ok: false, message };
    }
  },
  importEncuesta: async (file, employees, options = {}) => {
    const baseSolicitudes = await loadSolicitudesFromSqliteOrStorage();
    const result = await importEncuestaFromFile(file, employees, baseSolicitudes, options);

    if (result.diagnostics.unresolvedPuestos.length > 0) {
      return result;
    }

    if (hasTeletrabajoSqliteRepository()) {
      const records = await loadTeletrabajoRecordsFromSqlite();
      if (records !== null) {
        const expectedUpdatedAtById = new Map(
          records.map((record) => [record.id, record.updatedAt]),
        );
        const batchResult = await saveTeletrabajoSolicitudesToSqlite(
          result.solicitudes.map((solicitud) => ({
            solicitud,
            expectedUpdatedAt: expectedUpdatedAtById.get(solicitud.id) ?? null,
          })),
        );
        if (!batchResult?.ok) {
          throw new Error(
            batchResult?.message ?? 'No se ha podido importar la encuesta en SQLite.',
          );
        }
        set({
          solicitudes: result.solicitudes,
          selectedSolicitudId: firstVisibleSolicitudId(result.solicitudes),
        });
        return result;
      }
    }

    set(() => {
      persistSolicitudes(result.solicitudes);
      return {
        solicitudes: result.solicitudes,
        selectedSolicitudId: firstVisibleSolicitudId(result.solicitudes),
      };
    });
    return result;
  },
  previewImportHistorico: async (file, employees) => {
    const baseSolicitudes = await loadSolicitudesFromSqliteOrStorage();
    const result = await importHistoricoTeletrabajoFromFile(file, employees, baseSolicitudes);
    set({ pendingHistoricoImport: { ...result, baseSolicitudes } });
    return result;
  },
  cancelImportHistorico: () => {
    set({ pendingHistoricoImport: null });
  },
  confirmImportHistorico: async () => {
    return withTeletrabajoBusy('Importando histórico de Teletrabajo...', async () => {
      const pending = get().pendingHistoricoImport;
      if (!pending) {
        throw new Error('No hay ninguna importación de histórico pendiente de confirmar.');
      }

      const { baseSolicitudes, ...result } = pending;
      const changedIds = new Set<string>();
      const previousById = new Map(baseSolicitudes.map((solicitud) => [solicitud.id, solicitud]));

      result.solicitudes.forEach((solicitud) => {
        const previous = previousById.get(solicitud.id);
        if (!previous) {
          changedIds.add(solicitud.id);
          enqueueAuditEvent({
            module: 'teletrabajo',
            entityId: solicitud.id,
            action: 'created',
            summary: `Registro histórico importado para el periodo ${result.periodo}`,
            changes: [],
          });
          return;
        }

        if (previous.deletedAt || hasTeletrabajoDraftChanges(previous, solicitud)) {
          changedIds.add(solicitud.id);
          registerTeletrabajoUpdateAudit(previous, solicitud);
        }
      });

      if (hasTeletrabajoSqliteRepository()) {
        const records = await loadTeletrabajoRecordsFromSqlite();
        if (records !== null) {
          const expectedUpdatedAtById = new Map(
            records.map((record) => [record.id, record.updatedAt]),
          );
          const changedSolicitudes = result.solicitudes.filter((candidate) =>
            changedIds.has(candidate.id),
          );
          const batchResult = await saveTeletrabajoSolicitudesToSqlite(
            changedSolicitudes.map((solicitud) => ({
              solicitud,
              expectedUpdatedAt: expectedUpdatedAtById.get(solicitud.id) ?? null,
            })),
          );
          if (!batchResult?.ok) {
            throw new Error(
              batchResult?.message ?? 'No se ha podido importar el histórico en SQLite.',
            );
          }
          set({
            solicitudes: result.solicitudes,
            selectedSolicitudId: firstVisibleSolicitudId(result.solicitudes),
            filters: { ...get().filters, periodo: result.periodo },
            pendingHistoricoImport: null,
          });
          return result;
        }
      }

      set(() => {
        persistSolicitudes(result.solicitudes);
        return {
          solicitudes: result.solicitudes,
          selectedSolicitudId: firstVisibleSolicitudId(result.solicitudes),
          filters: { ...get().filters, periodo: result.periodo },
          pendingHistoricoImport: null,
        };
      });
      return result;
    });
  },
  createPeriodo: async (options) => {
    const periodo = options.periodo.trim();
    const sourcePeriodo = options.sourcePeriodo.trim();

    if (!periodo) {
      return { ok: false, message: 'Indica el nombre del nuevo periodo.', created: 0, ignored: 0 };
    }

    if (options.copyFromPrevious && !sourcePeriodo) {
      return { ok: false, message: 'Selecciona el periodo origen.', created: 0, ignored: 0 };
    }

    try {
      return await withTeletrabajoBusy('Creando nuevo periodo de Teletrabajo...', async () => {
        const baseSolicitudes = await loadSolicitudesFromSqliteOrStorage();
        const { created, ignored } = buildSolicitudesForNewPeriodo(baseSolicitudes, {
          periodo,
          sourcePeriodo,
          copyFromPrevious: options.copyFromPrevious,
        });

        if (options.copyFromPrevious && created.length === 0) {
          const message =
            ignored > 0
              ? `No se han creado solicitudes nuevas: ya existían ${ignored} empleado${ignored === 1 ? '' : 's'} en el periodo ${periodo}.`
              : `No hay solicitudes aprobadas o analizadas en el periodo ${sourcePeriodo}.`;
          return { ok: false, message, created: 0, ignored };
        }

        if (hasTeletrabajoSqliteRepository()) {
          const records = await loadTeletrabajoRecordsFromSqlite();
          if (records !== null) {
            for (const solicitud of created) {
              const saveResult = await saveTeletrabajoSolicitudToSqlite(solicitud, null);
              if (!saveResult?.ok) {
                throw new Error(
                  saveResult?.message ?? 'No se ha podido crear el periodo en SQLite.',
                );
              }
              enqueueAuditEvent({
                module: 'teletrabajo',
                entityId: solicitud.id,
                action: 'created',
                summary: `Registro creado para el periodo ${periodo}`,
                changes: [],
              });
            }

            const solicitudes = [...baseSolicitudes, ...created];
            set((state) => ({
              solicitudes,
              selectedSolicitudId: created[0]?.id ?? state.selectedSolicitudId,
              filters: { ...state.filters, periodo },
            }));
            return {
              ok: true,
              message:
                created.length > 0
                  ? `Periodo ${periodo} creado con ${created.length} solicitud${created.length === 1 ? '' : 'es'} renovada${created.length === 1 ? '' : 's'}.`
                  : `Periodo ${periodo} preparado. Crea nuevas solicitudes manuales con ese periodo.`,
              created: created.length,
              ignored,
            };
          }
        }

        const solicitudes = [...baseSolicitudes, ...created];
        persistSolicitudes(solicitudes);
        created.forEach((solicitud) => {
          enqueueAuditEvent({
            module: 'teletrabajo',
            entityId: solicitud.id,
            action: 'created',
            summary: `Registro creado para el periodo ${periodo}`,
            changes: [],
          });
        });
        set((state) => ({
          solicitudes,
          selectedSolicitudId: created[0]?.id ?? state.selectedSolicitudId,
          filters: { ...state.filters, periodo },
        }));
        return {
          ok: true,
          message:
            created.length > 0
              ? `Periodo ${periodo} creado con ${created.length} solicitud${created.length === 1 ? '' : 'es'} renovada${created.length === 1 ? '' : 's'}.`
              : `Periodo ${periodo} preparado. Crea nuevas solicitudes manuales con ese periodo.`,
          created: created.length,
          ignored,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido crear el periodo.';
      return { ok: false, message, created: 0, ignored: 0 };
    }
  },
  createPuestoTeletrabajo: async (draft) => {
    const puestosTeletrabajo = upsertPuestosTeletrabajo(get().puestosTeletrabajo, [draft]);
    const created = puestosTeletrabajo.find(
      (puesto) =>
        normalizeTeletrabajoPuesto(puesto.puesto) === normalizeTeletrabajoPuesto(draft.puesto),
    );
    set({ puestosTeletrabajo });

    if (!created) {
      return { ok: true, message: 'Puesto teletrabajable añadido.' };
    }

    const result = await persistPuestoTeletrabajoRecord(puestosTeletrabajo, created);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Puesto teletrabajable añadido.', recordId: created.id };
  },
  updatePuestoTeletrabajo: async (id, draft) => {
    const normalizedDraft = normalizeTeletrabajoPuestoDraft(draft);
    const now = new Date().toISOString();
    const puestosTeletrabajo = get()
      .puestosTeletrabajo.map((puesto) =>
        puesto.id === id ? { ...puesto, ...normalizedDraft, updatedAt: now } : puesto,
      )
      .sort((first, second) =>
        first.puesto.localeCompare(second.puesto, 'es', { numeric: true, sensitivity: 'base' }),
      );
    set({ puestosTeletrabajo });

    const updated = puestosTeletrabajo.find((puesto) => puesto.id === id);
    if (!updated) {
      return { ok: true, message: 'Puesto teletrabajable actualizado.' };
    }

    const result = await persistPuestoTeletrabajoRecord(puestosTeletrabajo, updated);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Puesto teletrabajable actualizado.', recordId: id };
  },
  removePuestoTeletrabajo: async (id) => {
    const now = new Date().toISOString();
    const puestosTeletrabajo = get().puestosTeletrabajo.map((puesto) =>
      puesto.id === id ? { ...puesto, deletedAt: now, updatedAt: now } : puesto,
    );
    set({ puestosTeletrabajo });

    const removed = puestosTeletrabajo.find((puesto) => puesto.id === id);
    if (!removed) {
      return { ok: true, message: 'Puesto teletrabajable eliminado.' };
    }

    const result = await persistPuestoTeletrabajoRecord(puestosTeletrabajo, removed);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Puesto teletrabajable eliminado.', recordId: id };
  },
  importPuestosTeletrabajo: async (file) => {
    const rows = await importTeletrabajoPuestosFromFile(file);
    set((state) => {
      const { gruposCobertura, idByNombreKey } = resolveGrupoCoberturaNombresToIds(
        rows.map((row) => row.grupoCoberturaNombre),
        state.gruposCobertura,
      );
      const draftsConGrupo = rows.map((row) => ({
        ...row.draft,
        grupoCoberturaId:
          idByNombreKey.get(normalizeGrupoCoberturaNombre(row.grupoCoberturaNombre)) ?? null,
      }));
      const puestosTeletrabajo = upsertPuestosTeletrabajo(state.puestosTeletrabajo, draftsConGrupo);
      persistPuestosTeletrabajo(puestosTeletrabajo);
      if (gruposCobertura !== state.gruposCobertura) {
        persistGruposCobertura(gruposCobertura);
      }
      return { puestosTeletrabajo, gruposCobertura };
    });
    return rows.length;
  },
  importPuestosTeletrabajoDrafts: (rows) => {
    set((state) => {
      const { gruposCobertura, idByNombreKey } = resolveGrupoCoberturaNombresToIds(
        rows.map((row) => row.grupoCoberturaNombre),
        state.gruposCobertura,
      );
      const normalizedDrafts = rows.map((row) =>
        normalizeTeletrabajoPuestoDraft({
          ...row.draft,
          grupoCoberturaId:
            idByNombreKey.get(normalizeGrupoCoberturaNombre(row.grupoCoberturaNombre)) ?? null,
        }),
      );
      const puestosTeletrabajo = upsertPuestosTeletrabajo(
        state.puestosTeletrabajo,
        normalizedDrafts,
      );
      persistPuestosTeletrabajo(puestosTeletrabajo);
      if (gruposCobertura !== state.gruposCobertura) {
        persistGruposCobertura(gruposCobertura);
      }
      return { puestosTeletrabajo, gruposCobertura };
    });
    return rows.filter((row) => row.draft.puesto.trim()).length;
  },
  createGrupoCobertura: async (draft) => {
    const id = createGrupoCoberturaId();
    const now = new Date().toISOString();
    const normalizedDraft = normalizeGrupoCoberturaDraft(draft);
    const nuevoGrupo: GrupoCobertura = {
      id,
      ...normalizedDraft,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const gruposCobertura = [...get().gruposCobertura, nuevoGrupo].sort((first, second) =>
      first.nombre.localeCompare(second.nombre, 'es', { numeric: true, sensitivity: 'base' }),
    );
    set({ gruposCobertura });

    const result = await persistGrupoCoberturaRecord(gruposCobertura, nuevoGrupo);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Grupo de cobertura creado.', recordId: id };
  },
  updateGrupoCobertura: async (id, draft) => {
    const normalizedDraft = normalizeGrupoCoberturaDraft(draft);
    const now = new Date().toISOString();
    const gruposCobertura = get()
      .gruposCobertura.map((grupo) =>
        grupo.id === id ? { ...grupo, ...normalizedDraft, updatedAt: now } : grupo,
      )
      .sort((first, second) =>
        first.nombre.localeCompare(second.nombre, 'es', { numeric: true, sensitivity: 'base' }),
      );
    set({ gruposCobertura });

    const updated = gruposCobertura.find((grupo) => grupo.id === id);
    if (!updated) {
      return { ok: true, message: 'Grupo de cobertura actualizado.' };
    }

    const result = await persistGrupoCoberturaRecord(gruposCobertura, updated);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Grupo de cobertura actualizado.', recordId: id };
  },
  removeGrupoCobertura: async (id) => {
    const now = new Date().toISOString();
    const state = get();
    const gruposCobertura = state.gruposCobertura.map((grupo) =>
      grupo.id === id ? { ...grupo, deletedAt: now, updatedAt: now } : grupo,
    );
    // Los puestos que estaban en el grupo eliminado quedan sin grupo (cobertura individual),
    // en vez de quedar enlazados a un grupo borrado de forma invisible.
    const puestosTeletrabajo = state.puestosTeletrabajo.map((puesto) =>
      puesto.grupoCoberturaId === id
        ? { ...puesto, grupoCoberturaId: null, updatedAt: now }
        : puesto,
    );
    set({ gruposCobertura, puestosTeletrabajo });

    const removedGrupo = gruposCobertura.find((grupo) => grupo.id === id);
    const grupoResult = removedGrupo
      ? await persistGrupoCoberturaRecord(gruposCobertura, removedGrupo)
      : { ok: true, message: '' };
    if (!grupoResult.ok) {
      return { ok: false, message: grupoResult.message };
    }

    // Los puestos que quedaron desenlazados también deben persistirse, uno a
    // uno, para no arrastrar el patrón de "guardar toda la lista".
    const puestosDesenlazados = puestosTeletrabajo.filter(
      (puesto, index) =>
        puesto !== state.puestosTeletrabajo[index] && puesto.grupoCoberturaId === null,
    );
    for (const puesto of puestosDesenlazados) {
      const puestoResult = await persistPuestoTeletrabajoRecord(puestosTeletrabajo, puesto);
      if (!puestoResult.ok) {
        return {
          ok: false,
          message: `Grupo eliminado, pero no se ha podido actualizar el puesto «${puesto.puesto}»: ${puestoResult.message}`,
        };
      }
    }

    return { ok: true, message: 'Grupo de cobertura eliminado.', recordId: id };
  },
  setPuestoGrupoCobertura: async (puestoId, grupoCoberturaId) => {
    const now = new Date().toISOString();
    const puestosTeletrabajo = get().puestosTeletrabajo.map((puesto) =>
      puesto.id === puestoId ? { ...puesto, grupoCoberturaId, updatedAt: now } : puesto,
    );
    set({ puestosTeletrabajo });

    const updated = puestosTeletrabajo.find((puesto) => puesto.id === puestoId);
    if (!updated) {
      return { ok: true, message: 'Puesto actualizado.' };
    }

    const result = await persistPuestoTeletrabajoRecord(puestosTeletrabajo, updated);
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    return { ok: true, message: 'Puesto actualizado.', recordId: puestoId };
  },
  removeWithConcurrencyCheck: async (id, expectedUpdatedAt) => {
    try {
      return await withTeletrabajoBusy('Eliminando solicitud de Teletrabajo...', async () => {
        if (hasTeletrabajoSqliteRepository()) {
          const records = await loadTeletrabajoRecordsFromSqlite();
          if (records !== null) {
            const currentRecord = records.find((record) => record.id === id);
            const latestSolicitud = currentRecord
              ? parseSingleSolicitud(currentRecord.value)
              : null;
            if (!currentRecord || !latestSolicitud) {
              throw new Error(
                'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
              );
            }

            if (expectedUpdatedAt && currentRecord.updatedAt !== expectedUpdatedAt) {
              throw new Error(
                'Esta solicitud ha sido modificada por otro usuario. Recarga antes de eliminarla.',
              );
            }

            const saveResult = await deleteTeletrabajoSolicitudInSqlite(
              latestSolicitud,
              currentRecord.updatedAt,
            );
            if (!saveResult?.ok) {
              throw new Error(saveResult?.message ?? 'No se ha podido eliminar la solicitud.');
            }

            enqueueAuditEvent({
              module: 'teletrabajo',
              entityId: latestSolicitud.id,
              action: 'deleted',
              summary: 'Registro eliminado',
              changes: [],
            });

            const solicitudes = records
              .filter((record) => record.id !== id)
              .flatMap((record) => parseSolicitudes(`[${record.value}]`));
            set({
              solicitudes,
              selectedSolicitudId: firstVisibleSolicitudId(solicitudes),
            });
            return { ok: true, message: 'Solicitud eliminada.' };
          }
        }

        const deletedAt = new Date().toISOString();
        const result = await saveSharedArrayRecord<TeletrabajoSolicitud>({
          storageKey: STORAGE_KEY,
          recordId: id,
          expectedUpdatedAt,
          parseRecords: parseSolicitudes,
          getRecordId: (solicitud) => solicitud.id,
          getRecordUpdatedAt: (solicitud) => solicitud.updatedAt,
          updateRecord: (latestSolicitud) => {
            enqueueAuditEvent({
              module: 'teletrabajo',
              entityId: latestSolicitud.id,
              action: 'deleted',
              summary: 'Registro eliminado',
              changes: [],
            });
            return { ...latestSolicitud, deletedAt, updatedAt: deletedAt };
          },
          missingMessage:
            'La solicitud ya no existe en la base compartida. Recarga antes de continuar.',
          conflictMessage:
            'Esta solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
        });
        set({
          solicitudes: result.records,
          selectedSolicitudId: firstVisibleSolicitudId(result.records),
        });
        return { ok: true, message: 'Solicitud eliminada.' };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se ha podido eliminar la solicitud.';
      return { ok: false, message };
    }
  },
  selectSolicitud: (solicitudId) => set({ selectedSolicitudId: solicitudId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));
