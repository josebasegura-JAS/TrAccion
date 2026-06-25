import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateEmployee } from '../features/plantilla/domain/derived';
import { EMPTY_EMPLOYEE_DRAFT, type Employee } from '../features/plantilla/domain/employee';
import type { JobPositionTranslation } from '../features/plantilla/domain/jobPositionTranslation';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { JobPositionTranslationsModal } from '../components/JobPositionTranslationsModal';

// DataTable llama a scrollContainerRef.current?.scrollTo en un efecto;
// jsdom no implementa Element.scrollTo (igual que en el smoke test general
// de módulos UI), así que se mockea aquí también.
Element.prototype.scrollTo = vi.fn();

function buildEmployee(overrides: Partial<Employee>): Employee {
  return {
    ...hydrateEmployee({ ...EMPTY_EMPLOYEE_DRAFT, empleado: '00001', nombreApellidos: 'Ana García' }),
    ...overrides,
  };
}

describe('JobPositionTranslationsModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useEmployeeStore.setState({ employees: [], jobPositionTranslations: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('al abrir, da de alta automáticamente como pendiente un puestoOrganizativo nuevo de Plantilla', async () => {
    useEmployeeStore.setState({
      employees: [buildEmployee({ puestoOrganizativo: 'Técnica de Recursos' })],
    });

    render(<JobPositionTranslationsModal onClose={() => {}} />);

    await waitFor(() => {
      expect(useEmployeeStore.getState().jobPositionTranslations).toEqual([
        { puestoCastellano: 'Técnica de Recursos', puestoEuskera: '' },
      ]);
    });

    expect(await screen.findByText(/se ha añadido 1 puesto pendiente/i)).toBeInTheDocument();
    expect(screen.getByText('Sin traducción')).toBeInTheDocument();
  });

  it('no añade nada ni muestra mensaje si todos los puestoOrganizativo ya tienen traducción', async () => {
    const existingTranslation: JobPositionTranslation = {
      puestoCastellano: 'Técnica de Recursos',
      puestoEuskera: 'Baliabide Teknikaria',
    };
    useEmployeeStore.setState({
      employees: [buildEmployee({ puestoOrganizativo: 'Técnica de Recursos' })],
      jobPositionTranslations: [existingTranslation],
    });

    render(<JobPositionTranslationsModal onClose={() => {}} />);

    // Da tiempo a que el efecto de sincronización se ejecute y resuelva.
    await waitFor(() => {
      expect(useEmployeeStore.getState().jobPositionTranslations).toHaveLength(1);
    });

    expect(screen.queryByText(/puesto pendiente/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Sin traducción')).not.toBeInTheDocument();
    expect(screen.getByText('Baliabide Teknikaria')).toBeInTheDocument();
  });

  it('marca «Sin traducción» en una fila ya existente que se dio de alta sin traducción manualmente', () => {
    useEmployeeStore.setState({
      jobPositionTranslations: [{ puestoCastellano: 'Conserje', puestoEuskera: '' }],
    });

    render(<JobPositionTranslationsModal onClose={() => {}} />);

    expect(screen.getByText('Sin traducción')).toBeInTheDocument();
  });
});
