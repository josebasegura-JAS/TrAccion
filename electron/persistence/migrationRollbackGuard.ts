/**
 * A migration marker is an in-memory optimization, not a durable record.
 * If a transaction rolls back, never leave the marker saying its SQL committed.
 */
import type { Database } from 'better-sqlite3';

export function withMigrationFlagRollback<T>(invalidate: () => void, work: () => T): T {
  try {
    return work();
  } catch (error) {
    invalidate();
    throw error;
  }
}

/** Keep better-sqlite3 transaction semantics while invalidating flags only on rollback. */
export function transactionWithMigrationReset<T>(
  db: Database,
  invalidate: () => void,
  operation: () => T,
): () => T {
  const transaction = db.transaction(operation);
  return () => withMigrationFlagRollback(invalidate, () => transaction());
}
