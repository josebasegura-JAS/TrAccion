import { afterEach, describe, expect, it } from 'vitest';
import { setEditorDirty, unregisterDirtyEditor } from './dirtyEditors';
import { markSharedEditingActive, markSharedEditingInactive } from './sharedEditingActivity';
import {
  databaseContextSwitchBlockReason,
  didDatabaseContextChange,
} from './databaseContextSwitchSafety';

const editorId = 'database-switch-test-editor';
const moduleName = 'tareas';
const recordId = 'task-1';

function status(path: string, databaseUuid: string): TraccionDatabaseStatus {
  return {
    ready: true,
    phase: 'active',
    path,
    message: '',
    databaseUuid,
    environment: 'production',
    schemaVersion: 1,
  } as TraccionDatabaseStatus;
}

afterEach(() => {
  unregisterDirtyEditor(editorId);
  markSharedEditingInactive(moduleName, recordId);
});

describe('databaseContextSwitchSafety', () => {
  it('bloquea el cambio si hay un editor con cambios pendientes', () => {
    setEditorDirty(editorId, true);

    expect(databaseContextSwitchBlockReason()).toMatch(/cambios pendientes/i);
  });

  it('bloquea el cambio si hay edición compartida activa', () => {
    markSharedEditingActive(moduleName, recordId);

    expect(databaseContextSwitchBlockReason()).toMatch(/edición en curso/i);
  });

  it('permite el cambio cuando no hay edición activa', () => {
    expect(databaseContextSwitchBlockReason()).toBeNull();
  });

  it('detecta cambio de identidad aunque la ruta coincida', () => {
    expect(
      didDatabaseContextChange(status('G:\\RRLL\\traccion.db', 'db-a'), status('G:\\RRLL\\traccion.db', 'db-b')),
    ).toBe(true);
  });

  it('detecta cambio de ruta y no considera cambio una cancelación', () => {
    const current = status('G:\\RRLL\\traccion.db', 'db-a');

    expect(didDatabaseContextChange(current, status('H:\\RRLL\\traccion.db', 'db-a'))).toBe(true);
    expect(didDatabaseContextChange(current, { ...current })).toBe(false);
  });
});
