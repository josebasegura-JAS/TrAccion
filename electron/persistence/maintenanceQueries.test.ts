import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  computeHeaviestTables,
  getDailyLocalBackupWeekdayName,
  LOCAL_STORAGE_BACKUP_RETENTION_COUNT,
  listUserTableNames,
  pruneLocalStorageBackups,
} from './maintenanceQueries';

/**
 * Tests directos sobre electron/persistence/maintenanceQueries.ts, contra
 * un better-sqlite3 real (no mockeado). Este módulo se extrajo deliberadamente
 * sin ningún import de 'electron' para que sea testable con Vitest normal:
 * importar electron/sqlitePersistence.ts directamente falla siempre que el
 * binario de Electron no esté instalado (incluso solo con `import { app }`,
 * sin llegar a usarlo), porque el paquete electron resuelve su ruta en el
 * top-level del módulo.
 *
 * Cubren las piezas más nuevas y sin red de seguridad: la poda que evitó el
 * crecimiento sin control de la base (~300MB), el desglose de tablas
 * pesadas, y el cálculo de día de la semana de la copia diaria local.
 *
 * No prueban el ciclo de vida completo de Electron (locks de fichero, IPC,
 * app.getPath): esas piezas dependen del proceso main y se verifican mejor
 * con los tests E2E de Playwright ya existentes. Aquí se aísla solo la
 * lógica SQL pura, que es la que de verdad puede tener bugs silenciosos de
 * comportamiento (orden incorrecto, condición de borrado equivocada, etc.).
 */
