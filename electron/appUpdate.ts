import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeOtherLocalInstancesForUpdate } from './localUpdateInstances.js';
import path from 'node:path';
import { getTraccionEnvironment } from './persistence/traccionEnvironment.js';
import { tmpdir } from 'node:os';

const UPDATE_MANIFEST_FILE_NAME = 'version.json';
let updateInProgress = false;

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

function parseAppVersion(version: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareAppVersions(a: string, b: string): number {
  const partsA = parseAppVersion(a);
  const partsB = parseAppVersion(b);
  if (!partsA || !partsB) {
    throw new Error(`No se pueden comparar versiones no válidas: "${a}" y "${b}".`);
  }

  for (let index = 0; index < 3; index += 1) {
    if (partsA[index] !== partsB[index]) return partsA[index] - partsB[index];
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
  const [, major, minor] = match;
  // El nombre publicado permanece estable durante toda la rama MAJOR.MINOR.
  // La revisión exacta MAJOR.MINOR.PATCH vive únicamente en version.json.
  return `Traccion ${major}.${minor}.piz`;
}

function buildLegacyPortableUpdateNameFromVersion(version: string): string | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  const [, major, minor, patch] = match;
  return `TrAccion V${major}.${minor}.${patch.padStart(2, '0')}.piz`;
}


export function buildInstalledExecutableNameFromVersion(version: string): string | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  const [, major, minor] = match;
  return `Traccion ${major}.${minor}.exe`;
}

export function buildInstalledExecutablePath(currentExecutablePath: string, version: string): string | null {
  const fileName = buildInstalledExecutableNameFromVersion(version);
  if (!fileName) return null;
  return path.join(path.dirname(currentExecutablePath), fileName);
}

/**
 * Genera el script de sustitución fuera del proceso Electron. Se mantiene como
 * función pura para poder probar los saltos de rama y, sobre todo, la ruta de
 * recuperación si Windows no permite reemplazar el ejecutable nuevo.
 */
