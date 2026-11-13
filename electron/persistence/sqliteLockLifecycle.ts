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
  isLockStale(lock: DatabaseLockInfo): boolean;
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
  clearHeartbeatBlock(): boolean;
  startDatabaseLockHeartbeat(
    lockPath: string,
    lock: DatabaseLockInfo,
  ): ReturnType<typeof setInterval>;
  releaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void>;
}

export function createSqliteLockLifecycle(
  getOwnerId: () => string,
  observeHeartbeat?: (operation: () => Promise<void>) => Promise<void>,
): SqliteLockLifecycle {
  let managerInstance: DatabaseLockManager | null = null;

  const getManager = (): DatabaseLockManager => {
    if (!managerInstance) {
      managerInstance = createDatabaseLockManager({ getOwnerId, observeHeartbeat });
    }
    return managerInstance;
  };

  return {
    getLockPath: (databasePath) => getManager().getLockPath(databasePath),
    getLockInfoPath: (lockPath) => getManager().getLockInfoPath(lockPath),
    readLock: (lockPath) => getManager().readLock(lockPath),
    isLockStale: (lock) => getManager().isLockStale(lock),
    withDatabaseOperationLock: (databasePath, operation, waitMs) =>
      getManager().withDatabaseOperationLock(databasePath, operation, waitMs),
    acquireLock: (databasePath, waitMs) => getManager().acquireLock(databasePath, waitMs),
    acquireStartupLock: (databasePath) => getManager().acquireStartupLock(databasePath),
    setConnectivityIssueNotifier: (notifier) => getManager().setConnectivityIssueNotifier(notifier),
    assertDatabaseWritesAllowed: () => getManager().assertDatabaseWritesAllowed(),
    isDatabaseWriteBlockedByHeartbeat: () => getManager().isDatabaseWriteBlockedByHeartbeat(),
    clearHeartbeatBlock: () => getManager().clearHeartbeatBlock(),
    startDatabaseLockHeartbeat: (lockPath, lock) =>
      getManager().startDatabaseLockHeartbeat(lockPath, lock),
    releaseLock: (lockPath, lock) => getManager().releaseLock(lockPath, lock),
  };
}
