import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';
import { useModuleHelpRegistry } from '../../services/moduleHelpRegistry';

describe('PageHeader', () => {
  afterEach(() => {
    cleanup();
    useModuleHelpRegistry.setState({ content: null });
  });

  it('no pinta el título en pantalla, pero lo deja accesible para lectores de pantalla', () => {
    render(
      <PageHeader title="Ticket Restaurante" actions={<button type="button">Acción</button>} />,
    );

    const heading = screen.getByRole('heading', { name: 'Ticket Restaurante' });
    expect(heading).toHaveClass('sr-only');
  });

  it('no renderiza ningún contenedor visible si no hay ni acciones ni estado', () => {
    const { container } = render(<PageHeader title="Sin nada" />);

    // Solo debe quedar el <h2 class="sr-only">, sin la franja de cabecera.
    expect(container.querySelectorAll('div')).toHaveLength(0);
  });

  it('renderiza las acciones cuando se proporcionan', () => {
    render(<PageHeader title="Tareas" actions={<button type="button">Nueva tarea</button>} />);

    expect(screen.getByRole('button', { name: 'Nueva tarea' })).toBeInTheDocument();
  });

  it('renderiza el indicador de estado ambiental (status) cuando se proporciona', () => {
    render(<PageHeader title="Especiales" status={<span>Guardado</span>} />);

    expect(screen.getByText('Guardado')).toBeInTheDocument();
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
