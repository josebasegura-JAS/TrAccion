import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildInstalledExecutableNameFromVersion,
  buildInstalledExecutablePath,
  buildUpdateApplyScript,
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
    const current = path.join('Users', 'usuario', 'Desktop', 'Traccion 1.1.exe');
    expect(buildInstalledExecutablePath(current, '1.1.82')).toBe(
      path.join('Users', 'usuario', 'Desktop', 'Traccion 1.1.exe'),
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


describe('script de aplicación del actualizador', () => {
  it('genera un CMD con CRLF reales, una instrucción por línea y sin separadores escapados', () => {
    const script = buildUpdateApplyScript(
      'C:\\Apps\\Traccion 1.2.exe',
      'C:\\Apps\\Traccion 1.2.exe',
      'C:\\Temp\\attempt-test\\TrAccion-nueva.exe',
    );
    const lines = script.split('\r\n');
    expect(lines.length).toBeGreaterThan(40);
    expect(lines[0]).toBe('@echo off');
    expect(lines[1]).toBe('setlocal EnableExtensions DisableDelayedExpansion');
    expect(lines).toContain(':reserve_old');
    expect(lines).toContain(':publish');
    expect(lines).toContain(':restore_old');
    expect(lines).toContain(':cleanup');
    expect(lines[lines.length - 1]).toBe('');
    expect(script).not.toContain('\\r\\n');
    expect(script.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('instala una revisión dentro de la misma rama y relanza el destino', () => {
    const script = buildUpdateApplyScript(
      'C:\\Apps\\Traccion 1.2.exe',
      'C:\\Apps\\Traccion 1.2.exe',
      'C:\\Temp\\TrAccion-nueva.exe',
    );

    expect(script).toContain('set "CURRENT=C:\\Apps\\Traccion 1.2.exe"');
    expect(script).toContain('set "TARGET=C:\\Apps\\Traccion 1.2.exe"');
    expect(script).toContain('ren "%CURRENT%" "%%~nxF"');
    expect(script).toContain('ren "%PREVIOUS%" "%%~nxF"');
    expect(script).toContain('start "" "%TARGET%"');
  });

  it('permite un salto de rama sin eliminar el ejecutable anterior', () => {
    const script = buildUpdateApplyScript(
      'C:\\Apps\\Traccion 1.2.exe',
      'C:\\Apps\\Traccion 2.0.exe',
      'C:\\Temp\\TrAccion-nueva.exe',
    );

    expect(script).toContain('set "TARGET=C:\\Apps\\Traccion 2.0.exe"');
    expect(script).not.toContain('del /Q "%CURRENT%"');
    expect(script.indexOf(' /B "%SOURCE%" "%CANDIDATE%"')).toBeLessThan(script.indexOf('ren "%CANDIDATE%" "%%~nxF"'));
    expect(script).toContain(' /B "%SOURCE%" "%TARGET%"');
    expect(script).toContain('start "" "%TARGET%"');
  });

  it('si no consigue sustituir el ejecutable conserva y relanza la versión actual', () => {
    const script = buildUpdateApplyScript(
      'C:\\Apps\\Traccion 1.2.exe',
      'C:\\Apps\\Traccion 2.0.exe',
      'C:\\Temp\\TrAccion-nueva.exe',
    );

    expect(script).toContain('if %ATTEMPTS% GEQ 120 goto :discard_candidate');
    expect(script).toContain(':giveup');
    expect(script).toContain('if exist "%CURRENT%" start "" "%CURRENT%"');
  });
});


describe('seguridad del indicador de actualización', () => {
  it('el aplicador devuelve error si la ventana no puede confirmarse antes de cerrar la aplicación', async () => {
    const { applyAppUpdate } = await import('./appUpdate.js');
    const result = await applyAppUpdate('1.2.1', null);
    expect(result.ok).toBe(false);
  });
});

// Usar un directorio real del workspace en lugar del alias TEMP 8.3.
function createPublicationFixture(): string {
  return realpathSync.native(mkdtempSync(path.join(process.cwd(), 'traccion-update-fixture-')));
}

function runPublicationScript(staging: string): string {
  const cwd = realpathSync.native(staging);
  const scriptPath = path.join(cwd, 'apply.cmd');
  expect(readFileSync(scriptPath, 'utf8')).toContain('TRACCION_TEST_BATCH_ENTERED');
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'call', '.\\apply.cmd'], {
    cwd, timeout: 15000, windowsHide: true, encoding: 'utf8',
  });
  const output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n');
  expect(output, 'Script: ' + scriptPath + '\n' + output).toContain('TRACCION_TEST_BATCH_ENTERED');
  expect(result.status, output).toBe(0);
  return output;
}

describe('publicación reversible del ejecutable en Windows', () => {
  const windowsIt = process.platform === 'win32' ? it : it.skip;
  windowsIt.each([true, false])('conserva versión anterior y publica bytes exactos (misma rama: %s)', sameBranch => {
    const dir = createPublicationFixture();
    try {
      const staging = path.join(dir, 'attempt-test');
      mkdirSync(staging);
      const current = path.join(dir, 'Traccion 1.2.exe');
      const target = sameBranch ? current : path.join(dir, 'Traccion 2.0.exe');
      const source = path.join(staging, 'TrAccion-nueva.exe');
      writeFileSync(current, 'version anterior');
      writeFileSync(source, 'version nueva');
      // Ejecutar el script real de publicación, sin arrancar ficheros ficticios
      // ni borrar el propio script durante la prueba.
      const script = buildUpdateApplyScript(current, target, source)
        .replace('@echo off', '@echo on\r\necho TRACCION_TEST_BATCH_ENTERED')
        .replace(/ >NUL 2>&1/g, '')
        .replace('start "" "%TARGET%"', 'ver >NUL')
        .replace('if exist "%CURRENT%" start "" "%CURRENT%"', 'rem fallback')
        .replace('(goto) 2>nul & del "%~f0" & rd "%~dp0"', 'exit /b 0');
      const scriptPath = path.join(staging, 'apply.cmd');
      writeFileSync(scriptPath, script);
      const output = runPublicationScript(staging);
      expect(readdirSync(dir), output).toContain(path.basename(target));
      expect(readFileSync(target, 'utf8'), output).toBe('version nueva');
      const previous = sameBranch
        ? path.join(dir, readdirSync(dir).find(name => name.includes('.previous-'))!)
        : current;
      expect(readFileSync(previous, 'utf8')).toBe('version anterior');
      expect(readdirSync(dir).some(name => name.includes('.pending-'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  windowsIt('no sobrescribe un destino de otra rama que ya existe', () => {
    const dir = createPublicationFixture();
    try {
      const staging = path.join(dir, 'attempt-test');
      mkdirSync(staging);
      const current = path.join(dir, 'Traccion 1.2.exe');
      const target = path.join(dir, 'Traccion 2.0.exe');
      const source = path.join(staging, 'TrAccion-nueva.exe');
      writeFileSync(current, 'original');
      writeFileSync(target, 'destino existente');
      writeFileSync(source, 'nuevo');
      const script = buildUpdateApplyScript(current, target, source)
        .replace('@echo off', '@echo on\r\necho TRACCION_TEST_BATCH_ENTERED')
        .replace(/ >NUL 2>&1/g, '')
        .replace('start "" "%TARGET%"', 'ver >NUL')
        .replace('if exist "%CURRENT%" start "" "%CURRENT%"', 'rem fallback')
        .replace('(goto) 2>nul & del "%~f0" & rd "%~dp0"', 'exit /b 0');
      writeFileSync(path.join(staging, 'apply.cmd'), script);
      runPublicationScript(staging);
      expect(readFileSync(current, 'utf8')).toBe('original');
      expect(readFileSync(target, 'utf8')).toBe('destino existente');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
