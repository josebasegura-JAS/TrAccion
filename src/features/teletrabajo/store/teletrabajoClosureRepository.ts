import { saveSharedRecord } from '../../../services/strictSqliteWrites';
import { loadTeletrabajoRecordsFromSqlite } from './teletrabajoSqliteRepository';
import {
  buildTeletrabajoOrdinaryClosure,
  getTeletrabajoClosureId,
  parseTeletrabajoClosure,
  type TeletrabajoOrdinaryClosure,
} from '../domain/cierreOrdinario';
import type { TeletrabajoSolicitud } from '../domain/solicitud';
import { parseSingleSolicitud } from './teletrabajoSolicitudes.helpers';

/**
 * Metadato de cierre en un registro SQLite con id reservado y OCC insert-only.
 * Los lectores de solicitudes ignoran este JSON (no es una solicitud válida).
 * La escritura comparte el mismo camino de bloqueo que el resto del módulo.
 */
export async function loadTeletrabajoOrdinaryClosure(periodo: string): Promise<TeletrabajoOrdinaryClosure | null> {
  const records = await loadTeletrabajoRecordsFromSqlite();
  if (!records) throw new Error('SQLite compartido no disponible.');
  const record = records.find((entry) => entry.id === getTeletrabajoClosureId(periodo));
  if (!record) return null;
  const parsed = parseTeletrabajoClosure(record.value);
  if (!parsed || parsed.periodo !== periodo) {
    throw new Error('La fotografía de cierre almacenada no es válida. No se modificará.');
  }
  return parsed;
}

export async function registerTeletrabajoOrdinaryClosure(periodo: string): Promise<TeletrabajoOrdinaryClosure> {
  const records = await loadTeletrabajoRecordsFromSqlite();
  if (!records) throw new Error('SQLite compartido no disponible.');
  if (records.some((entry) => entry.id === getTeletrabajoClosureId(periodo))) {
    throw new Error('El cierre ordinario ya está registrado por otro usuario. Actualiza la vista.');
  }
  const solicitudes: TeletrabajoSolicitud[] = records.flatMap((entry) => {
    const value = parseSingleSolicitud(entry.value);
    return value ? [value] : [];
  });
  const snapshot = buildTeletrabajoOrdinaryClosure(periodo, solicitudes, new Date());
  const saver = window.traccion?.saveTeletrabajoRecordIfUnchanged;
  if (!saver) throw new Error('SQLite compartido no disponible.');
  const now = snapshot.capturedAt;
  const value = JSON.stringify({ ...snapshot, createdAt: now, updatedAt: now, deletedAt: null });
  const response = await saveSharedRecord(async () => {
    const result = await saver({ id: getTeletrabajoClosureId(periodo), value, expectedUpdatedAt: null });
    return { ok: result.ok, message: result.message, currentUpdatedAt: result.currentUpdatedAt };
  });
  if (!response.ok) throw new Error('El cierre ha sido registrado por otro usuario o no se ha podido guardar. Actualiza la vista.');
  return snapshot;
}
