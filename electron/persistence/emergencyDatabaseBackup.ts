import { copyFile, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

export async function pruneEmergencyDatabaseBackups(
  databasePath: string,
  retentionCount = 1,
): Promise<void> {
  const directory = path.dirname(databasePath);
  const prefix = `${path.basename(databasePath)}.backup-`;
  const entries = await readdir(directory).catch(() => []);
  const backups = entries
    .filter((entry) => entry.startsWith(prefix))
    .sort()
    .reverse();

  await Promise.all(
    backups
      .slice(retentionCount)
      .map((entry) => unlink(path.join(directory, entry)).catch(() => undefined)),
  );
}

export async function backupExistingDatabase(databasePath: string): Promise<void> {
  try {
    await stat(databasePath);
  } catch {
    return;
  }

  await pruneEmergencyDatabaseBackups(databasePath, 1);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  try {
    await copyFile(databasePath, `${databasePath}.backup-${timestamp}`);
    await pruneEmergencyDatabaseBackups(databasePath, 1);
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
    if (code === 'ENOSPC') {
      console.warn(
        'No hay espacio para crear la copia preventiva SQLite. Se continúa sin bloquear el guardado.',
        error,
      );
      await pruneEmergencyDatabaseBackups(databasePath, 1);
      return;
    }

    throw error;
  }
}
