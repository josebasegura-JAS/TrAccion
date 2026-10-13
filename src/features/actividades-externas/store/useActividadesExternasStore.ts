import { create } from 'zustand';
import { readStorageItem } from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import { parseActividadesExternas, type ActividadExterna, type ActividadExternaDraft, type ActividadExternaEstado, type ActividadExternaComunicacion } from '../domain/actividadExterna';

const KEY = 'traccion.v1.actividadesExternas.records';
type Result = { ok: boolean; message: string };
interface State {
  records: ActividadExterna[];
  load: () => void;
  create: (draft: ActividadExternaDraft) => Promise<Result>;
  resolve: (id: string, estado: Exclude<ActividadExternaEstado, 'pendiente'>, motivo: string) => Promise<Result>;
  setComunicacion: (id: string, comunicacion: ActividadExternaComunicacion) => Promise<Result>;
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const now = () => new Date().toISOString();
const read = () => parseActividadesExternas(readStorageItem(KEY));

export const useActividadesExternasStore = create<State>((set, get) => ({
  records: [],
  load: () => set({ records: read() }),
  create: async (draft) => {
    if (!draft.empleado || !draft.nombre || !draft.actividad.trim()) return { ok: false, message: 'Selecciona una persona y describe la actividad.' };
    const createdAt = now();
    const record: ActividadExterna = {
      ...draft, actividad: draft.actividad.trim(), id: crypto.randomUUID(),
      estado: 'pendiente', motivoDenegacion: '', fechaResolucion: null,
      comunicacion: 'pendiente', fechaComunicacion: null, createdAt, updatedAt: createdAt,
    };
    try {
      const result = await saveNewSharedArrayRecord({
        storageKey: KEY, newRecord: record, parseRecords: parseActividadesExternas, getRecordId: (item: ActividadExterna) => item.id,
      });
      set({ records: result.records });
      return { ok: true, message: 'Solicitud registrada.' };
    } catch (error) { return { ok: false, message: message(error) }; }
  },
  resolve: async (id, estado, motivo) => {
    const record = get().records.find((item) => item.id === id);
    if (!record || record.estado !== 'pendiente') return { ok: false, message: 'La solicitud ya no está pendiente. Recarga los datos.' };
    if (estado === 'denegada' && !motivo.trim()) return { ok: false, message: 'Indica el motivo de la denegación.' };
    try {
      const result = await saveSharedArrayRecord<ActividadExterna>({
        storageKey: KEY, recordId: id, expectedUpdatedAt: record.updatedAt,
        parseRecords: parseActividadesExternas, getRecordId: (item) => item.id,
        getRecordUpdatedAt: (item) => item.updatedAt,
        updateRecord: (latest) => {
          if (latest.estado !== 'pendiente') throw new Error('La solicitud ya ha sido resuelta por otro usuario.');
          const stamp = now();
          return { ...latest, estado, motivoDenegacion: estado === 'denegada' ? motivo.trim() : '',
            fechaResolucion: stamp, comunicacion: 'pendiente', updatedAt: stamp };
        },
        missingMessage: 'Solicitud no encontrada.', conflictMessage: 'Otro usuario ha modificado la solicitud. Recarga antes de continuar.',
      });
      set({ records: result.records });
      return { ok: true, message: estado === 'autorizada' ? 'Solicitud autorizada.' : 'Solicitud denegada.' };
    } catch (error) { return { ok: false, message: message(error) }; }
  },
  setComunicacion: async (id, comunicacion) => {
    const record = get().records.find((item) => item.id === id);
    if (!record || record.estado === 'pendiente') return { ok: false, message: 'Resuelve la solicitud antes de comunicarla.' };
    try {
      const result = await saveSharedArrayRecord<ActividadExterna>({
        storageKey: KEY, recordId: id, expectedUpdatedAt: record.updatedAt,
        parseRecords: parseActividadesExternas, getRecordId: (item) => item.id,
        getRecordUpdatedAt: (item) => item.updatedAt,
        updateRecord: (latest) => {
          if (latest.estado === 'pendiente') throw new Error('La solicitud no está resuelta.');
          const stamp = now();
          return { ...latest, comunicacion, fechaComunicacion: comunicacion === 'confirmada' ? stamp : latest.fechaComunicacion, updatedAt: stamp };
        },
        missingMessage: 'Solicitud no encontrada.', conflictMessage: 'La solicitud ha cambiado. Recarga antes de continuar.',
      });
      set({ records: result.records });
      return { ok: true, message: comunicacion === 'confirmada' ? 'Envío confirmado manualmente.' : 'Estado de comunicación actualizado.' };
    } catch (error) { return { ok: false, message: message(error) }; }
  },
}));
