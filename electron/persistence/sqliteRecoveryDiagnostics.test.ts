import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
}));

import {
  describeSqliteRecoveryError,
  shouldWriteSqliteHealthDiagnostic,
  writeSqliteRecoveryDiagnostic,
} from './sqliteRecoveryDiagnostics.js';

let directory: string | null = null;
afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = null;
});

describe('PR9A · diagnósticos SQLite sin información personal', () => {
  it('registra código SQLite pero nunca la ruta SMB ni el mensaje arbitrario', () => {
    const error = Object.assign(
      new Error('SQLITE_IOERR: acceso a \\\\servidor\\recurso\\empleados.sqlite con contenido personal'),
      { code: 'SQLITE_IOERR' },
    );
    const descriptor = describeSqliteRecoveryError(error);
    expect(descriptor).toEqual({
      errorCode: 'SQLITE_IOERR',
      errorName: 'Error',
      errorMessage: 'Código SQLITE_IOERR',
    });
    expect(JSON.stringify(descriptor)).not.toContain('servidor');
    expect(JSON.stringify(descriptor)).not.toContain('personal');
  });

  it('conserva fallos y comprobaciones lentas; muestrea verificaciones sanas', () => {
    expect(shouldWriteSqliteHealthDiagnostic('failed', 5)).toBe(true);
    expect(shouldWriteSqliteHealthDiagnostic('skipped', 5)).toBe(true);
    expect(shouldWriteSqliteHealthDiagnostic('ok', 20_000)).toBe(true);
    const sequence = Array.from({ length: 61 }, () => shouldWriteSqliteHealthDiagnostic('ok', 10));
    expect(sequence.filter(Boolean)).toHaveLength(2);
  });

  it('escribe una línea JSON en userData con etapa y diagnóstico de cola', () => {
    directory = mkdtempSync(path.join(tmpdir(), 'traccion-pr9a-'));
    state.userData = directory;
    writeSqliteRecoveryDiagnostic({
      event: 'health', outcome: 'failed', stage: 'consulta', durationMs: 21_000,
      recoveryRequired: false,
      queue: { queuedOperations: 1, runningOperation: 'database:health-check', runningMs: 21_000, timedOut: false },
      errorCode: 'SQLITE_IOERR', errorName: 'Error', errorMessage: 'Código SQLITE_IOERR',
    });
    const content = readFileSync(path.join(directory, 'sqlite-recovery-diagnostics.jsonl'), 'utf8').trim();
    const event = JSON.parse(content) as Record<string, unknown>;
    expect(event.event).toBe('health');
    expect(event.stage).toBe('consulta');
    expect(event.durationMs).toBe(21_000);
    expect(event.errorCode).toBe('SQLITE_IOERR');
  });
});
