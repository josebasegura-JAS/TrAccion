import type { Database } from 'better-sqlite3';

/**
 * Última versión de schema que esta build de TrAccion sabe aplicar/leer.
 * sqlitePersistence.ts la usa para la protección contra downgrade (rechazar
 * abrir una base con un schema más nuevo que el que sabe manejar) y para
 * reportar el estado de la base de datos.
 */
export const CURRENT_SCHEMA_VERSION = 18;

interface SchemaMigrationRow {
  version: number;
}

function isSchemaMigrationRow(value: unknown): value is SchemaMigrationRow {
  return Boolean(value) && typeof (value as SchemaMigrationRow).version === 'number';
}

function hasSchemaMigrationsTable(db: Database): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  return row !== undefined;
}

/**
 * En una base de datos completamente nueva (fichero recién creado, primer
 * arranque de TrAccion en una máquina) la tabla schema_migrations todavía no
 * existe: la crea migrateToVersion1, que es la propia primera migración. Si
 * no se comprueba antes, la consulta lanza "no such table: schema_migrations"
 * en vez de devolver 0 (versión "sin migraciones aplicadas todavía"), lo que
 * antes rompía sqliteConnection.ts al llamar a esta función para la
 * protección contra downgrade justo antes de aplicar las migraciones.
 */
export function readCurrentSchemaVersion(db: Database): number {
  if (!hasSchemaMigrationsTable(db)) {
    return 0;
  }

  const row = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .get();

  return isSchemaMigrationRow(row) ? row.version : 0;
}

interface SqliteTableInfoRow {
  name: string;
}

function hasTableColumn(db: Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as SqliteTableInfoRow[];
  return rows.some((row) => row.name === columnName);
}

function addColumnIfMissing(db: Database, tableName: string, columnName: string, definition: string): void {
  if (!hasTableColumn(db, tableName, columnName)) {
    db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  }
}

/**
 * Fila de configuracion_state. Vive aquí (no en el módulo de Configuración
 * propiamente dicho) porque su único uso original es arreglar filas legacy
 * durante la migración de schema; sqlitePersistence.ts también la reutiliza
 * para la migración de Configuración desde persisted_records, así que se
 * exporta.
 */
export interface ConfiguracionStateRow {
  value_json: string;
  created_at?: string;
  updated_at: string;
  deleted_at?: string | null;
}

export function isConfiguracionStateRow(value: unknown): value is ConfiguracionStateRow {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<ConfiguracionStateRow>;
  return typeof candidate.value_json === 'string' && typeof candidate.updated_at === 'string';
}

export const CONFIGURACION_STATE_ID = 'main';
const LEGACY_CONFIGURACION_STATE_ID = 'configuracion';

