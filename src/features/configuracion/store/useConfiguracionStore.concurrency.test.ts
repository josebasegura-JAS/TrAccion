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
      taskStates: [],
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
        taskStates: [],
        taskOrigins: [],
      }),
      updatedAt: timestamp,
    }));
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

    expect(useConfiguracionStore.getState().rutaPlantillaTeletrabajo).toBe(
      '\\\\servidor\\plantillas\\teletrabajo.docx',
    );
  });

  it('descarta cambios optimistas ya encolados si una escritura anterior entra en conflicto', async () => {
    let resolveFirstSave: ((value: {
      ok: boolean;
      status: ReturnType<typeof activeStatus>;
      currentUpdatedAt: string;
      message: string;
    }) => void) | null = null;

    const firstSave = new Promise<{
      ok: boolean;
      status: ReturnType<typeof activeStatus>;
      currentUpdatedAt: string;
      message: string;
    }>((resolve) => {
      resolveFirstSave = resolve;
    });

    const remoteOrigin = {
      id: 'remoto',
      nombre: 'Cambio remoto',
      tipo: 'otro' as const,
      active: true,
      createdAt: timestamp,
      updatedAt: '2026-06-17T08:05:00.000Z',
    };

    const loader = vi
      .fn()
      .mockResolvedValueOnce({
        status: activeStatus(),
        value: JSON.stringify({
          rutaPlantillaTeletrabajo: '',
          taskPhases: [],
          taskStates: [],
          taskOrigins: [],
        }),
        updatedAt: timestamp,
      })
      .mockResolvedValueOnce({
        status: activeStatus(),
        value: JSON.stringify({
          rutaPlantillaTeletrabajo: '',
          taskPhases: [],
          taskStates: [],
          taskOrigins: [remoteOrigin],
        }),
        updatedAt: '2026-06-17T08:05:00.000Z',
      });
    const saver = vi.fn(() => firstSave);

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadConfiguracion: loader, saveConfiguracionIfUnchanged: saver },
    });

    useConfiguracionStore.getState().load();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));

    useConfiguracionStore.getState().addTaskOrigin('Primero local', 'otro');
    useConfiguracionStore.getState().addTaskOrigin('Segundo local', 'otro');
    await vi.waitFor(() => expect(saver).toHaveBeenCalledTimes(1));

    resolveFirstSave?.({
      ok: false,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:05:00.000Z',
      message: 'Conflicto de concurrencia.',
    });

    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(useConfiguracionStore.getState().taskOrigins.some((origin) => origin.id === 'remoto')).toBe(true),
    );

    expect(saver).toHaveBeenCalledTimes(1);
    expect(
      useConfiguracionStore.getState().taskOrigins.some((origin) =>
        origin.nombre === 'Primero local' || origin.nombre === 'Segundo local'),
    ).toBe(false);
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
      taskStates: [],
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

    useConfiguracionStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

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
          taskStates: [],
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
          taskStates: [],
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
