import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfiguracionStore } from './useConfiguracionStore';

const timestamp = '2026-06-17T08:00:00.000Z';

function activeStatus() {
  return { ready: true, phase: 'active' as const, message: 'SQLite activo' };
}

describe('useConfiguracionStore concurrencia multiusuario', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useConfiguracionStore.setState({
      rutaPlantillaTeletrabajo: '',
      rutaPlantillaLicenciaSinSueldo: '',
      taskPhases: [],
      taskOrigins: [],
    });
  });

  it('no aplica el cambio local cuando otro usuario ha modificado la configuración entre tanto (expectedUpdatedAt obsoleto)', async () => {
    const loader = vi.fn(async () => ({
      status: activeStatus(),
      value: JSON.stringify({
        rutaPlantillaTeletrabajo: '\\\\servidor\\plantillas\\teletrabajo.docx',
        rutaPlantillaLicenciaSinSueldo: '',
        taskPhases: [],
        taskOrigins: [],
      }),
      updatedAt: timestamp,
    }));
    // El saver simula que otro usuario ha guardado configuración justo
    // antes: el expectedUpdatedAt que envía este cliente ya no coincide con
    // el valor vigente, así que el guardado debe rechazarse.
    const saver = vi.fn(async () => ({
      ok: false,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:05:00.000Z',
      message: 'La configuración ha cambiado mientras guardabas. Recarga antes de continuar.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadConfiguracion: loader, saveConfiguracionIfUnchanged: saver },
    });

    useConfiguracionStore.getState().load();
    await vi.waitFor(() =>
      expect(useConfiguracionStore.getState().rutaPlantillaTeletrabajo).toBe(
        '\\\\servidor\\plantillas\\teletrabajo.docx',
      ),
    );

    useConfiguracionStore.getState().setRutaPlantillaTeletrabajo('\\\\servidor\\plantillas\\nueva.docx');
    await vi.waitFor(() => expect(saver).toHaveBeenCalledTimes(1));

    // Como el saver ha rechazado el guardado, el estado local no debe haber
    // cambiado: seguimos viendo la ruta que ya teníamos, no la nueva.
    expect(useConfiguracionStore.getState().rutaPlantillaTeletrabajo).toBe(
      '\\\\servidor\\plantillas\\teletrabajo.docx',
    );
  });

  it('aplica el cambio local cuando expectedUpdatedAt coincide con el valor vigente', async () => {
    const saver = vi.fn(async () => ({
      ok: true,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:10:00.000Z',
      message: 'Configuración guardada.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveConfiguracionIfUnchanged: saver },
    });

    useConfiguracionStore.getState().setRutaPlantillaTeletrabajo('\\\\servidor\\plantillas\\nueva.docx');

    await vi.waitFor(() =>
      expect(useConfiguracionStore.getState().rutaPlantillaTeletrabajo).toBe(
        '\\\\servidor\\plantillas\\nueva.docx',
      ),
    );
    expect(saver).toHaveBeenCalledTimes(1);
  });

  it('reloadFromStorage no sustituye el estado si el contenido normalizado no ha cambiado', async () => {
    const configValue = JSON.stringify({
      rutaPlantillaTeletrabajo: '\\\\servidor\\plantillas\\teletrabajo.docx',
      rutaPlantillaLicenciaSinSueldo: '',
      taskPhases: [],
      taskOrigins: [],
    });
    const loader = vi.fn(async () => ({
      status: activeStatus(),
      value: configValue,
      updatedAt: timestamp,
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadConfiguracion: loader, saveConfiguracionIfUnchanged: vi.fn() },
    });

    useConfiguracionStore.getState().load();
    await vi.waitFor(() =>
      expect(useConfiguracionStore.getState().rutaPlantillaTeletrabajo).toBe(
        '\\\\servidor\\plantillas\\teletrabajo.docx',
      ),
    );

    const taskPhasesBeforeReload = useConfiguracionStore.getState().taskPhases;

    // El polling detecta un cambio de updatedAt (por ejemplo, generado por
    // nuestra propia escritura en otra pestaña), pero el contenido
    // normalizado que devuelve SQLite es idéntico al que ya tenemos.
    useConfiguracionStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    // La referencia del array de fases debe mantenerse intacta: no debe
    // haberse llamado a set() si el contenido no cambió realmente.
    expect(useConfiguracionStore.getState().taskPhases).toBe(taskPhasesBeforeReload);
  });

  it('reloadFromStorage sí actualiza el estado cuando otro usuario cambia la configuración', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce({
        status: activeStatus(),
        value: JSON.stringify({
          rutaPlantillaTeletrabajo: '\\\\servidor\\plantillas\\teletrabajo.docx',
          rutaPlantillaLicenciaSinSueldo: '',
          taskPhases: [],
          taskOrigins: [],
        }),
        updatedAt: timestamp,
      })
      .mockResolvedValueOnce({
        status: activeStatus(),
        value: JSON.stringify({
          rutaPlantillaTeletrabajo: '\\\\servidor\\plantillas\\modificada-por-otro.docx',
          rutaPlantillaLicenciaSinSueldo: '',
          taskPhases: [],
          taskOrigins: [],
        }),
        updatedAt: '2026-06-17T09:00:00.000Z',
      });

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadConfiguracion: loader, saveConfiguracionIfUnchanged: vi.fn() },
    });

    useConfiguracionStore.getState().load();
    await vi.waitFor(() =>
      expect(useConfiguracionStore.getState().rutaPlantillaTeletrabajo).toBe(
        '\\\\servidor\\plantillas\\teletrabajo.docx',
      ),
    );

    useConfiguracionStore.getState().reloadFromStorage();
    await vi.waitFor(() =>
      expect(useConfiguracionStore.getState().rutaPlantillaTeletrabajo).toBe(
        '\\\\servidor\\plantillas\\modificada-por-otro.docx',
      ),
    );
  });
});
