import { app } from 'electron';
import { copyFile, mkdir, readFile, readdir, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { constants, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import type { Database, DatabaseConstructor } from 'better-sqlite3';

const DATABASE_FILE_NAME = 'traccion.sqlite';
const DATABASE_PREFERENCES_FILE_NAME = 'sqlite-preferences.json';
const LOCAL_BACKUP_DIRECTORY_NAME = 'sqlite-local-backup';
const LOCAL_BACKUP_DATABASE_FILE_NAME = 'traccion-local-backup.sqlite';
const LOCAL_BACKUP_JSON_FILE_NAME = 'traccion-local-backup.json';
const LOCAL_ROTATED_BACKUP_RETENTION_COUNT = 5;
const LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME = 'shutdown';
const LOCAL_SHUTDOWN_BACKUP_RETENTION_COUNT = 3;
const SHARED_SQLITE_BACKUP_RETENTION_COUNT = 3;
const LOCAL_ROTATED_BACKUP_MIN_INTERVAL_MS = 15 * 60 * 1000;
const LOCAL_LIVE_BACKUP_DEBOUNCE_MS = 5000;
const CURRENT_SCHEMA_VERSION = 6;
const LOCK_TTL_MS = 30 * 1000;
const LOCK_HEARTBEAT_MS = 10 * 1000;
const STARTUP_LOCK_WAIT_MS = 15 * 1000;
const STARTUP_LOCK_RETRY_MS = 250;
const SQLITE_BUSY_TIMEOUT_MS = 15_000;
const SQLITE_OPERATION_LOCK_WAIT_MS = 5 * 1000;
const SQLITE_ASYNC_OPERATION_LOCK_WAIT_MS = 15 * 1000;
const SQLITE_RECORD_LOCK_WAIT_MS = 750;
const SQLITE_OPERATION_LOCK_RETRY_MS = 50;
const RECORD_LOCK_TTL_MS = 30 * 1000;
const MODULE_LOCK_RECORD_ID = '__module__';
const DATABASE_HEARTBEAT_BLOCKED_MESSAGE =
  'La conexión con la carpeta compartida de SQLite puede estar interrumpida. Se bloquean nuevas escrituras hasta recuperar el heartbeat.';

export interface PersistedStorageRecord {
  key: string;
  value: string;
}

export interface ConditionalPersistedStorageRecord extends PersistedStorageRecord {
  expectedUpdatedAt: string | null;
}

export interface SqliteTaskRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SqliteTaskRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteTaskRecord[];
}

export interface SqliteTaskRecordsFilter {
  mode?: 'all' | 'active' | 'historical';
}

export interface ConditionalSqliteTaskRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

export interface ConditionalSqliteTaskSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentUpdatedAt: string | null;
  message: string;
}

export interface SqliteEmployeeRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SqliteEmployeeRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteEmployeeRecord[];
}

export interface ConditionalSqliteEmployeeRecord {
  id: string;
  value: string;
  expectedValue: string | null;
}

export interface ConditionalSqliteEmployeeSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentValue: string | null;
  message: string;
}

export interface SqliteSorteosRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SqliteSorteosRecordsSnapshot {
  status: DatabaseStatus;
  draws: SqliteSorteosRecord[];
  exclusions: SqliteSorteosRecord[];
  drawsUpdatedAt: string | null;
  exclusionsUpdatedAt: string | null;
}

export interface ConditionalSqliteSorteosSnapshot {
  draws: Array<{ id: string; value: string }>;
  exclusions: Array<{ id: string; value: string }>;
  expectedDrawsUpdatedAt: string | null;
  expectedExclusionsUpdatedAt: string | null;
}

export interface ConditionalSqliteSorteosSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentDrawsUpdatedAt: string | null;
  currentExclusionsUpdatedAt: string | null;
  message: string;
}

export interface PersistedStorageRecordSnapshot extends PersistedStorageRecord {
  updatedAt: string;
}

export interface PersistedRecordsTokenSnapshot {
  status: DatabaseStatus;
  refreshToken: string | null;
  latestUpdatedAt: string | null;
  taskRecordsUpdatedAt: string | null;
  sorteosDrawsUpdatedAt: string | null;
  sorteosExclusionsUpdatedAt: string | null;
}

export interface PersistedRecordsSnapshot extends PersistedRecordsTokenSnapshot {
  records: PersistedStorageRecordSnapshot[];
}

export interface PersistedRecordSnapshot {
  status: DatabaseStatus;
  record: PersistedStorageRecordSnapshot | null;
}

export interface LocalStorageBackupPayload {
  records: PersistedStorageRecord[];
}

export interface LocalBackupEntry {
  id: string;
  fileName: string;
  kind: 'sqlite' | 'json';
  path: string;
  sizeBytes: number;
  createdAt: string;
  isLiveCopy: boolean;
}

export interface RestoreLocalBackupResult {
  ok: boolean;
  status: DatabaseStatus;
  message: string;
}

export interface DatabaseLockInfo {
  ownerId: string;
  username: string;
  hostname: string;
  pid: number;
  createdAt: string;
  updatedAt: string;
}


