import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SaveState } from './loteriaPage.helpers';

describe('SaveState', () => {
  it('no muestra un estado permanente cuando no hay cambios ni mensajes', () => {
    const { container } = render(<SaveState dirty={false} message="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('mantiene visible el aviso de cambios pendientes', () => {
    render(<SaveState dirty message="" />);
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
  });

  it('no repite una confirmación rutinaria de guardado', () => {
    const { container } = render(
      <SaveState dirty={false} message="Cambios guardados. Excel de campaña actualizado." />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mantiene visibles los problemas que requieren atención', () => {
    render(
      <SaveState
        dirty={false}
        message="No se ha podido actualizar el Excel de campaña: acceso denegado."
      />,
    );
    expect(screen.getByText(/No se ha podido actualizar el Excel/)).toBeInTheDocument();
  });

  it('mantiene los resultados puntuales que no son el guardado normal', () => {
    render(<SaveState dirty={false} message="Borrador de Outlook preparado." />);
    expect(screen.getByText('Borrador de Outlook preparado.')).toBeInTheDocument();
  });
});
