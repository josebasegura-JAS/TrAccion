import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(), status: vi.fn(), dialog: vi.fn(), draft: vi.fn(), spawn: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: mocks.dialog },
  shell: { openPath: vi.fn() },
}));
vi.mock('./sqlitePersistenceFacade.js', () => ({ getSqliteStatus: mocks.status }));
vi.mock('./sqlitePersistence.js', () => ({ getSqliteStatus: mocks.status }));
vi.mock('./sqliteIpcQueue.js', () => ({ enqueueSqliteIpc: vi.fn() }));
vi.mock('./outlookDraftCompat.js', () => ({ createOutlookDraftCompat: mocks.draft }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
import { registerLoteriaIpc } from './ipc/registerLoteriaIpc.js';
import { registerSharedDocumentIpc } from './ipc/registerSharedDocumentIpc.js';
import { registerEspecialesIpc } from './ipc/registerEspecialesIpc.js';
import { registerAyudaEscolarIpc } from './ipc/registerAyudaEscolarIpc.js';

describe('T4: barreras IPC de entornos con centinelas de producción', () => {
  let root: string;
  let production: string;
  let testing: string;
  let argv: string[];
  const bytes = new Uint8Array([1, 2, 3]);
  const names = ['Loteria_2026_10-11-2026.xlsx', 'Loteria_2026_11-11-2026.xlsx', 'datos.pdf'];
  function environment(value: 'test' | 'production') {
    process.argv = [...argv.filter(arg => !arg.startsWith('--traccion-env')), '--traccion-env=' + value];
  }
  function handler(channel: string) {
    const entry = mocks.handle.mock.calls.find(call => call[0] === channel);
    if (!entry) throw new Error('Canal IPC no registrado: ' + channel);
    return entry[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>;
  }
  async function untouched() {
    expect((await readdir(production)).sort()).toEqual([...names].sort());
    for (const name of names) expect(await readFile(path.join(production, name), 'utf8')).toBe('CENTINELA-' + name);
  }
  beforeEach(async () => {
    argv = process.argv;
    environment('test');
    root = await mkdtemp(path.join(tmpdir(), 'traccion-t4-'));
    production = path.join(root, 'production');
    testing = path.join(root, 'test');
    await mkdir(production);
    await mkdir(testing);
    for (const name of names) await writeFile(path.join(production, name), 'CENTINELA-' + name);
    vi.clearAllMocks();
    mocks.status.mockReturnValue({ ready: true, phase: 'active', isDefaultPath: false, environment: 'test',
      path: path.join(testing, 'traccion.sqlite'), databaseUuid: 'test-a', applicationId: 'traccion', schemaVersion: 19 });
    registerLoteriaIpc();
    registerSharedDocumentIpc();
    registerEspecialesIpc();
    registerAyudaEscolarIpc();
  });
  afterEach(async () => {
    process.argv = argv;
    await rm(root, { recursive: true, force: true });
  });

  it('Lotería omite el espejo automático incluso con destino heredado de producción', async () => {
    expect(await handler('loteria:save-campaign-excel')({}, {
      year: 2026, directoryTemplate: production, fileName: names[1], buffer: bytes.buffer,
    })).toMatchObject({ ok: true, path: null, message: expect.stringContaining('desactivado') });
    expect(await readdir(testing)).toEqual([]);
    await untouched();
  });

  it.each([
    ['loteria:select-export-directory', 'excel', 'loteria'],
    ['ayuda-escolar:select-folder', 'documentos', 'ayuda-escolar'],
  ])('redirige %s sin abrir un selector externo', async (channel, category, folder) => {
    expect(await handler(channel)({})).toBe(path.join(await realpath(testing), category, folder));
    expect(mocks.dialog).not.toHaveBeenCalled();
    await untouched();
  });

  it('impide crear borradores reales desde Especiales en PRUEBAS', async () => {
    expect(await handler('especiales:create-outlook-draft')({}, { to: 'test@example.invalid', subject: 'prueba' }))
      .toMatchObject({ ok: false, message: expect.stringContaining('desactivado') });
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
    await untouched();
  });

  it('guarda exportaciones genéricas con nombres repetidos sin sobrescribir producción', async () => {
    const save = handler('export:save-test-file');
    const first = await save({}, { fileName: 'datos.pdf', buffer: bytes.buffer }) as { ok: boolean; path: string };
    const second = await save({}, { fileName: 'datos.pdf', buffer: bytes.buffer }) as { ok: boolean; path: string };
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.path).not.toBe(second.path);
    for (const file of [first.path, second.path]) {
      expect(path.relative(await realpath(testing), await realpath(file)).split(path.sep))
        .toEqual(['exportaciones', expect.stringMatching(/^manual-/), 'datos.pdf']);
      expect(await readFile(file)).toEqual(Buffer.from(bytes));
    }
    await untouched();
  });

  it('rechaza el canal exclusivo de pruebas en PRODUCCIÓN incluso con estado SQLite test', async () => {
    environment('production');
    expect(await handler('export:save-test-file')({}, { fileName: 'datos.pdf', buffer: bytes.buffer }))
      .toMatchObject({ ok: false, message: expect.stringContaining('exclusivo') });
    expect(await readdir(testing)).toEqual([]);
    await untouched();
  });

  it('rechaza exportaciones genéricas cuando la carpeta autorizada apunta a producción', async () => {
    await symlink(await realpath(production), path.join(testing, 'exportaciones'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(await handler('export:save-test-file')({}, { fileName: 'datos.pdf', buffer: bytes.buffer }))
      .toMatchObject({ ok: false });
    await untouched();
  });

  it.each(['loteria:select-export-directory', 'ayuda-escolar:select-folder'])(
    'rechaza %s con base inactiva sin acudir al diálogo de producción', async channel => {
      mocks.status.mockReturnValue({ ...mocks.status(), ready: false });
      await expect(handler(channel)({})).rejects.toThrow();
      expect(mocks.dialog).not.toHaveBeenCalled();
      expect(await readdir(testing)).toEqual([]);
      await untouched();
    },
  );
});
