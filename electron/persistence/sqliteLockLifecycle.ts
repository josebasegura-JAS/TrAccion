import {
  createDatabaseLockManager,
  type DatabaseConnectivityIssuePayload,
  type DatabaseLockInfo,
  type DatabaseLockManager,
} from './databaseLockManager.js';

export type { DatabaseConnectivityIssuePayload, DatabaseLockInfo } from './databaseLockManager.js';

export interface SqliteLockLifecycle {
  getLockPath(databasePath: string): string;
  getLockInfoPath(lockPath: string): string;
  readLock(lockPath: string): Promise<DatabaseLockInfo | null>;
  withDatabaseOperationLock<T>(
    databasePath: string,
    operation: () => Promise<T>,
    waitMs?: number,
  ): Promise<T>;
  acquireLock(databasePath: string, waitMs?: number): Promise<DatabaseLockInfo>;
  acquireStartupLock(databasePath: string): Promise<DatabaseLockInfo>;
  setConnectivityIssueNotifier(
    notifier: ((payload: DatabaseConnectivityIssuePayload) => void) | null,
  ): void;
  assertDatabaseWritesAllowed(): void;
  isDatabaseWriteBlockedByHeartbeat(): boolean;
  startDatabaseLockHeartbeat(
    lockPath: string,
    lock: DatabaseLockInfo,
  ): ReturnType<typeof setInterval>;
  releaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void>;
}

export function createSqliteLockLifecycle(getOwnerId: () => string): SqliteLockLifecycle {
  let managerInstance: DatabaseLockManager | null = null;

  const getManager = (): DatabaseLockManager => {
    if (!managerInstance) {
      managerInstance = createDatabaseLockManager({ getOwnerId });
    }
    return managerInstance;
  };

  return {
    getLockPath: (databasePath) => getManager().getLockPath(databasePath),
    getLockInfoPath: (lockPath) => getManager().getLockInfoPath(lockPath),
    readLock: (lockPath) => getManager().readLock(lockPath),
    withDatabaseOperationLock: (databasePath, operation, waitMs) =>
      getManager().withDatabaseOperationLock(databasePath, operation, waitMs),
    acquireLock: (databasePath, waitMs) => getManager().acquireLock(databasePath, waitMs),
    acquireStartupLock: (databasePath) => getManager().acquireStartupLock(databasePath),
    setConnectivityIssueNotifier: (notifier) => getManager().setConnectivityIssueNotifier(notifier),
    assertDatabaseWritesAllowed: () => getManager().assertDatabaseWritesAllowed(),
    isDatabaseWriteBlockedByHeartbeat: () => getManager().isDatabaseWriteBlockedByHeartbeat(),
    startDatabaseLockHeartbeat: (lockPath, lock) =>
      getManager().startDatabaseLockHeartbeat(lockPath, lock),
    releaseLock: (lockPath, lock) => getManager().releaseLock(lockPath, lock),
  };
}
