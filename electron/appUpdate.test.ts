import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkForAppUpdate, compareAppVersions } from './appUpdate.js';

describe('compareAppVersions', () => {
  it('considera mayor una versión con un patch numérico más alto, incluso con distinto número de dígitos', () => {
    expect(compareAppVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareAppVersions('1.0.9', '1.0.10')).toBeLessThan(0);
  });

  it('compara primero por major, luego minor, luego patch', () => {
    expect(compareAppVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareAppVersions('1.1.0', '1.0.99')).toBeGreaterThan(0);
    expect(compareAppVersions('1.0.5', '1.0.5')).toBe(0);
  });

  it('trata las partes que faltan o no son numéricas como 0', () => {
    expect(compareAppVersions('1.0', '1.0.0')).toBe(0);
    expect(compareAppVersions('1.0.x', '1.0.0')).toBe(0);
    expect(compareAppVersions('', '0.0.0')).toBe(0);
  });
});

describe('checkForAppUpdate', () => {
  const originalPortableExecutableFile = process.env.PORTABLE_EXECUTABLE_FILE;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'traccion-update-test-'));
    // Simula estar en el ejecutable portable real: la actualización
    // automática no hace nada si no se detecta este entorno.
    process.env.PORTABLE_EXECUTABLE_FILE = path.join(tempDir, 'TrAccion.exe');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalPortableExecutableFile === undefined) {
      delete process.env.PORTABLE_EXECUTABLE_FILE;
    } else {
      process.env.PORTABLE_EXECUTABLE_FILE = originalPortableExecutableFile;
    }
  });

  it('no ofrece actualización si no hay carpeta de actualizaciones configurada', async () => {
    const result = await checkForAppUpdate('1.0.5', null);

    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(result.message).toBeNull();
  });

  it('no ofrece actualización si no se detecta el ejecutable portable real', async () => {
    delete process.env.PORTABLE_EXECUTABLE_FILE;
    writeFileSync(path.join(tempDir, 'version.txt'), '9.9.9\n', 'utf8');

    const result = await checkForAppUpdate('1.0.5', tempDir);

    expect(result.updateAvailable).toBe(false);
    expect(result.message).toContain('ejecutable portable');
  });

  it('ofrece actualización cuando version.txt tiene una versión más nueva', async () => {
    writeFileSync(path.join(tempDir, 'version.txt'), '1.0.9\n', 'utf8');

    const result = await checkForAppUpdate('1.0.5', tempDir);

    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('1.0.9');
    expect(result.currentVersion).toBe('1.0.5');
    expect(result.message).toBeNull();
  });

  it('no ofrece actualización cuando version.txt es igual o anterior a la actual', async () => {
    writeFileSync(path.join(tempDir, 'version.txt'), '1.0.5\n', 'utf8');

    const result = await checkForAppUpdate('1.0.5', tempDir);

    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBe('1.0.5');
  });

  it('informa con un mensaje legible si no se puede leer version.txt (carpeta inaccesible o sin manifiesto)', async () => {
    const inaccessibleDir = path.join(tempDir, 'no-existe');

    const result = await checkForAppUpdate('1.0.5', inaccessibleDir);

    expect(result.updateAvailable).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(result.message).toContain('version.txt');
  });

  it('informa con un mensaje legible si version.txt está vacío', async () => {
    writeFileSync(path.join(tempDir, 'version.txt'), '   \n', 'utf8');

    const result = await checkForAppUpdate('1.0.5', tempDir);

    expect(result.updateAvailable).toBe(false);
    expect(result.message).toContain('version.txt');
  });
});
