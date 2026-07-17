import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDirtyEditorCount,
  hasDirtyEditors,
  setEditorDirty,
  unregisterDirtyEditor,
} from './dirtyEditors';

describe('dirtyEditors', () => {
  beforeEach(() => {
    unregisterDirtyEditor('editor-a');
    unregisterDirtyEditor('editor-b');
  });

  it('registra y elimina editores modificados sin duplicarlos', () => {
    setEditorDirty('editor-a', true);
    setEditorDirty('editor-a', true);

    expect(hasDirtyEditors()).toBe(true);
    expect(getDirtyEditorCount()).toBe(1);

    setEditorDirty('editor-a', false);
    expect(hasDirtyEditors()).toBe(false);
  });

  it('mantiene el recuento de varios editores abiertos', () => {
    setEditorDirty('editor-a', true);
    setEditorDirty('editor-b', true);
    unregisterDirtyEditor('editor-a');

    expect(getDirtyEditorCount()).toBe(1);
    expect(hasDirtyEditors()).toBe(true);
  });
});
