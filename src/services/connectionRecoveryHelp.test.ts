import { describe, expect, it } from 'vitest';
import { buildConnectionReport, classifyConnectionProblem, connectionProblemExplanation } from './connectionRecoveryHelp';

describe('ayuda de reconexión SQLite', () => {
  it('distingue fallo E/S de bloqueo y timeout', () => {
    expect(classifyConnectionProblem('SqliteError: disk I/O error')).toBe('disk-io');
    expect(classifyConnectionProblem('SQLITE_IOERR_READ')).toBe('disk-io');
    expect(classifyConnectionProblem('database is locked')).toBe('locked');
    expect(classifyConnectionProblem('La comprobación SQLite superó 6 s.')).toBe('timeout');
    expect(classifyConnectionProblem('ENOENT')).toBe('path');
    expect(classifyConnectionProblem(null)).toBe('unknown');
  });

  it('advierte que no se debe repetir un guardado incierto', () => {
    expect(connectionProblemExplanation('Resultado indeterminado')).toContain('No conviene repetir');
  });

  it('genera un informe utilizable sin inventar comprobaciones', () => {
    const report = buildConnectionReport({
      phase: 'reconnecting',
      attempt: 8,
      checking: false,
      consecutiveFailures: 8,
      lastFailureAt: '2026-11-03T09:00:00.000Z',
      lastSuccessAt: null,
      lastCheckDurationMs: 2500,
      lastError: 'disk I/O error',
    });
    expect(report).toContain('Intento mostrado: 8');
    expect(report).toContain('Tipo de incidencia: disk-io');
    expect(report).toContain('Error técnico: disk I/O error');
    expect(report).toContain('no incluye ni comprueba');
  });
});
