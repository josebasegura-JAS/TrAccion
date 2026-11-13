import { describe, expect, it, vi } from 'vitest';
import { isSessionReadRequest, isSessionReadResponse } from './sessionReadWorkerProtocol.js';
import { runSessionReadWorker, type SessionReadChild } from './sessionReadWorkerRunner.js';

const expected = { databaseUuid: 'db-test', applicationId: 'traccion', environment: 'test', schemaVersion: 19 };
const records = [{ id: 's1', value: '{"titulo":"Prueba"}', createdAt: '2026-11-13', updatedAt: '2026-11-13', deletedAt: null }];

function fakeChild() {
 let onMessage: (value: unknown) => void = () => {};
 let onExit: (code: number) => void = () => {};
 const postMessage = vi.fn();
 const kill = vi.fn();
 const child: SessionReadChild = {
   postMessage, kill,
   onMessage: callback => { onMessage = callback; },
   onExit: callback => { onExit = callback; },
 };
 return {
   child, postMessage, kill,
   message: (value: unknown) => onMessage(value),
   exit: (code = 0) => onExit(code),
 };
}

describe('PR9D-4B · Comité y Paritaria readonly worker', () => {
 it('rechaza módulos, filtros y mensajes de escritura arbitrarios', () => {
   const message = { kind: 'session:read', module: 'comite', databasePath: 'Z:/traccion.sqlite', expected };
   expect(isSessionReadRequest(message)).toBe(true);
   expect(isSessionReadRequest({ ...message, module: 'paritaria', id: 'a1' })).toBe(true);
   expect(isSessionReadRequest({ ...message, module: 'tasks' })).toBe(false);
   expect(isSessionReadRequest({ ...message, kind: 'session:write' })).toBe(false);
   expect(isSessionReadRequest({ ...message, id: 4 })).toBe(false);
   expect(isSessionReadResponse({ kind: 'session:result', records })).toBe(true);
   expect(isSessionReadResponse({ kind: 'session:result', records: [{ value: 5 }] })).toBe(false);
 });

 it('solo entrega resultado tras exit confirmado y conserva el filtro puntual', async () => {
   const fake = fakeChild();
   let settled = false;
   const task = runSessionReadWorker({
     createChild: () => fake.child, databasePath: 'Z:/traccion.sqlite',
     expected, module: 'comite', id: 's1',
   }).then(result => { settled = true; return result; });
   fake.message({ kind: 'session:ready' });
   expect(fake.postMessage).toHaveBeenCalledWith({
     kind: 'session:read', databasePath: 'Z:/traccion.sqlite', expected, module: 'comite', id: 's1',
   });
   fake.message({ kind: 'session:result', records });
   await Promise.resolve();
   expect(settled).toBe(false);
   expect(fake.postMessage).toHaveBeenCalledWith({ kind: 'session:shutdown' });
   fake.exit(0);
   expect(await task).toEqual(records);
 });

 it('un timeout no libera la operación antes de exit y rechaza respuesta tardía', async () => {
   vi.useFakeTimers();
   try {
     const fake = fakeChild();
     let settled = false;
     const task = runSessionReadWorker({
       createChild: () => fake.child, databasePath: 'Z:/traccion.sqlite', expected,
       module: 'paritaria', timeoutMs: 3_000,
     }).then(() => { settled = true; }, () => { settled = true; });
     fake.message({ kind: 'session:ready' });
     vi.advanceTimersByTime(3_000);
     expect(fake.kill).toHaveBeenCalledOnce();
     fake.message({ kind: 'session:result', records });
     await Promise.resolve();
     expect(settled).toBe(false);
     fake.exit(1);
     await task;
     expect(settled).toBe(true);
   } finally {
     vi.useRealTimers();
   }
 });

 it('una salida no verificada no entrega registros', async () => {
   const fake = fakeChild();
   const task = runSessionReadWorker({
     createChild: () => fake.child, databasePath: 'Z:/traccion.sqlite',
     expected, module: 'paritaria',
   });
   fake.message({ kind: 'session:ready' });
   fake.message({ kind: 'session:result', records });
   fake.exit(1);
   await expect(task).rejects.toThrow();
 });
});
