import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXCEL_BACKUP_FAILURE_EVENT,
  clearPersistedExcelBackupFailure,
  loadPersistedExcelBackupFailures,
  persistExcelBackupFailure,
  saveExcelBackupWithRetry,
  upsertExcelBackupFailure,
  type ExcelBackupFailure,
} from './saveExcelBackupWithRetry';

describe('saveExcelBackupWithRetry', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
  });

  it('conserva pendientes distintos y sustituye solo el del mismo respaldo', () => {
    const retry = vi.fn(async () => true);
    const first: ExcelBackupFailure = { id: 'a', message: 'A', retry };
    const second: ExcelBackupFailure = { id: 'b', message: 'B', retry };
    const refreshedFirst: ExcelBackupFailure = { id: 'a', message: 'A actualizado', retry };

    const twoPending = upsertExcelBackupFailure(upsertExcelBackupFailure([], first), second);
    expect(twoPending.map((failure) => failure.id)).toEqual(['a', 'b']);

    const refreshed = upsertExcelBackupFailure(twoPending, refreshedFirst);
    expect(refreshed).toHaveLength(2);
    expect(refreshed.find((failure) => failure.id === 'a')?.message).toBe('A actualizado');
    expect(refreshed.find((failure) => failure.id === 'b')?.message).toBe('B');
  });

  it('persiste pendientes para recuperarlos después de reiniciar la interfaz', () => {
    persistExcelBackupFailure(
      { id: 'G:\\RRLL::Coordinacion.xlsx', message: 'Respaldo pendiente' },
      '2026-10-15T10:00:00.000Z',
    );

    expect(loadPersistedExcelBackupFailures()).toEqual([
      {
        id: 'G:\\RRLL::Coordinacion.xlsx',
        message: 'Respaldo pendiente',
        failedAt: '2026-10-15T10:00:00.000Z',
      },
    ]);

    clearPersistedExcelBackupFailure('G:\\RRLL::Coordinacion.xlsx');
    expect(loadPersistedExcelBackupFailures()).toEqual([]);
  });

  it('emite un pendiente identificable, lo persiste y permite reintentarlo sin perder el contexto', async () => {
    const saveOperationalExcelBackup = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'EBUSY: archivo abierto' })
      .mockResolvedValueOnce({ ok: true, message: 'Guardado' });
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveOperationalExcelBackup },
    });

    const emittedFailures: ExcelBackupFailure[] = [];
    const listener = (event: Event) => {
      emittedFailures.push((event as CustomEvent<ExcelBackupFailure>).detail);
    };
    window.addEventListener(EXCEL_BACKUP_FAILURE_EVENT, listener);

    try {
      const message = await saveExcelBackupWithRetry({
        directory: 'G:\\RRLL\\Respaldos\\',
        fileName: 'Coordinacion_Direccion.xlsx',
        cleanupPrefix: 'Coordinacion_Direccion',
        buffer: new ArrayBuffer(8),
      });

      expect(message).toMatch(/archivo esté cerrado/i);
      expect(emittedFailures).toHaveLength(1);
      expect(loadPersistedExcelBackupFailures()).toHaveLength(1);
      const emittedFailure = emittedFailures[0];
      expect(emittedFailure?.id).toBe('G:\\RRLL\\Respaldos::Coordinacion_Direccion.xlsx');
      if (!emittedFailure?.retry) throw new Error('No se ha emitido el reintento esperado.');
      await expect(emittedFailure.retry()).resolves.toBe(true);
      expect(saveOperationalExcelBackup).toHaveBeenCalledTimes(2);
      expect(loadPersistedExcelBackupFailures()).toEqual([]);
    } finally {
      window.removeEventListener(EXCEL_BACKUP_FAILURE_EVENT, listener);
    }
  });

  it('un guardado correcto posterior limpia un pendiente de una sesión anterior', async () => {
    persistExcelBackupFailure({
      id: 'G:\\RRLL\\Respaldos::Coordinacion_Direccion.xlsx',
      message: 'Respaldo pendiente',
    });
    const saveOperationalExcelBackup = vi.fn().mockResolvedValue({ ok: true, message: 'Guardado' });
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveOperationalExcelBackup },
    });

    await expect(saveExcelBackupWithRetry({
      directory: 'G:\\RRLL\\Respaldos\\',
      fileName: 'Coordinacion_Direccion.xlsx',
      cleanupPrefix: 'Coordinacion_Direccion',
      buffer: new ArrayBuffer(8),
    })).resolves.toBeNull();

    expect(loadPersistedExcelBackupFailures()).toEqual([]);
  });
});