export interface RecordLockOwnerInfo {
  ownerId: string;
  ownerName: string;
  machineName: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface RecordLockPayload {
  module: string;
  recordId: string;
}

export interface RecordLockResult {
  ok: boolean;
  status: 'acquired' | 'released' | 'locked' | 'idle' | 'error';
  lock: RecordLockOwnerInfo | null;
  message: string;
}

export interface DatabaseStatus {
  ready: boolean;
  engine: 'better-sqlite3';
  phase: 'prepared' | 'active' | 'fallback' | 'error' | 'locked';
  path: string;
  schemaVersion: number;
  isDefaultPath: boolean;
  lockPath: string;
  lock?: DatabaseLockInfo;
  message?: string;
}

interface SchemaMigrationRow {
  version: number;
}

interface DatabasePreferences {
  customDirectoryPath: string | null;
}

const require = createRequire(import.meta.url);
const ownerId = `${hostname()}-${process.pid}-${Date.now().toString(36)}`;

let database: Database | null = null;
let status: DatabaseStatus | null = null;
let localBackupQueue: Promise<void> = Promise.resolve();
let localBackupTimer: ReturnType<typeof setTimeout> | null = null;
let pendingLocalBackupReason: string | null = null;
let activeDatabaseLock: { lockPath: string; lock: DatabaseLockInfo; heartbeat: ReturnType<typeof setInterval> } | null = null;
let databaseWriteBlockedByHeartbeat = false;
let heartbeatConsecutiveFailureCount = 0;
let notifyDatabaseConnectivityIssue: ((payload: DatabaseConnectivityIssuePayload) => void) | null = null;

export interface DatabaseConnectivityIssuePayload {
  blocked: boolean;
  message: string;
  failedHeartbeatCount: number;
  updatedAt: string;
}


function logSqliteMetric(message: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (data) {
    console.info(`[sqlite] ${message}`, data);
    return;
  }

  console.info(`[sqlite] ${message}`);
}

function largestPersistedRecordSizes(records: PersistedStorageRecordSnapshot[]): Array<{
  key: string;
  bytes: number;
}> {
  return records
    .map((record) => ({ key: record.key, bytes: Buffer.byteLength(record.value, 'utf8') }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 10);
}

function isSchemaMigrationRow(value: unknown): value is SchemaMigrationRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SchemaMigrationRow>;
  return typeof candidate.version === 'number';
}

function getDefaultDatabaseDirectory(): string {
  return path.join(app.getPath('userData'), 'data');
}
function getLocalBackupDirectory(): string {
  return path.join(app.getPath('userData'), LOCAL_BACKUP_DIRECTORY_NAME);
}

function getLocalBackupDatabasePath(): string {
  return path.join(getLocalBackupDirectory(), LOCAL_BACKUP_DATABASE_FILE_NAME);
}

function getLocalBackupJsonPath(): string {
  return path.join(getLocalBackupDirectory(), LOCAL_BACKUP_JSON_FILE_NAME);
}

function getLocalShutdownBackupDirectory(): string {
  return path.join(getLocalBackupDirectory(), LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME);
}

function backupTimestampForFileName(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function getRotatedLocalBackupDatabasePath(timestamp: string): string {
  return path.join(getLocalBackupDirectory(), `traccion-local-backup-${timestamp}.sqlite`);
}

function getRotatedLocalBackupJsonPath(timestamp: string): string {
  return path.join(getLocalBackupDirectory(), `traccion-local-backup-${timestamp}.json`);
}

function getShutdownLocalBackupDatabasePath(timestamp: string): string {
  return path.join(getLocalShutdownBackupDirectory(), `traccion-shutdown-backup-${timestamp}.sqlite`);
}

function getShutdownLocalBackupJsonPath(timestamp: string): string {
  return path.join(getLocalShutdownBackupDirectory(), `traccion-shutdown-backup-${timestamp}.json`);
}

function getSharedSqliteBackupPath(databasePath: string, timestamp: string): string {
  return path.join(path.dirname(databasePath), `traccion-backup-${timestamp}.sqlite`);
}

function isSharedSqliteBackupFileName(fileName: string): boolean {
  return /^traccion-backup-.*\.sqlite$/.test(fileName);
}

function isLocalBackupFileName(fileName: string): boolean {
  return (
    fileName === LOCAL_BACKUP_DATABASE_FILE_NAME ||
    fileName === LOCAL_BACKUP_JSON_FILE_NAME ||
    /^traccion-local-backup-.*\.(sqlite|json)$/.test(fileName)
  );
}

function isShutdownBackupFileName(fileName: string): boolean {
  return /^traccion-shutdown-backup-.*\.(sqlite|json)$/.test(fileName);
}

function isKnownBackupFileName(fileName: string): boolean {
  return isLocalBackupFileName(fileName) || isShutdownBackupFileName(fileName);
}

function localBackupKindFromFileName(fileName: string): 'sqlite' | 'json' | null {
  if (fileName.endsWith('.sqlite')) {
    return 'sqlite';
  }

  if (fileName.endsWith('.json')) {
    return 'json';
  }

  return null;
}

async function pruneBackupsInDirectory(
  backupDirectory: string,
  prefix: string,
  extension: 'sqlite' | 'json',
  retentionCount: number,
): Promise<void> {
  const suffix = `.${extension}`;
  const entries = await readdir(backupDirectory).catch(() => []);
  const backups = entries
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith(suffix))
    .sort()
    .reverse();

  await Promise.all(
    backups.slice(retentionCount).map((entry) =>
      unlink(path.join(backupDirectory, entry)).catch(() => undefined),
    ),
  );
}

async function pruneRotatedLocalBackups(extension: 'sqlite' | 'json'): Promise<void> {
  await pruneBackupsInDirectory(
    getLocalBackupDirectory(),
    'traccion-local-backup-',
    extension,
    LOCAL_ROTATED_BACKUP_RETENTION_COUNT,
  );
}

async function pruneShutdownLocalBackups(extension: 'sqlite' | 'json'): Promise<void> {
  await pruneBackupsInDirectory(
    getLocalShutdownBackupDirectory(),
    'traccion-shutdown-backup-',
    extension,
    LOCAL_SHUTDOWN_BACKUP_RETENTION_COUNT,
  );
}

async function pruneSharedSqliteBackups(databasePath: string): Promise<void> {
  const backupDirectory = path.dirname(databasePath);
  const entries = await readdir(backupDirectory).catch(() => []);
  const backups = entries.filter(isSharedSqliteBackupFileName).sort().reverse();

  await Promise.all(
    backups.slice(SHARED_SQLITE_BACKUP_RETENTION_COUNT).map((entry) =>
      unlink(path.join(backupDirectory, entry)).catch(() => undefined),
    ),
  );
}

async function writeSharedSqliteBackup(databasePath: string, timestamp: string): Promise<void> {
  await copyFile(databasePath, getSharedSqliteBackupPath(databasePath, timestamp));
  await pruneSharedSqliteBackups(databasePath);
}


async function getLatestRotatedLocalBackupTime(): Promise<number | null> {
  const backupDirectory = getLocalBackupDirectory();
  const entries = await readdir(backupDirectory).catch(() => []);
  const rotatedSqliteBackups = entries.filter(
    (entry) => entry.startsWith('traccion-local-backup-') && entry.endsWith('.sqlite'),
  );

  const backupStats = await Promise.all(
    rotatedSqliteBackups.map(async (entry) => {
      const fileStat = await stat(path.join(backupDirectory, entry)).catch(() => null);
      return fileStat?.isFile() ? fileStat.mtime.getTime() : null;
    }),
  );

  const timestamps = backupStats.filter((value): value is number => typeof value === 'number');
  if (timestamps.length === 0) {
    return null;
  }

  return Math.max(...timestamps);
}

async function shouldCreateRotatedLocalBackup(reason: string): Promise<boolean> {
  const reasons = reason
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (reasons.length === 0 || reasons.some((item) => !item.startsWith('save:'))) {
    return true;
  }

  const latestBackupTime = await getLatestRotatedLocalBackupTime();
  return latestBackupTime === null || Date.now() - latestBackupTime >= LOCAL_ROTATED_BACKUP_MIN_INTERVAL_MS;
}


function getPreferencesPath(): string {
  return path.join(app.getPath('userData'), DATABASE_PREFERENCES_FILE_NAME);
}

function getDatabasePathForDirectory(directoryPath: string): string {
  return path.join(directoryPath, DATABASE_FILE_NAME);
}

async function readDatabasePreferences(): Promise<DatabasePreferences> {
  try {
    const raw = await readFile(getPreferencesPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { customDirectoryPath: null };
    }

    const candidate = parsed as Partial<DatabasePreferences>;
    return {
      customDirectoryPath:
        typeof candidate.customDirectoryPath === 'string' && candidate.customDirectoryPath.trim()
          ? candidate.customDirectoryPath
          : null,
    };
  } catch {
    return { customDirectoryPath: null };
  }
}

async function writeDatabasePreferences(preferences: DatabasePreferences): Promise<void> {
  await mkdir(path.dirname(getPreferencesPath()), { recursive: true });
  await writeFile(getPreferencesPath(), JSON.stringify(preferences, null, 2), 'utf8');
}

async function getConfiguredDatabaseDirectory(): Promise<{
  directoryPath: string;
  isDefaultPath: boolean;
}> {
  const preferences = await readDatabasePreferences();
  if (preferences.customDirectoryPath) {
    return { directoryPath: preferences.customDirectoryPath, isDefaultPath: false };
  }

  return { directoryPath: getDefaultDatabaseDirectory(), isDefaultPath: true };
}

function getLockPath(databasePath: string): string {
  return `${databasePath}.lockdir`;
}

function getLockInfoPath(lockPath: string): string {
  return path.join(lockPath, 'owner.json');
}

function createLockInfo(): DatabaseLockInfo {
  let username = 'desconocido';
  try {
    username = userInfo().username;
  } catch {
    username = 'desconocido';
  }

  const now = new Date().toISOString();
  return {
    ownerId,
    username,
    hostname: hostname(),
    pid: process.pid,
    createdAt: now,
    updatedAt: now,
  };
}

function isDatabaseLockInfo(value: unknown): value is DatabaseLockInfo {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof DatabaseLockInfo, unknown>>;
  return (
    typeof candidate.ownerId === 'string' &&
    typeof candidate.username === 'string' &&
    typeof candidate.hostname === 'string' &&
    typeof candidate.pid === 'number' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function isLockStale(lock: DatabaseLockInfo): boolean {
  const updatedAt = Date.parse(lock.updatedAt);
  return Number.isNaN(updatedAt) || Date.now() - updatedAt > LOCK_TTL_MS;
}

async function readLock(lockPath: string): Promise<DatabaseLockInfo | null> {
  try {
    const raw = await readFile(getLockInfoPath(lockPath), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isDatabaseLockInfo(parsed) ? parsed : null;
  } catch {
    try {
      const raw = await readFile(lockPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return isDatabaseLockInfo(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function readLockSync(lockPath: string): DatabaseLockInfo | null {
  try {
    const raw = readFileSync(getLockInfoPath(lockPath), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isDatabaseLockInfo(parsed) ? parsed : null;
  } catch {
    try {
      const raw = readFileSync(lockPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return isDatabaseLockInfo(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function sleepSync(milliseconds: number): void {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, milliseconds);
}

function writeLockSync(lockPath: string, lock: DatabaseLockInfo): void {
  // En SMB, crear un directorio es más fiable que openSync(..., 'wx') sobre fichero.
  // La adquisición se basa en mkdir exclusivo: si dos procesos compiten, solo uno
  // debería poder crear el directorio .lockdir. El owner.json solo identifica al dueño.
  mkdirSync(lockPath);
  writeFileSync(getLockInfoPath(lockPath), JSON.stringify(lock, null, 2), 'utf8');

  const confirmedLock = readLockSync(lockPath);
  if (confirmedLock?.ownerId !== lock.ownerId) {
    removeLockSync(lockPath, lock.ownerId);
    throw new Error('Otro proceso ganó la carrera de lock SQLite en SMB.');
  }
}

async function writeLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
  await mkdir(lockPath);
  await writeFile(getLockInfoPath(lockPath), JSON.stringify(lock, null, 2), 'utf8');

  const confirmedLock = await readLock(lockPath);
  if (confirmedLock?.ownerId !== lock.ownerId) {
    await releaseLock(lockPath, lock);
    throw new Error('Otro proceso ganó la carrera de lock SQLite en SMB.');
  }
}

function removeLockSync(lockPath: string, expectedOwnerId: string): void {
  const lock = readLockSync(lockPath);
  if (lock?.ownerId === expectedOwnerId) {
    try {
      rmSync(lockPath, { recursive: true, force: true });
    } catch {
      // El lock puede haber sido eliminado por un proceso que se adelantó; no es crítico.
    }
  }
}

function removeStaleLockSync(lockPath: string, staleLock: DatabaseLockInfo): void {
  const currentLock = readLockSync(lockPath);
  if (currentLock?.ownerId !== staleLock.ownerId || !isLockStale(currentLock)) {
    return;
  }

  try {
    rmSync(lockPath, { recursive: true, force: true });
  } catch {
    // Otro proceso puede haber limpiado el lock antes.
  }
}

function removeCorruptStaleLockSync(lockPath: string): void {
  try {
    const metadata = statSync(lockPath);
    if (Date.now() - metadata.mtimeMs <= LOCK_TTL_MS) {
      return;
    }

    rmSync(lockPath, { recursive: true, force: true });
  } catch {
    // Si no existe o no se puede leer, dejamos que el bucle normal reintente.
  }
}

async function removeStaleLock(lockPath: string, staleLock: DatabaseLockInfo): Promise<void> {
  const currentLock = await readLock(lockPath);
  if (currentLock?.ownerId !== staleLock.ownerId || !isLockStale(currentLock)) {
    return;
  }

  try {
    await unlink(getLockInfoPath(lockPath)).catch(() => undefined);
    await rmdir(lockPath).catch(() => undefined);
  } catch {
    // Otro proceso puede haber limpiado el lock antes.
  }
}

async function removeCorruptStaleLock(lockPath: string): Promise<void> {
  try {
    const metadata = await stat(lockPath);
    if (Date.now() - metadata.mtimeMs <= LOCK_TTL_MS) {
      return;
    }

    await unlink(getLockInfoPath(lockPath)).catch(() => undefined);
    await rmdir(lockPath).catch(() => undefined);
  } catch {
    // Si no existe o no se puede leer, dejamos que el bucle normal reintente.
  }
}

function acquireOperationLockSync(databasePath: string, waitMs = SQLITE_OPERATION_LOCK_WAIT_MS): DatabaseLockInfo {
  const lockPath = getLockPath(databasePath);
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  let lastLock: DatabaseLockInfo | null = null;

  while (Date.now() - startedAt <= waitMs) {
    const existingLock = readLockSync(lockPath);
    lastLock = existingLock;

    if (existingLock && isLockStale(existingLock)) {
      removeStaleLockSync(lockPath, existingLock);
    }

    if (!existingLock) {
      removeCorruptStaleLockSync(lockPath);
    }

    if (!existingLock || isLockStale(existingLock)) {
      const lock = createLockInfo();
      try {
        writeLockSync(lockPath, lock);
        return lock;
      } catch {
        lastLock = readLockSync(lockPath);
      }
    }

    sleepSync(SQLITE_OPERATION_LOCK_RETRY_MS);
  }

  if (lastLock) {
    throw new Error(
      `Base ocupada temporalmente por ${lastLock.username}@${lastLock.hostname} (PID ${lastLock.pid}). Inténtalo de nuevo en unos segundos.`,
    );
  }

  throw new Error('No se ha podido adquirir el bloqueo temporal de operación SQLite.');
}

function withDatabaseOperationLockSync<T>(operation: () => T, waitMs = SQLITE_OPERATION_LOCK_WAIT_MS): T {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase !== 'active') {
    return operation();
  }

  const lockPath = getLockPath(currentStatus.path);
  const operationLock = acquireOperationLockSync(currentStatus.path, waitMs);
  try {
    return operation();
  } finally {
    removeLockSync(lockPath, operationLock.ownerId);
  }
}

async function withDatabaseOperationLock<T>(
  databasePath: string,
  operation: () => Promise<T>,
  waitMs = SQLITE_ASYNC_OPERATION_LOCK_WAIT_MS,
): Promise<T> {
  const lockPath = getLockPath(databasePath);
  const operationLock = await acquireLock(databasePath, waitMs);
  try {
    return await operation();
  } finally {
    await releaseLock(lockPath, operationLock).catch((error: unknown) => {
      console.warn('No se ha podido liberar el bloqueo temporal de operación SQLite.', error);
    });
  }
}

async function acquireLock(databasePath: string, waitMs = SQLITE_ASYNC_OPERATION_LOCK_WAIT_MS): Promise<DatabaseLockInfo> {
  const lockPath = getLockPath(databasePath);
  await mkdir(path.dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  let lastLock: DatabaseLockInfo | null = null;

  while (Date.now() - startedAt <= waitMs) {
    const existingLock = await readLock(lockPath);
    lastLock = existingLock;

    if (existingLock && isLockStale(existingLock)) {
      await removeStaleLock(lockPath, existingLock);
    }

    if (!existingLock) {
      await removeCorruptStaleLock(lockPath);
    }

    if (!existingLock || isLockStale(existingLock)) {
      const lock = createLockInfo();
      try {
        await writeLock(lockPath, lock);
        return lock;
      } catch {
        lastLock = await readLock(lockPath);
      }
    }

    await new Promise((resolve) => {
      setTimeout(resolve, SQLITE_OPERATION_LOCK_RETRY_MS);
    });
  }

  if (lastLock) {
    throw new Error(
      `Base ocupada temporalmente por ${lastLock.username}@${lastLock.hostname} (PID ${lastLock.pid}). Inténtalo de nuevo en unos segundos.`,
    );
  }

  throw new Error('No se ha podido adquirir el bloqueo temporal de operación SQLite.');
}

async function acquireStartupLock(databasePath: string): Promise<DatabaseLockInfo> {
  const startedAt = Date.now();
  let lastError: unknown = null;

  while (Date.now() - startedAt <= STARTUP_LOCK_WAIT_MS) {
    try {
      return await acquireLock(databasePath);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => {
        setTimeout(resolve, STARTUP_LOCK_RETRY_MS);
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('No se ha podido adquirir el bloqueo temporal de arranque SQLite.');
}

export function setDatabaseConnectivityIssueNotifier(
  notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null,
): void {
  notifyDatabaseConnectivityIssue = notifier;
}

function publishDatabaseConnectivityIssue(payload: DatabaseConnectivityIssuePayload): void {
  notifyDatabaseConnectivityIssue?.(payload);
}

function markHeartbeatFailure(error: unknown): void {
  heartbeatConsecutiveFailureCount += 1;
  console.warn('No se ha podido renovar el bloqueo SQLite de sesión.', error);

  if (heartbeatConsecutiveFailureCount < 3) {
    return;
  }

  databaseWriteBlockedByHeartbeat = true;
  publishDatabaseConnectivityIssue({
    blocked: true,
    failedHeartbeatCount: heartbeatConsecutiveFailureCount,
    updatedAt: new Date().toISOString(),
    message: DATABASE_HEARTBEAT_BLOCKED_MESSAGE,
  });
}

function markHeartbeatRecovered(): void {
  if (heartbeatConsecutiveFailureCount === 0 && !databaseWriteBlockedByHeartbeat) {
    return;
  }

  heartbeatConsecutiveFailureCount = 0;

  if (databaseWriteBlockedByHeartbeat) {
    databaseWriteBlockedByHeartbeat = false;
    publishDatabaseConnectivityIssue({
      blocked: false,
      failedHeartbeatCount: 0,
      updatedAt: new Date().toISOString(),
      message: 'La conexión con la carpeta compartida de SQLite se ha recuperado. Escrituras reactivadas.',
    });
  }
}

function assertDatabaseWritesAllowed(): void {
  if (!databaseWriteBlockedByHeartbeat) {
    return;
  }

  throw new Error(`Escritura bloqueada: ${DATABASE_HEARTBEAT_BLOCKED_MESSAGE}`);
}

async function heartbeatDatabaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
  const currentLock = await readLock(lockPath);
  if (currentLock?.ownerId !== lock.ownerId) {
    throw new Error('El bloqueo SQLite de sesión ya no pertenece a esta instancia.');
  }

  await writeFile(
    getLockInfoPath(lockPath),
    JSON.stringify({ ...currentLock, updatedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
}

function startDatabaseLockHeartbeat(lockPath: string, lock: DatabaseLockInfo): ReturnType<typeof setInterval> {
  return setInterval(() => {
    heartbeatDatabaseLock(lockPath, lock)
      .then(() => markHeartbeatRecovered())
      .catch((error: unknown) => markHeartbeatFailure(error));
  }, LOCK_HEARTBEAT_MS);
}

async function releaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
  const currentLock = await readLock(lockPath);
  if (currentLock?.ownerId !== lock.ownerId) {
    return;
  }

  await unlink(getLockInfoPath(lockPath)).catch(() => undefined);
  await rmdir(lockPath).catch(() => undefined);
}

async function releaseActiveSessionLock(): Promise<void> {
  const sessionLock = activeDatabaseLock;
  if (!sessionLock) {
    return;
  }

  activeDatabaseLock = null;
  clearInterval(sessionLock.heartbeat);
  await releaseLock(sessionLock.lockPath, sessionLock.lock).catch((error: unknown) => {
    console.warn('No se ha podido liberar el bloqueo SQLite de sesión.', error);
  });
}

async function pruneEmergencyDatabaseBackups(databasePath: string, retentionCount = 1): Promise<void> {
  const directory = path.dirname(databasePath);
  const prefix = `${path.basename(databasePath)}.backup-`;
  const entries = await readdir(directory).catch(() => []);
  const backups = entries
    .filter((entry) => entry.startsWith(prefix))
    .sort()
    .reverse();

  await Promise.all(
    backups.slice(retentionCount).map((entry) =>
      unlink(path.join(directory, entry)).catch(() => undefined),
    ),
  );
}


async function backupExistingDatabase(databasePath: string): Promise<void> {
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
    const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'ENOSPC') {
      console.warn('No hay espacio para crear la copia preventiva SQLite. Se continúa sin bloquear el guardado.', error);
      await pruneEmergencyDatabaseBackups(databasePath, 1);
      return;
    }

    throw error;
  }
}

async function ensureDirectoryIsUsable(directoryPath: string): Promise<void> {
  await mkdir(directoryPath, { recursive: true });
  await access(directoryPath, constants.R_OK | constants.W_OK);
  const probePath = path.join(directoryPath, `.traccion-write-test-${process.pid}-${Date.now()}`);
  await writeFile(probePath, 'ok', { encoding: 'utf8', flag: 'wx' });
  await unlink(probePath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function readCurrentSchemaVersion(db: Database): number {
  const row = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .get();

  return isSchemaMigrationRow(row) ? row.version : 0;
}

function migrateToVersion1(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS persisted_records (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'sqlite-primary',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_storage_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 1) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      1,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion2(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS editing_locks (
      module TEXT NOT NULL,
      record_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      machine_name TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (module, record_id)
    );
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 2) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      2,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion3(db: Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_persisted_records_updated_at
      ON persisted_records(updated_at);

    CREATE INDEX IF NOT EXISTS idx_editing_locks_expires_at
      ON editing_locks(expires_at);
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 3) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      3,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion4(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_task_records_updated_at
      ON task_records(updated_at);

    CREATE INDEX IF NOT EXISTS idx_task_records_deleted_at
      ON task_records(deleted_at);
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 4) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      4,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion5(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sorteos_draw_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sorteos_exclusion_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sorteos_draw_records_updated_at
      ON sorteos_draw_records(updated_at);

    CREATE INDEX IF NOT EXISTS idx_sorteos_exclusion_records_updated_at
      ON sorteos_exclusion_records(updated_at);
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 5) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      5,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion6(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS employee_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_employee_records_updated_at
      ON employee_records(updated_at);

    CREATE INDEX IF NOT EXISTS idx_employee_records_deleted_at
      ON employee_records(deleted_at);
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 6) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      6,
      new Date().toISOString(),
    );
  }
}

function applyMigrations(db: Database): void {
  migrateToVersion1(db);
  migrateToVersion2(db);
  migrateToVersion3(db);
  migrateToVersion4(db);
  migrateToVersion5(db);
  migrateToVersion6(db);
}

function openDatabase(databasePath: string): Database {
  const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;
  const db = new BetterSqlite3(databasePath);
  db.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  // En carpetas SMB/WAL se han observado corrupciones con varias instancias.
  // La concurrencia se coordina con un lock corto por operación, así que usamos
  // rollback journal clásico, más compatible con red que WAL/-shm.
  db.pragma('journal_mode = DELETE');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

function closeDatabase(): void {
  if (database) {
    database.close();
    database = null;
  }
}

async function closeDatabaseAndReleaseLock(): Promise<void> {
  if (database) {
    database.close();
    database = null;
  }

  await releaseActiveSessionLock();
}

async function prepareDatabaseAtPath(
  databasePath: string,
  sourceDatabasePath: string | null,
): Promise<void> {
  const targetExists = await fileExists(databasePath);
  if (targetExists) {
    return;
  }

  if (
    sourceDatabasePath &&
    sourceDatabasePath !== databasePath &&
    (await fileExists(sourceDatabasePath))
  ) {
    await copyFile(sourceDatabasePath, databasePath);
  }
}

async function activateDatabase(
  directoryPath: string,
  isDefaultPath: boolean,
  sourceDatabasePath: string | null,
): Promise<DatabaseStatus> {
  const databasePath = getDatabasePathForDirectory(directoryPath);
  const lockPath = getLockPath(databasePath);
  await ensureDirectoryIsUsable(directoryPath);

  // Bloqueo temporal solo para la fase delicada de arranque: creación inicial,
  // copia desde origen y migraciones. No se mantiene como lock de sesión porque
  // bloquearía al segundo usuario. La confiabilidad multiusuario se apoya en un
  // único lock corto por operación crítica SQLite, compartido también por backups.
  const startupLock = await acquireStartupLock(databasePath);
  const startupLockHeartbeat = startDatabaseLockHeartbeat(lockPath, startupLock);

  try {
    await prepareDatabaseAtPath(databasePath, sourceDatabasePath);
    const db = openDatabase(databasePath);
    database = db;
    status = {
      ready: true,
      engine: 'better-sqlite3',
      phase: 'active',
      path: databasePath,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      isDefaultPath,
      lockPath,
    };
    clearInterval(startupLockHeartbeat);
    await releaseLock(lockPath, startupLock);
    return status;
  } catch (error) {
    clearInterval(startupLockHeartbeat);
    await releaseLock(lockPath, startupLock);
    throw error;
  }
}

export async function initializeSqlitePersistence(): Promise<DatabaseStatus> {
  if (status) {
    return status;
  }

  const configured = await getConfiguredDatabaseDirectory();
  const databasePath = getDatabasePathForDirectory(configured.directoryPath);
  const lockPath = getLockPath(databasePath);

  try {
    return await activateDatabase(configured.directoryPath, configured.isDefaultPath, null);
  } catch (error) {
    const currentLock = await readLock(lockPath);
    status = {
      ready: false,
      engine: 'better-sqlite3',
      phase: isSqliteCorruptionError(error)
        ? 'error'
        : error instanceof Error && error.message.startsWith('Base ocupada')
          ? 'locked'
          : 'fallback',
      path: databasePath,
      schemaVersion: 0,
      isDefaultPath: configured.isDefaultPath,
      lockPath,
      lock: currentLock ?? undefined,
      message: isSqliteCorruptionError(error)
        ? `Base de datos SQLite dañada: ${error instanceof Error ? error.message : 'error desconocido'}. Restaura una copia de seguridad antes de seguir trabajando.`
        : error instanceof Error
          ? error.message
          : 'SQLite no está disponible; se mantiene localStorage.',
    };
  }

  return getSqliteStatus();
}

function requireDatabase(): Database {
  if (!database) {
    throw new Error('SQLite no está inicializado.');
  }

  return database;
}

function isSqliteCorruptionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('database disk image is malformed') ||
    message.includes('database corruption') ||
    message.includes('file is not a database')
  );
}

function isSqliteLockContentionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('base ocupada') || message.includes('bloqueo temporal');
}

function markDatabaseAsCorrupted(error: unknown): DatabaseStatus {
  const previousStatus = getSqliteStatus();
  const message =
    error instanceof Error
      ? `Base de datos SQLite dañada: ${error.message}. Restaura una copia de seguridad antes de seguir trabajando.`
      : 'Base de datos SQLite dañada. Restaura una copia de seguridad antes de seguir trabajando.';

  try {
    closeDatabase();
  } catch {
    database = null;
  }

  status = {
    ...previousStatus,
    ready: false,
    phase: 'error',
    message,
  };

  return status;
}

async function safeDatabaseOperation<T>(
  operation: () => T,
  fallback: (status: DatabaseStatus, message: string) => T,
): Promise<T> {
  const currentStatus = getSqliteStatus();
  try {
    return await withDatabaseOperationLock(currentStatus.path, async () => operation());
  } catch (error) {
    if (isSqliteCorruptionError(error)) {
      const nextStatus = markDatabaseAsCorrupted(error);
      return fallback(nextStatus, nextStatus.message ?? 'Base de datos SQLite dañada.');
    }

    throw error;
  }
}

export function getSqliteStatus(): DatabaseStatus {
  const fallbackPath = getDatabasePathForDirectory(getDefaultDatabaseDirectory());

  if (status?.ready && status.phase === 'active' && databaseWriteBlockedByHeartbeat) {
    return {
      ...status,
      message: DATABASE_HEARTBEAT_BLOCKED_MESSAGE,
    };
  }

  return (
    status ?? {
      ready: false,
      engine: 'better-sqlite3',
      phase: 'prepared',
      path: fallbackPath,
      schemaVersion: 0,
      isDefaultPath: true,
      lockPath: getLockPath(fallbackPath),
    }
  );
}

interface PersistedRecordRow {
  key: string;
  value_json: string;
  updated_at: string;
}

interface MetadataRow {
  value: string;
}

interface UpdatedAtRow {
  updated_at: string;
}

interface TaskRecordRow {
  id: string;
  value_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface SorteosRecordRow {
  id: string;
  value_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface EmployeeRecordRow {
  id: string;
  value_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface CountRow {
  count: number;
}

function isPersistedRecordRow(value: unknown): value is PersistedRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PersistedRecordRow>;
  return (
    typeof candidate.key === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.updated_at === 'string'
  );
}

function isTaskRecordRow(value: unknown): value is TaskRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TaskRecordRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string' &&
    (candidate.deleted_at === null || typeof candidate.deleted_at === 'string')
  );
}

function isSorteosRecordRow(value: unknown): value is SorteosRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SorteosRecordRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string' &&
    (candidate.deleted_at === null || typeof candidate.deleted_at === 'string')
  );
}

function isEmployeeRecordRow(value: unknown): value is EmployeeRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<EmployeeRecordRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string' &&
    (candidate.deleted_at === null || typeof candidate.deleted_at === 'string')
  );
}

function isCountRow(value: unknown): value is CountRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CountRow>;
  return typeof candidate.count === 'number';
}

function isJsonObjectWithStringId(value: unknown): value is { id: string; createdAt?: unknown; updatedAt?: unknown; deletedAt?: unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { id?: unknown };
  return typeof candidate.id === 'string' && candidate.id.trim().length > 0;
}

function isMetadataRow(value: unknown): value is MetadataRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MetadataRow>;
  return typeof candidate.value === 'string';
}

function isUpdatedAtRow(value: unknown): value is UpdatedAtRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<UpdatedAtRow>;
  return typeof candidate.updated_at === 'string';
}

function readPersistedRecordByKey(
  db: Database,
  key: string,
): PersistedStorageRecordSnapshot | null {
  const row = db
    .prepare('SELECT key, value_json, updated_at FROM persisted_records WHERE key = ?')
    .get(key);

  return isPersistedRecordRow(row)
    ? { key: row.key, value: row.value_json, updatedAt: row.updated_at }
    : null;
}

function readAllPersistedRecords(db: Database): PersistedStorageRecordSnapshot[] {
  return db
    .prepare('SELECT key, value_json, updated_at FROM persisted_records ORDER BY key')
    .all()
    .filter(isPersistedRecordRow)
    .map((row) => ({
      key: row.key,
      value: row.value_json,
      updatedAt: row.updated_at,
    }));
}

function enqueueLocalBackup(reason: string): void {
  pendingLocalBackupReason = pendingLocalBackupReason ? `${pendingLocalBackupReason}, ${reason}` : reason;

  if (localBackupTimer) {
    clearTimeout(localBackupTimer);
  }

  localBackupTimer = setTimeout(() => {
    const reasonToWrite = pendingLocalBackupReason ?? reason;
    pendingLocalBackupReason = null;
    localBackupTimer = null;

    localBackupQueue = localBackupQueue
      .then(() => writeLocalBackupArtifacts(reasonToWrite))
      .catch((error: unknown) => {
        console.warn('No se ha podido actualizar la copia local de respaldo SQLite.', error);
      });
  }, LOCAL_LIVE_BACKUP_DEBOUNCE_MS);
}

async function writeLocalBackupArtifacts(reason: string): Promise<void> {
  const currentDatabase = database;
  const currentStatus = getSqliteStatus();
  if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
    return;
  }

  const backupDirectory = getLocalBackupDirectory();
  await mkdir(backupDirectory, { recursive: true });

  let backupLock: DatabaseLockInfo;
  try {
    backupLock = await acquireLock(currentStatus.path);
  } catch (error) {
    if (isSqliteLockContentionError(error)) {
      console.info('Copia local SQLite omitida: base compartida ocupada temporalmente.');
      return;
    }
    throw error;
  }

  const backupLockPath = getLockPath(currentStatus.path);
  const backupLockHeartbeat = startDatabaseLockHeartbeat(backupLockPath, backupLock);

  try {
    const now = new Date().toISOString();
    const backupTimestamp = backupTimestampForFileName();
    const records = readAllPersistedRecords(currentDatabase);
    const payload = {
      createdAt: now,
      sourceDatabasePath: currentStatus.path,
      reason,
      recordCount: records.length,
      records,
    };
    const serializedPayload = JSON.stringify(payload, null, 2);

    const shouldRotateBackup = await shouldCreateRotatedLocalBackup(reason);

    await writeFile(getLocalBackupJsonPath(), serializedPayload, 'utf8');
    if (shouldRotateBackup) {
      await writeFile(getRotatedLocalBackupJsonPath(backupTimestamp), serializedPayload, 'utf8');
    }
    await pruneRotatedLocalBackups('json');

    try {
      await copyFile(currentStatus.path, getLocalBackupDatabasePath());
      if (shouldRotateBackup) {
        await copyFile(currentStatus.path, getRotatedLocalBackupDatabasePath(backupTimestamp));
      }
      await pruneRotatedLocalBackups('sqlite');
    } catch (error) {
      console.warn('No se ha podido copiar la base SQLite activa al respaldo local.', error);
    }

    try {
      await writeSharedSqliteBackup(currentStatus.path, backupTimestamp);
    } catch (error) {
      console.warn('No se ha podido crear la copia SQLite en la carpeta compartida.', error);
    }
  } finally {
    clearInterval(backupLockHeartbeat);
    await releaseLock(backupLockPath, backupLock).catch((error: unknown) => {
      console.warn('No se ha podido liberar el bloqueo SQLite de respaldo local.', error);
    });
  }
}

async function flushPendingLocalBackup(): Promise<void> {
  const reasonToWrite = pendingLocalBackupReason;

  if (localBackupTimer) {
    clearTimeout(localBackupTimer);
    localBackupTimer = null;
  }

  pendingLocalBackupReason = null;
  await localBackupQueue;

  if (reasonToWrite) {
    await writeLocalBackupArtifacts(reasonToWrite);
  }

  await localBackupQueue;
}

async function writeShutdownLocalBackupArtifacts(): Promise<void> {
  const currentDatabase = database;
  const currentStatus = getSqliteStatus();
  if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
    return;
  }

  const backupDirectory = getLocalShutdownBackupDirectory();
  await mkdir(backupDirectory, { recursive: true });

  let backupLock: DatabaseLockInfo;
  try {
    backupLock = await acquireLock(currentStatus.path);
  } catch (error) {
    if (isSqliteLockContentionError(error)) {
      console.info('Copia local SQLite omitida: base compartida ocupada temporalmente.');
      return;
    }
    throw error;
  }

  const backupLockPath = getLockPath(currentStatus.path);
  const backupLockHeartbeat = startDatabaseLockHeartbeat(backupLockPath, backupLock);

  try {
    const now = new Date().toISOString();
    const backupTimestamp = backupTimestampForFileName();
    const records = readAllPersistedRecords(currentDatabase);
    const payload = {
      createdAt: now,
      sourceDatabasePath: currentStatus.path,
      reason: 'shutdown',
      recordCount: records.length,
      records,
    };
    const serializedPayload = JSON.stringify(payload, null, 2);

    await writeFile(getShutdownLocalBackupJsonPath(backupTimestamp), serializedPayload, 'utf8');
    await pruneShutdownLocalBackups('json');

    try {
      await copyFile(currentStatus.path, getShutdownLocalBackupDatabasePath(backupTimestamp));
      await pruneShutdownLocalBackups('sqlite');
    } catch (error) {
      console.warn('No se ha podido crear la copia local de cierre SQLite.', error);
    }

    try {
      await writeSharedSqliteBackup(currentStatus.path, backupTimestamp);
    } catch (error) {
      console.warn('No se ha podido crear la copia SQLite de cierre en la carpeta compartida.', error);
    }
  } finally {
    clearInterval(backupLockHeartbeat);
    await releaseLock(backupLockPath, backupLock).catch((error: unknown) => {
      console.warn('No se ha podido liberar el bloqueo SQLite de respaldo de cierre.', error);
    });
  }
}

export async function createShutdownLocalBackup(): Promise<void> {
  await flushPendingLocalBackup();
  await writeShutdownLocalBackupArtifacts();
}

function updateRefreshMetadata(db: Database, updatedAt: string): void {
  const token = `${updatedAt}:${ownerId}`;
  db.prepare(
    `INSERT INTO app_metadata (key, value, updated_at)
     VALUES ('persisted_records_refresh_token', ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run(token, updatedAt);
}

function readRefreshToken(db: Database): string | null {
  const row = db
    .prepare("SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'")
    .get();
  return isMetadataRow(row) ? row.value : null;
}

export async function savePersistedRecord(record: PersistedStorageRecord): Promise<DatabaseStatus> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase === 'locked' || databaseWriteBlockedByHeartbeat) {
        return currentStatus;
      }

      assertDatabaseWritesAllowed();

      const now = new Date().toISOString();
      const db = requireDatabase();
      db.transaction(() => {
        db.prepare(
          `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
             VALUES (?, ?, 'sqlite-primary', ?, ?)
             ON CONFLICT(key) DO UPDATE SET
               value_json = excluded.value_json,
               source = excluded.source,
               updated_at = excluded.updated_at`,
        ).run(record.key, record.value, now, now);
        updateRefreshMetadata(db, now);
      })();
      enqueueLocalBackup(`save:${record.key}`);

      return currentStatus;
    },
    (nextStatus) => nextStatus,
  );
}

export interface ConditionalPersistedRecordSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentUpdatedAt: string | null;
  message: string;
}

export async function savePersistedRecordIfUnchanged(
  record: ConditionalPersistedStorageRecord,
): Promise<ConditionalPersistedRecordSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentUpdatedAt: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalPersistedRecordSaveResult => {
        const row = db
          .prepare('SELECT updated_at FROM persisted_records WHERE key = ?')
          .get(record.key);
        const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

        if (currentUpdatedAt !== record.expectedUpdatedAt) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt,
            message:
              'Los datos compartidos han cambiado mientras guardabas. Recarga antes de continuar para no pisar cambios de otro usuario.',
          };
        }

        const now = new Date().toISOString();

        if (currentUpdatedAt === null) {
          const insertResult = db
            .prepare(
              `INSERT OR IGNORE INTO persisted_records (key, value_json, source, created_at, updated_at)
               VALUES (?, ?, 'sqlite-primary', ?, ?)`,
            )
            .run(record.key, record.value, now, now);

          if (insertResult.changes !== 1) {
            const latest = db
              .prepare('SELECT updated_at FROM persisted_records WHERE key = ?')
              .get(record.key);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message:
                'Los datos compartidos han cambiado mientras guardabas. Recarga antes de continuar para no pisar cambios de otro usuario.',
            };
          }
        } else {
          const updateResult = db
            .prepare(
              `UPDATE persisted_records
               SET value_json = ?, source = 'sqlite-primary', updated_at = ?
               WHERE key = ? AND updated_at = ?`,
            )
            .run(record.value, now, record.key, currentUpdatedAt);

          if (updateResult.changes !== 1) {
            const latest = db
              .prepare('SELECT updated_at FROM persisted_records WHERE key = ?')
              .get(record.key);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message:
                'Los datos compartidos han cambiado mientras guardabas. Recarga antes de continuar para no pisar cambios de otro usuario.',
            };
          }
        }

        updateRefreshMetadata(db, now);

        return {
          ok: true,
          status: currentStatus,
          currentUpdatedAt: now,
          message: 'Guardado confirmado en SQLite compartido.',
        };
      })();

      if (result.ok) {
        enqueueLocalBackup(`save:${record.key}`);
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentUpdatedAt: null,
      message,
    }),
  );
}

function mapTaskRecordRow(row: TaskRecordRow): SqliteTaskRecord {
  return {
    id: row.id,
    value: row.value_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function readTaskRecords(db: Database, filter: SqliteTaskRecordsFilter = {}): SqliteTaskRecord[] {
  const mode = filter.mode ?? 'all';
  const whereClause =
    mode === 'active'
      ? "WHERE deleted_at IS NULL AND COALESCE(json_extract(value_json, '$.closedAt'), '') = '' AND json_extract(value_json, '$.estado') <> 'cerrada'"
      : mode === 'historical'
        ? "WHERE deleted_at IS NULL AND (COALESCE(json_extract(value_json, '$.closedAt'), '') <> '' OR json_extract(value_json, '$.estado') = 'cerrada')"
        : '';

  return db
    .prepare(`SELECT id, value_json, created_at, updated_at, deleted_at FROM task_records ${whereClause} ORDER BY created_at, id`)
    .all()
    .filter(isTaskRecordRow)
    .map(mapTaskRecordRow);
}

function maybeMigrateTasksFromPersistedRecord(db: Database): void {
  const taskCountRow = db.prepare('SELECT COUNT(*) AS count FROM task_records').get();
  const taskCount = isCountRow(taskCountRow) ? taskCountRow.count : 0;
  if (taskCount > 0) {
    return;
  }

  const legacyRecord = readPersistedRecordByKey(db, 'traccion.v1.tareas.tasks');
  if (!legacyRecord) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(legacyRecord.value);
  } catch {
    return;
  }

  if (!Array.isArray(parsed)) {
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO task_records (id, value_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  for (const item of parsed) {
    if (!isJsonObjectWithStringId(item)) {
      continue;
    }

    const createdAt = typeof item.createdAt === 'string' ? item.createdAt : now;
    const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : createdAt;
    const deletedAt = typeof item.deletedAt === 'string' ? item.deletedAt : null;
    insert.run(item.id, JSON.stringify(item), createdAt, updatedAt, deletedAt);
  }
}


function mapEmployeeRecordRow(row: EmployeeRecordRow): SqliteEmployeeRecord {
  return {
    id: row.id,
    value: row.value_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function isJsonObjectWithEmpleado(value: unknown): value is { empleado: string; deletedAt?: unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { empleado?: unknown };
  return typeof candidate.empleado === 'string' && candidate.empleado.trim().length > 0;
}

function maybeMigrateEmployeesFromPersistedRecord(db: Database): void {
  const employeeCountRow = db.prepare('SELECT COUNT(*) AS count FROM employee_records').get();
  const employeeCount = isCountRow(employeeCountRow) ? employeeCountRow.count : 0;
  if (employeeCount > 0) {
    return;
  }

  const legacyRecord = readPersistedRecordByKey(db, 'traccion.v1.plantilla.employees');
  if (!legacyRecord) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(legacyRecord.value);
  } catch {
    return;
  }

  if (!Array.isArray(parsed)) {
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO employee_records (id, value_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  for (const item of parsed) {
    if (!isJsonObjectWithEmpleado(item)) {
      continue;
    }

    const deletedAt = typeof item.deletedAt === 'string' ? item.deletedAt : null;
    insert.run(item.empleado, JSON.stringify(item), now, now, deletedAt);
  }
}

function readEmployeeRecords(db: Database): SqliteEmployeeRecord[] {
  return db
    .prepare('SELECT id, value_json, created_at, updated_at, deleted_at FROM employee_records ORDER BY id')
    .all()
    .filter(isEmployeeRecordRow)
    .map(mapEmployeeRecordRow);
}

export async function loadEmployeeRecordsSnapshot(): Promise<SqliteEmployeeRecordsSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active') {
        return { status: currentStatus, records: [] };
      }

      const db = requireDatabase();
      db.transaction(() => maybeMigrateEmployeesFromPersistedRecord(db))();
      return { status: currentStatus, records: readEmployeeRecords(db) };
    },
    (nextStatus) => ({ status: nextStatus, records: [] }),
  );
}

export async function saveEmployeeRecordIfUnchanged(
  record: ConditionalSqliteEmployeeRecord,
): Promise<ConditionalSqliteEmployeeSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentValue: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalSqliteEmployeeSaveResult => {
        maybeMigrateEmployeesFromPersistedRecord(db);
        const row = db.prepare('SELECT value_json FROM employee_records WHERE id = ?').get(record.id);
        const currentValue = row && typeof row === 'object' && typeof (row as { value_json?: unknown }).value_json === 'string'
          ? (row as { value_json: string }).value_json
          : null;

        if (currentValue !== record.expectedValue) {
          return {
            ok: false,
            status: currentStatus,
            currentValue,
            message:
              'Esta persona ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
          };
        }

        const now = new Date().toISOString();
        let parsed: unknown;
        try {
          parsed = JSON.parse(record.value);
        } catch {
          parsed = null;
        }
        const deletedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string'
            ? (parsed as { deletedAt: string }).deletedAt
            : null;

        if (currentValue === null) {
          const insertResult = db
            .prepare(
              `INSERT OR IGNORE INTO employee_records (id, value_json, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(record.id, record.value, now, now, deletedAt);

          if (insertResult.changes !== 1) {
            const latest = db.prepare('SELECT value_json FROM employee_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentValue: latest && typeof latest === 'object' && typeof (latest as { value_json?: unknown }).value_json === 'string'
                ? (latest as { value_json: string }).value_json
                : null,
              message: 'La persona ya existe en la base compartida. Recarga antes de continuar.',
            };
          }
        } else {
          const updateResult = db
            .prepare(
              `UPDATE employee_records
               SET value_json = ?, updated_at = ?, deleted_at = ?
               WHERE id = ? AND value_json = ?`,
            )
            .run(record.value, now, deletedAt, record.id, currentValue);

          if (updateResult.changes !== 1) {
            const latest = db.prepare('SELECT value_json FROM employee_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentValue: latest && typeof latest === 'object' && typeof (latest as { value_json?: unknown }).value_json === 'string'
                ? (latest as { value_json: string }).value_json
                : null,
              message:
                'Esta persona ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
            };
          }
        }

        updateRefreshMetadata(db, now);

        return {
          ok: true,
          status: currentStatus,
          currentValue: record.value,
          message: 'Persona guardada en SQLite.',
        };
      })();

      if (result.ok) {
        enqueueLocalBackup('save:employee_records');
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentValue: null,
      message,
    }),
  );
}

export async function loadTaskRecordsSnapshot(filter: SqliteTaskRecordsFilter = {}): Promise<SqliteTaskRecordsSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active') {
        return { status: currentStatus, records: [] };
      }

      const db = requireDatabase();
      db.transaction(() => maybeMigrateTasksFromPersistedRecord(db))();
      return { status: currentStatus, records: readTaskRecords(db, filter) };
    },
    (nextStatus) => ({ status: nextStatus, records: [] }),
  );
}

