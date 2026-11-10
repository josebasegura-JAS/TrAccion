import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTeletrabajoClosureId, parseTeletrabajoClosure } from '../domain/cierreOrdinario';
import type { TeletrabajoSolicitud } from '../domain/solicitud';
import { registerTeletrabajoOrdinaryClosure, loadTeletrabajoOrdinaryClosure } from './teletrabajoClosureRepository';

const records = new Map<string, { id: string; value: string; createdAt: string; updatedAt: string; deletedAt: null }>();
vi.mock('./teletrabajoSqliteRepository', () => ({
  loadTeletrabajoRecordsFromSqlite: vi.fn(async () => Array.from(records.values())),
}));

const source = {
  id: 'ord-1', empleado: '100', nombreApellidos: 'Persona',
  estado: 'pendiente', tipoSolicitud: 'nueva',
  periodo: '2026-2027', fechaSolicitud: '2026-07-20',
} as TeletrabajoSolicitud;
afterEach(() => {
  records.clear();
  delete (window as { traccion?: unknown }).traccion;
  vi.useRealTimers();
});

describe('Registro compartido de fotografía ordinaria', () => {
  it('se crea una sola vez mediante OCC; un segundo equipo no puede sobrescribirla', async () => {
    const now = new Date('2026-11-10T08:00:00.000Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    records.set(source.id, {
      id: source.id, value: JSON.stringify(source),
      createdAt: now.toISOString(), updatedAt: now.toISOString(), deletedAt: null,
    });
    const save = vi.fn(async ({ id, value, expectedUpdatedAt }: { id: string; value: string; expectedUpdatedAt: string | null }) => {
      if (records.has(id) || expectedUpdatedAt !== null) {
        return { ok: false, currentUpdatedAt: now.toISOString(), message: 'Conflicto' };
      }
      records.set(id, { id, value, createdAt: now.toISOString(), updatedAt: now.toISOString(), deletedAt: null });
      return { ok: true, currentUpdatedAt: now.toISOString(), message: 'Guardado' };
    });
    (window as { traccion?: unknown }).traccion = { saveTeletrabajoRecordIfUnchanged: save };

    const first = await registerTeletrabajoOrdinaryClosure('2026-2027');
    expect(first.entries).toEqual([{ id: 'ord-1', estado: 'pendiente', fechaSolicitud: '2026-07-20' }]);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      id: getTeletrabajoClosureId('2026-2027'), expectedUpdatedAt: null,
    }));
    await expect(registerTeletrabajoOrdinaryClosure('2026-2027')).rejects.toThrow('ya está registrado');
    expect(await loadTeletrabajoOrdinaryClosure('2026-2027')).toEqual(first);
    expect(parseTeletrabajoClosure(records.get(getTeletrabajoClosureId('2026-2027'))?.value ?? '')).not.toBeNull();

    // Una aprobación posterior no debe reescribir el snapshot conservado.
    records.set(source.id, { ...records.get(source.id)!, value: JSON.stringify({ ...source, estado: 'aprobada' }) });
    expect((await loadTeletrabajoOrdinaryClosure('2026-2027'))?.entries[0].estado).toBe('pendiente');
  });
});
