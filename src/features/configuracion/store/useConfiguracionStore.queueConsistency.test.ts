import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfiguracionStore } from './useConfiguracionStore';

describe('Configuración: cambios de rutas encolados sin perder campos independientes', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useConfiguracionStore.setState({ rutaExportacionLoteria: '', rutaExportacionTicketRestaurante: '' });
  });

  it('conserva dos rutas diferentes aunque se guarden sin esperar entre sí', async () => {
    const saved: string[] = [];
    Object.defineProperty(window, 'traccion', { configurable: true, value: {
      saveConfiguracionIfUnchanged: vi.fn(async ({ value }: { value: string }) => {
        saved.push(value);
        return { ok: true, currentUpdatedAt: String(saved.length), status: { ready: true, phase: 'active' }, message: 'Guardado' };
      }),
    } });
    const store = useConfiguracionStore.getState();
    const [first, second] = await Promise.all([
      store.setRutaExportacionLoteria('C:\\Loteria'),
      store.setRutaExportacionTicketRestaurante('C:\\Tickets'),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(useConfiguracionStore.getState().rutaExportacionLoteria).toBe('C:\\Loteria');
    expect(useConfiguracionStore.getState().rutaExportacionTicketRestaurante).toBe('C:\\Tickets');
    expect(JSON.parse(saved.at(-1) ?? '{}')).toMatchObject({
      rutaExportacionLoteria: 'C:\\Loteria',
      rutaExportacionTicketRestaurante: 'C:\\Tickets',
    });
  });
});
