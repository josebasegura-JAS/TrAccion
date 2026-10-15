import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXCEL_BACKUP_FAILURE_EVENT,
  saveExcelBackupWithRetry,
  upsertExcelBackupFailure,
  type ExcelBackupFailure,
} from './saveExcelBackupWithRetry';

describe('saveExcelBackupWithRetry', () => {
  beforeEach(() => {
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

  it('emite un pendiente identificable y permite reintentarlo sin perder el contexto', async () => {
    const saveOperationalExcelBackup = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'EBUSY: archivo abierto' })
      .mockResolvedValueOnce({ ok: true, message: 'Guardado' });
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveOperationalExcelBackup },
    });

    let emittedFailure: ExcelBackupFailure | null = null;
    const listener = (event: Event) => {
      emittedFailure = (event as CustomEvent<ExcelBackupFailure>).detail;
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
      expect(emittedFailure).not.toBeNull();
      expect((emittedFailure as ExcelBackupFailure | null)?.id).toBe(
        'G:\\RRLL\\Respaldos::Coordinacion_Direccion.xlsx',
      );
      await expect((emittedFailure as ExcelBackupFailure).retry()).resolves.toBe(true);
      expect(saveOperationalExcelBackup).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(EXCEL_BACKUP_FAILURE_EVENT, listener);
    }
  });
});
