import { describe, expect, it, vi } from 'vitest';
import { reportModuleReadFailure } from './reportModuleReadFailure';

const emitPersistenceFeedback = vi.hoisted(() => vi.fn());
vi.mock('../../services/persistenceFeedback', () => ({
  emitPersistenceFeedback,
}));

describe('reportModuleReadFailure', () => {
  it('clasifica el fallo como lectura y conserva la explicación de los datos anteriores', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reportModuleReadFailure('traccion.v1.actas.records', 'Actas', new Error('SMB no accesible'));
    expect(emitPersistenceFeedback).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      operation: 'read',
      key: 'traccion.v1.actas.records',
      message: expect.stringContaining('Se conserva la última información cargada'),
    }));
    vi.restoreAllMocks();
  });
});
