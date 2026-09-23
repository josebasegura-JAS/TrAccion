import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';

const UPDATE_MANIFEST_FILE_NAME = 'version.json';

export interface AppUpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  message: string | null;
  mandatory: boolean;
  notes: string | null;
}

export interface AppUpdateApplyResult {
  ok: boolean;
  message: string;
}

export interface AppUpdateManifest {
  version: string;
  fileName: string;
  sha256: string;
  mandatory: boolean;
  notes: string | null;
}

export function compareAppVersions(a: string, b: string): number {
  const partsA = a.trim().split('.').map((part) => Number.parseInt(part, 10) || 0);
  const partsB = b.trim().split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);

  for (let index = 0; index < length; index += 1) {
    const valueA = partsA[index] ?? 0;
    const valueB = partsB[index] ?? 0;
    if (valueA !== valueB) return valueA - valueB;
  }
  return 0;
}

function isPortableExecutable(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
}

function getPortableExecutablePath(): string | null {
  return process.env.PORTABLE_EXECUTABLE_FILE ?? null;
}

function buildPortableUpdateNameFromVersion(version: string): string | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  const [, major, minor, patch] = match;
  return `TrAccion V${major}.${minor}.${patch.padStart(2, '0')}.piz`;
}

function validateUpdateFileName(fileName: string, version: string): string {
  const normalized = fileName.trim();
  if (
    !normalized ||
    normalized.includes('/') ||
    normalized.includes('\\') ||
    path.basename(normalized) !== normalized ||
    !/^TrAccion V\d+\.\d+\.\d+\.piz$/i.test(normalized)
  ) {
    throw new Error('El nombre del fichero de actualización no es válido. Debe ser TrAccion Vx.y.zz.piz.');
  }

  const expected = buildPortableUpdateNameFromVersion(version);
  if (!expected || normalized.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`El fichero de actualización no corresponde a la versión ${version}.`);
  }
  return normalized;
}

export function parseAppUpdateManifest(raw: string): AppUpdateManifest {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('El manifiesto de versión está vacío.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('version.json no contiene JSON válido.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('version.json no tiene el formato esperado.');
  }

  const candidate = parsed as Record<string, unknown>;
  const version = typeof candidate.version === 'string' ? candidate.version.trim() : '';
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('El manifiesto no contiene una versión válida.');
  }

  const rawFileName = typeof candidate.file === 'string' ? candidate.file.trim() : '';
  if (!rawFileName) throw new Error('El manifiesto no contiene el fichero de actualización.');

  const rawSha = typeof candidate.sha256 === 'string' ? candidate.sha256.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{64}$/.test(rawSha)) {
    throw new Error('El manifiesto debe contener un SHA-256 válido.');
  }

  return {
    version,
    fileName: validateUpdateFileName(rawFileName, version),
    sha256: rawSha,
    mandatory: candidate.mandatory === true,
    notes: typeof candidate.notes === 'string' && candidate.notes.trim() ? candidate.notes.trim() : null,
  };
}

async function readUpdateManifest(updatesDirectoryPath: string): Promise<AppUpdateManifest> {
  return parseAppUpdateManifest(
    await readFile(path.join(updatesDirectoryPath, UPDATE_MANIFEST_FILE_NAME), 'utf8'),
  );
}

async function calculateSha256(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

async function verifySha256(filePath: string, expectedSha256: string): Promise<void> {
  const actual = await calculateSha256(filePath);
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error('La comprobación SHA-256 ha fallado. El fichero puede estar incompleto o haber sido modificado.');
  }
}

