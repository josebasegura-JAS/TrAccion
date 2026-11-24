// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDialog } from './AppDialog';

afterEach(cleanup);

describe('AppDialog: cierre explícito', () => {
  it('cierra un aviso informativo', () => {
    const onConfirm = vi.fn();
    render(<AppDialog mode="alert" message="Aviso" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar diálogo' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancela una confirmación destructiva sin ejecutarla', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<AppDialog mode="confirm" danger message="Eliminar" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar diálogo' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
