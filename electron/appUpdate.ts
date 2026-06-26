import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';

const UPDATE_MANIFEST_FILE_NAME = 'version.txt';

export interface AppUpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  /** Versión encontrada en la carpeta de actualizaciones, si se pudo leer. */
  latestVersion: string | null;
  /** Motivo legible si no se ha podido comprobar (carpeta no configurada, no
   * accesible, manifiesto ilegible, etc.). null si la comprobación fue bien
   * (haya o no actualización disponible). */
  message: string | null;
}

export interface AppUpdateApplyResult {
  ok: boolean;
  message: string;
}

/**
 * Compara dos versiones "X.Y.Z" por partes numéricas, no como texto, para
 * que "1.0.9" se entienda como anterior a "1.0.10". Devuelve >0 si `a` es
 * más nueva que `b`, <0 si es más antigua, 0 si son iguales. Las partes que
 * falten o no sean numéricas se tratan como 0.
 */
export function compareAppVersions(a: string, b: string): number {
  const partsA = a.trim().split('.').map((part) => Number.parseInt(part, 10) || 0);
  const partsB = b.trim().split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);

  for (let index = 0; index < length; index += 1) {
    const valueA = partsA[index] ?? 0;
    const valueB = partsB[index] ?? 0;
    if (valueA !== valueB) {
      return valueA - valueB;
    }
  }

  return 0;
}

function isPortableExecutable(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
}

/**
 * Ruta del .exe que el usuario realmente ejecuta. Solo está disponible en
 * el build portable real (electron-builder la define antes de lanzar el
 * runtime de Electron); en desarrollo o en otros targets no existe, y la
 * actualización automática no tiene sentido ahí.
 */
function getPortableExecutablePath(): string | null {
  return process.env.PORTABLE_EXECUTABLE_FILE ?? null;
}

function findExeInDirectory(entries: string[]): string | null {
  const exe = entries.find((entry) => entry.toLowerCase().endsWith('.exe'));
  return exe ?? null;
}

export async function checkForAppUpdate(
  currentVersion: string,
  updatesDirectoryPath: string | null,
): Promise<AppUpdateCheckResult> {
  if (!isPortableExecutable()) {
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      message: 'La actualización automática solo está disponible en el ejecutable portable de Windows.',
    };
  }

  if (!updatesDirectoryPath) {
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      message: null,
    };
  }

  const manifestPath = path.join(updatesDirectoryPath, UPDATE_MANIFEST_FILE_NAME);

  let latestVersion: string;
  try {
    const raw = await readFile(manifestPath, 'utf8');
    latestVersion = raw.trim();
    if (!latestVersion) {
      throw new Error('El manifiesto de versión está vacío.');
    }
  } catch (error) {
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      message: `No se ha podido leer ${UPDATE_MANIFEST_FILE_NAME} en la carpeta de actualizaciones: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const updateAvailable = compareAppVersions(latestVersion, currentVersion) > 0;

  return {
    updateAvailable,
    currentVersion,
    latestVersion,
    message: null,
  };
}

/**
 * Copia el .exe nuevo a una carpeta temporal local, genera un script .bat
 * que espera a que esta instancia se cierre del todo, sustituye el .exe
 * original por el nuevo, relanza la app desde ahí y se autoborra; lanza ese
 * script en segundo plano (detached) y devuelve sin esperar a que termine.
 * Quien llama a esta función debe cerrar la app (app.quit()) justo después,
 * para que el cierre ordenado habitual (copia de seguridad de SQLite
 * incluida) se ejecute antes de que el .bat intente sustituir el .exe.
 */
export async function applyAppUpdate(updatesDirectoryPath: string | null): Promise<AppUpdateApplyResult> {
  if (!isPortableExecutable()) {
    return {
      ok: false,
      message: 'La actualización automática solo está disponible en el ejecutable portable de Windows.',
    };
  }

  if (!updatesDirectoryPath) {
    return { ok: false, message: 'No hay configurada ninguna carpeta de actualizaciones.' };
  }

  const targetExePath = getPortableExecutablePath();
  if (!targetExePath) {
    return {
      ok: false,
      message: 'No se ha podido determinar la ruta del ejecutable actual.',
    };
  }

  let newExeFileName: string;
  try {
    const entries = await readdir(updatesDirectoryPath);
    const found = findExeInDirectory(entries);
    if (!found) {
      return {
        ok: false,
        message: `No se ha encontrado ningún .exe en la carpeta de actualizaciones (${updatesDirectoryPath}).`,
      };
    }
    newExeFileName = found;
  } catch (error) {
    return {
      ok: false,
      message: `No se ha podido leer la carpeta de actualizaciones: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const sourceExePath = path.join(updatesDirectoryPath, newExeFileName);
  const stagingDir = path.join(tmpdir(), 'traccion-update-staging');
  const stagedExePath = path.join(stagingDir, newExeFileName);

  try {
    await mkdir(stagingDir, { recursive: true });
    await copyFile(sourceExePath, stagedExePath);
  } catch (error) {
    return {
      ok: false,
      message: `No se ha podido copiar el ejecutable nuevo a una carpeta temporal: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const scriptPath = path.join(stagingDir, 'traccion-apply-update.bat');
  const currentPid = process.pid;

  // El bucle de espera comprueba cada 1s si el PID actual sigue vivo
  // (tasklist), con un tope de ~120s. Una vez muerto, copia el .exe nuevo
  // sobre el original, lo relanza, y se autoborra (start "" para no dejar
  // una ventana de consola colgada).
  const batScript = [
    '@echo off',
    'setlocal',
    `set "TARGET=${targetExePath}"`,
    `set "SOURCE=${stagedExePath}"`,
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
    'copy /Y "%SOURCE%" "%TARGET%" >NUL',
    'if errorlevel 1 goto :giveup',
    'start "" "%TARGET%"',
    'goto :cleanup',
    ':giveup',
    'rem No se ha podido completar la actualizacion; el ejecutable original no se ha tocado o el proceso no llego a cerrarse a tiempo.',
    ':cleanup',
    'del "%SOURCE%" >NUL 2>&1',
    '(goto) 2>nul & del "%~f0"',
    '',
  ].join('\r\n');

  try {
    await writeFile(scriptPath, batScript, 'utf8');
  } catch (error) {
    return {
      ok: false,
      message: `No se ha podido preparar el script de actualización: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  try {
    const child = spawn('cmd.exe', ['/c', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch (error) {
    return {
      ok: false,
      message: `No se ha podido iniciar el proceso de actualización: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  return {
    ok: true,
    message: 'Actualización en curso: la aplicación se cerrará y se reabrirá con la nueva versión.',
  };
}
