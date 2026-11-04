import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RETRY_MS = 250;
const WAIT_MS = 10_000;
const HEARTBEAT_MS = 5_000;
const STALE_MS = 10 * 60_000;
const BACKUP_SUFFIX = '.traccion-backup-';

/**
 * Exclusión mutua por carpeta SMB, no por proceso. No se publica cuando
 * falla una comprobación de propiedad. El proceso que deja un lock tras un
 * corte de conexión no lo borra si ya pertenece a otro equipo.
 */
export async function withSharedSummaryWordLock<T>(
  directory: string,
  kind: 'comite' | 'paritaria',
  operation: (assertOwned: () => Promise<void>) => Promise<T>,
  options: { waitMs?: number; staleMs?: number } = {},
): Promise<T> {
  const lockPath = path.join(directory, `.traccion-${kind}-summary.lockdir`);
  const ownerPath = path.join(lockPath, 'owner');
  const token = randomUUID();
  const started = Date.now();

  async function recoverStaleLock(): Promise<void> {
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    if (Date.now() - info.mtimeMs < (options.staleMs ?? STALE_MS)) return;
    const oldPath = `${lockPath}.abandoned-${randomUUID()}`;
    try {
      const latest = await stat(lockPath);
      if (latest.mtimeMs !== info.mtimeMs || Date.now() - latest.mtimeMs < (options.staleMs ?? STALE_MS)) return;
      await rename(lockPath, oldPath);
      // Si un proceso antiguo recobra red, comprobará que ha perdido su
      // archivo de propiedad antes de poder publicar.
      await rm(oldPath, { recursive: true, force: true }).catch(() => undefined);
    } catch (error) {
      if (['ENOENT', 'EEXIST', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
      throw error;
    }
  }

  for (;;) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await recoverStaleLock();
      if (Date.now() - started >= (options.waitMs ?? WAIT_MS)) {
        throw new Error(`Otro equipo está actualizando el resumen de ${kind === 'comite' ? 'Comité' : 'Paritaria'}. No se ha modificado el Word.`);
      }
      await new Promise<void>((resolve) => { setTimeout(resolve, RETRY_MS); });
    }
  }

  // Si falla la creación del identificador, conservar el lock para su
  // recuperación (nunca permitir una publicación sin propietario).
  await writeFile(ownerPath, token, { flag: 'wx' });

  let heartbeatFailed = false;
  let inFlightHeartbeat: Promise<void> | null = null;
  const assertOwned = async (): Promise<void> => {
    if (heartbeatFailed) throw new Error('Se perdió la conexión mientras se actualizaba el resumen Word. No se publica.');
    const actual = await readFile(ownerPath, 'utf8');
    if (actual !== token) throw new Error('El bloqueo del resumen Word pertenece a otro equipo. No se publica.');
  };
  const heartbeat = setInterval(() => {
    if (inFlightHeartbeat) return;
    inFlightHeartbeat = (async () => {
      try {
        await assertOwned();
        const now = new Date();
        await utimes(lockPath, now, now);
      } catch {
        heartbeatFailed = true;
      }
    })().finally(() => { inFlightHeartbeat = null; });
  }, HEARTBEAT_MS);

  try {
    await assertOwned();
    const result = await operation(assertOwned);
    await assertOwned();
    return result;
  } finally {
    clearInterval(heartbeat);
    if (inFlightHeartbeat) await inFlightHeartbeat;
    try {
      if (await readFile(ownerPath, 'utf8') === token) {
        await rm(lockPath, { recursive: true });
      }
    } catch {
      // Un fallo de red debe conservar el lock para recuperación por TTL.
    }
  }
}

/**
 * Un corte entre renombrar la fuente y publicar el nuevo Word puede dejar
 * el original en una copia recuperable. Se restaura solo cuando no existe
 * un Word vigente y hay una única copia inequívoca.
 */
export async function recoverInterruptedSummaryWord(
  directory: string,
  isSummaryName: (filename: string) => boolean,
  assertOwned: () => Promise<void>,
): Promise<void> {
  const names = await readdir(directory);
  if (names.some((name) => isSummaryName(name))) return;
  const backupSourceName = (name: string): string | null => {
    const cut = name.lastIndexOf(BACKUP_SUFFIX);
    if (cut >= 0) return name.slice(0, cut);
    // Las versiones anteriores utilizaban esta extensión fija.
    return name.endsWith('.traccion-backup')
      ? name.slice(0, -'.traccion-backup'.length)
      : null;
  };
  const backups = names.filter((name) => {
    const original = backupSourceName(name);
    return original !== null && isSummaryName(original);
  });
  if (backups.length !== 1) return;
  const backupName = backups[0];
  const originalName = backupSourceName(backupName);
  if (!originalName) return;
  await assertOwned();
  await rename(path.join(directory, backupName), path.join(directory, originalName));
}

/**
 * No elimina backups preexistentes. Se mantiene el original hasta tener
 * el temporal completo y verificable, y se revierte si falla el rename.
 */
export async function publishSummaryWord(
  directory: string,
  sourcePath: string,
  targetPath: string,
  output: Buffer,
  assertOwned: () => Promise<void>,
): Promise<void> {
  const token = randomUUID();
  const tempPath = path.join(directory, `.${path.basename(targetPath)}.${token}.tmp`);
  const backupPath = `${sourcePath}${BACKUP_SUFFIX}${token}`;
  try {
    // Nunca sobrescribir otro documento con nombre de destino diferente.
    if (targetPath !== sourcePath) {
      try {
        await stat(targetPath);
        throw new Error(`Ya existe ${path.basename(targetPath)}. No se sustituye automáticamente.`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    await writeFile(tempPath, output, { flag: 'wx' });
    const written = await stat(tempPath);
    if (written.size !== output.byteLength) {
      throw new Error('La escritura temporal del resumen Word quedó incompleta.');
    }
    await assertOwned();
    await rename(sourcePath, backupPath);
    try {
      await assertOwned();
      await rename(tempPath, targetPath);
    } catch (error) {
      // Si no hemos publicado, el Word anterior debe recuperar su nombre.
      await rename(backupPath, sourcePath).catch(() => undefined);
      throw error;
    }
    // La falta de limpieza no debe revertir una publicación ya correcta.
    await unlink(backupPath).catch(() => undefined);
  } finally {
    await unlink(tempPath).catch(() => undefined);
    // Nunca se borran aquí los backups: si el rollback falla, la copia
    // única permanece disponible para la siguiente recuperación.
  }
}
