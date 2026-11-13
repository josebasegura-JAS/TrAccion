import { describe, expect, it, vi } from 'vitest';
import { ISOLATED_JSON_TABLES, isIsolatedJsonTable } from './persistence/isolatedJsonTables.js';
import { isJsonReadRequest, isJsonReadResponse } from './jsonReadWorkerProtocol.js';
import { runJsonReadWorker, type JsonReadChild } from './jsonReadWorkerRunner.js';

const expected = {
  databaseUuid: 'db-1', applicationId: 'traccion', environment: 'test', schemaVersion: 19,
};
const records = [{
  id: 'one', value: '{"titulo":"ejemplo"}', createdAt: '2026-11-13',
  updatedAt: '2026-11-13', deletedAt: null,
}];

function fakeChild() {
  let messageHandler: (data: unknown) => void = () => {};
  let exitHandler: (code: number) => void = () => {};
  const postMessage = vi.fn();
  const kill = vi.fn();
  const child: JsonReadChild = {
    postMessage, kill,
    onMessage: fn => { messageHandler = fn; },
    onExit: fn => { exitHandler = fn; },
  };
  return {
    child, postMessage, kill,
    send: (data: unknown) => messageHandler(data),
    exit: (code = 0) => exitHandler(code),
  };
}

describe('PR9D-4C · catálogo readonly JSON', () => {
  it('solo acepta las doce tablas declaradas', () => {
    expect(ISOLATED_JSON_TABLES).toHaveLength(12);
    expect(new Set(ISOLATED_JSON_TABLES).size).toBe(12);
    for (const table of ISOLATED_JSON_TABLES) expect(isIsolatedJsonTable(table)).toBe(true);
    for (const table of ['task_records', 'editing_locks', 'sqlite_master', 'comite_session_records', 'users']) {
      expect(isIsolatedJsonTable(table)).toBe(false);
    }
  });
  it('rechaza órdenes de escritura, tablas arbitrarias e identidades inválidas', () => {
    const request = {
      kind: 'json:read', table: 'criterios_rrll_records',
      databasePath: 'Z:/traccion.sqlite', expected,
    };
    expect(isJsonReadRequest(request)).toBe(true);
    expect(isJsonReadRequest({ ...request, table: 'sqlite_master' })).toBe(false);
    expect(isJsonReadRequest({ ...request, kind: 'json:write' })).toBe(false);
    expect(isJsonReadRequest({ ...request, expected: { ...expected, databaseUuid: '' } })).toBe(false);
    expect(isJsonReadResponse({ kind: 'json:result', records })).toBe(true);
    expect(isJsonReadResponse({ kind: 'json:result', records: [{ id: 1 }] })).toBe(false);
  });
});

describe('PR9D-4C · resultado condicionado a salida del worker', () => {
  it('tras ready y resultado exige exit(0)', async () => {
    const fake = fakeChild();
    let completed = false;
    const task = runJsonReadWorker({
      createChild: () => fake.child, expected, table: 'criterios_rrll_records',
      databasePath: 'Z:/traccion.sqlite',
    }).then(result => { completed = true; return result; });
    fake.send({ kind: 'json:ready' });
    expect(fake.postMessage).toHaveBeenCalledWith({
      kind: 'json:read', databasePath: 'Z:/traccion.sqlite',
      expected, table: 'criterios_rrll_records',
    });
    fake.send({ kind: 'json:result', records });
    expect(fake.postMessage).toHaveBeenCalledWith({ kind: 'json:shutdown' });
    await Promise.resolve();
    expect(completed).toBe(false);
    fake.exit(0);
    expect(await task).toEqual(records);
  });

  it('timeout solicita kill, ignora resultados tardíos y espera exit', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeChild();
      let settled = false;
      const task = runJsonReadWorker({
        createChild: () => fake.child, expected, table: 'acta_type_records',
        databasePath: 'Z:/traccion.sqlite', timeoutMs: 3000,
      }).then(() => { settled = true; }, () => { settled = true; });
      fake.send({ kind: 'json:ready' });
      vi.advanceTimersByTime(3000);
      expect(fake.kill).toHaveBeenCalledOnce();
      fake.send({ kind: 'json:result', records });
      await Promise.resolve();
      expect(settled).toBe(false);
      fake.exit(1);
      await task;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rechaza resultado de un worker que sale con error', async () => {
    const fake = fakeChild();
    const task = runJsonReadWorker({
      createChild: () => fake.child, expected, table: 'ticket_restaurante_person_records',
      databasePath: 'Z:/traccion.sqlite',
    });
    fake.send({ kind: 'json:ready' });
    fake.send({ kind: 'json:result', records });
    fake.exit(1);
    await expect(task).rejects.toThrow();
  });
});
