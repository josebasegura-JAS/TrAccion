import { create } from 'zustand';
import { syncActividadesExternasExcelBackup } from '../services/actividadesExternasExcelBackup';
import { readStorageItem } from '../../../services/persistence';
import { deleteSharedArrayRecord, saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import { parseActividadesExternas, type ActividadExterna, type ActividadExternaDraft, type ActividadExternaComunicacion } from '../domain/actividadExterna';

const KEY = 'traccion.v1.actividadesExternas.records';
type Result = { ok: boolean; message: string };
interface State {
  records: ActividadExterna[];
  load: () => void;
  create: (draft: ActividadExternaDraft) => Promise<Result>;
  update: (id: string, draft: ActividadExternaDraft) => Promise<Result>;
  remove: (id: string) => Promise<Result>;
  resolve: (id: string, estado: 'propuesta' | 'rechazada_rrll' | 'autorizada' | 'denegada', motivo: string) => Promise<Result>;
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
      estado: 'pendiente', motivoDenegacion: '', observacionesResolucion: '', fechaResolucion: null, fechaRevisionRrll: null, observacionesRrll: '',
      comunicacion: 'pendiente', fechaComunicacion: null, createdAt, updatedAt: createdAt,
    };
    try {
      const result = await saveNewSharedArrayRecord({
        storageKey: KEY, newRecord: record, parseRecords: parseActividadesExternas, getRecordId: (item: ActividadExterna) => item.id,
      });
      set({ records: result.records });
      const excelWarning = await syncActividadesExternasExcelBackup(result.records);
      return { ok: true, message: excelWarning ? `Solicitud registrada. ${excelWarning}` : 'Solicitud registrada.' };
    } catch (error) { return { ok: false, message: message(error) }; }
  },
  update: async (id, draft) => {
    const record = get().records.find((item) => item.id === id);
    if (!record) return { ok: false, message: 'Solicitud no encontrada. Recarga los datos.' };
    if (!draft.empleado.trim() || !draft.nombre.trim() || !draft.actividad.trim() || !draft.fechaSolicitud) {
      return { ok: false, message: 'Completa la persona, la actividad y la fecha de solicitud.' };
    }
    try {
      const result = await saveSharedArrayRecord<ActividadExterna>({
        storageKey: KEY, recordId: id, expectedUpdatedAt: record.updatedAt,
        parseRecords: parseActividadesExternas, getRecordId: (item) => item.id,
        getRecordUpdatedAt: (item) => item.updatedAt,
        updateRecord: (latest) => ({
          ...latest, ...draft, actividad: draft.actividad.trim(), updatedAt: now(),
        }),
        missingMessage: 'La solicitud ya no existe.',
        conflictMessage: 'Otro usuario ha modificado esta solicitud. Recarga antes de editar.',
      });
      set({ records: result.records });
      const excelWarning = await syncActividadesExternasExcelBackup(result.records);
      return { ok: true, message: `Solicitud actualizada.${excelWarning ? ` ${excelWarning}` : ''}` };
    } catch (error) { return { ok: false, message: message(error) }; }
  },
  remove: async (id) => {
    const record = get().records.find((item) => item.id === id);
    if (!record) return { ok: false, message: 'Solicitud no encontrada. Recarga los datos.' };
    try {
      const result = await deleteSharedArrayRecord<ActividadExterna>({
        storageKey: KEY, recordId: id, expectedUpdatedAt: record.updatedAt,
        parseRecords: parseActividadesExternas, getRecordId: (item) => item.id,
        getRecordUpdatedAt: (item) => item.updatedAt,
        conflictMessage: 'Otro usuario ha modificado esta solicitud. Recarga antes de eliminar.',
      });
      set({ records: result.records });
      const excelWarning = await syncActividadesExternasExcelBackup(result.records);
      return { ok: true, message: `Solicitud eliminada.${excelWarning ? ` ${excelWarning}` : ''}` };
    } catch (error) { return { ok: false, message: message(error) }; }
  },
  resolve: async (id, estado, motivo) => {
    const record = get().records.find((item) => item.id === id);
    if (!record || !((record.estado === 'pendiente' && (estado === 'propuesta' || estado === 'rechazada_rrll')) || (record.estado === 'propuesta' && (estado === 'autorizada' || estado === 'denegada')))) return { ok: false, message: 'Transición de estado no permitida. Recarga los datos.' };
    if ((estado === 'denegada' || estado === 'rechazada_rrll') && !motivo.trim()) return { ok: false, message: 'Indica el motivo de la denegación.' };
    try {
      const result = await saveSharedArrayRecord<ActividadExterna>({
        storageKey: KEY, recordId: id, expectedUpdatedAt: record.updatedAt,
        parseRecords: parseActividadesExternas, getRecordId: (item) => item.id,
        getRecordUpdatedAt: (item) => item.updatedAt,
        updateRecord: (latest) => {
          if (!((latest.estado === 'pendiente' && (estado === 'propuesta' || estado === 'rechazada_rrll')) || (latest.estado === 'propuesta' && (estado === 'autorizada' || estado === 'denegada')))) throw new Error('La solicitud ha cambiado de fase.');
          const stamp = now();
          return { ...latest, estado, ...(estado === 'propuesta' || estado === 'rechazada_rrll' ? { fechaRevisionRrll: stamp, observacionesRrll: motivo.trim() } : { observacionesResolucion: motivo.trim(), fechaResolucion: stamp }),
            motivoDenegacion: estado === 'denegada' || estado === 'rechazada_rrll' ? motivo.trim() : '', comunicacion: 'pendiente', updatedAt: stamp };
        },
        missingMessage: 'Solicitud no encontrada.', conflictMessage: 'Otro usuario ha modificado la solicitud. Recarga antes de continuar.',
      });
      set({ records: result.records });
      const excelWarning = await syncActividadesExternasExcelBackup(result.records);
      return { ok: true, message: `${estado === 'propuesta' ? 'Elevada al Comité de Dirección.' : estado === 'rechazada_rrll' ? 'Rechazada por RRLL.' : estado === 'autorizada' ? 'Autorizada por el Comité.' : 'Denegada por el Comité.'}${excelWarning ? ` ${excelWarning}` : ''}` };
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
          if (latest.estado === 'pendiente' || latest.estado === 'propuesta') throw new Error('La solicitud no está resuelta.');
          const stamp = now();
          return { ...latest, comunicacion, fechaComunicacion: comunicacion === 'confirmada' ? stamp : latest.fechaComunicacion, updatedAt: stamp };
        },
        missingMessage: 'Solicitud no encontrada.', conflictMessage: 'La solicitud ha cambiado. Recarga antes de continuar.',
      });
      set({ records: result.records });
      const excelWarning = await syncActividadesExternasExcelBackup(result.records);
      return { ok: true, message: `${comunicacion === 'confirmada' ? 'Envío confirmado manualmente.' : 'Estado de comunicación actualizado.'}${excelWarning ? ` ${excelWarning}` : ''}` };
    } catch (error) { return { ok: false, message: message(error) }; }
  },
}));
