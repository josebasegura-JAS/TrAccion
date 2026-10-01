import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildInstalledExecutableNameFromVersion,
  buildInstalledExecutablePath,
  checkForAppUpdate,
  compareAppVersions,
  parseAppUpdateManifest,
} from './appUpdate.js';

describe('compareAppVersions', () => {
  it('compara correctamente versiones numéricas', () => {
    expect(compareAppVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareAppVersions('1.1.0', '1.0.99')).toBeGreaterThan(0);
    expect(compareAppVersions('1.0.5', '1.0.5')).toBe(0);
    expect(compareAppVersions('1.3.0', '1.2.999')).toBeGreaterThan(0);
    expect(compareAppVersions('2.0.0', '1.99.999')).toBeGreaterThan(0);
    expect(compareAppVersions('10.0.1', '2.99.999')).toBeGreaterThan(0);
  });

  it('rechaza versiones ambiguas o mal formadas', () => {
    expect(() => compareAppVersions('1.2', '1.2.136')).toThrow(/versiones no válidas/i);
    expect(() => compareAppVersions('1.2.beta', '1.2.136')).toThrow(/versiones no válidas/i);
  });
});

describe('nombre local estable del ejecutable', () => {
  it('usa major.minor y no la versión exacta del build', () => {
    expect(buildInstalledExecutableNameFromVersion('1.1.82')).toBe('Traccion 1.1.exe');
    expect(buildInstalledExecutableNameFromVersion('1.2.01')).toBe('Traccion 1.2.exe');
    expect(buildInstalledExecutableNameFromVersion('2.0.7')).toBe('Traccion 2.0.exe');
  });

  it('instala la nueva versión en la misma carpeta que el ejecutable arrancado', () => {
    const current = path.win32.join('C:\\', 'Users', 'usuario', 'Desktop', 'Traccion 1.1.exe');
    expect(path.win32.normalize(buildInstalledExecutablePath(current, '1.1.82') ?? '')).toBe(
      path.win32.join('C:\\', 'Users', 'usuario', 'Desktop', 'Traccion 1.1.exe'),
    );
  });

  it('rechaza versiones con formato no soportado', () => {
    expect(buildInstalledExecutableNameFromVersion('1.2')).toBeNull();
    expect(buildInstalledExecutablePath('C:\\TrAccion.exe', '1.2')).toBeNull();
  });
});

describe('parseAppUpdateManifest', () => {
  const sha = 'a'.repeat(64);

  it('lee version.json con .piz, SHA-256, notas y obligatoriedad', () => {
    expect(parseAppUpdateManifest(JSON.stringify({
      version: '1.1.79',
      file: 'Traccion 1.1.piz',
      sha256: sha,
      mandatory: true,
      notes: 'Correcciones críticas.',
    }))).toEqual({
      version: '1.1.79',
      fileName: 'Traccion 1.1.piz',
      sha256: sha,
      mandatory: true,
      notes: 'Correcciones críticas.',
    });
  });

  it('acepta paquetes de cualquier rama futura si el fichero corresponde al manifiesto', () => {
    expect(parseAppUpdateManifest(JSON.stringify({
      version: '2.0.1', file: 'Traccion 2.0.piz', sha256: sha,
    })).fileName).toBe('Traccion 2.0.piz');
    expect(parseAppUpdateManifest(JSON.stringify({
      version: '10.4.27', file: 'Traccion 10.4.piz', sha256: sha,
    })).fileName).toBe('Traccion 10.4.piz');
  });

  it('acepta también el nombre técnico legado Vx.y.zz para paquetes ya publicados', () => {
    const sha = 'a'.repeat(64);
    const result = parseAppUpdateManifest(JSON.stringify({ version: '1.2.03', file: 'TrAccion V1.2.03.piz', sha256: sha }));
    expect(result.fileName).toBe('TrAccion V1.2.03.piz');
  });

  it('exige JSON, SHA-256 y fichero .piz correspondiente a la versión', () => {
    expect(() => parseAppUpdateManifest('1.1.79')).toThrow(/JSON válido/i);
    expect(() => parseAppUpdateManifest(JSON.stringify({ version: '1.1.79', file: 'Traccion 1.1.piz' }))).toThrow(/SHA-256/i);
    expect(() => parseAppUpdateManifest(JSON.stringify({ version: '1.1.79', file: 'TrAccion V1.1.79.exe', sha256: sha }))).toThrow(/no es válido/i);
    expect(() => parseAppUpdateManifest(JSON.stringify({ version: '1.1.79', file: 'Traccion 1.2.piz', sha256: sha }))).toThrow(/no corresponde/i);
  });

  it('rechaza rutas y hashes inválidos', () => {
    expect(() => parseAppUpdateManifest(JSON.stringify({ version: '1.1.79', file: '..\\Traccion 1.1.piz', sha256: sha }))).toThrow(/no es válido/i);
    expect(() => parseAppUpdateManifest(JSON.stringify({ version: '1.1.79', file: 'Traccion 1.1.piz', sha256: '123' }))).toThrow(/SHA-256/i);
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
      version: '1.1.79', file: 'Traccion 1.1.piz', sha256: sha, mandatory: true, notes: 'Cambio importante',
    }), 'utf8');

    const result = await checkForAppUpdate('1.1.78', tempDir);
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('1.1.79');
    expect(result.mandatory).toBe(true);
    expect(result.notes).toBe('Cambio importante');
  });

  it('detecta un salto directo entre ramas, incluido 1.2 -> 2.0', async () => {
    writeFileSync(path.join(tempDir, 'version.json'), JSON.stringify({
      version: '2.0.1', file: 'Traccion 2.0.piz', sha256: sha,
    }), 'utf8');

    const result = await checkForAppUpdate('1.2.136', tempDir);
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('2.0.1');
  });

  it('no ofrece actualización cuando la versión es igual', async () => {
    writeFileSync(path.join(tempDir, 'version.json'), JSON.stringify({
      version: '1.1.78', file: 'Traccion 1.1.piz', sha256: sha,
    }), 'utf8');
    const result = await checkForAppUpdate('1.1.78', tempDir);
    expect(result.updateAvailable).toBe(false);
  });

  it('rechaza manifiestos antiguos o sin SHA-256', async () => {
    writeFileSync(path.join(tempDir, 'version.json'), JSON.stringify({
      version: '1.1.79', file: 'Traccion 1.1.piz',
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
