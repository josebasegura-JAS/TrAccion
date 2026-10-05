import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ModalBody, ModalHeader, ModalShell, ModalTitle } from './ModalShell';

afterEach(() => {
  cleanup();
});

function ModernModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">Abrir moderno</button>
      {open ? (
        <ModalShell labelledBy="modern-modal-title" onClose={() => setOpen(false)} size="sm">
          <ModalHeader>
            <ModalTitle id="modern-modal-title">Modal moderno</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <button type="button">Primera acción</button>
            <button onClick={() => setOpen(false)} type="button">Cerrar moderno</button>
          </ModalBody>
        </ModalShell>
      ) : null}
    </>
  );
}

function LegacyModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">Abrir legacy</button>
      {open ? (
        <div aria-label="Detalle anual de prueba" aria-modal="true" role="dialog">
          <button aria-label="Cerrar detalle" onClick={() => setOpen(false)} type="button">
            Cerrar
          </button>
          <button type="button">Acción legacy</button>
        </div>
      ) : null}
    </>
  );
}

describe('ModalShell', () => {
  it('cierra con Escape y devuelve el foco al control que abrió el modal moderno', async () => {
    render(<ModernModalHarness />);
    const opener = screen.getByRole('button', { name: 'Abrir moderno' });
    opener.focus();
    fireEvent.click(opener);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('mantiene Tab dentro del modal moderno', async () => {
    render(<ModernModalHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir moderno' }));

    const first = await screen.findByRole('button', { name: 'Primera acción' });
    const last = screen.getByRole('button', { name: 'Cerrar moderno' });

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('aplica Escape, focus trap y retorno de foco a un diálogo legacy', async () => {
    render(<LegacyModalHarness />);
    const opener = screen.getByRole('button', { name: 'Abrir legacy' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole('dialog', { name: 'Detalle anual de prueba' });
    expect(dialog).not.toHaveAttribute('data-modal-shell');

    const close = screen.getByRole('button', { name: 'Cerrar detalle' });
    const action = screen.getByRole('button', { name: 'Acción legacy' });

    await waitFor(() => expect(close).toHaveFocus());

    action.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
