/**
 * Creates an EMPTY, disposable test database using the same migrations as
 * TrAcción. Never copies production data. Called only after selecting test
 * userData and a separate, configured test directory.
 */
import { app } from 'electron';
import { closeSync, existsSync, openSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { DatabaseConstructor } from 'better-sqlite3';
import { applyMigrations } from './schemaMigrations.js';
import { inspectAndEnsureDatabaseIdentity } from './databaseIdentity.js';
import { getConfiguredDatabaseDirectory, getDatabasePathForDirectory } from './databasePreferences.js';

const require = createRequire(import.meta.url);

export async function prepareDisposableTestDatabase(): Promise<void> {
  if (process.env.TRACCION_DATABASE_ENVIRONMENT !== 'test' ||
      !app.getPath('userData').endsWith('-test-environment')) {
    throw new Error('No se permite crear una SQLite de prueba fuera del perfil aislado.');
  }
  const configured = await getConfiguredDatabaseDirectory();
  if (configured.isDefaultPath) {
    throw new Error('Selecciona primero una carpeta de pruebas explícita.');
  }
  const databasePath = getDatabasePathForDirectory(configured.directoryPath);
  if (existsSync(databasePath)) {
    // No alter an existing database during startup. The normal identity
    // verification will reject a production or foreign file.
    return;
  }

  // Exclusive create: never overwrite a file another test client created.
  let fd: number;
  try { fd = openSync(databasePath, 'wx', 0o600); }
  catch {
    if (existsSync(databasePath)) return;
    throw new Error('No se pudo crear la base SQLite de pruebas en la carpeta elegida.');
  }
  closeSync(fd);
  const Ctor = require('better-sqlite3') as DatabaseConstructor;
  const db = new Ctor(databasePath, { fileMustExist: true });
  try {
    applyMigrations(db);
  } finally { db.close(); }
  const result = inspectAndEnsureDatabaseIdentity(databasePath, { allowLegacyBootstrap: true });
  if (result.identity.environment !== 'test') {
    throw new Error('La nueva base SQLite no tiene identidad de pruebas.');
  }
}
