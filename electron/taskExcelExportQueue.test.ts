import { describe, expect, it, vi } from 'vitest';
import { createSerialTaskExcelQueue } from './taskExcelExportQueue.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => { resolve = finish; });
  return { promise, resolve };
}

describe('createSerialTaskExcelQueue', () => {
  it('serializa exportaciones manuales y automáticas y prepara cada snapshot al comenzar', async () => {
    const gate = deferred();
    const calls: string[] = [];
    let revision = 1;
    const queue = createSerialTaskExcelQueue();

    const first = queue.enqueue(async () => {
      const snapshot = revision;
      calls.push(`snapshot:${snapshot}`);
      await gate.promise;
      calls.push(`written:${snapshot}`);
      return snapshot;
    });

    const second = queue.enqueue(async () => {
      const snapshot = revision;
      calls.push(`snapshot:${snapshot}`);
      calls.push(`written:${snapshot}`);
      return snapshot;
    });

    await Promise.resolve();
    expect(calls).toEqual(['snapshot:1']);
    revision = 2;
    gate.resolve();
    expect(await first).toBe(1);
    expect(await second).toBe(2);
    expect(calls).toEqual(['snapshot:1', 'written:1', 'snapshot:2', 'written:2']);
  });

  it('un fallo al exportar no bloquea las siguientes peticiones', async () => {
    const queue = createSerialTaskExcelQueue();
    const failed = queue.enqueue(async (): Promise<void> => {
      throw new Error('SMB temporalmente inaccesible');
    });
    const next = vi.fn(async () => 'nuevo-archivo');
    const recovered = queue.enqueue(next);

    await expect(failed).rejects.toThrow('SMB temporalmente inaccesible');
    await expect(recovered).resolves.toBe('nuevo-archivo');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('una exportación detenida no retiene la cola de operaciones SQLite', async () => {
    const fileGate = deferred();
    const snapshotReady = deferred();
    const databaseCalls: string[] = [];
    let sqliteTail: Promise<void> = Promise.resolve();
    const enqueueSqlite = (name: string): Promise<void> => {
      const result = sqliteTail.then(() => { databaseCalls.push(name); });
      sqliteTail = result;
      return result;
    };
    const queue = createSerialTaskExcelQueue();

    const exportPromise = queue.enqueue(async () => {
      await enqueueSqlite('snapshot');
      snapshotReady.resolve();
      await fileGate.promise; // ExcelJS o escritura lenta en carpeta SMB.
    });
    await snapshotReady.promise;
    expect(databaseCalls).toContain('snapshot');

    // El guardado no espera a que termine la escritura del archivo Excel.
    await enqueueSqlite('save-task');
    expect(databaseCalls).toEqual(['snapshot', 'save-task']);
    fileGate.resolve();
    await exportPromise;
  });
});