function ensureConfiguracionStateShape(db: Database): void {
  const now = new Date().toISOString();
  addColumnIfMissing(db, 'configuracion_state', 'created_at', 'TEXT');
  addColumnIfMissing(db, 'configuracion_state', 'updated_at', 'TEXT');
  addColumnIfMissing(db, 'configuracion_state', 'deleted_at', 'TEXT');
  db.prepare(
    `UPDATE configuracion_state
     SET created_at = COALESCE(created_at, updated_at, ?),
         updated_at = COALESCE(updated_at, created_at, ?)
     WHERE created_at IS NULL OR updated_at IS NULL`,
  ).run(now, now);

  const legacyRow = db
    .prepare('SELECT value_json, created_at, updated_at, deleted_at FROM configuracion_state WHERE id = ?')
    .get(LEGACY_CONFIGURACION_STATE_ID) as ConfiguracionStateRow | undefined;
  if (isConfiguracionStateRow(legacyRow)) {
    db.prepare(
      `INSERT OR IGNORE INTO configuracion_state (id, value_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      CONFIGURACION_STATE_ID,
      legacyRow.value_json,
      legacyRow.created_at,
      legacyRow.updated_at,
      legacyRow.deleted_at ?? null,
    );
  }
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

function migrateToVersion7(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS comite_session_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_comite_session_records_updated_at
      ON comite_session_records(updated_at);
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 7) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      7,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion8(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS paritaria_session_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_paritaria_session_records_updated_at
      ON paritaria_session_records(updated_at);
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 8) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      8,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion9(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS acta_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_acta_records_updated_at
      ON acta_records(updated_at);
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 9) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      9,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion10(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teletrabajo_solicitud_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_teletrabajo_solicitud_records_updated_at
      ON teletrabajo_solicitud_records(updated_at);
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 10) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      10,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion11(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vinculograma_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS licencia_sin_sueldo_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS criterios_rrll_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS especiales_recipient_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS presupuesto_scenario_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS presupuesto_manual_item_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS presupuesto_ticket_group_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS presupuesto_actual_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS teletrabajo_puesto_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS job_position_translation_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS configuracion_state (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
  `);

  ensureConfiguracionStateShape(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_vinculograma_records_updated_at ON vinculograma_records(updated_at);
    CREATE INDEX IF NOT EXISTS idx_licencia_sin_sueldo_records_updated_at ON licencia_sin_sueldo_records(updated_at);
    CREATE INDEX IF NOT EXISTS idx_criterios_rrll_records_updated_at ON criterios_rrll_records(updated_at);
    CREATE INDEX IF NOT EXISTS idx_especiales_recipient_records_updated_at ON especiales_recipient_records(updated_at);
    CREATE INDEX IF NOT EXISTS idx_presupuesto_scenario_records_updated_at ON presupuesto_scenario_records(updated_at);
    CREATE INDEX IF NOT EXISTS idx_presupuesto_manual_item_records_updated_at ON presupuesto_manual_item_records(updated_at);
    CREATE INDEX IF NOT EXISTS idx_presupuesto_ticket_group_records_updated_at ON presupuesto_ticket_group_records(updated_at);
    CREATE INDEX IF NOT EXISTS idx_presupuesto_actual_records_updated_at ON presupuesto_actual_records(updated_at);
    CREATE INDEX IF NOT EXISTS idx_teletrabajo_puesto_records_updated_at ON teletrabajo_puesto_records(updated_at);
    CREATE INDEX IF NOT EXISTS idx_job_position_translation_records_updated_at ON job_position_translation_records(updated_at);
    CREATE INDEX IF NOT EXISTS idx_configuracion_state_updated_at ON configuracion_state(updated_at);
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 11) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      11,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion12(db: Database): void {
  // v12 mantiene compatibilidad con bases donde configuracion_state se creó
  // antes de consolidar created_at/deleted_at. CREATE TABLE IF NOT EXISTS no
  // corrige una tabla ya existente, por lo que hay que completar columnas aquí.
  ensureConfiguracionStateShape(db);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 12) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      12,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion13(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS acta_type_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_acta_type_records_updated_at ON acta_type_records(updated_at);
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 13) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      13,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion14(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teletrabajo_grupo_cobertura_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_teletrabajo_grupo_cobertura_records_updated_at ON teletrabajo_grupo_cobertura_records(updated_at);
  `);
  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 14) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      14,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion15(db: Database): void {
  // Primera tanda de migración de Ticket Restaurante a SQLite: calendars y
  // people (entidades maestras relacionadas por calendarId). absences,
  // config y manutenciones permanecen en localStorage por ahora.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_restaurante_calendar_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_restaurante_calendar_records_updated_at ON ticket_restaurante_calendar_records(updated_at);

    CREATE TABLE IF NOT EXISTS ticket_restaurante_person_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_restaurante_person_records_updated_at ON ticket_restaurante_person_records(updated_at);
  `);
  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 15) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      15,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion16(db: Database): void {
  // Segunda tanda de migración de Ticket Restaurante a SQLite: absences
  // (colección con id propio, igual patrón que calendars/people) y config
  // (objeto único, migrado como colección de un solo registro de id fijo
  // para reutilizar createJsonModuleRepository sin código a medida).
  // manutenciones migran en v17.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_restaurante_absence_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_restaurante_absence_records_updated_at ON ticket_restaurante_absence_records(updated_at);

    CREATE TABLE IF NOT EXISTS ticket_restaurante_config_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_restaurante_config_records_updated_at ON ticket_restaurante_config_records(updated_at);
  `);
  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 16) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      16,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion17(db: Database): void {
  // Tercera tanda de Ticket Restaurante: manutenciones.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_restaurante_manutencion_records (
      id TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_restaurante_manutencion_records_updated_at ON ticket_restaurante_manutencion_records(updated_at);
  `);
  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 17) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      17,
      new Date().toISOString(),
    );
  }
}

function migrateToVersion18(db: Database): void {
  // El editor de contenido estructurado de Actas (puntos/acuerdos/votaciones)
  // y el censo de miembros se revirtieron: las actas vuelven a editarse en
  // Word. Se purgan las claves huérfanas que quedaron en persisted_records.
  db.prepare('DELETE FROM persisted_records WHERE key IN (?, ?)').run(
    'traccion.v1.actas.censo',
    'traccion.v1.actas.contenidos',
  );
  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 18) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      18,
      new Date().toISOString(),
    );
  }
}

export function applyMigrations(db: Database): void {
  migrateToVersion1(db);
  migrateToVersion2(db);
  migrateToVersion3(db);
  migrateToVersion4(db);
  migrateToVersion5(db);
  migrateToVersion6(db);
  migrateToVersion7(db);
  migrateToVersion8(db);
  migrateToVersion9(db);
  migrateToVersion10(db);
  migrateToVersion11(db);
  migrateToVersion12(db);
  migrateToVersion13(db);
  migrateToVersion14(db);
  migrateToVersion15(db);
  migrateToVersion16(db);
  migrateToVersion17(db);
  migrateToVersion18(db);
}
