import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEditorShortcuts } from './useEditorShortcuts';

function Harness({
  canSave = true,
  enabled = true,
  onClose,
  onSave,
}: {
  canSave?: boolean;
  enabled?: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  useEditorShortcuts({ canSave, enabled, onClose, onSave });
  return null;
}

function dispatchShortcut(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe('useEditorShortcuts', () => {
  afterEach(() => {
    cleanup();
    document.querySelectorAll('[data-block-editor-shortcuts="true"]').forEach((node) => node.remove());
  });

  it('guarda con Ctrl+S y evita el guardado del navegador', () => {
    const onSave = vi.fn();
    render(<Harness onClose={vi.fn()} onSave={onSave} />);

    const event = dispatchShortcut({ key: 's', ctrlKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('admite Cmd+S y no guarda si la acción está deshabilitada', () => {
    const onSave = vi.fn();
    render(<Harness canSave={false} onClose={vi.fn()} onSave={onSave} />);

    const event = dispatchShortcut({ key: 'S', metaKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('solicita el cierre con Escape', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} onSave={vi.fn()} />);

    const event = dispatchShortcut({ key: 'Escape' });

    expect(event.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no actúa cuando hay un diálogo o modal superior', () => {
    const blocker = document.createElement('div');
    blocker.dataset.blockEditorShortcuts = 'true';
    document.body.appendChild(blocker);
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(<Harness onClose={onClose} onSave={onSave} />);

    dispatchShortcut({ key: 'Escape' });
    dispatchShortcut({ key: 's', ctrlKey: true });

    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
  it('ignora la repetición automática de Ctrl+S', () => {
    const onSave = vi.fn();
    render(<Harness onClose={vi.fn()} onSave={onSave} />);
    dispatchShortcut({ key: 's', ctrlKey: true });
    const repeated = dispatchShortcut({ key: 's', ctrlKey: true, repeat: true });
    expect(repeated.defaultPrevented).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('no intercepta combinaciones con Alt o Shift', () => {
    const onSave = vi.fn();
    render(<Harness onClose={vi.fn()} onSave={onSave} />);
    expect(dispatchShortcut({ key: 's', ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(dispatchShortcut({ key: 's', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('respeta la composición de texto y eventos ya consumidos', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(<Harness onClose={onClose} onSave={onSave} />);
    dispatchShortcut({ key: 'Escape', isComposing: true });
    const consumed = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
    consumed.preventDefault();
    window.dispatchEvent(consumed);
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('no deja listeners activos al deshabilitar o desmontar', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const view = render(<Harness enabled={false} onClose={onClose} onSave={onSave} />);
    dispatchShortcut({ key: 'Escape' });
    view.rerender(<Harness enabled onClose={onClose} onSave={onSave} />);
    dispatchShortcut({ key: 's', metaKey: true });
    view.unmount();
    dispatchShortcut({ key: 'Escape' });
    dispatchShortcut({ key: 's', ctrlKey: true });
    expect(onClose).not.toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
