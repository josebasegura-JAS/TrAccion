import { describe, expect, it, vi } from 'vitest';
import type { Database } from 'better-sqlite3';
import { createRecordLockService, type DatabaseStatus } from './recordLockService';
import * as recordLocksModule from './recordLocks';

/**
 * Tests de orquestación de recordLockService.ts con dependencias mockeadas
 * (getSqliteStatus, requireDatabase, withDatabaseOperationLock, getOwnerId):
 * no ejercitan la lógica SQL real de editing_locks (eso ya lo cubre
 * recordLocks.test.ts contra una base real), sino el "pegamento" que decide
 * si se puede intentar la operación y cómo se traduce cualquier fallo a un
 * RecordLockResult con mensaje.
 */
describe('recordLockService — orquestación de bloqueos por registro', () => {
  const fakeDb = {} as Database;

  function buildDependencies(overrides: Partial<DatabaseStatus> = {}) {
    const status: DatabaseStatus = { ready: true, phase: 'active', ...overrides };
    return {
      getSqliteStatus: vi.fn(() => status),
      requireDatabase: vi.fn(() => fakeDb),
      withDatabaseOperationLock: vi.fn(async (_path: string, operation: () => Promise<unknown>) =>
        operation(),
      ),
      getOwnerId: vi.fn(() => 'owner-1'),
      getDatabasePath: vi.fn(() => '/tmp/traccion.sqlite'),
    };
  }

  it('rechaza un payload inválido sin llegar a tocar la base', async () => {
    const dependencies = buildDependencies();
    const service = createRecordLockService(dependencies);

    const result = await service.acquireRecordLock({ module: '', recordId: '' });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('inválido');
    expect(dependencies.requireDatabase).not.toHaveBeenCalled();
  });

  it('devuelve error cuando la base no está lista (ready:false)', async () => {
    const dependencies = buildDependencies({ ready: false });
    const service = createRecordLockService(dependencies);

    const result = await service.acquireRecordLock({ module: 'teletrabajo', recordId: 'sol-1' });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('no está disponible');
  });

  it('devuelve error cuando la fase es "locked"', async () => {
    const dependencies = buildDependencies({ phase: 'locked' });
    const service = createRecordLockService(dependencies);

    const result = await service.heartbeatRecordLock({ module: 'actas', recordId: 'acta-1' });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('no está disponible');
  });

  it('delega en acquireRecordLockInTransaction con el contexto del propietario actual', async () => {
    const dependencies = buildDependencies();
    const service = createRecordLockService(dependencies);
    const spy = vi
      .spyOn(recordLocksModule, 'acquireRecordLockInTransaction')
      .mockReturnValue({ ok: true, status: 'acquired', lock: null, message: 'ok' });

    const result = await service.acquireRecordLock({ module: 'teletrabajo', recordId: 'sol-1' });

    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      fakeDb,
      { module: 'teletrabajo', recordId: 'sol-1' },
      expect.objectContaining({ ownerId: 'owner-1' }),
    );

    spy.mockRestore();
  });

  it('convierte una excepción inesperada en un RecordLockResult con mensaje', async () => {
    const dependencies = buildDependencies();
    const service = createRecordLockService(dependencies);
    const spy = vi
      .spyOn(recordLocksModule, 'releaseRecordLockInTransaction')
      .mockImplementation(() => {
        throw new Error('fallo simulado de SQLite');
      });

    const result = await service.releaseRecordLock({ module: 'teletrabajo', recordId: 'sol-1' });

    expect(result.ok).toBe(false);
    expect(result.message).toBe('fallo simulado de SQLite');

    spy.mockRestore();
  });

  it('usa la ruta de base de datos actual como clave del lock de operación', async () => {
    const dependencies = buildDependencies();
    const service = createRecordLockService(dependencies);
    vi.spyOn(recordLocksModule, 'getRecordLockInTransaction').mockReturnValue({
      ok: true,
      status: 'idle',
      lock: null,
      message: 'ok',
    });

    await service.getRecordLock({ module: 'teletrabajo', recordId: 'sol-1' });

    expect(dependencies.withDatabaseOperationLock).toHaveBeenCalledWith(
      '/tmp/traccion.sqlite',
      expect.any(Function),
      750,
    );

    vi.restoreAllMocks();
  });
});
