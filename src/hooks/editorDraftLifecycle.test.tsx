import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRecoverableDraftKey, readRecoverableDraft, writeRecoverableDraft, useRecoverableDraft } from './useRecoverableDraft';
import { useUnsavedChanges } from './useUnsavedChanges';
import { getDirtyEditorCount } from '../services/dirtyEditors';

const mocks = vi.hoisted(() => ({ confirm: vi.fn(async () => true), recover: vi.fn(), discard: vi.fn() }));
vi.mock('./useAppDialog', () => ({ useAppDialog: () => ({ confirm: mocks.confirm, dialogNode: null }) }));

const key = buildRecoverableDraftKey('tareas', 'test');
const initial = { titulo: 'Original' };
const changed = { titulo: 'Modificado' };
function draftEditor(value = initial, enabled = true) {
  return renderHook(({ current, active, storageKey }) => useRecoverableDraft({
    currentValue: current, initialValue: initial, enabled: active, onRecover: mocks.recover, storageKey,
  }), { initialProps: { current: value, active: enabled, storageKey: key } });
}
beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  mocks.confirm.mockReset().mockResolvedValue(true);
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('ciclo real de borradores recuperables', () => {
  it('guarda solo la última edición después del debounce', () => {
    const editor = draftEditor();
    editor.rerender({ current: changed, active: true, storageKey: key });
    act(() => vi.advanceTimersByTime(300));
    expect(readRecoverableDraft(key)).toBeNull();
    const latest = { titulo: 'Última edición' };
    editor.rerender({ current: latest, active: true, storageKey: key });
    act(() => vi.advanceTimersByTime(499));
    expect(readRecoverableDraft(key)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(readRecoverableDraft(key)?.value).toEqual(latest);
  });
  it('guarda inmediatamente el último valor antes de descargar la ventana', () => {
    const editor = draftEditor();
    editor.rerender({ current: changed, active: true, storageKey: key });
    act(() => { window.dispatchEvent(new Event('beforeunload')); });
    expect(readRecoverableDraft(key)?.value).toEqual(changed);
  });
  it('ofrece recuperar un borrador tras desmontar y volver a abrir', async () => {
    const editor = draftEditor(changed);
    act(() => vi.advanceTimersByTime(500));
    editor.unmount();
    await act(async () => { draftEditor(); });
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.recover).toHaveBeenCalledWith(changed);
  });
  it('permite descartar explícitamente un borrador anterior', async () => {
    writeRecoverableDraft(key, changed);
    mocks.confirm.mockResolvedValueOnce(false);
    await act(async () => { draftEditor(); });
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(readRecoverableDraft(key)).toBeNull();
  });
  it('no solicita recuperar un borrador idéntico a la versión inicial', () => {
    writeRecoverableDraft(key, initial);
    draftEditor();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(readRecoverableDraft(key)).toBeNull();
  });
  it('elimina el borrador cuando el usuario vuelve al valor inicial', () => {
    const editor = draftEditor(changed);
    act(() => vi.advanceTimersByTime(500));
    expect(readRecoverableDraft(key)?.value).toEqual(changed);
    editor.rerender({ current: initial, active: true, storageKey: key });
    expect(readRecoverableDraft(key)).toBeNull();
  });
  it('limpia únicamente el borrador del registro confirmado', () => {
    const other = buildRecoverableDraftKey('teletrabajo', 'test');
    writeRecoverableDraft(other, changed);
    const editor = draftEditor(changed);
    act(() => vi.advanceTimersByTime(500));
    act(() => editor.result.current.clearDraft());
    expect(readRecoverableDraft(key)).toBeNull();
    expect(readRecoverableDraft(other)?.value).toEqual(changed);
  });
  it('no aplica una confirmación tardía a un editor desmontado', async () => {
    writeRecoverableDraft(key, changed);
    let resolve!: (value: boolean) => void;
    mocks.confirm.mockReturnValueOnce(new Promise(res => { resolve = res; }));
    const editor = draftEditor();
    editor.unmount();
    await act(async () => resolve(true));
    expect(mocks.recover).not.toHaveBeenCalled();
    expect(readRecoverableDraft(key)?.value).toEqual(changed);
  });
});

describe('protección de cambios sin guardar', () => {
  function closeEditor(current = changed) {
    return renderHook(({ value, enabled }) => useUnsavedChanges({
      currentValue: value, initialValue: initial, enabled, onDiscard: mocks.discard,
    }), { initialProps: { value: current, enabled: true } });
  }
  it('cierra sin preguntar si no hay modificaciones', async () => {
    const editor = closeEditor(initial);
    await act(async () => editor.result.current.requestClose());
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.discard).toHaveBeenCalledTimes(1);
  });
  it('cancelar el descarte mantiene el editor registrado como modificado', async () => {
    const editor = closeEditor();
    mocks.confirm.mockResolvedValueOnce(false);
    await act(async () => editor.result.current.requestClose());
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(editor.result.current.isDirty).toBe(true);
    expect(getDirtyEditorCount()).toBe(1);
  });
  it('solo permite descartar tras confirmación positiva', async () => {
    const editor = closeEditor();
    await act(async () => editor.result.current.requestClose());
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.discard).toHaveBeenCalledTimes(1);
  });
  it('actualiza el registro global de varios editores al revertir y desmontar', () => {
    const first = closeEditor();
    const second = closeEditor();
    expect(getDirtyEditorCount()).toBe(2);
    first.rerender({ value: initial, enabled: true });
    expect(getDirtyEditorCount()).toBe(1);
    second.unmount();
    expect(getDirtyEditorCount()).toBe(0);
  });
});
