import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ directory: '' }));
vi.mock('electron', () => ({ app: { getPath: () => mocks.directory } }));

describe('sqliteIncidentJournal', () => {
  beforeEach(() => {
    mocks.directory = mkdtempSync(path.join(tmpdir(), 'traccion-journal-test-'));
    vi.resetModules();
  });
  afterEach(() => rmSync(mocks.directory, { force: true, recursive: true }));

  it('mantiene como incierta una escritura que empezó y no finalizó', async () => {
    const journal = await import('./sqliteIncidentJournal.js');
    journal.beginSqliteWrite('tasks:save-record');
    expect(journal.getSqliteIncidentReport().uncertain).toHaveLength(1);
    vi.resetModules();
    const reopened = await import('./sqliteIncidentJournal.js');
    expect(reopened.getSqliteIncidentReport().uncertain[0]?.operation).toBe('tasks:save-record');
  });

  it('distingue timeout de finalización real y no considera incierta una escritura completada', async () => {
    const journal = await import('./sqliteIncidentJournal.js');
    const id = journal.beginSqliteWrite('tasks:save-record');
    journal.finishSqliteWrite(id, 'tasks:save-record', 'timeout');
    expect(journal.getSqliteIncidentReport().uncertain).toHaveLength(1);
    journal.finishSqliteWrite(id, 'tasks:save-record', 'completed');
    expect(journal.getSqliteIncidentReport().uncertain).toHaveLength(0);
  });

  it('trata un rechazo de la operación como indeterminado para evitar reintentos ciegos', async () => {
    const journal = await import('./sqliteIncidentJournal.js');
    const id = journal.beginSqliteWrite('tasks:save-record');
    journal.finishSqliteWrite(id, 'tasks:save-record', 'failed', 'Red no disponible');
    expect(journal.getSqliteIncidentReport().uncertain).toHaveLength(1);
  });
});