export async function saveTaskRecordIfUnchanged(
  record: ConditionalSqliteTaskRecord,
): Promise<ConditionalSqliteTaskSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentUpdatedAt: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalSqliteTaskSaveResult => {
        maybeMigrateTasksFromPersistedRecord(db);
        const row = db.prepare('SELECT updated_at FROM task_records WHERE id = ?').get(record.id);
        const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

        if (currentUpdatedAt !== record.expectedUpdatedAt) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt,
            message:
              'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
          };
        }

        const now = new Date().toISOString();
        let parsed: unknown;
        try {
          parsed = JSON.parse(record.value);
        } catch {
          parsed = null;
        }
        const deletedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string'
            ? (parsed as { deletedAt: string }).deletedAt
            : null;
        const createdAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { createdAt?: unknown }).createdAt === 'string'
            ? (parsed as { createdAt: string }).createdAt
            : now;
        const updatedAt =
          parsed && typeof parsed === 'object' && typeof (parsed as { updatedAt?: unknown }).updatedAt === 'string'
            ? (parsed as { updatedAt: string }).updatedAt
            : now;

        if (currentUpdatedAt === null) {
          const insertResult = db
            .prepare(
              `INSERT OR IGNORE INTO task_records (id, value_json, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(record.id, record.value, createdAt, updatedAt, deletedAt);

          if (insertResult.changes !== 1) {
            const latest = db.prepare('SELECT updated_at FROM task_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message:
                'La tarea ya existe en la base compartida. Recarga antes de continuar.',
            };
          }
        } else {
          const updateResult = db
            .prepare(
              `UPDATE task_records
               SET value_json = ?, updated_at = ?, deleted_at = ?
               WHERE id = ? AND updated_at = ?`,
            )
            .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

          if (updateResult.changes !== 1) {
            const latest = db.prepare('SELECT updated_at FROM task_records WHERE id = ?').get(record.id);
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
              message:
                'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
            };
          }
        }

        updateRefreshMetadata(db, updatedAt);

        return {
          ok: true,
          status: currentStatus,
          currentUpdatedAt: updatedAt,
          message: 'Tarea guardada en SQLite.',
        };
      })();

      if (result.ok) {
        enqueueLocalBackup('save:task_records');
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentUpdatedAt: null,
      message,
    }),
  );
}

function mapSorteosRecordRow(row: SorteosRecordRow): SqliteSorteosRecord {
  return {
    id: row.id,
    value: row.value_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function readAllSorteosRows(db: Database, tableName: 'sorteos_draw_records' | 'sorteos_exclusion_records'): SqliteSorteosRecord[] {
  return db
    .prepare(`SELECT id, value_json, created_at, updated_at, deleted_at FROM ${tableName} WHERE deleted_at IS NULL ORDER BY created_at, id`)
    .all()
    .filter(isSorteosRecordRow)
    .map(mapSorteosRecordRow);
}

function getSorteosCollectionUpdatedAt(db: Database, tableName: 'sorteos_draw_records' | 'sorteos_exclusion_records'): string | null {
  const row = db.prepare(`SELECT MAX(updated_at) AS updated_at FROM ${tableName}`).get();
  return isUpdatedAtRow(row) ? row.updated_at : null;
}

function getTaskRecordsUpdatedAt(db: Database): string | null {
  const row = db.prepare('SELECT MAX(updated_at) AS updated_at FROM task_records').get();
  return isUpdatedAtRow(row) ? row.updated_at : null;
}

function migrateSorteosArrayFromPersistedRecord(
  db: Database,
  tableName: 'sorteos_draw_records' | 'sorteos_exclusion_records',
  storageKey: string,
): void {
  const countRow = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  const count = isCountRow(countRow) ? countRow.count : 0;
  if (count > 0) {
    return;
  }

  const legacyRecord = readPersistedRecordByKey(db, storageKey);
  if (!legacyRecord) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(legacyRecord.value);
  } catch {
    return;
  }

  if (!Array.isArray(parsed)) {
    return;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ${tableName} (id, value_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)`,
  );

  for (const item of parsed) {
    if (!isJsonObjectWithStringId(item)) {
      continue;
    }

    const createdAt = typeof item.createdAt === 'string' ? item.createdAt : now;
    const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : createdAt;
    insert.run(item.id, JSON.stringify(item), createdAt, updatedAt);
  }
}

