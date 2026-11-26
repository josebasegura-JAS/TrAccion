import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { saveTestExportFile } from './testExportFile.js';

describe('exportaciones manuales de pruebas', () => {
  it('guarda archivos independientes dentro de la base activa y rechaza rutas externas', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'traccion-test-export-'));
    const status = { ready: true, phase: 'active', path: path.join(root, 'traccion.sqlite'), isDefaultPath: false, environment: 'test' };
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    try {
      const first = await saveTestExportFile(status, { fileName: 'datos.xlsx', buffer });
      const second = await saveTestExportFile(status, { fileName: 'datos.xlsx', buffer });
      expect(path.relative(root, first).split(path.sep)[0]).toBe('exportaciones');
      expect(first).not.toBe(second);
      expect([...await readFile(first)]).toEqual([1, 2, 3]);
      for (const fileName of ['../datos.xlsx', '..\\datos.xlsx', 'C:\\datos.xlsx', 'datos.exe', 'CON.csv']) {
        await expect(saveTestExportFile(status, { fileName, buffer })).rejects.toThrow();
      }
      await expect(saveTestExportFile({ ...status, environment: 'production' }, { fileName: 'datos.xlsx', buffer })).rejects.toThrow();
      await expect(saveTestExportFile({ ...status, ready: false }, { fileName: 'datos.xlsx', buffer })).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
