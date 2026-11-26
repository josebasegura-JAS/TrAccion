import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAutomaticExcelEnabled } from './excelGenerationPolicy';
import { syncCoordinacionExcelBackup } from './coordinacionExcelBackup';
import { syncLicenciasExcelBackup, syncVinculogramaExcelBackup } from './operationalExcelBackups';
import { syncActividadesExternasExcelBackup } from '../../features/actividades-externas/services/actividadesExternasExcelBackup';
import { syncCriteriosRrllExcelBackup } from '../../features/criterios-rrll/services/criteriosRrllExcelBackup';

const original = window.traccion;
afterEach(() => Object.defineProperty(window, 'traccion', { configurable: true, value: original }));
describe('Excel automático de pruebas', () => {
  it('omite los generadores antes de leer configuración o publicar', async () => {
    const save = vi.fn();
    Object.defineProperty(window, 'traccion', { configurable: true, value: { getAppEnvironment: async () => 'test', saveOperationalExcelBackup: save } });
    expect(await isAutomaticExcelEnabled()).toBe(false);
    expect(await Promise.all([syncCoordinacionExcelBackup([]), syncLicenciasExcelBackup([]), syncVinculogramaExcelBackup([]), syncActividadesExternasExcelBackup([]), syncCriteriosRrllExcelBackup([])])).toEqual([null,null,null,null,null]);
    expect(save).not.toHaveBeenCalled();
  });
  it('conserva producción y bloquea si el entorno no se puede verificar', async () => {
    Object.defineProperty(window, 'traccion', { configurable: true, value: { getAppEnvironment: async () => 'production' } });
    expect(await isAutomaticExcelEnabled()).toBe(true);
    Object.defineProperty(window, 'traccion', { configurable: true, value: { getAppEnvironment: async () => { throw new Error('IPC'); } } });
    expect(await isAutomaticExcelEnabled()).toBe(false);
  });
});