function maybeMigrateSorteosFromPersistedRecords(db: Database): void {
  migrateSorteosArrayFromPersistedRecord(db, 'sorteos_draw_records', 'traccion.v1.sorteos.draws');
  migrateSorteosArrayFromPersistedRecord(db, 'sorteos_exclusion_records', 'traccion.v1.sorteos.exclusions');
}

export async function loadSorteosRecordsSnapshot(): Promise<SqliteSorteosRecordsSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active') {
        return { status: currentStatus, draws: [], exclusions: [], drawsUpdatedAt: null, exclusionsUpdatedAt: null };
      }

      const db = requireDatabase();
      db.transaction(() => maybeMigrateSorteosFromPersistedRecords(db))();
      return {
        status: currentStatus,
        draws: readAllSorteosRows(db, 'sorteos_draw_records'),
        exclusions: readAllSorteosRows(db, 'sorteos_exclusion_records'),
        drawsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_draw_records'),
        exclusionsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_exclusion_records'),
      };
    },
    (nextStatus) => ({
      status: nextStatus,
      draws: [],
      exclusions: [],
      drawsUpdatedAt: null,
      exclusionsUpdatedAt: null,
    }),
  );
}

function replaceSorteosTable(
  db: Database,
  tableName: 'sorteos_draw_records' | 'sorteos_exclusion_records',
  records: Array<{ id: string; value: string }>,
  timestamp: string,
): void {
  const incomingIds = new Set(records.map((record) => record.id));
  const existingRows = db
    .prepare(`SELECT id, value_json, created_at, updated_at, deleted_at FROM ${tableName}`)
    .all();
  const existingById = new Map<string, { value_json: string; created_at: string }>();

  for (const row of existingRows) {
    if (isSorteosRecordRow(row)) {
      existingById.set(row.id, { value_json: row.value_json, created_at: row.created_at });
    }
  }

  const upsert = db.prepare(
    `INSERT INTO ${tableName} (id, value_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, deleted_at = NULL`,
  );

  for (const record of records) {
    const existing = existingById.get(record.id);
    let parsed: unknown;
    try {
      parsed = JSON.parse(record.value);
    } catch {
      parsed = null;
    }
    const createdAt =
      existing?.created_at ??
      (parsed && typeof parsed === 'object' && typeof (parsed as { createdAt?: unknown }).createdAt === 'string'
        ? (parsed as { createdAt: string }).createdAt
        : timestamp);
    upsert.run(record.id, record.value, createdAt, timestamp);
  }

  const markDeleted = db.prepare(`UPDATE ${tableName} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`);
  for (const id of existingById.keys()) {
    if (!incomingIds.has(id)) {
      markDeleted.run(timestamp, timestamp, id);
    }
  }
}

