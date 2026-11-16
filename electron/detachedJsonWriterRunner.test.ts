import { describe, expect, it, vi } from 'vitest';
import { saveJsonBatchViaDetachedWriter } from './detachedJsonWriterRunner.js';
import type { DetachedWriterRequest } from './detachedCriteriaWriterProtocol.js';
import type { DetachedWriterChild } from './detachedCriteriaWriterRunner.js';

function setup() {
  const sent: DetachedWriterRequest[] = [];
  let message: (data: unknown) => void = () => undefined;
  let exit: (code: number) => void = () => undefined;
  const kill = vi.fn();
  const child: DetachedWriterChild = {
    postMessage: item => { sent.push(item); },
    onMessage: handler => { message = handler; },
    onExit: handler => { exit = handler; },
    kill,
  };
  const job = () => saveJsonBatchViaDetachedWriter({
    createChild: () => child,
    databasePath: 'test.sqlite',
    expected: { databaseUuid: 'uuid', applicationId: 'TrAccion', environment: 'production', schemaVersion: 1 },
    operationId: 'op-444',
    table: 'criterios_rrll_records',
    records: [{ id: 'id-1', value: JSON.stringify({id: 'id-1', updatedAt:'v1'}), expectedUpdatedAt: null }],
  });
  return { job, sent, message: (v: unknown) => message(v), exit: (c: number) => exit(c), kill };
}
describe('PR444 · runner del escritor JSON', () => {
  it('confirma solo después de cerrar y observar exit(0)', async () => {
    const s = setup();
    let resolved = false;
    const job = s.job().then(x => { resolved = true; return x; });
    s.message({ kind:'detached:ready' });
    s.message({ kind:'detached:opened' });
    expect(s.sent.map(x=>x.kind)).toEqual(['detached:open','detached:save-json-batch']);
    s.message({kind:'detached:json-batch-saved',operationId:'op-444',
      result:{ok:true,results:[{ok:true,currentUpdatedAt:'v1'}]}});
    expect(s.sent.at(-1)?.kind).toBe('detached:close');
    await Promise.resolve();
    expect(resolved).toBe(false);
    s.exit(0);
    expect(await job).toEqual({ok:true,results:[{ok:true,currentUpdatedAt:'v1'}]});
  });
  it('resultado previo al cierre NO es éxito si exit no es 0', async () => {
    const s = setup();
    const job = s.job();
    s.message({kind:'detached:ready'});
    s.message({kind:'detached:opened'});
    s.message({kind:'detached:json-batch-saved',operationId:'op-444',
      result:{ok:true,results:[{ok:true,currentUpdatedAt:'v1'}]}});
    s.exit(1);
    await expect(job).rejects.toThrow('resultado incierto');
  });
  it('bloquea respuesta de otra operación, sin reintentar automáticamente', async () => {
    const s = setup();
    const job = s.job();
    s.message({kind:'detached:ready'});
    s.message({kind:'detached:opened'});
    s.message({kind:'detached:json-batch-saved',operationId:'op-antigua',
      result:{ok:true,results:[]}});
    expect(s.kill).toHaveBeenCalledTimes(1);
    s.exit(1);
    await expect(job).rejects.toThrow('resultado incierto');
    expect(s.sent.filter(x=>x.kind==='detached:save-json-batch')).toHaveLength(1);
  });
});
