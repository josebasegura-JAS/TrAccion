import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_TELETRABAJO_FILTERS } from '../domain/filters';
import { EMPTY_TELETRABAJO_DRAFT, type TeletrabajoDraft, type TeletrabajoSolicitud } from '../domain/solicitud';
import { useTeletrabajoStore } from './useTeletrabajoStore';

const STORAGE_KEY = 'traccion.v1.teletrabajo.solicitudes';
const PUESTOS_STORAGE_KEY = 'traccion.v1.teletrabajo.puestos';
const timestamp = '2026-06-17T08:00:00.000Z';

function draft(overrides: Partial<TeletrabajoDraft> = {}): TeletrabajoDraft {
  return {
    ...EMPTY_TELETRABAJO_DRAFT,
    empleado: '  1001  ',
    nombreApellidos: '  Ana García López  ',
    puestoNomina: '  Técnica RRLL  ',
    puestoOrganizativo: '  Relaciones Laborales  ',
    residencia: '  SSCC  ',
    dni: '  00000000T  ',
    direccionTeletrabajo: '  Bilbao  ',
    estado: 'pendiente',
    tipoSolicitud: 'nueva',
    diasTeletrabajo: ['jueves', 'martes', 'jueves', 'lunes'] as unknown as TeletrabajoDraft['diasTeletrabajo'],
    fechaSolicitud: '  2026-06-17  ',
    periodo: '  2026/2027  ',
    observaciones: '  Observación inicial  ',
    ...overrides,
  };
}

function readPersistedSolicitudes(): TeletrabajoSolicitud[] {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as TeletrabajoSolicitud[];
}

describe('useTeletrabajoStore persistence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));
    window.localStorage.clear();
    useTeletrabajoStore.setState({
      solicitudes: [],
      puestosTeletrabajo: [],
      selectedSolicitudId: '',
      filters: EMPTY_TELETRABAJO_FILTERS,
    });
  });

  it('crea, normaliza, persiste y recarga una solicitud', () => {
    useTeletrabajoStore.getState().create(draft());

    const [created] = useTeletrabajoStore.getState().solicitudes;
    expect(created).toMatchObject({
      empleado: '1001',
      nombreApellidos: 'Ana García López',
      puestoNomina: 'Técnica RRLL',
      puestoOrganizativo: 'Relaciones Laborales',
      residencia: 'SSCC',
      direccionTeletrabajo: 'Bilbao',
      fechaSolicitud: '2026-06-17',
      periodo: '2026/2027',
      observaciones: 'Observación inicial',
      diasTeletrabajo: ['martes', 'jueves'],
      fechaOrdenador: '2024-09-01',
      fechaCascos: '2024-09-01',
      revisado: false,
      deletedAt: null,
    });
    expect(useTeletrabajoStore.getState().selectedSolicitudId).toBe(created.id);
    expect(readPersistedSolicitudes()[0].id).toBe(created.id);

    useTeletrabajoStore.setState({ solicitudes: [], selectedSolicitudId: '' });
    useTeletrabajoStore.getState().load();

    expect(useTeletrabajoStore.getState().solicitudes[0].id).toBe(created.id);
    expect(useTeletrabajoStore.getState().selectedSolicitudId).toBe(created.id);
  });

  it('actualiza sin cambiar createdAt, marca revisado y conserva el cambio tras recargar', () => {
    useTeletrabajoStore.getState().create(draft());
    const original = useTeletrabajoStore.getState().solicitudes[0];

    vi.setSystemTime(new Date('2026-06-18T09:30:00.000Z'));
    useTeletrabajoStore.getState().update(
      original.id,
      draft({
        estado: 'aprobada',
        tipoSolicitud: 'renovacion',
        diasTeletrabajo: ['miercoles'],
        observaciones: '  Cambio aprobado  ',
        validacionSeguridadInformatica: true,
        validacionPrevencion: true,
        validacionJefatura: true,
        revisado: true,
      }),
    );

    const updated = useTeletrabajoStore.getState().solicitudes[0];
    expect(updated).toMatchObject({
      id: original.id,
      estado: 'aprobada',
      tipoSolicitud: 'renovacion',
      diasTeletrabajo: ['miercoles'],
      observaciones: 'Cambio aprobado',
      validacionSeguridadInformatica: true,
      validacionPrevencion: true,
      validacionJefatura: true,
      revisado: true,
      createdAt: original.createdAt,
      updatedAt: '2026-06-18T09:30:00.000Z',
    });

    useTeletrabajoStore.setState({ solicitudes: [], selectedSolicitudId: '' });
    useTeletrabajoStore.getState().load();

    expect(useTeletrabajoStore.getState().solicitudes[0]).toMatchObject({
      id: original.id,
      estado: 'aprobada',
      revisado: true,
    });
  });

  it('elimina de forma lógica y selecciona la siguiente solicitud visible', () => {
    useTeletrabajoStore.getState().create(draft({ empleado: '1001', nombreApellidos: 'Ana García' }));
    useTeletrabajoStore.getState().create(draft({ empleado: '1002', nombreApellidos: 'Bea Ruiz' }));
    const [first, second] = useTeletrabajoStore.getState().solicitudes;

    vi.setSystemTime(new Date('2026-06-19T10:00:00.000Z'));
    useTeletrabajoStore.getState().remove(first.id);

    const removed = useTeletrabajoStore.getState().solicitudes.find((solicitud) => solicitud.id === first.id);
    expect(removed).toMatchObject({ deletedAt: '2026-06-19T10:00:00.000Z' });
    expect(useTeletrabajoStore.getState().selectedSolicitudId).toBe(second.id);
    expect(readPersistedSolicitudes().find((solicitud) => solicitud.id === first.id)?.deletedAt).toBe(
      '2026-06-19T10:00:00.000Z',
    );
  });

  it('importa puestos por borrador deduplicando por puesto normalizado', () => {
    const count = useTeletrabajoStore.getState().importPuestosTeletrabajoDrafts([
      { puesto: ' Técnico RRLL ', maxSolicitudes: 2, observaciones: 'Inicial' },
      { puesto: 'técnico rrll', maxSolicitudes: 3, observaciones: 'Actualizado' },
      { puesto: 'Jefatura', maxSolicitudes: 1, observaciones: '' },
    ]);

    expect(count).toBe(3);
    expect(useTeletrabajoStore.getState().puestosTeletrabajo.map((puesto) => puesto.puesto)).toEqual([
      'Jefatura',
      'técnico rrll',
    ]);
    expect(window.localStorage.getItem(PUESTOS_STORAGE_KEY)).toContain('Actualizado');
  });
});