export async function saveSorteosSnapshotIfUnchanged(
  snapshot: ConditionalSqliteSorteosSnapshot,
): Promise<ConditionalSqliteSorteosSaveResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || databaseWriteBlockedByHeartbeat) {
        return {
          ok: false,
          status: currentStatus,
          currentDrawsUpdatedAt: null,
          currentExclusionsUpdatedAt: null,
          message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
        };
      }

      assertDatabaseWritesAllowed();

      const db = requireDatabase();
      const result = db.transaction((): ConditionalSqliteSorteosSaveResult => {
        maybeMigrateSorteosFromPersistedRecords(db);
        const currentDrawsUpdatedAt = getSorteosCollectionUpdatedAt(db, 'sorteos_draw_records');
        const currentExclusionsUpdatedAt = getSorteosCollectionUpdatedAt(db, 'sorteos_exclusion_records');

        if (
          currentDrawsUpdatedAt !== snapshot.expectedDrawsUpdatedAt ||
          currentExclusionsUpdatedAt !== snapshot.expectedExclusionsUpdatedAt
        ) {
          return {
            ok: false,
            status: currentStatus,
            currentDrawsUpdatedAt,
            currentExclusionsUpdatedAt,
            message:
              'Los sorteos han cambiado mientras guardabas. Recarga antes de continuar para no sobrescribir cambios.',
          };
        }

        const now = new Date().toISOString();
        replaceSorteosTable(db, 'sorteos_draw_records', snapshot.draws, now);
        replaceSorteosTable(db, 'sorteos_exclusion_records', snapshot.exclusions, now);
        updateRefreshMetadata(db, now);

        return {
          ok: true,
          status: currentStatus,
          currentDrawsUpdatedAt: now,
          currentExclusionsUpdatedAt: now,
          message: 'Sorteos guardados en SQLite.',
        };
      })();

      if (result.ok) {
        enqueueLocalBackup('save:sorteos_records');
      }

      return result;
    },
    (nextStatus, message) => ({
      ok: false,
      status: nextStatus,
      currentDrawsUpdatedAt: null,
      currentExclusionsUpdatedAt: null,
      message,
    }),
  );
}

