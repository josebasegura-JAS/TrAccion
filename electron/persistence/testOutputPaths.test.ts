import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { mkdtemp, mkdir, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { assertTestOutputDirectory, resolveTestOutputDirectory, testBackupRoot, testOutputRoot } from './testOutputPaths.js';

describe('rutas de salida de PRUEBAS', () => {
  const root = path.resolve('test-db');
  const status = { ready: true, phase: 'active', isDefaultPath: false, environment: 'test', path: path.join(root, 'traccion.sqlite') };
  it('solo admite una base test activa', () => {
    expect(testOutputRoot(status)).toBe(root);
    expect(() => testOutputRoot({ ...status, environment: 'production' })).toThrow();
    expect(() => testOutputRoot({ ...status, ready: false })).toThrow();
    expect(() => testOutputRoot({ ...status, isDefaultPath: true })).toThrow();
  });
  it('separa los respaldos de perfiles distintos dentro de la base', () => {
    const a = testBackupRoot(status, 'profile-a');
    const b = testBackupRoot(status, 'profile-b');
    expect(path.dirname(a)).toBe(path.join(root, 'backups-pruebas'));
    expect(a).not.toBe(b);
  });
  it('rechaza una ruta de producción incluso si existe y contiene Excel', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'traccion-output-boundary-'));
    try {
      const test = path.join(root, 'test');
      const production = path.join(root, 'production');
      await mkdir(test);
      await mkdir(production);
      const active = { ...status, path: path.join(test, 'traccion.sqlite') };
      const target = await resolveTestOutputDirectory(active, 'excel', 'operativos');
      await expect(assertTestOutputDirectory(active, target, 'excel', 'operativos')).resolves.toBeUndefined();
      await expect(assertTestOutputDirectory(active, production, 'excel', 'operativos')).rejects.toThrow();
      await expect(assertTestOutputDirectory({ ...active, ready: false }, target, 'excel', 'operativos')).rejects.toThrow();
      const external = await realpath(production);
      await symlink(external, path.join(test, 'desvio'), process.platform === 'win32' ? 'junction' : 'dir');
      await expect(resolveTestOutputDirectory(active, 'desvio')).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

});
