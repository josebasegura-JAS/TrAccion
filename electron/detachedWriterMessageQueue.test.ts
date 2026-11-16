import { describe, expect, it } from 'vitest';
import { createSerializedDetachedMessageQueue } from './detachedWriterMessageQueue.js';

describe('PR450 · serialización de peticiones al escritor aislado', () => {
  it('espera al guardado asíncrono antes de cerrar y no ejecuta peticiones solapadas', async () => {
    const executed: string[] = [];
    let releaseSave!: () => void;
    const blockedSave = new Promise<void>(resolve => { releaseSave = resolve; });
    const queue = createSerializedDetachedMessageQueue(async (kind: string) => {
      executed.push('start:' + kind);
      if (kind === 'save') await blockedSave;
      executed.push('end:' + kind);
    }, error => { throw error; });
    queue.enqueue('open');
    queue.enqueue('save');
    queue.enqueue('close');
    await Promise.resolve();
    await Promise.resolve();
    // El cierre encolado no puede adelantar al guardado todavía bloqueado.
    expect(executed).not.toContain('start:close');
    releaseSave();
    await queue.whenIdle();
    expect(executed).toEqual([
      'start:open', 'end:open', 'start:save', 'end:save',
      'start:close', 'end:close',
    ]);
  });

  it('un error inesperado descarta el cierre pendiente y nuevos mensajes', async () => {
    const executed: string[] = [];
    const failures: unknown[] = [];
    const queue = createSerializedDetachedMessageQueue(async (kind: string) => {
      executed.push(kind);
      if (kind === 'save') throw new Error('fallo');
    }, error => { failures.push(error); });
    queue.enqueue('open');
    queue.enqueue('save');
    queue.enqueue('close');
    await queue.whenIdle();
    queue.enqueue('late-save');
    await queue.whenIdle();
    expect(executed).toEqual(['open', 'save']);
    expect(queue.failed).toBe(true);
    expect(failures).toHaveLength(1);
  });
});
