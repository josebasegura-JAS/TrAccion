import { describe, expect, it } from 'vitest';
import {
  EMPTY_TELETRABAJO_FILTERS,
  filterTeletrabajoSolicitudes,
  type TeletrabajoFilters,
} from './filters';
import { sortTeletrabajoByDefault } from './sort';
import { normalizeDiasTeletrabajo, type TeletrabajoSolicitud } from './solicitud';

function buildSolicitud(overrides: Partial<TeletrabajoSolicitud>): TeletrabajoSolicitud {
  return {
    id: 'teletrabajo-base',
    empleado: '100',
    nombreApellidos: 'Persona Base',
    puestoNomina: 'Técnico/a',
    puestoOrganizativo: 'Organización',
    residencia: 'Oficinas Centrales',
    dni: '12345678Z',
    direccionTeletrabajo: 'Calle Base 1 Bilbao Bizkaia',
    estado: 'pendiente',
    tipoSolicitud: 'nueva',
    diasTeletrabajo: ['martes'],
    fechaSolicitud: '2026-01-01',
    periodo: '2026-2027',
    observaciones: '',
    validacionSeguridadInformatica: false,
    validacionPrevencion: false,
    validacionJefatura: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('teletrabajo domain', () => {
  it('busca únicamente por empleado y nombreApellidos', () => {
    const source = [
      buildSolicitud({ id: 'empleado', empleado: '12345', residencia: 'No coincide' }),
      buildSolicitud({ id: 'nombre', empleado: '99999', nombreApellidos: 'María Solicitud' }),
      buildSolicitud({
        id: 'otro-campo',
        empleado: '88888',
        nombreApellidos: 'Otra persona',
        residencia: 'Solicitud',
      }),
    ];

    expect(
      filterTeletrabajoSolicitudes(source, {
        ...EMPTY_TELETRABAJO_FILTERS,
        search: 'solicitud',
      }).map((solicitud) => solicitud.id),
    ).toEqual(['nombre']);

    expect(
      filterTeletrabajoSolicitudes(source, {
        ...EMPTY_TELETRABAJO_FILTERS,
        search: '12345',
      }).map((solicitud) => solicitud.id),
    ).toEqual(['empleado']);
  });

  it('filtra por estado, tipoSolicitud y periodo', () => {
    const source = [
      buildSolicitud({
        id: 'match',
        estado: 'aprobada',
        tipoSolicitud: 'renovacion',
        periodo: '2026-2027',
      }),
      buildSolicitud({
        id: 'estado',
        estado: 'pendiente',
        tipoSolicitud: 'renovacion',
        periodo: '2026-2027',
      }),
      buildSolicitud({
        id: 'tipo',
        estado: 'aprobada',
        tipoSolicitud: 'nueva',
        periodo: '2026-2027',
      }),
      buildSolicitud({
        id: 'periodo',
        estado: 'aprobada',
        tipoSolicitud: 'renovacion',
        periodo: '2025-2026',
      }),
    ];
    const filters: TeletrabajoFilters = {
      ...EMPTY_TELETRABAJO_FILTERS,
      estado: 'aprobada',
      tipoSolicitud: 'renovacion',
      periodo: '2026-2027',
    };

    expect(filterTeletrabajoSolicitudes(source, filters).map((solicitud) => solicitud.id)).toEqual([
      'match',
    ]);
  });

  it('ordena inicialmente por periodo descendente y empleado ascendente', () => {
    const source = [
      buildSolicitud({ id: '2025-200', empleado: '200', periodo: '2025-2026' }),
      buildSolicitud({ id: '2026-300', empleado: '300', periodo: '2026-2027' }),
      buildSolicitud({ id: '2026-100', empleado: '100', periodo: '2026-2027' }),
      buildSolicitud({ id: '2027-050', empleado: '050', periodo: '2027-2028' }),
    ];

    expect(sortTeletrabajoByDefault(source).map((solicitud) => solicitud.id)).toEqual([
      '2027-050',
      '2026-100',
      '2026-300',
      '2025-200',
    ]);
  });

  it('excluye solicitudes borradas lógicamente', () => {
    const source = [
      buildSolicitud({ id: 'visible' }),
      buildSolicitud({ id: 'borrada', deletedAt: '2026-02-01T00:00:00.000Z' }),
    ];

    expect(
      filterTeletrabajoSolicitudes(source, EMPTY_TELETRABAJO_FILTERS).map(
        (solicitud) => solicitud.id,
      ),
    ).toEqual(['visible']);
  });

  it('normaliza días seleccionados a martes, miercoles y jueves sin duplicados', () => {
    expect(normalizeDiasTeletrabajo(['jueves', 'lunes', 'martes', 'jueves', 'miercoles'])).toEqual([
      'martes',
      'miercoles',
      'jueves',
    ]);
  });
});