export function buildUpdateApplyScript(
  currentExePath: string,
  targetExePath: string,
  stagedExePath: string,
): string {
  // No se sobrescribe el EXE activo con una copia parcial. El candidato y
  // la reserva están en el mismo directorio que el destino (rename local).
  const attempt = path.basename(path.dirname(stagedExePath)).replace(/[^a-zA-Z0-9-]/g, '_');
  const escape = (value: string) => {
    if (/["\r\n]/.test(value)) throw new Error('Ruta de actualización no válida.');
    return value.replace(/%/g, '%%');
  };
  return [
    '@echo off',
    'setlocal EnableExtensions DisableDelayedExpansion',
    `set "CURRENT=${escape(currentExePath)}"`,
    `set "TARGET=${escape(targetExePath)}"`,
    `set "SOURCE=${escape(stagedExePath)}"`,
    `set "CANDIDATE=%TARGET%.pending-${attempt}"`,
    `set "PREVIOUS=%CURRENT%.previous-${attempt}.exe"`,
    'set /a ATTEMPTS=0',
    'if exist "%CANDIDATE%" goto :giveup',
    'if exist "%PREVIOUS%" goto :giveup',
    'if /I "%CURRENT%"=="%TARGET%" goto :copy_new',
    'if exist "%TARGET%" goto :giveup',
    ':copy_new',
    'copy /B /Y "%SOURCE%" "%CANDIDATE%" >NUL 2>&1',
    'if errorlevel 1 goto :discard_candidate',
    '"%SystemRoot%\\System32\\fc.exe" /B "%SOURCE%" "%CANDIDATE%" >NUL 2>&1',
    'if errorlevel 1 goto :discard_candidate',
    'if /I not "%CURRENT%"=="%TARGET%" goto :publish',
    ':reserve_old',
    'set /a ATTEMPTS+=1',
    'for %%F in ("%PREVIOUS%") do ren "%CURRENT%" "%%~nxF" >NUL 2>&1',
    'if not errorlevel 1 goto :publish',
    'if %ATTEMPTS% GEQ 120 goto :discard_candidate',
    'timeout /t 1 /nobreak >NUL',
    'goto :reserve_old',
    ':publish',
    'if exist "%TARGET%" goto :restore_old',
    'for %%F in ("%TARGET%") do ren "%CANDIDATE%" "%%~nxF" >NUL 2>&1',
    'if errorlevel 1 goto :restore_old',
    '"%SystemRoot%\\System32\\fc.exe" /B "%SOURCE%" "%TARGET%" >NUL 2>&1',
    'if errorlevel 1 goto :invalid_target',
    'start "" "%TARGET%"',
    'if errorlevel 1 goto :invalid_target',
    'rem Conservar la version anterior para recuperacion manual; no asumir que START confirma arranque.',
    'goto :cleanup',
    ':invalid_target',
    'del /Q "%TARGET%" >NUL 2>&1',
    ':restore_old',
    'if /I not "%CURRENT%"=="%TARGET%" goto :discard_candidate',
    'if not exist "%PREVIOUS%" goto :discard_candidate',
    'if exist "%CURRENT%" goto :keep_reserve',
    'for %%F in ("%CURRENT%") do ren "%PREVIOUS%" "%%~nxF" >NUL 2>&1',
    'if errorlevel 1 goto :keep_reserve',
    ':discard_candidate',
    'del /Q "%CANDIDATE%" >NUL 2>&1',
    ':giveup',
    'if exist "%CURRENT%" start "" "%CURRENT%"',
    'goto :cleanup',
    ':keep_reserve',
    'rem No borrar la reserva ni ejecutar una version de estado incierto.',
    ':cleanup',
    'del /Q "%SOURCE%" >NUL 2>&1',
    '(goto) 2>nul & del "%~f0" & rd "%~dp0"',
    '',
  ].join('\\r\\n');
}

function validateUpdateFileName(fileName: string, version: string): string {
  const normalized = fileName.trim();
  if (
    !normalized
    || normalized.includes('/')
    || normalized.includes('\\')
    || path.basename(normalized) !== normalized
    || path.extname(normalized).toLowerCase() !== '.piz'
  ) {
    throw new Error('El nombre del fichero de actualización no es válido. Debe ser Traccion x.y.piz.');
  }

  // El nombre se valida contra la rama MAJOR.MINOR declarada por el propio manifiesto.
  // Así una instalación 1.2 puede aceptar directamente 1.3, 2.0, 3.1, etc. sin conocerlas de antemano.
  // El formato Vx.y.zz se conserva únicamente para paquetes antiguos ya publicados.
  const accepted = [
    buildPortableUpdateNameFromVersion(version),
    buildLegacyPortableUpdateNameFromVersion(version),
  ].filter((value): value is string => Boolean(value));

  if (!accepted.some((expected) => normalized.toLowerCase() === expected.toLowerCase())) {
    throw new Error(`El fichero de actualización no corresponde a la versión ${version}. Formato esperado: Traccion x.y.piz.`);
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
  if (getTraccionEnvironment() === 'test') {
    return { updateAvailable: false, currentVersion, latestVersion: null, mandatory: false,
      notes: null, message: 'Las actualizaciones automáticas están desactivadas en el entorno PRUEBAS.' };
  }
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
 * Copia el .piz a TEMP, verifica su SHA-256 y genera un .cmd temporal.
 * La instalación local usa un nombre estable derivado de la rama MAJOR.MINOR
 * declarada por version.json (por ejemplo, "Traccion 1.2.exe", "Traccion 1.3.exe"
 * o "Traccion 2.0.exe"). El manifiesto conserva la versión técnica exacta.
 * El actualizador no presupone ninguna rama concreta y admite saltos directos entre ramas.
 */
export async function applyAppUpdate(
  currentVersion: string,
  updatesDirectoryPath: string | null,
  confirmBeforeLaunch: () => Promise<boolean> = async () => true,
): Promise<AppUpdateApplyResult> {
  if (updateInProgress) return { ok: false, message: 'Ya hay una actualización en preparación.' };
  updateInProgress = true;
  let launched = false;
  let stagingDir: string | null = null;
  try {
    const result = await prepareAppUpdate(currentVersion, updatesDirectoryPath, confirmBeforeLaunch, (directory) => { stagingDir = directory; });
    launched = result.ok;
    return result;
  } finally {
    if (!launched) {
      if (stagingDir) await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
      updateInProgress = false;
    }
  }
}

async function prepareAppUpdate(
  currentVersion: string,
  updatesDirectoryPath: string | null,
  confirmBeforeLaunch: () => Promise<boolean>,
  registerStaging: (directory: string) => void,
): Promise<AppUpdateApplyResult> {
  if (getTraccionEnvironment() === 'test') {
    return { ok: false, message: 'Las actualizaciones automáticas están desactivadas en el entorno PRUEBAS.' };
  }
  if (!isPortableExecutable()) {
    return { ok: false, message: 'La actualización automática solo está disponible en el ejecutable portable de Windows.' };
  }
  if (!updatesDirectoryPath) return { ok: false, message: 'No hay configurada ninguna carpeta de actualizaciones.' };

  const currentExePath = getPortableExecutablePath();
  if (!currentExePath) return { ok: false, message: 'No se ha podido determinar la ruta del ejecutable actual.' };

  let manifest: AppUpdateManifest;
  try {
    manifest = await readUpdateManifest(updatesDirectoryPath);
    if (compareAppVersions(manifest.version, currentVersion) <= 0) {
      return { ok: false, message: `La versión disponible (${manifest.version}) no es más reciente que la instalada (${currentVersion}).` };
    }
  } catch (error) {
    return { ok: false, message: `No se ha podido preparar la actualización: ${error instanceof Error ? error.message : String(error)}` };
  }

  const targetExePath = buildInstalledExecutablePath(currentExePath, manifest.version);
  if (!targetExePath) {
    return { ok: false, message: `No se ha podido calcular el nombre local para la versión ${manifest.version}.` };
  }

  const sourcePath = path.join(updatesDirectoryPath, manifest.fileName);
  let stagingDir: string;
  let stagedExePath: string;
  try {
    const stagingRoot = path.join(tmpdir(), 'traccion-update-staging');
    await mkdir(stagingRoot, { recursive: true });
    stagingDir = await mkdtemp(path.join(stagingRoot, 'attempt-'));
    registerStaging(stagingDir);
    const stagedDownloadPath = path.join(stagingDir, manifest.fileName);
    stagedExePath = path.join(stagingDir, 'TrAccion-nueva.exe');
    await copyFile(sourcePath, stagedDownloadPath);
    await verifySha256(stagedDownloadPath, manifest.sha256);
    await rename(stagedDownloadPath, stagedExePath);
  } catch (error) {
    return {
      ok: false,
      message: `No se ha podido copiar o verificar la nueva versión: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // No lanzar el sustituidor mientras otro proceso local mantenga abierto
  // el mismo EXE. Todos deben confirmar un cierre seguro y terminar su
  // rutina habitual de liberación de SQLite antes de continuar.
  let peersClosed: { ok: boolean; message: string };
  try {
    peersClosed = await closeOtherLocalInstancesForUpdate();
  } catch (error) {
    return { ok: false, message: `No se ha podido coordinar el cierre local: ${String(error)}` };
  }
  if (!peersClosed.ok) return peersClosed;

  const scriptPath = path.join(stagingDir, 'traccion-apply-update.cmd');
  // Restaurado el actualizador portable probado: sin dependencias de PowerShell.
  // El cierre ordenado y su indicador Electron los gestiona main.ts.
  try {
    const batScript = buildUpdateApplyScript(currentExePath, targetExePath, stagedExePath);
    await writeFile(scriptPath, batScript, 'utf8');
    if (!(await confirmBeforeLaunch())) {
      return { ok: false, message: 'Actualización cancelada: hay cambios sin guardar o no se puede confirmar el cierre.' };
    }
    const child = spawn('cmd.exe', ['/d', '/c', 'traccion-apply-update.cmd'], { cwd: stagingDir, detached: true, stdio: 'ignore', windowsHide: true });
    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.once('spawn', resolve);
    });
    child.unref();
  } catch (error) {
    return { ok: false, message: `No se ha podido iniciar el proceso de actualización: ${error instanceof Error ? error.message : String(error)}` };
  }

  return {
    ok: true,
    message: `Actualización a V${manifest.version} preparada. TrAcción se cerrará, sustituirá el ejecutable anterior y volverá a abrir automáticamente.`,
  };
}
