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
      gruposCobertura: [],
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
      {
        draft: { puesto: ' Técnico RRLL ', maxSolicitudes: 2, dotacionComputable: 0, grupoCoberturaId: null, observaciones: 'Inicial' },
        grupoCoberturaNombre: '',
      },
      {
        draft: { puesto: 'técnico rrll', maxSolicitudes: 3, dotacionComputable: 0, grupoCoberturaId: null, observaciones: 'Actualizado' },
        grupoCoberturaNombre: '',
      },
      {
        draft: { puesto: 'Jefatura', maxSolicitudes: 1, dotacionComputable: 0, grupoCoberturaId: null, observaciones: '' },
        grupoCoberturaNombre: '',
      },
    ]);

    expect(count).toBe(3);
    expect(useTeletrabajoStore.getState().puestosTeletrabajo.map((puesto) => puesto.puesto)).toEqual([
      'Jefatura',
      'técnico rrll',
    ]);
    expect(window.localStorage.getItem(PUESTOS_STORAGE_KEY)).toContain('Actualizado');
  });

  describe('concurrencia en Puestos y Grupos de cobertura (creación/edición individual)', () => {
    afterEach(() => {
      delete (window as { traccion?: unknown }).traccion;
    });

    it('createPuestoTeletrabajo devuelve ok y guarda solo el registro creado, no toda la lista', async () => {
      const saveCalls: Array<{ id: string }> = [];
      (window as { traccion?: unknown }).traccion = {
        saveTeletrabajoPuestoRecordIfUnchanged: vi.fn(async (record: { id: string }) => {
          saveCalls.push(record);
          return { ok: true, currentUpdatedAt: timestamp };
        }),
      };

      const result = await useTeletrabajoStore.getState().createPuestoTeletrabajo({
        puesto: 'Recepcionista',
        maxSolicitudes: 1,
        dotacionComputable: 1,
        grupoCoberturaId: null,
        observaciones: '',
      });

      expect(result.ok).toBe(true);
      // Solo debe haberse llamado al guardado SQLite UNA vez (el puesto creado), no una vez por puesto existente.
      expect(saveCalls).toHaveLength(1);
      expect(saveCalls[0].id).toBe(useTeletrabajoStore.getState().puestosTeletrabajo[0].id);
    });

    it('updatePuestoTeletrabajo refleja el conflicto cuando otra persona modificó el mismo puesto', async () => {
      (window as { traccion?: unknown }).traccion = {
        saveTeletrabajoPuestoRecordIfUnchanged: vi.fn(async () => ({ ok: true, currentUpdatedAt: timestamp })),
      };
      const createResult = await useTeletrabajoStore.getState().createPuestoTeletrabajo({
        puesto: 'Recepcionista',
        maxSolicitudes: 1,
        dotacionComputable: 1,
        grupoCoberturaId: null,
        observaciones: '',
      });
      const puestoId = createResult.recordId as string;

      // Simula que, entre medias, otra persona ya modificó este mismo puesto en la base compartida.
      (window as { traccion?: unknown }).traccion = {
        saveTeletrabajoPuestoRecordIfUnchanged: vi.fn(async () => ({
          ok: false,
          message: 'Este puesto ha sido modificado por otra persona. Recarga antes de continuar.',
        })),
      };

      const updateResult = await useTeletrabajoStore.getState().updatePuestoTeletrabajo(puestoId, {
        puesto: 'Recepcionista',
        maxSolicitudes: 2,
        dotacionComputable: 1,
        grupoCoberturaId: null,
        observaciones: '',
      });

      expect(updateResult.ok).toBe(false);
      expect(updateResult.message).toContain('modificado por otra persona');
    });

    it('createGrupoCobertura y updateGrupoCobertura guardan solo el registro tocado y reflejan conflictos', async () => {
      const saveCalls: Array<{ id: string }> = [];
      (window as { traccion?: unknown }).traccion = {
        saveTeletrabajoGrupoCoberturaRecordIfUnchanged: vi.fn(async (record: { id: string }) => {
          saveCalls.push(record);
          return { ok: true, currentUpdatedAt: timestamp };
        }),
      };

      const createResult = await useTeletrabajoStore.getState().createGrupoCobertura({
        nombre: 'Recepción',
        presencialidadMinima: 2,
      });

      expect(createResult.ok).toBe(true);
      expect(saveCalls).toHaveLength(1);

      (window as { traccion?: unknown }).traccion = {
        saveTeletrabajoGrupoCoberturaRecordIfUnchanged: vi.fn(async () => ({
          ok: false,
          message: 'Este grupo de cobertura ha sido modificado por otra persona. Recarga antes de continuar.',
        })),
      };

      const updateResult = await useTeletrabajoStore
        .getState()
        .updateGrupoCobertura(createResult.recordId as string, {
          nombre: 'Recepción',
          presencialidadMinima: 3,
        });

      expect(updateResult.ok).toBe(false);
      expect(updateResult.message).toContain('modificado por otra persona');
    });
  });
});
