/**
 * Creates an EMPTY test database using the ordinary TrAcción migrations.
 * Never reads production data. A shared initialization directory prevents
 * two PCs provisioning the same test DB at the same time.
 *
 * Provisioning does NOT replace existing databases. If interrupted,
 * the initialization lock is retained for manual review (fail closed).
 */
import { app } from 'electron';
import {
  constants, copyFileSync, existsSync, mkdirSync, rmSync, unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Database } from 'better-sqlite3';

type DatabaseConstructor = new (filename: string, options?: { fileMustExist?: boolean }) => Database;
import { applyMigrations } from './schemaMigrations.js';
import { inspectAndEnsureDatabaseIdentity } from './databaseIdentity.js';
import { getConfiguredDatabaseDirectory, getDatabasePathForDirectory } from './databasePreferences.js';

const require = createRequire(import.meta.url);

export async function prepareDisposableTestDatabase(): Promise<void> {
  const userData = app.getPath('userData');
  if (process.env.TRACCION_DATABASE_ENVIRONMENT !== 'test' ||
      !userData.endsWith('-test-environment')) {
    throw new Error('No se permite crear una SQLite de prueba fuera del perfil aislado.');
  }
  const configured = await getConfiguredDatabaseDirectory();
  if (configured.isDefaultPath) {
    throw new Error('Selecciona primero una carpeta de pruebas explícita.');
  }
  const databasePath = getDatabasePathForDirectory(configured.directoryPath);
  const creationLock = databasePath + '.test-initialization.lockdir';
  // A file may be visible while another PC is still copying it. Never use
  // its mere existence as proof that initialization has completed.
  if (existsSync(creationLock)) {
    throw new Error('La base de pruebas tiene una inicialización pendiente; no se abrirá un archivo posiblemente incompleto.');
  }
  if (existsSync(databasePath)) return;

  // mkdir on the shared folder must be exclusive; refuse any uncertain owner
  // rather than deleting a lock from a possibly running initializer.
  try { mkdirSync(creationLock); }
  catch { throw new Error('La base de pruebas se está creando en otro equipo o hay una inicialización pendiente de revisión.'); }
  let completed = false;
  const temporary = path.join(userData, 'traccion-test-init-' + randomUUID() + '.sqlite');
  try {
    if (existsSync(databasePath)) {
      completed = true;
      return;
    }
    const Ctor = require('better-sqlite3') as DatabaseConstructor;
    const db = new Ctor(temporary);
    try {
      applyMigrations(db);
    } finally { db.close(); }
    const result = inspectAndEnsureDatabaseIdentity(temporary, { allowLegacyBootstrap: true });
    if (result.identity.environment !== 'test') {
      throw new Error('La nueva base SQLite no tiene identidad de pruebas.');
    }
    // EXCL: never overwrite the file if another client created it first.
    copyFileSync(temporary, databasePath, constants.COPYFILE_EXCL);
    completed = true;
  } finally {
    try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* diagnostic remains */ }
    if (completed) rmSync(creationLock, {recursive:true});
    // Uncertain creation keeps marker for manual investigation.
  }
}
