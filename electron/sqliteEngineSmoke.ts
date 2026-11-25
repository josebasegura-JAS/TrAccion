import { app } from 'electron';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startIsolatedTestEngine } from './sqliteEngineWorkerClient.js';

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
  await engine.close();
  await rm(root, { recursive: true, force: true });
  console.info('SQLite isolated smoke: OK');
}

void run().then(() => app.exit(0)).catch((error: unknown) => {
  console.error('SQLite isolated smoke: FAILED', error);
  app.exit(1);
});
