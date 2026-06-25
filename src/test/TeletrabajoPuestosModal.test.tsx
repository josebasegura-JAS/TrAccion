import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import type { Employee } from '../features/plantilla/domain/employee';
import type { JobPositionTranslation } from '../features/plantilla/domain/jobPositionTranslation';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import type { TeletrabajoPuesto } from '../features/teletrabajo/domain/puestosTeletrabajo';
import { TeletrabajoPuestosModal } from '../components/TeletrabajoPuestosModal';

// DataTable llama a scrollContainerRef.current?.scrollTo en un efecto;
// jsdom no implementa Element.scrollTo (igual que en el smoke test general
// de módulos UI), así que se mockea aquí también.
Element.prototype.scrollTo = vi.fn();

const now = '2026-06-01T08:00:00.000Z';

function buildEmployee(overrides: Partial<Employee>): Employee {
  return {
    empleado: '00001',
    nombreApellidos: 'Ana García',
    puestoNomina: 'Técnica',
    puestoOrganizativo: 'Técnica',
    puestoEus: '',
    residencia: '',
    unidad: '',
    nivelRetributivo: '',
    direccionOrganizativa: '',
    antiguedadPuesto: '',
    sexo: '',
    calle: '',
    numero: '',
    piso: '',
    codigoPostal: '',
    poblacion: '',
    provincia: '',
    nif: '',
    dni: '',
    residenciaCast: '',
    residenciaEus: '',
    direccionTeletrabajo: '',
    deletedAt: null,
    ...overrides,
  };
}

function buildPuesto(overrides: Partial<TeletrabajoPuesto>): TeletrabajoPuesto {
  return {
    id: 'puesto-1',
    puesto: 'Técnica',
    maxSolicitudes: 2,
    dotacionComputable: 3,
    grupoCoberturaId: null,
    observaciones: '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

function buildTranslation(overrides: Partial<JobPositionTranslation>): JobPositionTranslation {
  return { puestoCastellano: 'Técnica', puestoEuskera: 'Teknikaria', ...overrides };
}

describe('TeletrabajoPuestosModal', () => {
  beforeEach(() => {
    useEmployeeStore.setState({ employees: [], jobPositionTranslations: [] });
    useTeletrabajoStore.setState({ puestosTeletrabajo: [], gruposCobertura: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it('ofrece el campo Puesto como input con datalist (no como select cerrado)', () => {
    useEmployeeStore.setState({ jobPositionTranslations: [buildTranslation({})] });

    render(<TeletrabajoPuestosModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /añadir puesto/i }));

    const puestoInput = screen.getByLabelText('Puesto') as HTMLInputElement;
    expect(puestoInput.tagName).toBe('INPUT');
    expect(puestoInput.getAttribute('list')).toBe('teletrabajo-puestos-maestros');

    // El datalist debe ofrecer la opción de Traducción de puestos como
    // sugerencia, sin forzar un <select> cerrado.
    const datalist = document.getElementById('teletrabajo-puestos-maestros');
    expect(datalist).not.toBeNull();
    const option = within(datalist as HTMLElement).getByRole('option', { hidden: true });
    expect(option.getAttribute('value')).toBe('Técnica');
  });

  it('no muestra ningún aviso cuando todo puestoOrganizativo activo tiene su puesto teletrabajable', () => {
    useEmployeeStore.setState({
      employees: [buildEmployee({ puestoOrganizativo: 'Técnica' })],
    });
    useTeletrabajoStore.setState({
      puestosTeletrabajo: [buildPuesto({ puesto: 'Técnica' })],
    });

    render(<TeletrabajoPuestosModal onClose={() => {}} />);

    expect(screen.queryByText(/sin equivalente aquí/i)).not.toBeInTheDocument();
  });

  it('avisa cuando un puestoOrganizativo activo no tiene ningún puesto teletrabajable equivalente', () => {
    useEmployeeStore.setState({
      employees: [buildEmployee({ puestoOrganizativo: 'Técnica de Recursos' })],
    });
    useTeletrabajoStore.setState({
      puestosTeletrabajo: [buildPuesto({ puesto: 'Técnica' })],
    });

    render(<TeletrabajoPuestosModal onClose={() => {}} />);

    expect(screen.getByText(/sin equivalente aquí/i)).toBeInTheDocument();
    expect(screen.getByText('Técnica de Recursos')).toBeInTheDocument();
  });

  it('no avisa de empleados dados de baja (deletedAt) ni cuenta duplicados del mismo puesto', () => {
    useEmployeeStore.setState({
      employees: [
        buildEmployee({ empleado: '00001', puestoOrganizativo: 'Técnica de Recursos' }),
        buildEmployee({ empleado: '00002', puestoOrganizativo: 'Técnica de Recursos' }),
        buildEmployee({
          empleado: '00003',
          puestoOrganizativo: 'Puesto de baja',
          deletedAt: now,
        }),
      ],
    });
    useTeletrabajoStore.setState({ puestosTeletrabajo: [] });

    render(<TeletrabajoPuestosModal onClose={() => {}} />);

    expect(screen.getByText(/hay 1 puesto organizativo en plantilla/i)).toBeInTheDocument();
    expect(screen.queryByText('Puesto de baja')).not.toBeInTheDocument();
    expect(screen.getAllByText('Técnica de Recursos')).toHaveLength(1);
  });

  it('compara por texto normalizado: acentos/mayúsculas distintos no generan aviso', () => {
    useEmployeeStore.setState({
      employees: [buildEmployee({ puestoOrganizativo: 'técnica  ' })],
    });
    useTeletrabajoStore.setState({
      puestosTeletrabajo: [buildPuesto({ puesto: 'Técnica' })],
    });

    render(<TeletrabajoPuestosModal onClose={() => {}} />);

    expect(screen.queryByText(/sin equivalente aquí/i)).not.toBeInTheDocument();
  });

  it('marca «(sin traducción)» en un puesto teletrabajable cuya traducción está pendiente', () => {
    useEmployeeStore.setState({
      jobPositionTranslations: [buildTranslation({ puestoCastellano: 'Técnica', puestoEuskera: '' })],
    });
    useTeletrabajoStore.setState({
      puestosTeletrabajo: [buildPuesto({ puesto: 'Técnica' })],
    });

    render(<TeletrabajoPuestosModal onClose={() => {}} />);

    expect(screen.getByText('(sin traducción)')).toBeInTheDocument();
  });

  it('no marca nada cuando el puesto teletrabajable ya tiene traducción al euskera', () => {
    useEmployeeStore.setState({
      jobPositionTranslations: [buildTranslation({ puestoCastellano: 'Técnica', puestoEuskera: 'Teknikaria' })],
    });
    useTeletrabajoStore.setState({
      puestosTeletrabajo: [buildPuesto({ puesto: 'Técnica' })],
    });

    render(<TeletrabajoPuestosModal onClose={() => {}} />);

    expect(screen.queryByText('(sin traducción)')).not.toBeInTheDocument();
  });
});