export async function checkForAppUpdate(
  currentVersion: string,
  updatesDirectoryPath: string | null,
): Promise<AppUpdateCheckResult> {
  const baseResult = {
    currentVersion,
    mandatory: false,
    notes: null as string | null,
  };

  if (!isPortableExecutable()) {
    return {
      ...baseResult,
      updateAvailable: false,
      latestVersion: null,
      message: 'La actualización automática solo está disponible en el ejecutable portable de Windows.',
    };
  }
  if (!updatesDirectoryPath) {
    return { ...baseResult, updateAvailable: false, latestVersion: null, message: null };
  }

  try {
    const manifest = await readUpdateManifest(updatesDirectoryPath);
    return {
      updateAvailable: compareAppVersions(manifest.version, currentVersion) > 0,
      currentVersion,
      latestVersion: manifest.version,
      message: null,
      mandatory: manifest.mandatory,
      notes: manifest.notes,
    };
  } catch (error) {
    return {
      ...baseResult,
      updateAvailable: false,
      latestVersion: null,
      message: `No se ha podido leer ${UPDATE_MANIFEST_FILE_NAME} en la carpeta de actualizaciones: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Copia el .piz (un portable .exe renombrado) a TEMP, verifica su SHA-256,
 * lo deja allí con extensión .exe y genera un .bat temporal. El .bat espera
 * a que TrAccion cierre, conserva una copia .previous.exe del ejecutable
 * anterior, instala la nueva versión y vuelve a abrirla.
 */
export async function applyAppUpdate(
  currentVersion: string,
  updatesDirectoryPath: string | null,
): Promise<AppUpdateApplyResult> {
  if (!isPortableExecutable()) {
    return { ok: false, message: 'La actualización automática solo está disponible en el ejecutable portable de Windows.' };
  }
  if (!updatesDirectoryPath) return { ok: false, message: 'No hay configurada ninguna carpeta de actualizaciones.' };

  const targetExePath = getPortableExecutablePath();
  if (!targetExePath) return { ok: false, message: 'No se ha podido determinar la ruta del ejecutable actual.' };

  let manifest: AppUpdateManifest;
  try {
    manifest = await readUpdateManifest(updatesDirectoryPath);
    if (compareAppVersions(manifest.version, currentVersion) <= 0) {
      return { ok: false, message: `La versión disponible (${manifest.version}) no es más reciente que la instalada (${currentVersion}).` };
    }
  } catch (error) {
    return { ok: false, message: `No se ha podido preparar la actualización: ${error instanceof Error ? error.message : String(error)}` };
  }

  const sourcePath = path.join(updatesDirectoryPath, manifest.fileName);
  const stagingDir = path.join(tmpdir(), 'traccion-update-staging');
  const stagedDownloadPath = path.join(stagingDir, manifest.fileName);
  const stagedExePath = path.join(stagingDir, 'TrAccion-nueva.exe');

  try {
    await rm(stagingDir, { recursive: true, force: true });
    await mkdir(stagingDir, { recursive: true });
    await copyFile(sourcePath, stagedDownloadPath);
    await verifySha256(stagedDownloadPath, manifest.sha256);
    await rename(stagedDownloadPath, stagedExePath);
  } catch (error) {
    return {
      ok: false,
      message: `No se ha podido copiar o verificar la nueva versión: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const scriptPath = path.join(stagingDir, 'traccion-apply-update.cmd');
  const previousExePath = `${targetExePath}.previous.exe`;
  const currentPid = process.pid;
  const batScript = [
    '@echo off',
    'setlocal',
    `set "TARGET=${targetExePath}"`,
    `set "SOURCE=${stagedExePath}"`,
    `set "PREVIOUS=${previousExePath}"`,
    `set "PID=${currentPid}"`,
    'set "ATTEMPTS=0"',
    ':waitloop',
    'tasklist /FI "PID eq %PID%" 2>NUL | find /I "%PID%" >NUL',
    'if not errorlevel 1 (',
    '  set /a ATTEMPTS+=1',
    '  if %ATTEMPTS% GEQ 120 goto :giveup',
    '  timeout /t 1 /nobreak >NUL',
    '  goto :waitloop',
    ')',
    'del /Q "%PREVIOUS%" >NUL 2>&1',
    'move /Y "%TARGET%" "%PREVIOUS%" >NUL',
    'if errorlevel 1 goto :giveup',
    'copy /Y "%SOURCE%" "%TARGET%" >NUL',
    'if errorlevel 1 goto :rollback',
    'start "" "%TARGET%"',
    'goto :cleanup',
    ':rollback',
    'move /Y "%PREVIOUS%" "%TARGET%" >NUL 2>&1',
    'start "" "%TARGET%"',
    'goto :cleanup',
    ':giveup',
    'rem No se ha podido completar la actualización; se conserva la versión actual.',
    ':cleanup',
    'del /Q "%SOURCE%" >NUL 2>&1',
    '(goto) 2>nul & del "%~f0"',
    '',
  ].join('\r\n');

  try {
    await writeFile(scriptPath, batScript, 'utf8');
    const child = spawn('cmd.exe', ['/c', scriptPath], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch (error) {
    return { ok: false, message: `No se ha podido iniciar el proceso de actualización: ${error instanceof Error ? error.message : String(error)}` };
  }

  return { ok: true, message: `Actualización a V${manifest.version} preparada. TrAccion se cerrará y volverá a abrir automáticamente.` };
}