export async function migrateLocalStorageSnapshot(payload: LocalStorageBackupPayload): Promise<DatabaseStatus> {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase === 'locked' || databaseWriteBlockedByHeartbeat) {
    return currentStatus;
  }

  assertDatabaseWritesAllowed();
  return withDatabaseOperationLock(currentStatus.path, async () => {
    const db = requireDatabase();
    const now = new Date().toISOString();
    const records = payload.records.filter(
      (record): record is PersistedStorageRecord =>
        typeof record.key === 'string' && typeof record.value === 'string',
    );

    const migrateSnapshotTransaction = db.transaction(() => {
      db.prepare('INSERT INTO local_storage_backups (created_at, payload_json) VALUES (?, ?)')
        .run(now, JSON.stringify({ records }));

      const upsert = db.prepare(
        `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
         VALUES (?, ?, 'sqlite-primary', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           source = excluded.source,
           updated_at = excluded.updated_at`,
      );

      for (const record of records) {
        upsert.run(record.key, record.value, now, now);
      }

      if (records.length > 0) {
        updateRefreshMetadata(db, now);
      }
    });

    migrateSnapshotTransaction();

    if (records.length > 0) {
      enqueueLocalBackup('migrate-local-storage-snapshot');
    }

    return currentStatus;
  });
}

export async function createLocalStorageBackup(payload: LocalStorageBackupPayload): Promise<DatabaseStatus> {
  return safeDatabaseOperation(
    () => {
      assertDatabaseWritesAllowed();
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase === 'locked') {
        return currentStatus;
      }

      const records = payload.records.filter(
        (record): record is PersistedStorageRecord =>
          typeof record.key === 'string' && typeof record.value === 'string',
      );
      const db = requireDatabase();
      db.prepare('INSERT INTO local_storage_backups (created_at, payload_json) VALUES (?, ?)')
        .run(new Date().toISOString(), JSON.stringify({ records }));
      enqueueLocalBackup('local-storage-backup');

      return currentStatus;
    },
    (nextStatus) => nextStatus,
  );
}

