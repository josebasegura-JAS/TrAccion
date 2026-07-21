import { describe, expect, it } from 'vitest';
import {
  SQLITE_BUSY_RETRY_DELAYS_MS,
  isSqliteBusyOrLockedError,
  isSqliteCorruptionError,
  isSqliteLockContentionError,
} from './sqliteOperationGuard';

describe('sqliteOperationGuard — isSqliteCorruptionError', () => {
  it('reconoce los 3 mensajes de corrupción de better-sqlite3', () => {
    expect(isSqliteCorruptionError(new Error('database disk image is malformed'))).toBe(true);
    expect(isSqliteCorruptionError(new Error('SQLITE_CORRUPT: database corruption detected'))).toBe(true);
    expect(isSqliteCorruptionError(new Error('file is not a database'))).toBe(true);
  });

  it('es insensible a mayúsculas/minúsculas', () => {
    expect(isSqliteCorruptionError(new Error('DATABASE DISK IMAGE IS MALFORMED'))).toBe(true);
  });

  it('NO confunde un error de ocupación temporal con corrupción', () => {
    expect(isSqliteCorruptionError(new Error('database is locked'))).toBe(false);
    expect(isSqliteCorruptionError(new Error('SQLITE_BUSY'))).toBe(false);
  });

  it('no revienta con errores que no son instancias de Error', () => {
    expect(isSqliteCorruptionError('database disk image is malformed')).toBe(true);
    expect(isSqliteCorruptionError(undefined)).toBe(false);
    expect(isSqliteCorruptionError(null)).toBe(false);
    expect(isSqliteCorruptionError({ some: 'object' })).toBe(false);
  });
});

describe('sqliteOperationGuard — isSqliteLockContentionError', () => {
  it('reconoce los mensajes en español de ocupación temporal (lock de archivo SMB)', () => {
    expect(
      isSqliteLockContentionError(
        new Error('Base ocupada temporalmente por otro.usuario@PC-2 (PID 1234).'),
      ),
    ).toBe(true);
    expect(
      isSqliteLockContentionError(new Error('No se ha podido adquirir el bloqueo temporal de operación SQLite.')),
    ).toBe(true);
  });

  it('NO confunde un error de corrupción con ocupación temporal', () => {
    expect(isSqliteLockContentionError(new Error('database disk image is malformed'))).toBe(false);
  });

  it('NO confunde el código nativo SQLITE_BUSY (contención a nivel de fichero .sqlite) con el lock de directorio SMB', () => {
    // Son dos mecanismos distintos (ver ARCHITECTURE.md §5): este clasificador
    // es específico del lock de archivo .lockdir, no del motor SQLite.
    expect(isSqliteLockContentionError(new Error('database is locked'))).toBe(false);
  });
});

describe('sqliteOperationGuard — isSqliteBusyOrLockedError', () => {
  it('reconoce los códigos nativos SQLITE_BUSY y SQLITE_LOCKED aunque el mensaje no diga nada reconocible', () => {
    expect(isSqliteBusyOrLockedError({ code: 'SQLITE_BUSY', message: 'algo inesperado' })).toBe(true);
    expect(isSqliteBusyOrLockedError({ code: 'SQLITE_LOCKED', message: 'algo inesperado' })).toBe(true);
  });

  it('reconoce el mensaje en inglés de better-sqlite3 aunque no traiga código', () => {
    expect(isSqliteBusyOrLockedError(new Error('database is locked'))).toBe(true);
    expect(isSqliteBusyOrLockedError(new Error('SQLITE_ERROR: database table is locked'))).toBe(true);
  });

  it('no reconoce otros códigos nativos ni errores no relacionados', () => {
    expect(isSqliteBusyOrLockedError({ code: 'SQLITE_CONSTRAINT', message: 'UNIQUE constraint failed' })).toBe(
      false,
    );
    expect(isSqliteBusyOrLockedError(new Error('ENOENT: no such file or directory'))).toBe(false);
  });

  it('no revienta con valores sin forma de error', () => {
    expect(isSqliteBusyOrLockedError(null)).toBe(false);
    expect(isSqliteBusyOrLockedError(undefined)).toBe(false);
    expect(isSqliteBusyOrLockedError('database is locked')).toBe(true);
  });
});

describe('sqliteOperationGuard — SQLITE_BUSY_RETRY_DELAYS_MS', () => {
  it('define un backoff creciente de 3 reintentos (4 intentos totales en safeDatabaseOperation)', () => {
    expect(SQLITE_BUSY_RETRY_DELAYS_MS).toEqual([100, 300, 700]);
    // Estrictamente creciente: cada reintento espera más que el anterior.
    for (let i = 1; i < SQLITE_BUSY_RETRY_DELAYS_MS.length; i += 1) {
      expect(SQLITE_BUSY_RETRY_DELAYS_MS[i]).toBeGreaterThan(SQLITE_BUSY_RETRY_DELAYS_MS[i - 1]);
    }
  });
});
