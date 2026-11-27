import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  handle: vi.fn(),
  dialog: vi.fn(),
}));
vi.mock('./sqlitePersistenceFacade.js', () => ({ getSqliteStatus: mocks.status }));
vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: mocks.dialog },
}));
import { registerOperationalExcelBackupIpc } from './ipc/registerOperationalExcelBackupIpc.js';
import { publishOperationalExcelBackup } from './operationalExcelPublication.js';
import { exportOpenTasksWord } from './taskOpenWordExport.js';

describe('Fase C: aislamiento de publicadores con archivos reales', () => {
  let root: string;
  let production: string;
  let testing: string;
  let originalArgv: string[];
  const oldName = 'Vinculograma_10-11-2026.xlsx';
  const newName = 'Vinculograma_11-11-2026.xlsx';
  const taskName = 'Tareas abiertas.xlsx';
  const bytes = new Uint8Array([1, 2, 3]);

  beforeEach(async () => {
    originalArgv = process.argv;
    process.argv = [...originalArgv.filter(arg => !arg.startsWith('--traccion-env')), '--traccion-env=test'];
    root = await mkdtemp(path.join(tmpdir(), 'traccion-output-integration-'));
    production = path.join(root, 'production');
    testing = path.join(root, 'test');
    await mkdir(production);
    await mkdir(testing);
    for (const name of [oldName, newName, taskName]) {
      await writeFile(path.join(production, name), 'CENTINELA-' + name);
    }
    mocks.status.mockReset();
    mocks.status.mockReturnValue({ ready: true, phase: 'active', isDefaultPath: false, environment: 'test', databaseUuid: 'test-a', applicationId: 'traccion', schemaVersion: 19, path: path.join(testing, 'traccion.sqlite') });
    mocks.handle.mockClear();
    mocks.dialog.mockClear();
    registerOperationalExcelBackupIpc();
  });

  afterEach(async () => {
    process.argv = originalArgv;
    await rm(root, { recursive: true, force: true });
  });

  async function assertProductionUntouched() {
    expect((await readdir(production)).sort()).toEqual([oldName, newName, taskName].sort());
    for (const name of [oldName, newName, taskName]) {
      expect(await readFile(path.join(production, name), 'utf8')).toBe('CENTINELA-' + name);
    }
  }

  function saveHandler() {
    const entry = mocks.handle.mock.calls.find(call => call[0] === 'operational-backup:save-excel');
    if (!entry) throw new Error('Canal IPC no registrado');
    return entry[1];
  }

  function payload(manual: boolean) {
    return { directory: production, fileName: newName, cleanupPrefix: 'Vinculograma_', buffer: bytes.buffer, manual };
  }

  it('redirige el Excel manual heredado y poda exclusivamente en PRUEBAS', async () => {
    const select = mocks.handle.mock.calls.find(call => call[0] === 'operational-backup:select-directory');
    if (!select) throw new Error('Selector no registrado');
    const destination = await select[1]({});
    expect(destination).toBe(path.join(await realpath(testing), 'excel', 'operativos'));
    expect(mocks.dialog).not.toHaveBeenCalled();
    await writeFile(path.join(destination, oldName), 'OBSOLETO-TEST');
    const result = await saveHandler()({}, payload(true));
    expect(result.ok).toBe(true);
    expect(result.path).toBe(path.join(destination, newName));
    expect(await readFile(result.path)).toEqual(Buffer.from(bytes));
    expect(await readdir(destination)).toEqual([newName]);
    await assertProductionUntouched();
  });

  it('bloquea publicación automática y acceso directo al publicador externo', async () => {
    expect((await saveHandler()({}, payload(false))).ok).toBe(false);
    await expect(publishOperationalExcelBackup(production, newName, 'Vinculograma_', bytes)).rejects.toThrow();
    expect(await readdir(testing)).toEqual([]);
    await assertProductionUntouched();
  });

  it('rechaza exportación manual si SQLite no está activa', async () => {
    mocks.status.mockReturnValue({ ...mocks.status(), ready: false });
    expect((await saveHandler()({}, payload(true))).ok).toBe(false);
    await expect(exportOpenTasksWord([], production)).rejects.toThrow();
    await assertProductionUntouched();
  });

  it('genera un libro real de Tareas sin tocar el destino heredado', async () => {
    const result = await exportOpenTasksWord([], production);
    expect(result.ok).toBe(true);
    if (!result.path) throw new Error('No se publicó el Excel');
    expect(path.dirname(await realpath(result.path))).toBe(path.join(await realpath(testing), 'excel', 'tareas'));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.path);
    expect(workbook.worksheets.length).toBe(3);
    await assertProductionUntouched();
  });

  it('rechaza junctions o enlaces de ambos publicadores hacia producción', async () => {
    await mkdir(path.join(testing, 'excel'));
    for (const name of ['operativos', 'tareas']) {
      await symlink(await realpath(production), path.join(testing, 'excel', name), process.platform === 'win32' ? 'junction' : 'dir');
    }
    expect((await saveHandler()({}, payload(true))).ok).toBe(false);
    await expect(exportOpenTasksWord([], production)).rejects.toThrow();
    await assertProductionUntouched();
  });
  it('no publica Tareas si cambia la identidad mientras se genera el libro', async () => {
    const result = await exportOpenTasksWord([], production, async () => {
      mocks.status.mockReturnValue({ ...mocks.status(), databaseUuid: 'test-b' });
      return true;
    });
    expect(result.ok).toBe(false);
    expect((await readdir(path.join(testing, 'excel', 'tareas'))).filter(name => /^Tareas_abiertas_.*\.xlsx$/.test(name))).toEqual([]);
    await assertProductionUntouched();
  });

});
