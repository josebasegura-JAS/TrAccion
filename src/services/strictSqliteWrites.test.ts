import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSharedRecord } from './strictSqliteWrites';

describe('strictSqliteWrites', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('devuelve el resultado de SQLite cuando el guardado tiene éxito', async () => {
    const save = vi.fn(async () => ({ ok: true, message: 'Guardado.', currentUpdatedAt: 't1' }));
    await expect(saveSharedRecord(save)).resolves.toEqual({ ok: true, message: 'Guardado.', currentUpdatedAt: 't1' });
  });

  it('rechaza el cambio cuando SQLite no está disponible', async () => {
    const result = await saveSharedRecord(async () => null);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Repositorio SQLite no disponible');
  });

  it('no convierte un fallo SQLite en guardado local', async () => {
    const result = await saveSharedRecord(async () => ({
      ok: false,
      message: 'SQLite no está activo. No se permite guardar sin base compartida.',
      currentUpdatedAt: null,
    }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('NO se ha guardado localmente');
  });

  it('rechaza el cambio cuando la llamada a SQLite lanza una excepción', async () => {
    const result = await saveSharedRecord(async () => {
      throw new Error('No se ha podido contactar con el proceso principal.');
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('NO se ha guardado localmente');
  });

  it('propaga intacto un conflicto OCC', async () => {
    const conflict = {
      ok: false,
      message: 'El registro ha sido modificado por otro usuario.',
      currentUpdatedAt: 'other-token',
    };
    await expect(saveSharedRecord(async () => conflict)).resolves.toEqual(conflict);
  });
});
