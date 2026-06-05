export interface SqlitePreparationStatus {
  ready: false;
  engine: 'better-sqlite3';
  phase: 'prepared';
  note: string;
}

export const sqlitePreparationStatus: SqlitePreparationStatus = {
  ready: false,
  engine: 'better-sqlite3',
  phase: 'prepared',
  note: 'Dependencia nativa declarada y canal IPC preparado; la persistencia real se implementará en una fase posterior.',
};
