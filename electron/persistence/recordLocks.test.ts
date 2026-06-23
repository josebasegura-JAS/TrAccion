import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireRecordLockInTransaction,
  getRecordLockInTransaction,
  heartbeatRecordLockInTransaction,
  MODULE_LOCK_RECORD_ID,
  releaseRecordLockInTransaction,
  type OwnerContext,
} from './recordLocks';

/**
 * Tests directos sobre la lógica de editing_locks, contra un better-sqlite3
 * real (no mockeado) — mismo motivo que maintenanceQueries.test.ts: este
 * módulo se extrajo sin ningún import de 'electron' precisamente para
 * poder probarlo así.
 *
 * No prueban la coordinación de archivo entre procesos (withDatabaseOperationLock)
 * ni el ciclo de vida completo de Electron: esas piezas viven en
 * sqlitePersistence.ts. Aquí se aísla solo el "quién gana el lock y por qué",
 * que es la parte con lógica real y bugs posibles (excepciones de orden,
 * condición de expiración, exclusión del propio owner).
 */
describe('recordLocks — funciones SQL puras sobre editing_locks', () => {
  let tempDir: string;
  let db: Database.Database;

  const ownerA: OwnerContext = { ownerId: 'owner-a', ownerName: 'Ana', hostname: 'PC-ANA' };
  const ownerB: OwnerContext = { ownerId: 'owner-b', ownerName: 'Bea', hostname: 'PC-BEA' };

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'traccion-locks-test-'));
    db = new Database(path.join(tempDir, 'test.sqlite'));
    db.exec(`
      CREATE TABLE editing_locks (
        module TEXT NOT NULL,
        record_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        machine_name TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (module, record_id, owner_id)
      )
    `);
  });

  afterEach(() => {
    db?.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('acquireRecordLockInTransaction', () => {
    it('adquiere el lock cuando el registro está libre', () => {
      const result = acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);

      expect(result.ok).toBe(true);
      expect(result.status).toBe('acquired');
      expect(result.lock?.ownerId).toBe('owner-a');
    });

    it('rechaza la adquisición cuando otro owner ya tiene el mismo registro', () => {
      acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);
      const result = acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerB);

      expect(result.ok).toBe(false);
      expect(result.status).toBe('locked');
      expect(result.lock?.ownerId).toBe('owner-a');
      expect(result.message).toMatch(/registro bloqueado por ana@pc-ana/i);
    });

    it('permite al mismo owner volver a adquirir (renovar) su propio lock', () => {
      acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);
      const result = acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);

      expect(result.ok).toBe(true);
      expect(result.status).toBe('acquired');

      const rows = db.prepare('SELECT COUNT(*) AS c FROM editing_locks').get() as { c: number };
      expect(rows.c).toBe(1);
    });

    it('no afecta registros distintos del mismo módulo (lock por registro, no global)', () => {
      acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);
      const result = acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-2' }, ownerB);

      expect(result.ok).toBe(true);
      expect(result.status).toBe('acquired');
    });

    it('no afecta el mismo registro en módulos distintos', () => {
      acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'shared-id' }, ownerA);
      const result = acquireRecordLockInTransaction(db, { module: 'vinculograma', recordId: 'shared-id' }, ownerB);

      expect(result.ok).toBe(true);
      expect(result.status).toBe('acquired');
    });

    it('un lock de módulo completo bloquea la adquisición de cualquier registro de ese módulo por otro owner', () => {
      acquireRecordLockInTransaction(db, { module: 'comite', recordId: MODULE_LOCK_RECORD_ID }, ownerA);
      const result = acquireRecordLockInTransaction(db, { module: 'comite', recordId: 'sesion-1' }, ownerB);

      expect(result.ok).toBe(false);
      expect(result.status).toBe('locked');
      expect(result.message).toMatch(/módulo bloqueado por ana@pc-ana/i);
    });

    it('un lock de módulo completo no bloquea al mismo owner que lo tiene', () => {
      acquireRecordLockInTransaction(db, { module: 'comite', recordId: MODULE_LOCK_RECORD_ID }, ownerA);
      const result = acquireRecordLockInTransaction(db, { module: 'comite', recordId: 'sesion-1' }, ownerA);

      expect(result.ok).toBe(true);
    });

    it('intentar adquirir el lock de módulo completo cuando alguien ya tiene un registro suelto también se rechaza', () => {
      acquireRecordLockInTransaction(db, { module: 'comite', recordId: 'sesion-1' }, ownerA);
      const result = acquireRecordLockInTransaction(
        db,
        { module: 'comite', recordId: MODULE_LOCK_RECORD_ID },
        ownerB,
      );

      expect(result.ok).toBe(false);
      expect(result.status).toBe('locked');
    });

    it('un lock expirado ya no bloquea la adquisición de otro owner', () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      db.prepare(
        `INSERT INTO editing_locks (module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at)
         VALUES ('actas', 'acta-1', 'owner-a', 'Ana', 'PC-ANA', ?, ?)`,
      ).run(past, past);

      const result = acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerB);

      expect(result.ok).toBe(true);
      expect(result.status).toBe('acquired');
      expect(result.lock?.ownerId).toBe('owner-b');
    });
  });

  describe('heartbeatRecordLockInTransaction', () => {
    it('renueva el lock propio extendiendo su expiración', () => {
      const acquireResult = acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);
      const firstExpiresAt = acquireResult.lock?.expiresAt;

      const heartbeatResult = heartbeatRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);

      expect(heartbeatResult.ok).toBe(true);
      expect(heartbeatResult.status).toBe('acquired');
      expect(heartbeatResult.lock?.expiresAt).toBeDefined();
      expect(firstExpiresAt).toBeDefined();
    });

    it('rechaza el heartbeat si otro owner tiene el lock del mismo registro', () => {
      acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);
      const result = heartbeatRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerB);

      expect(result.ok).toBe(false);
      expect(result.status).toBe('locked');
      expect(result.lock?.ownerId).toBe('owner-a');
    });

    it('adquiere el lock vía heartbeat si el registro estaba libre (sesión que perdió el acquire inicial)', () => {
      const result = heartbeatRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);

      expect(result.ok).toBe(true);
      expect(result.status).toBe('acquired');
    });

    it('el heartbeat también respeta el lock de módulo completo de otro owner', () => {
      acquireRecordLockInTransaction(db, { module: 'comite', recordId: MODULE_LOCK_RECORD_ID }, ownerA);
      const result = heartbeatRecordLockInTransaction(db, { module: 'comite', recordId: 'sesion-1' }, ownerB);

      expect(result.ok).toBe(false);
      expect(result.status).toBe('locked');
    });
  });

  describe('releaseRecordLockInTransaction', () => {
    it('libera el lock propio y deja el registro disponible', () => {
      acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);
      releaseRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);

      const result = acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerB);
      expect(result.ok).toBe(true);
    });

    it('no libera el lock de otro owner (release solo afecta al propio)', () => {
      acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);
      releaseRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerB);

      const result = acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerB);
      expect(result.ok).toBe(false);
      expect(result.status).toBe('locked');
    });

    it('liberar un lock que no existe no lanza error', () => {
      expect(() =>
        releaseRecordLockInTransaction(db, { module: 'actas', recordId: 'no-existe' }, ownerA),
      ).not.toThrow();
    });
  });

  describe('getRecordLockInTransaction', () => {
    it('devuelve idle cuando no hay ningún lock para el registro', () => {
      const result = getRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA, new Date().toISOString());

      expect(result.status).toBe('idle');
      expect(result.ok).toBe(true);
      expect(result.lock).toBeNull();
    });

    it('devuelve ok=true cuando el lock existente es del propio owner que consulta', () => {
      acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);
      const result = getRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA, new Date().toISOString());

      expect(result.ok).toBe(true);
      expect(result.status).toBe('acquired');
      expect(result.lock?.ownerId).toBe('owner-a');
    });

    it('devuelve ok=false cuando el lock existente es de otro owner', () => {
      acquireRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerA);
      const result = getRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerB, new Date().toISOString());

      expect(result.ok).toBe(false);
      expect(result.status).toBe('locked');
      expect(result.lock?.ownerId).toBe('owner-a');
    });

    it('no devuelve un lock ya expirado (lo trata como idle)', () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      db.prepare(
        `INSERT INTO editing_locks (module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at)
         VALUES ('actas', 'acta-1', 'owner-a', 'Ana', 'PC-ANA', ?, ?)`,
      ).run(past, past);

      const result = getRecordLockInTransaction(db, { module: 'actas', recordId: 'acta-1' }, ownerB, new Date().toISOString());

      expect(result.status).toBe('idle');
    });
  });
});
