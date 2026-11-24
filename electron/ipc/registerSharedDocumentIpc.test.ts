import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => unknown>(),
  openPath: vi.fn(async () => ''),
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (event: unknown, payload?: unknown) => unknown) => mocks.handlers.set(channel, handler) },
  shell: { openPath: mocks.openPath },
}));
import { registerSharedDocumentIpc } from './registerSharedDocumentIpc.js';

function invoke(channel: string, payload?: unknown) {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error('Canal no registrado: ' + channel);
  return handler({}, payload);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  registerSharedDocumentIpc();
});
describe('IPC documentos compartidos', () => {
  it.each([null, {}, { fileName: 'test.xlsx', buffer: 'invalid' }, { fileName: ' ', buffer: new Uint8Array([1]) }])('rechaza Excel inválido antes de abrir archivos: %o', async (payload) => {
    expect(await invoke('excel:open-workbook', payload)).toMatchObject({ ok: false, message: expect.any(String) });
    expect(mocks.openPath).not.toHaveBeenCalled();
  });
  it.each([null, 'invalid', new Uint8Array([1, 2, 3]), new ArrayBuffer(0)])('devuelve error controlado para DOCX inválido: %o', async (payload) => {
    expect(await invoke('docx:extract-text', payload)).toMatchObject({ ok: false, message: expect.any(String) });
    expect(mocks.openPath).not.toHaveBeenCalled();
  });
});
