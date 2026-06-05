import { describe, expect, it } from 'vitest';
import type { Employee } from '../../plantilla/domain/employee';
import {
  EMPTY_TELETRABAJO_FILTERS,
  filterTeletrabajoSolicitudes,
  type TeletrabajoFilters,
} from './filters';
import { importEncuestaRows } from './importEncuesta';
import { sortTeletrabajoByDefault } from './sort';
import { normalizeDiasTeletrabajo, type TeletrabajoSolicitud } from './solicitud';
import { detectTeletrabajoWordMarkers } from './word';
import { unzipDocx, zipDocx, type ZipEntry } from './zip';

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

function buildEmployee(overrides: Partial<Employee>): Employee {
  return {
    empleado: '100',
    nombreApellidos: 'Persona Plantilla',
    puestoNomina: 'Puesto Nómina Plantilla',
    puestoOrganizativo: 'Puesto Organizativo Plantilla',
    residencia: 'Bilbao',
    nivelRetributivo: 'N1',
    sexo: 'M',
    calle: 'Calle Plantilla',
    numero: '1',
    piso: '2',
    codigoPostal: '48001',
    poblacion: 'Bilbao',
    provincia: 'Bizkaia',
    nif: '12345678Z',
    dni: '12345678Z',
    residenciaCast: 'Bilbao',
    residenciaEus: 'Bilbo',
    direccionTeletrabajo: 'Calle Plantilla 1, 2, 48001 Bilbao Bizkaia',
    deletedAt: null,
    ...overrides,
  };
}

describe('importador de encuesta de teletrabajo', () => {
  it('importa con Nº empleado', () => {
    const result = importEncuestaRows(
      [
        ['Nº empleado', 'nombre completo', 'periodo'],
        ['200', 'Persona Encuesta', '2026-2027'],
      ],
      [],
      [],
    );

    expect(result.summary).toEqual({ imported: 1, updated: 0, ignored: 0 });
    expect(result.solicitudes[0]).toMatchObject({
      empleado: '200',
      nombreApellidos: 'Persona Encuesta',
      periodo: '2026-2027',
    });
  });

  it('ignora columnas desconocidas', () => {
    const result = importEncuestaRows(
      [
        ['empleado', 'columna inventada', 'observaciones'],
        ['201', 'No debe importarse', 'Texto libre'],
      ],
      [],
      [],
    );

    expect(result.solicitudes[0]).toMatchObject({
      empleado: '201',
      observaciones: 'Texto libre',
    });
  });

  it('descarta fila sin empleado', () => {
    const result = importEncuestaRows(
      [
        ['empleado', 'nombre completo'],
        ['', 'Sin empleado'],
        ['202', 'Con empleado'],
      ],
      [],
      [],
    );

    expect(result.summary).toEqual({ imported: 1, updated: 0, ignored: 1 });
    expect(result.solicitudes).toHaveLength(1);
  });

  it('enriquece desde Plantilla cuando existe empleado', () => {
    const employee = buildEmployee({ empleado: '203' });
    const result = importEncuestaRows(
      [
        ['empleado', 'nombre completo'],
        ['203', 'Nombre Encuesta'],
      ],
      [employee],
      [],
    );

    expect(result.solicitudes[0]).toMatchObject({
      empleado: '203',
      nombreApellidos: 'Persona Plantilla',
      puestoNomina: 'Puesto Nómina Plantilla',
      puestoOrganizativo: 'Puesto Organizativo Plantilla',
      residencia: 'Bilbao',
      dni: '12345678Z',
      direccionTeletrabajo: 'Calle Plantilla 1, 2, 48001 Bilbao Bizkaia',
    });
  });

  it('importa aunque empleado no exista en Plantilla', () => {
    const result = importEncuestaRows(
      [
        ['empleado', 'nombre completo'],
        ['204', 'Persona Externa'],
      ],
      [],
      [],
    );

    expect(result.solicitudes[0]).toMatchObject({
      empleado: '204',
      nombreApellidos: 'Persona Externa',
      puestoNomina: '',
      puestoOrganizativo: '',
      residencia: '',
      dni: '',
      direccionTeletrabajo: '',
    });
  });

  it('normaliza días martes/miércoles/jueves', () => {
    const result = importEncuestaRows(
      [
        ['empleado', 'días teletrabajo'],
        ['205', 'Martes y Miércoles'],
        ['206', 'jueves'],
      ],
      [],
      [],
    );

    expect(result.solicitudes.map((solicitud) => solicitud.diasTeletrabajo)).toEqual([
      ['martes', 'miercoles'],
      ['jueves'],
    ]);
  });

  it('ignora lunes/viernes', () => {
    const result = importEncuestaRows(
      [
        ['empleado', 'días'],
        ['207', 'lunes y viernes'],
      ],
      [],
      [],
    );

    expect(result.solicitudes[0].diasTeletrabajo).toEqual([]);
  });

  it('actualiza por empleado + periodo sin duplicar', () => {
    const current = buildSolicitud({
      id: 'existente',
      empleado: '208',
      periodo: '2026-2027',
      observaciones: 'Anterior',
      deletedAt: '2026-02-01T00:00:00.000Z',
    });
    const result = importEncuestaRows(
      [
        ['empleado', 'periodo', 'observaciones'],
        ['208', '2026-2027', 'Nueva observación'],
      ],
      [],
      [current],
      { now: new Date('2026-06-05T00:00:00.000Z') },
    );

    expect(result.summary).toEqual({ imported: 0, updated: 1, ignored: 0 });
    expect(result.solicitudes).toHaveLength(1);
    expect(result.solicitudes[0]).toMatchObject({
      id: 'existente',
      observaciones: 'Nueva observación',
      deletedAt: '2026-02-01T00:00:00.000Z',
    });
  });

  it('normaliza tipoSolicitud renovacion/nueva', () => {
    const result = importEncuestaRows(
      [
        ['empleado', 'tipo solicitud'],
        ['209', 'Renovación'],
        ['210', 'Nueva solicitud'],
        ['211', ''],
      ],
      [],
      [],
    );

    expect(result.solicitudes.map((solicitud) => solicitud.tipoSolicitud)).toEqual([
      'renovacion',
      'nueva',
      'nueva',
    ]);
  });
});

describe('generación Word de teletrabajo', () => {
  it('detecta marcadores Word y conserva el DOCX como ZIP válido', async () => {
    const entries: ZipEntry[] = [
      {
        name: 'word/document.xml',
        data: new TextEncoder().encode(
          '<w:document><w:body><w:bookmarkStart w:id="1" w:name="nombreApellidos"/><w:bookmarkEnd w:id="1"/><w:t>{{martes}}</w:t></w:body></w:document>',
        ),
      },
    ];
    const docx = zipDocx(entries);

    await expect(detectTeletrabajoWordMarkers(docx.buffer)).resolves.toEqual([
      'martes',
      'nombreApellidos',
    ]);
    await expect(unzipDocx(docx.buffer)).resolves.toHaveLength(1);
  });
});
