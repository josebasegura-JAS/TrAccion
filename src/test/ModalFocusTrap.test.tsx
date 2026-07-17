import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDialog } from '../components/ui/AppDialog';
import { ModalShell } from '../components/ui/ModalShell';

afterEach(() => {
  cleanup();
});

describe('modal focus trap', () => {
  it('mueve el foco al primer control y mantiene Tab dentro de ModalShell', async () => {
    render(
      <ModalShell labelledBy="modal-title" onClose={vi.fn()}>
        <h2 id="modal-title">Editar</h2>
        <button type="button">Primero</button>
        <input aria-label="Campo" />
        <button type="button">Último</button>
      </ModalShell>,
    );

    const first = screen.getByRole('button', { name: 'Primero' });
    const last = screen.getByRole('button', { name: 'Último' });

    await waitFor(() => expect(first).toHaveFocus());

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('devuelve el foco al control que abrió el modal', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)} type="button">Abrir</button>
          {open ? (
            <ModalShell labelledBy="return-title" onClose={() => setOpen(false)}>
              <h2 id="return-title">Modal</h2>
              <button type="button">Dentro</button>
            </ModalShell>
          ) : null}
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    opener.focus();
    fireEvent.click(opener);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Dentro' })).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('solo permite que el diálogo superior gestione Escape', async () => {
    const onBaseClose = vi.fn();
    const onDialogCancel = vi.fn();

    render(
      <ModalShell labelledBy="base-title" onClose={onBaseClose}>
        <h2 id="base-title">Base</h2>
        <button type="button">Acción base</button>
        <AppDialog
          message="Cambios sin guardar"
          mode="confirm"
          onCancel={onDialogCancel}
          onConfirm={vi.fn()}
        />
      </ModalShell>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onDialogCancel).toHaveBeenCalledTimes(1);
    expect(onBaseClose).not.toHaveBeenCalled();
  });

  it('mantiene el foco dentro de AppDialog', async () => {
    render(
      <AppDialog
        message="¿Continuar?"
        mode="confirm"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Aceptar' });

    await waitFor(() => expect(cancel).toHaveFocus());
    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancel).toHaveFocus();
  });
});
