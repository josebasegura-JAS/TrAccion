import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

const LOCK_DIRECTORY = '.traccion-tareas-excel.lockdir';
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
  } = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  const lockPath = path.join(directory, LOCK_DIRECTORY);
  const ownerPath = path.join(lockPath, OWNER_FILE);
  const token = randomUUID();
  const start = now();
  let acquired = false;

  async function recoverAbandonedLock(): Promise<void> {
    let metadata: Awaited<ReturnType<typeof stat>>;
    try {
      metadata = await stat(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (now() - metadata.mtimeMs < (options.staleMs ?? STALE_MS)) return;
    // Renombrar primero evita borrar inadvertidamente un bloqueo nuevo
    // si dos equipos intentan recuperar el mismo directorio.
    const abandonedPath = `${lockPath}.abandoned-${randomUUID()}`;
    try {
      // Confirmación inmediata; si otro proceso ha actualizado el heartbeat,
      // se considera activo y no se recupera.
      const latest = await stat(lockPath);
      if (now() - latest.mtimeMs < (options.staleMs ?? STALE_MS)) return;
      await rename(lockPath, abandonedPath);
    } catch (error) {
      if (['ENOENT', 'EEXIST', 'EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
      throw error;
    }
    await rm(abandonedPath, { recursive: true, force: true }).catch(() => undefined);
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
      await recoverAbandonedLock();
      if (now() - start >= (options.waitMs ?? WAIT_MS)) {
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
