import { app } from 'electron';
import { copyFile, mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startIsolatedTestEngine } from './sqliteEngineWorkerClient.js';
import { openSqliteDatabase } from './persistence/sqliteConnection.js';
import { inspectAndEnsureDatabaseIdentity } from './persistence/databaseIdentity.js';

async function run(): Promise<void> {
  await app.whenReady();
  const root = await mkdtemp(path.join(tmpdir(), 'traccion-engine-smoke-'));
  const userData = path.join(root, 'profile');
  const directory = path.join(root, 'database');
  await mkdir(userData);
  await mkdir(directory);
  const engine = startIsolatedTestEngine(userData);
  // On failure keep the temporary directory for diagnosis. Never switch to
  // another engine or attempt to replay a write.
  await engine.ready;
  await engine.call('initializeSqlitePersistence');
  const status = await engine.call('changeSqliteDirectory', directory);
  if (!status.ready || status.environment !== 'test') throw new Error('No se activó la base temporal test.');
  const key = 'isolation-smoke';
  const value = JSON.stringify({ verified: true });
  const saved = await engine.call('savePersistedRecordIfUnchanged', { key, value, expectedUpdatedAt: null });
  if (!saved.ok) throw new Error('No se guardó el registro temporal.');
  const read = await engine.call('getPersistedRecordSnapshot', key);
  if (read.record?.value !== value) throw new Error('Lectura SQLite no coincide con escritura.');
  const secondProfile = path.join(root, 'profile-b');
  await mkdir(secondProfile);
  const peer = startIsolatedTestEngine(secondProfile);
  await peer.ready;
  await peer.call('initializeSqlitePersistence');
  const peerStatus = await peer.call('changeSqliteDirectory', directory);
  if (!peerStatus.ready || peerStatus.databaseUuid !== status.databaseUuid) throw new Error('Cliente B no conectado a la misma base test.');
  const peerRead = await peer.call('getPersistedRecordSnapshot', key);
  if (peerRead.record?.value !== value) throw new Error('Cliente B no observa escritura de A.');
  const conflict = await peer.call('savePersistedRecordIfUnchanged', { key, value: 'conflict', expectedUpdatedAt: null });
  if (conflict.ok) throw new Error('Se ha aceptado una escritura con versión obsoleta.');
  const unchanged = await engine.call('getPersistedRecordSnapshot', key);
  if (unchanged.record?.value !== value) throw new Error('El conflicto alteró el registro original.');
  const parallel = await Promise.all([
    engine.call('savePersistedRecordIfUnchanged', { key: 'parallel-a', value: 'A', expectedUpdatedAt: null }),
    peer.call('savePersistedRecordIfUnchanged', { key: 'parallel-b', value: 'B', expectedUpdatedAt: null }),
  ]);
  if (parallel.some(result => !result.ok)) throw new Error('Falló escritura concurrente en registros distintos.');
  const [seenA, seenB] = await Promise.all([
    peer.call('getPersistedRecordSnapshot', 'parallel-a'),
    engine.call('getPersistedRecordSnapshot', 'parallel-b'),
  ]);
  if (seenA.record?.value !== 'A' || seenB.record?.value !== 'B') throw new Error('Escritura concurrente no persistida.');
  await peer.close();

  // Verificar una copia real sin levantar la prohibición de restaurar en PRUEBAS.
  await engine.call('createManualLocalBackup');
  if ((await engine.call('getSqliteRestartBackupSnapshot')).pendingBackupRevisions !== 0) throw new Error('Backup manual no confirmó la revisión actual.');
  // Las tres operaciones con conexión propia deben registrar una revisión
  // después de COMMIT, y no hacerlo ante conflicto o lote vacío.
  const pending = async () => (await engine.call('getSqliteRestartBackupSnapshot')).pendingBackupRevisions;
  const stamp = new Date().toISOString();
  const task = { id: 'smoke-atomic-task', value: JSON.stringify({ createdAt: stamp, updatedAt: stamp }), expectedUpdatedAt: null };
  const initialRevision = await pending();
  const batch = await engine.callExtra('saveTaskRecordsAtomically', [[task]]) as { ok: boolean };
  if (!batch.ok || await pending() !== initialRevision + 1) throw new Error('El lote de tareas no registró su revisión de backup.');
  const rejectedBatch = await engine.callExtra('saveTaskRecordsAtomically', [[task]]) as { ok: boolean };
  if (rejectedBatch.ok || await pending() !== initialRevision + 1) throw new Error('El conflicto de tareas alteró la revisión.');
  const calendar = { id: 'smoke-calendar', value: JSON.stringify({ createdAt: stamp, updatedAt: stamp }), expectedUpdatedAt: null };
  const imported = await engine.callExtra('importTicketRestaurantePeopleAtomically', [{ calendars: [calendar], people: [] }]) as { ok: boolean };
  if (!imported.ok || await pending() !== initialRevision + 2) throw new Error('La importación de Ticket no registró su revisión.');
  const empty = await engine.callExtra('importTicketRestaurantePeopleAtomically', [{ calendars: [], people: [] }]) as { ok: boolean };
  if (!empty.ok || await pending() !== initialRevision + 2) throw new Error('La importación vacía alteró la revisión.');
  const deletedAt = new Date(Date.now() + 1000).toISOString();
  const removed = await engine.callExtra('removeTicketRestauranteCalendarWithPeopleAtomically', [{
    calendar: { ...calendar, expectedUpdatedAt: stamp, value: JSON.stringify({ createdAt: stamp, updatedAt: deletedAt, deletedAt }) },
    people: [],
  }]) as { ok: boolean };
  if (!removed.ok || await pending() !== initialRevision + 3) throw new Error('La baja de calendario no registró su revisión.');
  const backups = await engine.call('listLocalBackups');
  const backup = backups.find(item => item.kind === 'sqlite' && item.isLiveCopy);
  if (!backup || backup.sizeBytes <= 0) throw new Error('No se generó respaldo SQLite real.');
  // Windows can expose the temp directory through a short name or junction.
  // Compare physical paths, and require the dedicated test backup subtree.
  const physicalDirectory = await realpath(directory);
  const physicalBackup = await realpath(backup.path);
  const relativeBackup = path.relative(physicalDirectory, physicalBackup);
  const parts = relativeBackup.split(path.sep);
  if (path.isAbsolute(relativeBackup) || parts.length !== 4 ||
      parts[0] !== 'backups-pruebas' || !/^[a-f0-9]{16}$/.test(parts[1]) ||
      parts[2] !== 'sqlite-local-backup' || parts[3] !== backup.fileName) {
    throw new Error(`El backup de pruebas salió de la carpeta SQLite: ${relativeBackup}`);
  }
  const mutation = await engine.call('savePersistedRecordIfUnchanged', {
    key, value: 'changed-after-backup', expectedUpdatedAt: unchanged.record?.updatedAt ?? null,
  });
  if (!mutation.ok) throw new Error('No se modificó el registro temporal.');
  const restored = await engine.call('restoreLocalBackup', backup.id);
  if (restored.ok || !(/desactivada en (?:el entorno )?PRUEBAS/.test(restored.message))) {
    throw new Error('La protección de restauración en PRUEBAS no se ha respetado.');
  }
  const currentRecord = await engine.call('getPersistedRecordSnapshot', key);
  if (currentRecord.record?.value !== 'changed-after-backup') throw new Error('Una restauración rechazada alteró la base.');
  // Abrir el snapshot en otra carpeta temporal, nunca sustituir la base activa.
  const backupProfile = path.join(root, 'backup-profile');
  const backupDirectory = path.join(root, 'backup-database');
  await mkdir(backupProfile);
  await mkdir(backupDirectory);
  await copyFile(backup.path, path.join(backupDirectory, 'traccion.sqlite'));
  const backupEngine = startIsolatedTestEngine(backupProfile);
  await backupEngine.ready;
  await backupEngine.call('initializeSqlitePersistence');
  const backupStatus = await backupEngine.call('changeSqliteDirectory', backupDirectory);
  if (!backupStatus.ready || backupStatus.databaseUuid !== status.databaseUuid ||
      backupStatus.environment !== 'test') throw new Error('La copia no conserva la identidad SQLite.');
  const backupRecord = await backupEngine.call('getPersistedRecordSnapshot', key);
  if (backupRecord.record?.value !== value) throw new Error('La copia no conserva el valor original.');
  await backupEngine.close();
  await engine.close();

  // Reabrir únicamente después de confirmar la salida del propietario anterior.
  const reopened = startIsolatedTestEngine(userData);
  await reopened.ready;
  const reopenedStatus = await reopened.call('initializeSqlitePersistence');
  if (!reopenedStatus.ready || reopenedStatus.databaseUuid !== status.databaseUuid) {
    throw new Error('No se recuperó la identidad tras el cierre ordenado.');
  }
  const persisted = await reopened.call('getPersistedRecordSnapshot', key);
  if (persisted.record?.value !== 'changed-after-backup') throw new Error('El registro no sobrevivió al cierre.');
  await reopened.close();

  // Producción simulada exclusivamente con archivo sintético local.
  const productionDirectory = path.join(root, 'synthetic-production');
  const productionProfile = path.join(root, 'synthetic-production-profile');
  await mkdir(productionDirectory);
  await mkdir(productionProfile);
  const productionFile = path.join(productionDirectory, 'traccion.sqlite');
  openSqliteDatabase(productionFile, { busyTimeoutMs: 1000 }).close();
  const identity = inspectAndEnsureDatabaseIdentity(productionFile, {
    expectedEnvironment: 'production', allowLegacyBootstrap: true,
  }).identity;
  const productionEngine = startIsolatedTestEngine(productionProfile, undefined, undefined, 'production');
  await productionEngine.ready;
  await productionEngine.call('initializeSqlitePersistence');
  const productionStatus = await productionEngine.call('changeSqliteDirectory', productionDirectory);
  if (!productionStatus.ready || productionStatus.environment !== 'production' ||
      productionStatus.databaseUuid !== identity.databaseUuid) throw new Error('No se activó producción sintética.');
  const productionSaved = await productionEngine.call('savePersistedRecordIfUnchanged', {
    key: 'production-smoke', value: '{}', expectedUpdatedAt: null,
  });
  if (!productionSaved.ok) throw new Error('No se guardó producción sintética.');
  await productionEngine.close();
  await rm(root, { recursive: true, force: true });
  console.info('SQLite isolated smoke: OK');
}

void run().then(() => app.exit(0)).catch((error: unknown) => {
  console.error('SQLite isolated smoke: FAILED', error);
  app.exit(1);
});
