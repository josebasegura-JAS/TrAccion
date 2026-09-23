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
  const sha = 'a'.repeat(64);

  it('lee version.json con .piz, SHA-256, notas y obligatoriedad', () => {
    expect(parseAppUpdateManifest(JSON.stringify({
      version: '1.1.79',
      file: 'TrAccion V1.1.79.piz',
      sha256: sha,
      mandatory: true,
      notes: 'Correcciones críticas.',
    }))).toEqual({
      version: '1.1.79',
      fileName: 'TrAccion V1.1.79.piz',
      sha256: sha,
      mandatory: true,
      notes: 'Correcciones críticas.',
    });
  });

  it('exige JSON, SHA-256 y fichero .piz correspondiente a la versión', () => {
    expect(() => parseAppUpdateManifest('1.1.79')).toThrow(/JSON válido/i);
    expect(() => parseAppUpdateManifest(JSON.stringify({ version: '1.1.79', file: 'TrAccion V1.1.79.piz' }))).toThrow(/SHA-256/i);
    expect(() => parseAppUpdateManifest(JSON.stringify({ version: '1.1.79', file: 'TrAccion V1.1.79.exe', sha256: sha }))).toThrow(/no es válido/i);
    expect(() => parseAppUpdateManifest(JSON.stringify({ version: '1.1.79', file: 'TrAccion V1.1.80.piz', sha256: sha }))).toThrow(/no corresponde/i);
  });

  it('rechaza rutas y hashes inválidos', () => {
    expect(() => parseAppUpdateManifest(JSON.stringify({ version: '1.1.79', file: '..\\TrAccion V1.1.79.piz', sha256: sha }))).toThrow(/no es válido/i);
    expect(() => parseAppUpdateManifest(JSON.stringify({ version: '1.1.79', file: 'TrAccion V1.1.79.piz', sha256: '123' }))).toThrow(/SHA-256/i);
  });
});

describe('checkForAppUpdate', () => {
  const originalPortableExecutableFile = process.env.PORTABLE_EXECUTABLE_FILE;
  const sha = 'b'.repeat(64);
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
      version: '1.1.79', file: 'TrAccion V1.1.79.piz', sha256: sha, mandatory: true, notes: 'Cambio importante',
    }), 'utf8');

    const result = await checkForAppUpdate('1.1.78', tempDir);
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('1.1.79');
    expect(result.mandatory).toBe(true);
    expect(result.notes).toBe('Cambio importante');
  });

  it('no ofrece actualización cuando la versión es igual', async () => {
    writeFileSync(path.join(tempDir, 'version.json'), JSON.stringify({
      version: '1.1.78', file: 'TrAccion V1.1.78.piz', sha256: sha,
    }), 'utf8');
    const result = await checkForAppUpdate('1.1.78', tempDir);
    expect(result.updateAvailable).toBe(false);
  });

  it('rechaza manifiestos antiguos o sin SHA-256', async () => {
    writeFileSync(path.join(tempDir, 'version.json'), JSON.stringify({
      version: '1.1.79', file: 'TrAccion V1.1.79.piz',
    }), 'utf8');
    const result = await checkForAppUpdate('1.1.78', tempDir);
    expect(result.updateAvailable).toBe(false);
    expect(result.message).toContain('SHA-256');
  });

  it('informa de forma legible si no existe version.json', async () => {
    const result = await checkForAppUpdate('1.1.78', tempDir);
    expect(result.updateAvailable).toBe(false);
    expect(result.message).toContain('version.json');
  });
});
