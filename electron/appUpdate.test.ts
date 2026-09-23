import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkForAppUpdate, compareAppVersions, parseAppUpdateManifest } from './appUpdate.js';

describe('compareAppVersions', () => {
  it('compara correctamente versiones numéricas', () => {
    expect(compareAppVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareAppVersions('1.1.0', '1.0.99')).toBeGreaterThan(0);
    expect(compareAppVersions('1.0.5', '1.0.5')).toBe(0);
  });
});

describe('parseAppUpdateManifest', () => {
  it('lee version.json con .piz, SHA-256, notas y obligatoriedad', () => {
    const sha = 'a'.repeat(64);
    expect(parseAppUpdateManifest(JSON.stringify({
      version: '1.1.78',
      file: 'TrAccion V1.1.78.piz',
      sha256: sha,
      mandatory: true,
      notes: 'Correcciones críticas.',
    }))).toEqual({
      version: '1.1.78',
      fileName: 'TrAccion V1.1.78.piz',
      sha256: sha,
      mandatory: true,
      notes: 'Correcciones críticas.',
    });
  });

  it('acepta JSON sin nombre de fichero y lo deduce de la versión', () => {
    expect(parseAppUpdateManifest('{"version":"1.1.8"}').fileName).toBe('TrAccion V1.1.08.piz');
  });

  it('mantiene compatibilidad con el version.txt anterior', () => {
    expect(parseAppUpdateManifest('version=1.1.8\nfile=TrAccion V1.1.08.exe\n')).toEqual({
      version: '1.1.8',
      fileName: 'TrAccion V1.1.08.exe',
      sha256: null,
      mandatory: false,
      notes: null,
    });
  });

  it('rechaza rutas y hashes inválidos', () => {
    expect(() => parseAppUpdateManifest('{"version":"1.1.8","file":"..\\\\mal.piz"}')).toThrow(/no es válido/i);
    expect(() => parseAppUpdateManifest('{"version":"1.1.8","sha256":"123"}')).toThrow(/SHA-256/i);
  });
});

describe('checkForAppUpdate', () => {
  const originalPortableExecutableFile = process.env.PORTABLE_EXECUTABLE_FILE;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'traccion-update-test-'));
    process.env.PORTABLE_EXECUTABLE_FILE = path.join(tempDir, 'TrAccion.exe');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (originalPortableExecutableFile === undefined) delete process.env.PORTABLE_EXECUTABLE_FILE;
    else process.env.PORTABLE_EXECUTABLE_FILE = originalPortableExecutableFile;
  });

  it('detecta una versión JSON más nueva y devuelve sus metadatos', async () => {
    writeFileSync(path.join(tempDir, 'version.json'), JSON.stringify({
      version: '1.1.79', file: 'TrAccion.piz', mandatory: true, notes: 'Cambio importante',
    }), 'utf8');

    const result = await checkForAppUpdate('1.1.78', tempDir);
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('1.1.79');
    expect(result.mandatory).toBe(true);
    expect(result.notes).toBe('Cambio importante');
  });

  it('no ofrece actualización cuando la versión es igual', async () => {
    writeFileSync(path.join(tempDir, 'version.json'), '{"version":"1.1.78","file":"TrAccion.piz"}', 'utf8');
    const result = await checkForAppUpdate('1.1.78', tempDir);
    expect(result.updateAvailable).toBe(false);
  });

  it('usa version.txt como compatibilidad si no existe version.json', async () => {
    writeFileSync(path.join(tempDir, 'version.txt'), '1.1.79\n', 'utf8');
    const result = await checkForAppUpdate('1.1.78', tempDir);
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('1.1.79');
  });

  it('informa de forma legible si no existe ningún manifiesto', async () => {
    const result = await checkForAppUpdate('1.1.78', tempDir);
    expect(result.updateAvailable).toBe(false);
    expect(result.message).toContain('version.json');
  });
});
