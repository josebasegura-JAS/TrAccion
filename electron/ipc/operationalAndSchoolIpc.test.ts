import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  publish: vi.fn(async () => 'published.xlsx'),
  dialog: vi.fn(async () => ({ canceled: true, filePaths: [] as string[] })),
  spawn: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => mocks.handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: mocks.dialog },
}));
vi.mock('../operationalExcelPublication.js', () => ({ publishOperationalExcelBackup: mocks.publish }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));

import { registerOperationalExcelBackupIpc } from './registerOperationalExcelBackupIpc.js';
import { registerAyudaEscolarIpc } from './registerAyudaEscolarIpc.js';

function invoke(channel: string, ...args: unknown[]) {
  const handler = mocks.handlers.get(channel);
  if (!handler) throw new Error('Canal no registrado: ' + channel);
  return handler({}, ...args);
}
let directory: string;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
  registerOperationalExcelBackupIpc();
  registerAyudaEscolarIpc();
  directory = mkdtempSync(path.join(tmpdir(), 'traccion-ipc-export-'));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
function validPayload() {
  return { directory, fileName: 'Report_2026.xlsx', cleanupPrefix: 'Report_', buffer: new Uint8Array([1, 2]).buffer };
}
describe('IPC publicación Excel', () => {
  it('rechaza parámetros incorrectos antes de publicar', async () => {
    for (const payload of [null, {}, { ...validPayload(), buffer: 'bad' }, { ...validPayload(), directory: 1 }]) {
      expect(await invoke('operational-backup:save-excel', payload)).toMatchObject({ ok: false, path: null });
    }
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it.each([
    { fileName: '../report.xlsx' }, { fileName: 'report.exe' }, { fileName: '.hidden.xlsx' },
    { cleanupPrefix: '../report' }, { cleanupPrefix: '' }, { buffer: new ArrayBuffer(0) }, { directory: ' ' },
  ])('rechaza nombres, rutas o contenido inválidos: %o', async (patch) => {
    expect(await invoke('operational-backup:save-excel', { ...validPayload(), ...patch })).toMatchObject({ ok: false, path: null });
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('transmite el nombre y los bytes al publicador', async () => {
    expect(await invoke('operational-backup:save-excel', validPayload())).toMatchObject({ ok: true, path: 'published.xlsx' });
    expect(mocks.publish).toHaveBeenCalledWith(directory, 'Report_2026.xlsx', 'Report_', Buffer.from([1, 2]));
  });
  it('devuelve error recuperable cuando Excel está bloqueado', async () => {
    mocks.publish.mockRejectedValueOnce(Object.assign(new Error('ocupado'), { code: 'EPERM' }));
    expect(await invoke('operational-backup:save-excel', validPayload())).toMatchObject({ ok: false, path: null, message: expect.stringContaining('bloqueado') });
  });
  it('distingue un fallo genérico de uno por archivo bloqueado', async () => {
    mocks.publish.mockRejectedValueOnce(Object.assign(new Error('sin espacio'), { code: 'ENOSPC' }));
    expect(await invoke('operational-backup:save-excel', validPayload())).toMatchObject({ ok: false, path: null, message: expect.stringContaining('sin espacio') });
  });
});
describe('IPC Ayuda Escolar', () => {
  it('no ejecuta Outlook con contenido no binario', async () => {
    expect(await invoke('ayuda-escolar:inspect-message', 'test.msg', null)).toMatchObject({ ok: false });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('no ejecuta Outlook con datos de archivado incompletos', async () => {
    expect(await invoke('ayuda-escolar:archive-message', {})).toMatchObject({ ok: false });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it('no archiva si no hay carpeta configurada', async () => {
    expect(await invoke('ayuda-escolar:archive-message', { fileName: 'test.msg', buffer: new ArrayBuffer(1), basePath: ' ', employeeName: 'test' })).toMatchObject({ ok: false });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it.each(['ayuda-escolar:select-folder', 'operational-backup:select-directory'])('%s permite cancelar sin seleccionar ruta', async (channel) => {
    expect(await invoke(channel)).toBeNull();
  });
});
