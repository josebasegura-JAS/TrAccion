import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
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
      // Windows puede resolver el directorio TEMP a un nombre largo distinto
      // del alias 8.3 devuelto por tmpdir(). Comparar ambos extremos reales.
      const canonicalRoot = await realpath(root);
      for (const destination of [first, second]) {
        const relative = path.relative(canonicalRoot, await realpath(destination));
        expect(relative.split(path.sep)).toEqual(['exportaciones', expect.stringMatching(/^manual-/), 'datos.xlsx']);
      }
      expect(first).not.toBe(second);
      expect([...await readFile(first)]).toEqual([1, 2, 3]);
      for (const fileName of ['../datos.xlsx', '..\\datos.xlsx', 'C:\\datos.xlsx', 'datos.exe', 'CON.csv', 'datos\u0000.xlsx', 'datos\u001f.xlsx']) {
        await expect(saveTestExportFile(status, { fileName, buffer })).rejects.toThrow();
      }
      await expect(saveTestExportFile({ ...status, environment: 'production' }, { fileName: 'datos.xlsx', buffer })).rejects.toThrow();
      await expect(saveTestExportFile({ ...status, ready: false }, { fileName: 'datos.xlsx', buffer })).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
