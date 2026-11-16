/**
 * A whole lifecycle (including retry delays and publishing a newly opened
 * handle) must stay visible to the independent activity drain barrier.
 * The distributed SMB lock remains the responsibility of the caller.
 */
export interface SqliteAdmissionTracker {
  run<T>(label: string, operation: () => T | Promise<T>): Promise<T>;
}

export function runGuardedSqliteLifecycle<T>(
  assertMayEnterMain: () => void,
  tracker: SqliteAdmissionTracker,
  label: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  // Synchronous admission: no await can allow freeze between checks.
  assertMayEnterMain();
  return tracker.run(label, operation);
}
