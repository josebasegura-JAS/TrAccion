import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FloatingSaveAction } from './FloatingSaveAction';

const visibleRect = {
  bottom: 80,
  height: 40,
  left: 0,
  right: 180,
  top: 40,
  width: 180,
  x: 0,
  y: 40,
  toJSON: () => ({}),
} as DOMRect;

const offscreenRect = {
  ...visibleRect,
  bottom: -20,
  top: -60,
  y: -60,
} as DOMRect;

describe('FloatingSaveAction', () => {
  afterEach(() => {
    cleanup();
    document
      .querySelectorAll('[data-page-header-actions="true"], [data-save-anchor]')
      .forEach((element) => element.remove());
    vi.restoreAllMocks();
  });

  it('se oculta mientras las acciones del PageHeader están visibles', async () => {
    const headerActions = document.createElement('div');
    headerActions.dataset.pageHeaderActions = 'true';
    headerActions.getBoundingClientRect = vi.fn(() => visibleRect);
    document.body.appendChild(headerActions);

    render(<FloatingSaveAction visible onSave={() => undefined} />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
    });
  });

  it('aparece al hacer scroll cuando la acción fija deja de estar visible', async () => {
    let rect = visibleRect;
    const headerActions = document.createElement('div');
    headerActions.dataset.pageHeaderActions = 'true';
    headerActions.getBoundingClientRect = vi.fn(() => rect);
    document.body.appendChild(headerActions);

    render(<FloatingSaveAction visible onSave={() => undefined} />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
    });

    rect = offscreenRect;
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
    });
  });

  it('permite vigilar un guardado fijo mediante selector', async () => {
    const fixedSave = document.createElement('button');
    fixedSave.dataset.saveAnchor = 'settings';
    fixedSave.getBoundingClientRect = vi.fn(() => visibleRect);
    document.body.appendChild(fixedSave);

    render(
      <FloatingSaveAction
        onSave={() => undefined}
        suppressWhenPageHeaderHasActions={false}
        suppressWhenSelectorVisible="[data-save-anchor='settings']"
        visible
      />,
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument();
    });
  });
});
