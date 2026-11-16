import { describe, expect, it, vi } from 'vitest';
import { savePresupuestosViaDetachedWriter } from './detachedPresupuestosWriterRunner.js';
import type { DetachedWriterChild } from './detachedCriteriaWriterRunner.js';
import type { DetachedWriterRequest } from './detachedCriteriaWriterProtocol.js';

function fixture() {
  let message: (data: unknown) => void = () => undefined;
  let exit: (code: number) => void = () => undefined;
  const sent: DetachedWriterRequest[] = [];
  const kill = vi.fn();
  const child: DetachedWriterChild = {
    postMessage: x => { sent.push(x); },
    onMessage: cb => { message = cb; },
    onExit: cb => { exit = cb; },
    kill,
  };
  const options = {
    createChild: () => child,
    databasePath: '/shared/traccion.sqlite',
    expected: {databaseUuid:'uuid',applicationId:'TrAccion',environment:'production',schemaVersion:17},
    operationId:'presupuestos-save-1',
    payload: {ownerId:'owner-a',snapshot:{scenarios:[],manualItems:[],ticketGroups:[],actuals:[],expectedUpdatedAt:null}},
  };
  return { options, sent, kill, emit: (data:unknown) => message(data), exit: (code:number) => exit(code) };
}
const result = {ok:true,status:{ready:true,engine:'better-sqlite3',phase:'active',path:'x',schemaVersion:17,
  isDefaultPath:false,lockPath:'x'},message:'Presupuestos guardados.',currentUpdatedAt:'v2'};
describe('PR466 · protocolo de Presupuestos aislados', () => {
  it('no publica éxito antes de cerrar y observar exit(0)', async () => {
    const f = fixture();
    let settled = false;
    const job = savePresupuestosViaDetachedWriter(f.options).then(x => {settled=true; return x;});
    f.emit({kind:'detached:ready'});
    f.emit({kind:'detached:opened'});
    expect(f.sent.map(x=>x.kind)).toEqual(['detached:open','detached:save-presupuestos']);
    f.emit({kind:'detached:presupuestos-saved',operationId:'presupuestos-save-1',result});
    expect(f.sent[f.sent.length-1]?.kind).toBe('detached:close');
    await Promise.resolve();
    expect(settled).toBe(false);
    f.exit(0);
    expect(await job).toEqual(result);
  });

  it('un cierre inesperado nunca confirma éxito ni repite el guardado', async () => {
    const f = fixture();
    const job = savePresupuestosViaDetachedWriter(f.options);
    f.emit({kind:'detached:ready'});
    f.emit({kind:'detached:opened'});
    f.emit({kind:'detached:presupuestos-saved',operationId:'presupuestos-save-1',result});
    f.exit(1);
    await expect(job).rejects.toThrow('incierto');
    expect(f.sent.filter(x=>x.kind==='detached:save-presupuestos')).toHaveLength(1);
  });

  it('una respuesta de otra operación pone en cuarentena la sesión', async () => {
    const f = fixture();
    const job = savePresupuestosViaDetachedWriter(f.options);
    f.emit({kind:'detached:ready'});
    f.emit({kind:'detached:opened'});
    f.emit({kind:'detached:presupuestos-saved',operationId:'OTRA',result});
    expect(f.kill).toHaveBeenCalledTimes(1);
    f.exit(1);
    await expect(job).rejects.toThrow('incierto');
  });
});
