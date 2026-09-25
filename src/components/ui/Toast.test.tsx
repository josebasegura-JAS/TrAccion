import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from './Toast';

function Trigger() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Exportación completada')} type="button">success</button>
      <button onClick={() => toast.error('No se ha podido guardar')} type="button">error</button>
    </div>
  );
}

describe('ToastProvider', () => {
  it('anuncia éxitos de forma polite y permite cerrarlos', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'success' }));
    const toast = screen.getByRole('status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveTextContent('Exportación completada');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }));
    expect(screen.queryByText('Exportación completada')).not.toBeInTheDocument();
  });

  it('anuncia errores de forma assertive', () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'error' }));
    const toast = screen.getByRole('alert');
    expect(toast).toHaveAttribute('aria-live', 'assertive');
    expect(toast).toHaveTextContent('No se ha podido guardar');
  });
});
