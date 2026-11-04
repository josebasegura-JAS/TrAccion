import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LOCK_DIRECTORY = '.traccion-tareas-excel.lockdir';
export const TASK_EXCEL_GENERATION_LOCK_DIRECTORY = '.traccion-tareas-excel-generation.lockdir';
const PUBLISHED_MARKER_NAME = '.traccion-tareas-excel-published.json';

export class TaskExcelLockBusyError extends Error {
  constructor() {
    super('Otro equipo está generando el Excel de Tareas.');
    this.name = 'TaskExcelLockBusyError';
  }
}

/** El marcador es una optimización, no sustituye la revalidación de SQLite. */
export async function hasPublishedTaskExcelSignature(directory: string, signature: string, fileName: string): Promise<boolean> {
  try {
    const raw = await readFile(path.join(directory, PUBLISHED_MARKER_NAME), 'utf8');
    const marker: unknown = JSON.parse(raw);
    if (!marker || typeof marker !== 'object') return false;
    const data = marker as { signature?: unknown; fileName?: unknown };
    if (data.signature !== signature || data.fileName !== fileName) return false;
    const target = await stat(path.join(directory, fileName));
    return target.isFile() && target.size > 0;
  } catch {
    return false;
  }
}

export async function markPublishedTaskExcelSignature(directory: string, signature: string, fileName: string): Promise<void> {
  const tempPath = path.join(directory, `.traccion-tareas-excel-marker-${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, JSON.stringify({ signature, fileName }), 'utf8');
    await rename(tempPath, path.join(directory, PUBLISHED_MARKER_NAME));
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}

const OWNER_FILE = 'owner.json';
const WAIT_MS = 12_000;
const RETRY_MS = 250;
const STALE_MS = 10 * 60_000;
const HEARTBEAT_MS = 5_000;

export interface TaskExcelPublishResult {
  published: boolean;
  stale: boolean;
}

/**
 * Bloqueo exclusivo entre instancias (mkdir atómico en el mismo directorio SMB).
 * Si no podemos comprobar la propiedad del bloqueo, NO publicamos ni liberamos
 * el bloqueo ajeno. Los bloqueos abandonados se recuperan tras 10 minutos sin
 * heartbeat, trasladándolos primero a un nombre único.
 */
export async function withSharedTaskExcelLock<T>(
  directory: string,
  operation: () => Promise<T>,
  options: {
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    waitMs?: number;
    staleMs?: number;
    lockDirectoryName?: string;
  } = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  const lockPath = path.join(directory, options.lockDirectoryName ?? LOCK_DIRECTORY);
  const ownerPath = path.join(lockPath, OWNER_FILE);
  const token = randomUUID();
  const start = now();
  let acquired = false;

  // Recuperar automáticamente un lock por mtime es inseguro: el equipo
  // propietario puede seguir activo y renovar el lease entre stat y rename.
  // Ante caducidad preferimos rechazar la publicación y conservar los datos.
  async function checkExistingLock(): Promise<void> {
    const info = await stat(lockPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (info && now() - info.mtimeMs >= (options.staleMs ?? STALE_MS)) {
      throw new Error('Bloqueo antiguo del Excel compartido: puede haber un equipo desconectado. No se ha reemplazado el archivo. Verifica que ningún equipo esté exportando antes de retirar manualmente el bloqueo.');
    }
  }

  while (!acquired) {
    try {
      await mkdir(lockPath);
      acquired = true;
      // Si falla la identificación tras crear el directorio, se conserva
      // el bloqueo para recuperación segura; nadie debe publicar a ciegas.
      await writeFile(ownerPath, token, { flag: 'wx' });
    } catch (error) {
      if (acquired || (error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await checkExistingLock();
      if (now() - start >= (options.waitMs ?? WAIT_MS)) {
        if (options.lockDirectoryName === TASK_EXCEL_GENERATION_LOCK_DIRECTORY) throw new TaskExcelLockBusyError();
        throw new Error('El Excel de tareas está siendo actualizado por otro equipo. No se ha reemplazado el archivo anterior.');
      }
      await sleep(RETRY_MS);
    }
  }

  let lost = false;
  let heartbeatRunning = false;
  const heartbeat = setInterval(() => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    void (async () => {
      try {
        const owner = await readFile(ownerPath, 'utf8');
        if (owner !== token) throw new Error('La propiedad del bloqueo ha cambiado.');
        const date = new Date();
        await utimes(lockPath, date, date);
      } catch {
        lost = true;
      } finally {
        heartbeatRunning = false;
      }
    })();
  }, HEARTBEAT_MS);

  const assertOwnership = async (): Promise<void> => {
    if (lost) throw new Error('Se perdió la conexión o el bloqueo del Excel compartido. No se publica el archivo.');
    const current = await readFile(ownerPath, 'utf8');
    if (current !== token) throw new Error('Otro equipo tiene el bloqueo del Excel. No se publica el archivo.');
  };

  try {
    await assertOwnership();
    const result = await operation();
    await assertOwnership();
    return result;
  } finally {
    clearInterval(heartbeat);
    try {
      if (await readFile(ownerPath, 'utf8') === token) {
        await rm(lockPath, { recursive: true });
      }
    } catch {
      // Ante un fallo SMB conservamos el bloqueo para recuperación por TTL.
    }
  }
}

/** Revalidar bajo el lock evita publicar un snapshot que ya quedó obsoleto. */
export async function publishTaskExcel(
  directory: string,
  tempPath: string,
  finalPath: string,
  isStillCurrent: () => Promise<boolean>,
  afterPublish: () => Promise<void>,
): Promise<TaskExcelPublishResult> {
  return withSharedTaskExcelLock(directory, async () => {
    if (!await isStillCurrent()) return { published: false, stale: true };
    // Origen y destino están en la misma carpeta: el cambio de nombre evita
    // copias parciales. Si Windows no permite reemplazar un Excel abierto,
    // se devuelve el error y el archivo anterior permanece intacto.
    await rename(tempPath, finalPath);
    await afterPublish();
    return { published: true, stale: false };
  });
}

/**
 * Firma estable del contenido realmente exportable, independiente del orden
 * SQL. Evita apoyarse en relojes de los equipos o en updated_at de un único
 * registro, que podrían no capturar cierres o bajas.
 */
export function taskExcelSnapshotSignature(records: readonly { value: string }[]): string {
  const hash = createHash('sha256');
  for (const value of records.map((record) => record.value).sort()) {
    hash.update(String(Buffer.byteLength(value)));
    hash.update(':');
    hash.update(value);
  }
  return hash.digest('hex');
}