describe('maintenanceQueries — funciones SQL puras', () => {
  let tempDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'traccion-sqlite-test-'));
    db = new Database(path.join(tempDir, 'test.sqlite'));
  });

  afterEach(() => {
    db?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('pruneLocalStorageBackups', () => {
    beforeEach(() => {
      db.exec(
        'CREATE TABLE local_storage_backups (id INTEGER PRIMARY KEY, created_at TEXT, payload_json TEXT)',
      );
    });

    it('no falla y no borra nada cuando hay menos filas que el límite de retención', () => {
      const insert = db.prepare(
        'INSERT INTO local_storage_backups (created_at, payload_json) VALUES (?, ?)',
      );
      for (let i = 0; i < 3; i += 1) {
        insert.run(`2026-06-${10 + i}T00:00:00.000Z`, '{}');
      }

      pruneLocalStorageBackups(db);

      const count = (
        db.prepare('SELECT COUNT(*) AS c FROM local_storage_backups').get() as { c: number }
      ).c;
      expect(count).toBe(3);
    });

    it('conserva exactamente las últimas N filas (por created_at) y borra el resto', () => {
      const insert = db.prepare(
        'INSERT INTO local_storage_backups (created_at, payload_json) VALUES (?, ?)',
      );
      // 15 filas, con created_at estrictamente creciente para que el orden sea inequívoco.
      const totalRows = 15;
      for (let i = 0; i < totalRows; i += 1) {
        const day = String(i + 1).padStart(2, '0');
        insert.run(`2026-06-${day}T00:00:00.000Z`, JSON.stringify({ index: i }));
      }

      pruneLocalStorageBackups(db);

      const remaining = db
        .prepare('SELECT created_at FROM local_storage_backups ORDER BY created_at ASC')
        .all() as Array<{ created_at: string }>;

      expect(remaining).toHaveLength(LOCAL_STORAGE_BACKUP_RETENTION_COUNT);
      // Deben quedar las N filas MÁS RECIENTES, es decir las últimas N insertadas.
      const expectedFirstKeptDay = totalRows - LOCAL_STORAGE_BACKUP_RETENTION_COUNT + 1;
      expect(remaining[0].created_at).toBe(
        `2026-06-${String(expectedFirstKeptDay).padStart(2, '0')}T00:00:00.000Z`,
      );
      expect(remaining[remaining.length - 1].created_at).toBe(
        `2026-06-${String(totalRows).padStart(2, '0')}T00:00:00.000Z`,
      );
    });

    it('de verdad libera espacio en disco tras VACUUM (caso real que motivó la poda)', () => {
      const insert = db.prepare(
        'INSERT INTO local_storage_backups (created_at, payload_json) VALUES (?, ?)',
      );
      const bigPayload = JSON.stringify({ records: Array(200).fill('x'.repeat(500)) });

      db.exec('BEGIN');
      for (let i = 0; i < 1500; i += 1) {
        insert.run(new Date(Date.now() - i * 1000).toISOString(), bigPayload);
      }
      db.exec('COMMIT');

      const dbPath = db.name;
      const sizeBeforePrune = statSync(dbPath).size;

      pruneLocalStorageBackups(db);
      db.exec('VACUUM');

      const sizeAfterVacuum = statSync(dbPath).size;

      expect(sizeAfterVacuum).toBeLessThan(sizeBeforePrune);
      // No es solo "algo menor": debe ser una reducción sustancial, no marginal.
      expect(sizeAfterVacuum).toBeLessThan(sizeBeforePrune * 0.3);
    });
  });

  describe('listUserTableNames y computeHeaviestTables', () => {
    it('excluye las tablas internas de sqlite_ del listado', () => {
      db.exec('CREATE TABLE mi_tabla (id INTEGER PRIMARY KEY)');
      const names = listUserTableNames(db);
      expect(names).toContain('mi_tabla');
      expect(names.some((name) => name.startsWith('sqlite_'))).toBe(false);
    });

    it('ordena las tablas de mayor a menor tamaño', () => {
      db.exec('CREATE TABLE tabla_grande (id INTEGER PRIMARY KEY, data TEXT)');
      db.exec('CREATE TABLE tabla_pequena (id INTEGER PRIMARY KEY, data TEXT)');

      const insertBig = db.prepare('INSERT INTO tabla_grande (data) VALUES (?)');
      for (let i = 0; i < 500; i += 1) {
        insertBig.run('x'.repeat(300));
      }
      db.prepare('INSERT INTO tabla_pequena (data) VALUES (?)').run('y');

      const breakdown = computeHeaviestTables(db);

      expect(breakdown[0].table).toBe('tabla_grande');
      expect(breakdown[0].rowCount).toBe(500);
      // El resto de tablas (incluida tabla_pequena) deben venir después, nunca antes.
      const smallIndex = breakdown.findIndex((entry) => entry.table === 'tabla_pequena');
      expect(smallIndex).toBeGreaterThan(0);
    });

    it('respeta el límite de resultados solicitado', () => {
      for (let i = 0; i < 5; i += 1) {
        db.exec(`CREATE TABLE tabla_${i} (id INTEGER PRIMARY KEY)`);
      }

      const breakdown = computeHeaviestTables(db, 3);
      expect(breakdown).toHaveLength(3);
    });

    it('devuelve un array vacío sin lanzar error cuando no hay tablas de usuario', () => {
      expect(() => computeHeaviestTables(db)).not.toThrow();
      expect(computeHeaviestTables(db)).toEqual([]);
    });
  });

  describe('getDailyLocalBackupWeekdayName', () => {
    it('mapea correctamente cada día de la semana a su nombre en inglés estable', () => {
      // 2026-06-21 es domingo, 2026-06-22 es lunes (confirmado contra calendario real).
      expect(getDailyLocalBackupWeekdayName(new Date('2026-06-21T12:00:00'))).toBe('sunday');
      expect(getDailyLocalBackupWeekdayName(new Date('2026-06-22T12:00:00'))).toBe('monday');
      expect(getDailyLocalBackupWeekdayName(new Date('2026-06-23T12:00:00'))).toBe('tuesday');
      expect(getDailyLocalBackupWeekdayName(new Date('2026-06-24T12:00:00'))).toBe('wednesday');
      expect(getDailyLocalBackupWeekdayName(new Date('2026-06-25T12:00:00'))).toBe('thursday');
      expect(getDailyLocalBackupWeekdayName(new Date('2026-06-26T12:00:00'))).toBe('friday');
      expect(getDailyLocalBackupWeekdayName(new Date('2026-06-27T12:00:00'))).toBe('saturday');
    });

    it('da el mismo nombre para la misma fecha sin importar la hora', () => {
      const morning = getDailyLocalBackupWeekdayName(new Date('2026-06-22T01:00:00'));
      const evening = getDailyLocalBackupWeekdayName(new Date('2026-06-22T23:00:00'));
      expect(morning).toBe(evening);
    });
  });
});