export async function listLocalBackups(): Promise<LocalBackupEntry[]> {
  await pruneRotatedLocalBackups('json');
  await pruneRotatedLocalBackups('sqlite');
  await pruneShutdownLocalBackups('json');
  await pruneShutdownLocalBackups('sqlite');

  const readBackupEntries = async (
    backupDirectory: string,
    fileNamePredicate: (fileName: string) => boolean,
    idPrefix = '',
  ): Promise<LocalBackupEntry[]> => {
    const entries = await readdir(backupDirectory).catch(() => []);
    const backups = await Promise.all(
      entries
        .filter(fileNamePredicate)
        .map(async (fileName): Promise<LocalBackupEntry | null> => {
          const kind = localBackupKindFromFileName(fileName);
          if (!kind) {
            return null;
          }

          const filePath = path.join(backupDirectory, fileName);
          const fileStat = await stat(filePath).catch(() => null);
          if (!fileStat?.isFile()) {
            return null;
          }

          return {
            id: `${idPrefix}${fileName}`,
            fileName,
            kind,
            path: filePath,
            sizeBytes: fileStat.size,
            createdAt: fileStat.mtime.toISOString(),
            isLiveCopy:
              !idPrefix &&
              (fileName === LOCAL_BACKUP_DATABASE_FILE_NAME || fileName === LOCAL_BACKUP_JSON_FILE_NAME),
          };
        }),
    );

    return backups.filter((entry): entry is LocalBackupEntry => Boolean(entry));
  };

  const [localBackups, shutdownBackups] = await Promise.all([
    readBackupEntries(getLocalBackupDirectory(), isLocalBackupFileName),
    readBackupEntries(getLocalShutdownBackupDirectory(), isShutdownBackupFileName, `${LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME}/`),
  ]);

  return [...localBackups, ...shutdownBackups]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function parseLocalBackupJson(raw: string): PersistedStorageRecord[] {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const records = (parsed as Partial<LocalStorageBackupPayload>).records;
  if (!Array.isArray(records)) {
    return [];
  }

  return records.filter(
    (record): record is PersistedStorageRecord =>
      Boolean(record) &&
      typeof (record as Partial<PersistedStorageRecord>).key === 'string' &&
      typeof (record as Partial<PersistedStorageRecord>).value === 'string',
  );
}

function resolveLocalBackupReference(fileName: string): { safeFileName: string; backupPath: string } | null {
  const normalizedReference = fileName.replace(/\\/g, '/');
  const isShutdownReference = normalizedReference.startsWith(`${LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME}/`);
  const rawFileName = isShutdownReference
    ? normalizedReference.slice(LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME.length + 1)
    : normalizedReference;
  const safeFileName = path.basename(rawFileName);

  if (safeFileName !== rawFileName || !isKnownBackupFileName(safeFileName)) {
    return null;
  }

  if (isShutdownReference) {
    return isShutdownBackupFileName(safeFileName)
      ? { safeFileName, backupPath: path.join(getLocalShutdownBackupDirectory(), safeFileName) }
      : null;
  }

  return isLocalBackupFileName(safeFileName)
    ? { safeFileName, backupPath: path.join(getLocalBackupDirectory(), safeFileName) }
    : null;
}

export async function restoreLocalBackup(fileName: string): Promise<RestoreLocalBackupResult> {
  const currentStatus = getSqliteStatus();
  const backupReference = resolveLocalBackupReference(fileName);

  if (!backupReference) {
    return { ok: false, status: currentStatus, message: 'Copia de respaldo no válida.' };
  }

  const { safeFileName, backupPath } = backupReference;
  const kind = localBackupKindFromFileName(safeFileName);
  if (!kind) {
    return { ok: false, status: currentStatus, message: 'Copia de respaldo no válida.' };
  }

  const backupStat = await stat(backupPath).catch(() => null);
  if (!backupStat?.isFile()) {
    return { ok: false, status: currentStatus, message: 'La copia de respaldo no existe.' };
  }

  if (kind === 'json') {
    const records = parseLocalBackupJson(await readFile(backupPath, 'utf8'));
    if (records.length === 0) {
      return { ok: false, status: currentStatus, message: 'El respaldo JSON no contiene registros recuperables.' };
    }

    if (currentStatus.ready && currentStatus.phase === 'active') {
      enqueueLocalBackup(`pre-restore:${safeFileName}`);
    }

    const nextStatus = migrateLocalStorageSnapshot({ records });
    return {
      ok: nextStatus.ready && nextStatus.phase === 'active',
      status: nextStatus,
      message:
        nextStatus.ready && nextStatus.phase === 'active'
          ? 'Copia JSON restaurada. Reinicia o recarga la app para aplicar la caché recuperada.'
          : (nextStatus.message ?? 'No se ha podido restaurar el respaldo JSON.'),
    };
  }

  const configuredDirectory = await getConfiguredDatabaseDirectory();
  const targetDatabasePath = getDatabasePathForDirectory(configuredDirectory.directoryPath);

  try {
    await mkdir(path.dirname(targetDatabasePath), { recursive: true });

    await withDatabaseOperationLock(targetDatabasePath, async () => {
      if (currentStatus.ready) {
        await backupExistingDatabase(currentStatus.path);
      } else {
        await copyFile(targetDatabasePath, `${targetDatabasePath}.backup-${backupTimestampForFileName()}`).catch(
          () => undefined,
        );
      }

      await closeDatabaseAndReleaseLock();
      await unlink(`${targetDatabasePath}-wal`).catch(() => undefined);
      await unlink(`${targetDatabasePath}-shm`).catch(() => undefined);
      await copyFile(backupPath, targetDatabasePath);
    });

    const nextStatus = await activateDatabase(
      configuredDirectory.directoryPath,
      configuredDirectory.isDefaultPath,
      null,
    );
    enqueueLocalBackup(`restore:${safeFileName}`);

    return {
      ok: nextStatus.ready && nextStatus.phase === 'active',
      status: nextStatus,
      message: 'Copia SQLite restaurada. Reinicia o recarga la app para aplicar los datos recuperados.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se ha podido restaurar el respaldo SQLite.';
    return { ok: false, status: getSqliteStatus(), message };
  }
}

export async function getPersistedRecordSnapshot(key: string): Promise<PersistedRecordSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase === 'locked') {
        return { status: currentStatus, record: null };
      }

      const db = requireDatabase();
      return { status: currentStatus, record: readPersistedRecordByKey(db, key) };
    },
    (nextStatus) => ({ status: nextStatus, record: null }),
  );
}

export async function loadPersistedRecordsSnapshot(): Promise<PersistedRecordsSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase === 'locked') {
        return {
          status: currentStatus,
          records: [],
          refreshToken: null,
          latestUpdatedAt: null,
          taskRecordsUpdatedAt: null,
          sorteosDrawsUpdatedAt: null,
          sorteosExclusionsUpdatedAt: null,
        };
      }

      const db = requireDatabase();
      const startedAt = Date.now();
      const records = readAllPersistedRecords(db);
      const latestUpdatedAt = records.reduce<string | null>((latest, record) => {
        if (!latest) {
          return record.updatedAt;
        }

        return Date.parse(record.updatedAt) > Date.parse(latest) ? record.updatedAt : latest;
      }, null);

      logSqliteMetric('loadPersistedRecordsSnapshot', {
        records: records.length,
        elapsedMs: Date.now() - startedAt,
        largestKeys: largestPersistedRecordSizes(records),
      });

      return {
        status: currentStatus,
        records,
        refreshToken: readRefreshToken(db),
        latestUpdatedAt,
        taskRecordsUpdatedAt: getTaskRecordsUpdatedAt(db),
        sorteosDrawsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_draw_records'),
        sorteosExclusionsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_exclusion_records'),
      };
    },
    (nextStatus) => ({
      status: nextStatus,
      records: [],
      refreshToken: null,
      latestUpdatedAt: null,
      taskRecordsUpdatedAt: null,
      sorteosDrawsUpdatedAt: null,
      sorteosExclusionsUpdatedAt: null,
    }),
  );
}

export async function getPersistedRecordsTokenSnapshot(): Promise<PersistedRecordsTokenSnapshot> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase === 'locked') {
        return {
          status: currentStatus,
          refreshToken: null,
          latestUpdatedAt: null,
          taskRecordsUpdatedAt: null,
          sorteosDrawsUpdatedAt: null,
          sorteosExclusionsUpdatedAt: null,
        };
      }

      const db = requireDatabase();
      const latestRow = db
        .prepare('SELECT updated_at FROM persisted_records ORDER BY updated_at DESC LIMIT 1')
        .get();
      const latestUpdatedAt =
        latestRow &&
        typeof latestRow === 'object' &&
        typeof (latestRow as { updated_at?: unknown }).updated_at === 'string'
          ? (latestRow as { updated_at: string }).updated_at
          : null;

      return {
        status: currentStatus,
        refreshToken: readRefreshToken(db),
        latestUpdatedAt,
        taskRecordsUpdatedAt: getTaskRecordsUpdatedAt(db),
        sorteosDrawsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_draw_records'),
        sorteosExclusionsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_exclusion_records'),
      };
    },
    (nextStatus) => ({
      status: nextStatus,
      refreshToken: null,
      latestUpdatedAt: null,
      taskRecordsUpdatedAt: null,
      sorteosDrawsUpdatedAt: null,
      sorteosExclusionsUpdatedAt: null,
    }),
  );
}


export async function getSqliteSyncTokensSnapshot(): Promise<PersistedRecordsTokenSnapshot> {
  return getPersistedRecordsTokenSnapshot();
}


interface EditingLockRow {
  module: string;
  record_id: string;
  owner_id: string;
  owner_name: string;
  machine_name: string;
  acquired_at: string;
  expires_at: string;
}

function isEditingLockRow(value: unknown): value is EditingLockRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<EditingLockRow>;
  return (
    typeof candidate.module === 'string' &&
    typeof candidate.record_id === 'string' &&
    typeof candidate.owner_id === 'string' &&
    typeof candidate.owner_name === 'string' &&
    typeof candidate.machine_name === 'string' &&
    typeof candidate.acquired_at === 'string' &&
    typeof candidate.expires_at === 'string'
  );
}

function lockOwnerFromRow(row: EditingLockRow): RecordLockOwnerInfo {
  return {
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    machineName: row.machine_name,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
  };
}

function currentOwnerName(): string {
  try {
    return userInfo().username || 'desconocido';
  } catch {
    return 'desconocido';
  }
}

function validateRecordLockPayload(payload: RecordLockPayload): boolean {
  return payload.module.trim().length > 0 && payload.recordId.trim().length > 0;
}

function recordLockError(message: string): RecordLockResult {
  return { ok: false, status: 'error', lock: null, message };
}

function ensureRecordLockDatabase(): Database | null {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase === 'locked') {
    return null;
  }

  return requireDatabase();
}

function deleteExpiredRecordLocks(db: Database, now: string): void {
  db.prepare('DELETE FROM editing_locks WHERE expires_at <= ?').run(now);
}

function readRecordLockRow(
  db: Database,
  moduleName: string,
  recordId: string,
): EditingLockRow | null {
  const row = db
    .prepare('SELECT module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at FROM editing_locks WHERE module = ? AND record_id = ?')
    .get(moduleName, recordId);
  return isEditingLockRow(row) ? row : null;
}

