declare module 'better-sqlite3' {
  export interface Statement<BindParameters extends unknown[] = unknown[]> {
    run(...params: BindParameters): { changes: number; lastInsertRowid: number | bigint };
    get(...params: BindParameters): unknown;
    all(...params: BindParameters): unknown[];
  }

  export interface Database {
    exec(sql: string): void;
    prepare<BindParameters extends unknown[] = unknown[]>(sql: string): Statement<BindParameters>;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
    pragma(source: string): unknown;
    close(): void;
  }

  export interface DatabaseConstructor {
    new (filename: string): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
