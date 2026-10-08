import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CoordinationPoint } from '../domain/coordinacion';
import { CoordinationPointEditor } from './CoordinationPointEditor';

function makePoint(overrides: Partial<CoordinationPoint> = {}): CoordinationPoint {
  return {
    id: 'point-1',
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

describe('CoordinationPointEditor remote synchronization', () => {
  afterEach(() => {
    cleanup();
  });

  function renderEditor(point: CoordinationPoint) {
    const onDraftChange = vi.fn();
    const onRemoteConflictChange = vi.fn();
    const view = render(
      <CoordinationPointEditor
        index={0}
        isUnion={false}
        meetingOpen
        onConvertToTask={vi.fn()}
        onDelete={vi.fn()}
        onDraftChange={onDraftChange}
        onRemoteConflictChange={onRemoteConflictChange}
        point={point}
      />,
    );

    return { ...view, onDraftChange, onRemoteConflictChange };
  }

  it('refreshes a clean draft when the point changes externally', () => {
    const initial = makePoint();
    const { rerender, onDraftChange, onRemoteConflictChange } = renderEditor(initial);

    const remote = makePoint({
      result: 'Resultado actualizado por otra sesión',
      updatedAt: '2026-10-08T07:05:00.000Z',
    });
    rerender(
      <CoordinationPointEditor
        index={0}
        isUnion={false}
        meetingOpen
        onConvertToTask={vi.fn()}
        onDelete={vi.fn()}
        onDraftChange={onDraftChange}
        onRemoteConflictChange={onRemoteConflictChange}
        point={remote}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Resultado / acuerdos' })).toHaveValue('Resultado actualizado por otra sesión');
    expect(screen.queryByText('Este punto ha cambiado en otra sesión')).not.toBeInTheDocument();
    expect(onDraftChange).toHaveBeenCalledWith('point-1', expect.objectContaining({ result: remote.result }), false);
    expect(onRemoteConflictChange).toHaveBeenCalledWith('point-1', false);
  });

  it('preserves a dirty local draft and reports a conflict when editable remote data changes', () => {
    const initial = makePoint();
    const { rerender, onDraftChange, onRemoteConflictChange } = renderEditor(initial);
    const result = screen.getByRole('textbox', { name: 'Resultado / acuerdos' });

    fireEvent.change(result, { target: { value: 'Mi edición local' } });

    const remote = makePoint({
      result: 'Edición guardada desde otra sesión',
      updatedAt: '2026-10-08T07:05:00.000Z',
    });
    rerender(
      <CoordinationPointEditor
        index={0}
        isUnion={false}
        meetingOpen
        onConvertToTask={vi.fn()}
        onDelete={vi.fn()}
        onDraftChange={onDraftChange}
        onRemoteConflictChange={onRemoteConflictChange}
        point={remote}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Resultado / acuerdos' })).toHaveValue('Mi edición local');
    expect(screen.getByText('Este punto ha cambiado en otra sesión')).toBeInTheDocument();
    expect(onRemoteConflictChange).toHaveBeenCalledWith('point-1', true);
  });

  it('reloads the remote point explicitly to resolve a conflict', () => {
    const initial = makePoint();
    const { rerender, onDraftChange, onRemoteConflictChange } = renderEditor(initial);

    fireEvent.change(screen.getByRole('textbox', { name: 'Resultado / acuerdos' }), {
      target: { value: 'Mi edición local' },
    });

    const remote = makePoint({
      result: 'Versión remota vigente',
      updatedAt: '2026-10-08T07:05:00.000Z',
    });
    rerender(
      <CoordinationPointEditor
        index={0}
        isUnion={false}
        meetingOpen
        onConvertToTask={vi.fn()}
        onDelete={vi.fn()}
        onDraftChange={onDraftChange}
        onRemoteConflictChange={onRemoteConflictChange}
        point={remote}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Recargar cambios' }));

    expect(screen.getByRole('textbox', { name: 'Resultado / acuerdos' })).toHaveValue('Versión remota vigente');
    expect(screen.queryByText('Este punto ha cambiado en otra sesión')).not.toBeInTheDocument();
    expect(onDraftChange).toHaveBeenLastCalledWith('point-1', expect.objectContaining({ result: remote.result }), false);
    expect(onRemoteConflictChange).toHaveBeenLastCalledWith('point-1', false);
  });

  it('does not report a conflict when the remote point converges with the local draft after save', () => {
    const initial = makePoint();
    const { rerender, onDraftChange, onRemoteConflictChange } = renderEditor(initial);

    fireEvent.change(screen.getByRole('textbox', { name: 'Resultado / acuerdos' }), {
      target: { value: 'Resultado ya guardado' },
    });

    const saved = makePoint({
      result: 'Resultado ya guardado',
      updatedAt: '2026-10-08T07:05:00.000Z',
    });
    rerender(
      <CoordinationPointEditor
        index={0}
        isUnion={false}
        meetingOpen
        onConvertToTask={vi.fn()}
        onDelete={vi.fn()}
        onDraftChange={onDraftChange}
        onRemoteConflictChange={onRemoteConflictChange}
        point={saved}
      />,
    );

    expect(screen.queryByText('Este punto ha cambiado en otra sesión')).not.toBeInTheDocument();
    expect(onRemoteConflictChange).not.toHaveBeenCalledWith('point-1', true);
    expect(onRemoteConflictChange).toHaveBeenCalledWith('point-1', false);
  });
});
