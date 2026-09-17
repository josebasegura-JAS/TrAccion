import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';
import { useModuleHelpRegistry } from '../../services/moduleHelpRegistry';

describe('PageHeader', () => {
  afterEach(() => {
    cleanup();
    useModuleHelpRegistry.setState({ content: null });
  });

  it('no pinta el título en pantalla, pero lo deja accesible cuando hay acciones', () => {
    render(
      <PageHeader title="Ticket Restaurante" actions={<button type="button">Acción</button>} />,
    );

    const heading = screen.getByRole('heading', { name: 'Ticket Restaurante' });
    expect(heading).toHaveClass('sr-only');
  });

  it('no deja ningún nodo en el flujo si no hay acciones ni estado', () => {
    const { container } = render(<PageHeader title="Sin nada" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza las acciones cuando se proporcionan', () => {
    render(<PageHeader title="Tareas" actions={<button type="button">Nueva tarea</button>} />);

    expect(screen.getByRole('button', { name: 'Nueva tarea' })).toBeInTheDocument();
  });

  it('saca el status del flujo cuando no hay acciones para no crear un hueco vacío', () => {
    const { container } = render(<PageHeader title="Tareas" status={<span>Guardado</span>} />);

    expect(screen.getByText('Guardado')).toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    expect(document.body.querySelector('[aria-label="Tareas: estado"]')).toHaveClass('fixed');
  });

  it('mantiene status y acciones en la misma barra cuando ambos son visibles', () => {
    const { container } = render(
      <PageHeader
        title="Especiales"
        status={<span>Guardado</span>}
        actions={<button type="button">Nueva comunicación</button>}
      />,
    );

    expect(screen.getByText('Guardado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva comunicación' })).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass('fixed');
  });

  it('registra la ayuda del módulo en moduleHelpRegistry al montarse', () => {
    render(
      <PageHeader
        title="Sorteos"
        helpSections={[{ title: 'Sección', body: 'Contenido de ayuda' }]}
        helpSubtitle="Subtítulo de ayuda"
      />,
    );

    const content = useModuleHelpRegistry.getState().content;
    expect(content).not.toBeNull();
    expect(content?.title).toBe('Sorteos');
    expect(content?.subtitle).toBe('Subtítulo de ayuda');
    expect(content?.sections).toHaveLength(1);
  });

  it('usa helpTitle en lugar de title para la ayuda registrada si se indica', () => {
    render(
      <PageHeader
        title="Comité"
        helpTitle="Comité de Empresa"
        helpSections={[{ title: 'Sección', body: 'Contenido' }]}
      />,
    );

    expect(useModuleHelpRegistry.getState().content?.title).toBe('Comité de Empresa');
  });

  it('limpia la ayuda registrada al desmontarse', () => {
    const { unmount } = render(
      <PageHeader title="Vinculograma" helpSections={[{ title: 'Sección', body: 'Contenido' }]} />,
    );

    expect(useModuleHelpRegistry.getState().content).not.toBeNull();

    unmount();

    expect(useModuleHelpRegistry.getState().content).toBeNull();
  });

  it('no registra ayuda si no se pasan helpSections', () => {
    render(<PageHeader title="Ajustes" actions={<button type="button">Acción</button>} />);

    expect(useModuleHelpRegistry.getState().content).toBeNull();
  });
});
