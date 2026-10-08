import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoordinationPoint } from '../domain/coordinacion';
import { CoordinationPointEditor } from './CoordinationPointEditor';

function makePoint(overrides: Partial<CoordinationPoint> = {}): CoordinationPoint {
  return {
    id: 'point-hardening',
    origin: 'manual',
    taskId: null,
    title: 'Punto de prueba',
    detail: '',
    result: 'Resultado inicial',
    status: 'pendiente',
    createdAt: '2026-10-08T07:00:00.000Z',
    updatedAt: '2026-10-08T07:00:00.000Z',
    ...overrides,
  };
}

function editorProps(point: CoordinationPoint, onDraftChange = vi.fn(), onRemoteConflictChange = vi.fn()) {
  return {
    index: 0,
    isUnion: false,
    meetingOpen: true,
    onConvertToTask: vi.fn(),
    onDelete: vi.fn(),
    onDraftChange,
    onRemoteConflictChange,
    point,
  };
}

describe('CoordinationPointEditor hardening', () => {
  afterEach(() => cleanup());

  it('no crea conflicto por cambios remotos no editables mientras existe un draft local', () => {
    const initial = makePoint();
    const onDraftChange = vi.fn();
    const onRemoteConflictChange = vi.fn();
    const view = render(<CoordinationPointEditor {...editorProps(initial, onDraftChange, onRemoteConflictChange)} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Resultado / acuerdos' }), {
      target: { value: 'Edición local pendiente' },
    });

    const remoteMetadataOnly = makePoint({
      title: 'Título actualizado fuera',
      detail: 'Detalle actualizado fuera',
      updatedAt: '2026-10-08T07:05:00.000Z',
    });
    view.rerender(
      <CoordinationPointEditor {...editorProps(remoteMetadataOnly, onDraftChange, onRemoteConflictChange)} />,
    );

    expect(screen.getByRole('textbox', { name: 'Resultado / acuerdos' })).toHaveValue('Edición local pendiente');
    expect(screen.queryByText('Este punto ha cambiado en otra sesión')).not.toBeInTheDocument();
    expect(onRemoteConflictChange).not.toHaveBeenCalledWith('point-hardening', true);
  });

  it('detecta conflicto si remoto cambia otro campo editable distinto del modificado localmente', () => {
    const initial = makePoint();
    const onDraftChange = vi.fn();
    const onRemoteConflictChange = vi.fn();
    const view = render(<CoordinationPointEditor {...editorProps(initial, onDraftChange, onRemoteConflictChange)} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Resultado / acuerdos' }), {
      target: { value: 'Mi resultado local' },
    });

    const remote = makePoint({
      status: 'seguimiento',
      updatedAt: '2026-10-08T07:05:00.000Z',
    });
    view.rerender(<CoordinationPointEditor {...editorProps(remote, onDraftChange, onRemoteConflictChange)} />);

    expect(screen.getByRole('textbox', { name: 'Resultado / acuerdos' })).toHaveValue('Mi resultado local');
    expect(screen.getByText('Este punto ha cambiado en otra sesión')).toBeInTheDocument();
    expect(onRemoteConflictChange).toHaveBeenCalledWith('point-hardening', true);
  });

  it('libera el conflicto del padre al desmontar el editor', () => {
    const initial = makePoint();
    const onDraftChange = vi.fn();
    const onRemoteConflictChange = vi.fn();
    const view = render(<CoordinationPointEditor {...editorProps(initial, onDraftChange, onRemoteConflictChange)} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Resultado / acuerdos' }), {
      target: { value: 'Mi edición local' },
    });
    view.rerender(
      <CoordinationPointEditor
        {...editorProps(
          makePoint({ result: 'Versión remota', updatedAt: '2026-10-08T07:05:00.000Z' }),
          onDraftChange,
          onRemoteConflictChange,
        )}
      />,
    );

    expect(onRemoteConflictChange).toHaveBeenCalledWith('point-hardening', true);
    view.unmount();
    expect(onRemoteConflictChange).toHaveBeenLastCalledWith('point-hardening', false);
  });
});