function readConflictingEditingLock(
  db: Database,
  moduleName: string,
  recordId: string,
): EditingLockRow | null {
  const normalizedRecordId = recordId.trim();

  if (normalizedRecordId === MODULE_LOCK_RECORD_ID) {
    const row = db
      .prepare(
        `SELECT module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at
         FROM editing_locks
         WHERE module = ? AND owner_id <> ?
         ORDER BY record_id = ? DESC, expires_at DESC
         LIMIT 1`,
      )
      .get(moduleName, ownerId, MODULE_LOCK_RECORD_ID);
    return isEditingLockRow(row) ? row : null;
  }

  const row = db
    .prepare(
      `SELECT module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at
       FROM editing_locks
       WHERE module = ?
         AND owner_id <> ?
         AND record_id IN (?, ?)
       ORDER BY record_id = ? DESC, expires_at DESC
       LIMIT 1`,
    )
    .get(moduleName, ownerId, normalizedRecordId, MODULE_LOCK_RECORD_ID, MODULE_LOCK_RECORD_ID);
  return isEditingLockRow(row) ? row : null;
}

export async function acquireRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  if (!validateRecordLockPayload(payload)) {
    return recordLockError('Identificador de bloqueo inválido.');
  }

  const currentStatus = getSqliteStatus();
  return withDatabaseOperationLock(currentStatus.path, async () => {
    try {
      const db = ensureRecordLockDatabase();
      if (!db) {
        return recordLockError('SQLite no está disponible para coordinar bloqueos.');
      }

      const moduleName = payload.module.trim();
      const recordId = payload.recordId.trim();
      const now = new Date();
      const nowIso = now.toISOString();
      const expiresAt = new Date(now.getTime() + RECORD_LOCK_TTL_MS).toISOString();
      deleteExpiredRecordLocks(db, nowIso);
      const conflictingLock = readConflictingEditingLock(db, moduleName, recordId);

      if (conflictingLock) {
        const isModuleLock = conflictingLock.record_id === MODULE_LOCK_RECORD_ID;
        return {
          ok: false,
          status: 'locked',
          lock: lockOwnerFromRow(conflictingLock),
          message: isModuleLock
            ? `Módulo bloqueado por ${conflictingLock.owner_name}@${conflictingLock.machine_name}.`
            : `Registro bloqueado por ${conflictingLock.owner_name}@${conflictingLock.machine_name}.`,
        };
      }

      const existingLock = readRecordLockRow(db, moduleName, recordId);

      if (existingLock) {
        db.prepare(
          `UPDATE editing_locks
           SET owner_name = ?, machine_name = ?, expires_at = ?
           WHERE module = ? AND record_id = ? AND owner_id = ?`,
        ).run(currentOwnerName(), hostname(), expiresAt, moduleName, recordId, ownerId);
      } else {
        db.prepare(
          `INSERT INTO editing_locks
           (module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(moduleName, recordId, ownerId, currentOwnerName(), hostname(), nowIso, expiresAt);
      }

      const lock = readRecordLockRow(db, moduleName, recordId);
      return {
        ok: true,
        status: 'acquired',
        lock: lock ? lockOwnerFromRow(lock) : null,
        message: 'Bloqueo adquirido.',
      };
    } catch (error) {
      return recordLockError(
        error instanceof Error ? error.message : 'No se ha podido adquirir el bloqueo del registro.',
      );
    }
  }, SQLITE_RECORD_LOCK_WAIT_MS);
}

export async function heartbeatRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  if (!validateRecordLockPayload(payload)) {
    return recordLockError('Identificador de bloqueo inválido.');
  }

  const currentStatus = getSqliteStatus();
  return withDatabaseOperationLock(currentStatus.path, async () => {
    try {
      const db = ensureRecordLockDatabase();
      if (!db) {
        return recordLockError('SQLite no está disponible para renovar bloqueos.');
      }

      const moduleName = payload.module.trim();
      const recordId = payload.recordId.trim();
      const now = new Date();
      const nowIso = now.toISOString();
      const expiresAt = new Date(now.getTime() + RECORD_LOCK_TTL_MS).toISOString();
      deleteExpiredRecordLocks(db, nowIso);
      const existingLock = readRecordLockRow(db, moduleName, recordId);

      if (existingLock && existingLock.owner_id !== ownerId) {
        return {
          ok: false,
          status: 'locked',
          lock: lockOwnerFromRow(existingLock),
          message: `Registro bloqueado por ${existingLock.owner_name}@${existingLock.machine_name}.`,
        };
      }

      if (existingLock) {
        db.prepare(
          `UPDATE editing_locks
           SET owner_name = ?, machine_name = ?, expires_at = ?
           WHERE module = ? AND record_id = ? AND owner_id = ?`,
        ).run(currentOwnerName(), hostname(), expiresAt, moduleName, recordId, ownerId);
      } else {
        const conflictingLock = readConflictingEditingLock(db, moduleName, recordId);
        if (conflictingLock) {
          return {
            ok: false,
            status: 'locked',
            lock: lockOwnerFromRow(conflictingLock),
            message: `Registro bloqueado por ${conflictingLock.owner_name}@${conflictingLock.machine_name}.`,
          };
        }
        db.prepare(
          `INSERT INTO editing_locks
           (module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(moduleName, recordId, ownerId, currentOwnerName(), hostname(), nowIso, expiresAt);
      }

      const lock = readRecordLockRow(db, moduleName, recordId);

      return {
        ok: true,
        status: 'acquired',
        lock: lock ? lockOwnerFromRow(lock) : null,
        message: 'Bloqueo renovado.',
      };
    } catch (error) {
      return recordLockError(
        error instanceof Error ? error.message : 'No se ha podido renovar el bloqueo del registro.',
      );
    }
  }, SQLITE_RECORD_LOCK_WAIT_MS);
}

export async function releaseRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  if (!validateRecordLockPayload(payload)) {
    return recordLockError('Identificador de bloqueo inválido.');
  }

  const currentStatus = getSqliteStatus();
  return withDatabaseOperationLock(currentStatus.path, async () => {
    try {
      const db = ensureRecordLockDatabase();
      if (!db) {
        return recordLockError('SQLite no está disponible para liberar bloqueos.');
      }

      db.prepare('DELETE FROM editing_locks WHERE module = ? AND record_id = ? AND owner_id = ?').run(
        payload.module.trim(),
        payload.recordId.trim(),
        ownerId,
      );

      return { ok: true, status: 'released', lock: null, message: 'Bloqueo liberado.' };
    } catch (error) {
      return recordLockError(
        error instanceof Error ? error.message : 'No se ha podido liberar el bloqueo del registro.',
      );
    }
  }, SQLITE_RECORD_LOCK_WAIT_MS);
}

export async function getRecordLock(payload: RecordLockPayload): Promise<RecordLockResult> {
  if (!validateRecordLockPayload(payload)) {
    return recordLockError('Identificador de bloqueo inválido.');
  }

  const currentStatus = getSqliteStatus();
  return withDatabaseOperationLock(currentStatus.path, async () => {
    try {
      const db = ensureRecordLockDatabase();
      if (!db) {
        return recordLockError('SQLite no está disponible para consultar bloqueos.');
      }

      const nowIso = new Date().toISOString();
      deleteExpiredRecordLocks(db, nowIso);
      const moduleName = payload.module.trim();
      const recordId = payload.recordId.trim();
      const conflictingLock = readConflictingEditingLock(db, moduleName, recordId);

      if (conflictingLock) {
        return {
          ok: false,
          status: 'locked',
          lock: lockOwnerFromRow(conflictingLock),
          message:
            conflictingLock.record_id === MODULE_LOCK_RECORD_ID
              ? 'Bloqueo global de módulo activo.'
              : 'Bloqueo de registro activo.',
        };
      }

      const existingLock = readRecordLockRow(db, moduleName, recordId);

      return existingLock
        ? {
            ok: existingLock.owner_id === ownerId,
            status: 'acquired',
            lock: lockOwnerFromRow(existingLock),
            message: 'Bloqueo activo.',
          }
        : { ok: true, status: 'idle', lock: null, message: 'Sin bloqueo activo.' };
    } catch (error) {
      return recordLockError(
        error instanceof Error ? error.message : 'No se ha podido consultar el bloqueo del registro.',
      );
    }
  }, SQLITE_RECORD_LOCK_WAIT_MS);
}

export async function changeSqliteDirectory(directoryPath: string): Promise<DatabaseStatus> {
  const previousStatus = getSqliteStatus();
  const previousDatabasePath = database ? previousStatus.path : null;
  const normalizedDirectoryPath = path.resolve(directoryPath);
  const nextDatabasePath = getDatabasePathForDirectory(normalizedDirectoryPath);

  if (previousStatus.ready && previousStatus.path === nextDatabasePath) {
    return previousStatus;
  }

  try {
    if (database) {
      await withDatabaseOperationLock(previousStatus.path, async () => {
        await backupExistingDatabase(previousStatus.path);
      });
    }

    await closeDatabaseAndReleaseLock();

    try {
      const nextStatus = await activateDatabase(
        normalizedDirectoryPath,
        false,
        previousDatabasePath,
      );
      await writeDatabasePreferences({ customDirectoryPath: normalizedDirectoryPath });
      return nextStatus;
    } catch (changeError) {
      if (previousStatus.ready) {
        try {
          const restoredDirectory = path.dirname(previousStatus.path);
          const restoredStatus = await activateDatabase(
            restoredDirectory,
            previousStatus.isDefaultPath,
            null,
          );
          status = { ...restoredStatus, message: errorMessage(changeError) };
          return status;
        } catch {
          status = {
            ...previousStatus,
            ready: false,
            phase: 'fallback',
            message: errorMessage(changeError),
          };
          return status;
        }
      }

      throw changeError;
    }
  } catch (error) {
    status = { ...previousStatus, message: errorMessage(error) };
    return status;
  }
}

export async function resetSqliteDirectory(): Promise<DatabaseStatus> {
  const previousStatus = getSqliteStatus();
  const previousDatabasePath = database ? previousStatus.path : null;
  const defaultDirectory = getDefaultDatabaseDirectory();

  try {
    if (database) {
      await withDatabaseOperationLock(previousStatus.path, async () => {
        await backupExistingDatabase(previousStatus.path);
      });
    }
    await closeDatabaseAndReleaseLock();
    const nextStatus = await activateDatabase(defaultDirectory, true, previousDatabasePath);
    await writeDatabasePreferences({ customDirectoryPath: null });
    return nextStatus;
  } catch (error) {
    try {
      if (previousStatus.ready) {
        const restoredStatus = await activateDatabase(
          path.dirname(previousStatus.path),
          previousStatus.isDefaultPath,
          null,
        );
        status = { ...restoredStatus, message: errorMessage(error) };
        return status;
      }
    } catch {
      // Mantener el fallback existente.
    }
    status = { ...previousStatus, message: errorMessage(error) };
    return status;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se ha podido cambiar la ruta SQLite.';
}

export async function closeSqlitePersistence(): Promise<void> {
  await createShutdownLocalBackup();
  await closeDatabaseAndReleaseLock();
}
