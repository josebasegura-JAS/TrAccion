import { describe, expect, it } from 'vitest';

import type { Employee } from '../../plantilla/domain/employee';
import {
  EMPTY_TELETRABAJO_FILTERS,
  filterTeletrabajoSolicitudes,
  type TeletrabajoFilters,
} from './filters';
import { evaluateTeletrabajoAntiguedad } from './antiguedad';
import { importEncuestaRows } from './importEncuesta';
import { sortTeletrabajoByDefault } from './sort';
import { normalizeDiasTeletrabajo, type TeletrabajoSolicitud } from './solicitud';
import { detectTeletrabajoWordMarkers, generateTeletrabajoWord } from './word';
import { unzipDocx, zipDocx, type ZipEntry } from './zip';

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('No se ha podido leer el Blob.'));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }

      reject(new Error('El Blob leído no ha devuelto ArrayBuffer.'));
    };
    reader.readAsArrayBuffer(blob);
  });
}

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
    fechaOrdenador: '2026-01-02',
    fechaCascos: '2026-01-03',
    periodo: '2026-2027',
    observaciones: '',
    validacionSeguridadInformatica: false,
    validacionPrevencion: false,
    validacionJefatura: false,
    revisado: false,
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
    puestoEus: 'Puesto Euskera Plantilla',
    residencia: 'Bilbao',
    unidad: '',
    nivelRetributivo: 'N1',
    direccionOrganizativa: 'Dirección Plantilla',
    antiguedadPuesto: '2024-01-01',
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



describe('antigüedad mínima para teletrabajo', () => {
  it('marca como no cumple cuando la solicitud se realiza antes de cumplir un año en el puesto', () => {
    const solicitud = buildSolicitud({ fechaSolicitud: '2026-09-10' });
    const employee = buildEmployee({ antiguedadPuesto: '2025-09-11' });

    expect(evaluateTeletrabajoAntiguedad(solicitud, employee)).toMatchObject({
      status: 'no-cumple',
      antiguedadPuesto: '2025-09-11',
      fechaReferencia: '2026-09-10',
    });
  });

  it('marca como cumple desde el día exacto en que alcanza un año en el puesto', () => {
    const solicitud = buildSolicitud({ fechaSolicitud: '2026-09-11' });
    const employee = buildEmployee({ antiguedadPuesto: '2025-09-11' });

    expect(evaluateTeletrabajoAntiguedad(solicitud, employee)).toMatchObject({
      status: 'cumple',
      antiguedadPuesto: '2025-09-11',
      fechaReferencia: '2026-09-11',
    });
  });

  it('devuelve sin dato cuando falta empleado, antigüedad o fecha de solicitud válida', () => {
    expect(evaluateTeletrabajoAntiguedad(buildSolicitud({}), null).status).toBe('sin-dato');
    expect(
      evaluateTeletrabajoAntiguedad(
        buildSolicitud({ fechaSolicitud: '2026-09-11' }),
        buildEmployee({ antiguedadPuesto: '' }),
      ).status,
    ).toBe('sin-dato');
    expect(
      evaluateTeletrabajoAntiguedad(
        buildSolicitud({ fechaSolicitud: '' }),
        buildEmployee({ antiguedadPuesto: '2025-09-11' }),
      ).status,
    ).toBe('sin-dato');
  });
});

describe('importador de encuesta de teletrabajo', () => {
  it('detecta cabecera desplazada y solo importa respuestas Sí del formato real', () => {
    const result = importEncuestaRows(
      [
        ['Encuesta Teletrabajo 2026-2027'],
        ['Texto informativo previo'],
        [
          'Aux',
          'Nº. Emp.',
          'Apellidos y Nombre',
          'Respuesta',
          'Fecha ordenador',
          'Fecha cascos',
          'Aportaciones',
          'Otra columna',
        ],
        ['1', '200', 'Persona Sí', 'Sí', '2026-09-10', '2026-09-11', 'martes y jueves', 'ignorada'],
        ['2', '201', 'Persona No', 'No', '', '', 'jueves', 'ignorada'],
      ],
      [],
      [],
    );

    expect(result.summary).toEqual({ imported: 1, updated: 0, reactivated: 0, ignored: 1 });
    expect(result.solicitudes[0]).toMatchObject({
      empleado: '200',
      nombreApellidos: 'Persona Sí',
      periodo: '2026-2027',
      diasTeletrabajo: ['martes', 'jueves'],
      fechaOrdenador: '2026-09-10',
      fechaCascos: '2026-09-11',
      observaciones: 'martes y jueves',
      estado: 'pendiente',
      tipoSolicitud: 'renovacion',
      validacionSeguridadInformatica: false,
      validacionPrevencion: false,
      validacionJefatura: false,
      revisado: false,
    });
  });

  it('importa el formato de Microsoft Forms con pregunta y aportaciones largas', () => {
    const result = importEncuestaRows(
      [
        ['', '', '', 'Solicitud Teletrabajo 2026-2027'],
        ['', '', '', 'Pregunta', 'Aportaciones'],
        [
          'Nº. Emp.',
          'Apellidos y Nombre',
          'Respuesta/Puntuación',
          'Selecciona si vas a Teletrabajar',
          'Si has respondido anteriormente que sí, por favor, escribe brevemente qué tipo de teletrabajo solicitas:\n\nTiempo: Si te quieres acoger al Teletrabajo por el periodo completo, sólo unos meses (cuáles), semanas etc.\n\nDías: martes y jueves, sólo martes, sólo jueves o sólo miércoles.\n\nGracias por tu colaboración.',
        ],
        ['1188', 'Persona No', 'Respuesta', 'No', ''],
        ['', '', 'Punt.', '100', '', '50'],
        [
          '678',
          'Persona Si',
          'Respuesta',
          'Sí',
          'Teletrabajo por periodo completo, martes y jueves.',
        ],
        ['', '', 'Punt.', '100', '', '100'],
      ],
      [],
      [],
    );

    expect(result.summary).toEqual({ imported: 1, updated: 0, reactivated: 0, ignored: 3 });
    expect(result.solicitudes[0]).toMatchObject({
      empleado: '678',
      nombreApellidos: 'Persona Si',
      periodo: '2026-2027',
      diasTeletrabajo: ['martes', 'jueves'],
      observaciones: 'Teletrabajo por periodo completo, martes y jueves.',
    });
  });

  it('ignora filas auxiliares Punt.', () => {
    const result = importEncuestaRows(
      [
        ['Nº. Emp.', 'Apellidos y Nombre', 'Respuesta', 'Aportaciones'],
        ['Punt.', '', '', ''],
        ['202', 'Persona Encuesta', 'Sí', 'jueves'],
      ],
      [],
      [],
    );

    expect(result.summary).toEqual({ imported: 1, updated: 0, reactivated: 0, ignored: 1 });
    expect(result.solicitudes.map((solicitud) => solicitud.empleado)).toEqual(['202']);
  });

  it('detecta martes, miércoles y jueves en castellano desde Aportaciones', () => {
    const result = importEncuestaRows(
      [
        ['Nº. Emp.', 'Apellidos y Nombre', 'Respuesta', 'Aportaciones'],
        ['203', 'Persona Martes Jueves', 'Sí', 'martes y jueves'],
        ['204', 'Persona Tres Días', 'Sí', 'martes, miércoles y jueves'],
      ],
      [],
      [],
    );

    expect(result.solicitudes.map((solicitud) => solicitud.diasTeletrabajo)).toEqual([
      ['martes', 'jueves'],
      ['martes', 'miercoles', 'jueves'],
    ]);
  });

  it('detecta astearte eta ostegunetan en euskera desde Aportaciones', () => {
    const result = importEncuestaRows(
      [
        ['Nº. Emp.', 'Apellidos y Nombre', 'Respuesta', 'Aportaciones'],
        ['205', 'Persona Euskera', 'Sí', 'astearte eta ostegunetan'],
        ['206', 'Persona Euskera Artículo', 'Sí', 'asteartea eta osteguna'],
      ],
      [],
      [],
    );

    expect(result.solicitudes.map((solicitud) => solicitud.diasTeletrabajo)).toEqual([
      ['martes', 'jueves'],
      ['martes', 'jueves'],
    ]);
  });

  it('mantiene completa la observación ambigua aunque detecte días', () => {
    const observacion = 'martes y jueves, aunque me vale uno; si no es posible jueves me adapto';
    const result = importEncuestaRows(
      [
        ['Nº. Emp.', 'Apellidos y Nombre', 'Respuesta', 'Aportaciones'],
        ['207', 'Persona Ambigua', 'Sí', observacion],
      ],
      [],
      [],
    );

    expect(result.solicitudes[0]).toMatchObject({
      diasTeletrabajo: ['martes', 'jueves'],
      observaciones: observacion,
    });
  });

  it('enriquece desde Plantilla cuando existe empleado', () => {
    const employee = buildEmployee({ empleado: '208' });
    const result = importEncuestaRows(
      [
        ['Nº. Emp.', 'Apellidos y Nombre', 'Respuesta', 'Aportaciones'],
        ['208', 'Nombre Encuesta', 'Sí', 'martes'],
      ],
      [employee],
      [],
    );

    expect(result.solicitudes[0]).toMatchObject({
      empleado: '208',
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
        ['Nº. Emp.', 'Apellidos y Nombre', 'Respuesta', 'Aportaciones'],
        ['209', 'Persona Externa', 'Sí', 'jueves'],
      ],
      [],
      [],
    );

    expect(result.solicitudes[0]).toMatchObject({
      empleado: '209',
      nombreApellidos: 'Persona Externa',
      puestoNomina: '',
      puestoOrganizativo: '',
      residencia: '',
      dni: '',
      direccionTeletrabajo: '',
    });
  });

  it('actualiza por empleado + periodo sin duplicar', () => {
    const current = buildSolicitud({
      id: 'existente',
      empleado: '210',
      periodo: '2026-2027',
      observaciones: 'Anterior',
      deletedAt: '2026-02-01T00:00:00.000Z',
    });
    const result = importEncuestaRows(
      [
        ['Renovación Teletrabajo 2026-2027'],
        ['Nº. Emp.', 'Apellidos y Nombre', 'Respuesta', 'Aportaciones'],
        ['210', 'Persona Actualizada', 'Sí', 'Nueva observación martes'],
      ],
      [],
      [current],
      { now: new Date('2026-06-05T00:00:00.000Z') },
    );

    expect(result.summary).toEqual({ imported: 0, updated: 0, reactivated: 1, ignored: 0 });
    expect(result.solicitudes).toHaveLength(1);
    expect(result.solicitudes[0]).toMatchObject({
      id: 'existente',
      observaciones: 'Nueva observación martes',
      diasTeletrabajo: ['martes'],
      deletedAt: null,
    });
  });

  it('usa 2026-2027 como fallback cuando no detecta periodo', () => {
    const result = importEncuestaRows(
      [
        ['Nº. Emp.', 'Apellidos y Nombre', 'Respuesta', 'Aportaciones'],
        ['211', 'Persona Sin Periodo', 'Sí', 'preferiblemente martes'],
      ],
      [],
      [],
      { now: new Date('2030-01-01T00:00:00.000Z') },
    );

    expect(result.solicitudes[0].periodo).toBe('2026-2027');
    expect(result.solicitudes[0].tipoSolicitud).toBe('renovacion');
  });
});

describe('generación Word de teletrabajo', () => {
  it('sustituye los marcadores originales y los partidos entre nodos con los datos del acuerdo', async () => {
    const documentXml = [
      '<w:document><w:body>',
      '<w:t>«Nombre_Completo»</w:t>',
      '<w:t>«Puesto_EUS»</w:t>',
      '<w:t>«Puesto_CAST»</w:t>',
      '<w:t>«Porcentaje»</w:t>',
      '<w:t>«Fecha_Ordenador»</w:t>',
      '<w:t>«Fecha_Cascos»</w:t>',
      '<w:t>«D/M/A» D/M/A</w:t>',
      '<w:t>«U/H/E» U/H/E</w:t>',
      '<w:t>«fecha»</w:t>',
      '<w:t>«M_1º</w:t><w:t>data»</w:t>',
      '<w:t>M_2º</w:t><w:t>data</w:t>',
      '</w:body></w:document>',
    ].join('');
    const template = zipDocx([
      {
        name: 'word/document.xml',
        data: new TextEncoder().encode(documentXml),
      },
    ]);
    const previousTraccion = window.traccion;
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        readTeletrabajoTemplate: async () => template.buffer,
      },
    });

    try {
      const result = await generateTeletrabajoWord(
        buildSolicitud({
          nombreApellidos: 'Persona Plantilla',
          estado: 'aprobada',
          diasTeletrabajo: ['martes', 'jueves'],
          fechaOrdenador: '2026-09-10',
          fechaCascos: '2026-09-11',
          periodo: '2026-2027',
        }),
        buildEmployee({ puestoEus: 'Analista EUS' }),
        '/tmp/plantilla.docx',
        [{ puestoCastellano: 'Puesto Nómina Plantilla', puestoEuskera: 'No debe usarse' }],
      );
      const entries = await unzipDocx(await readBlobAsArrayBuffer(result.blob));
      const updatedDocument = new TextDecoder().decode(entries[0].data);
      const today = new Date();
      const numericCast = `${String(today.getDate()).padStart(2, '0')}/${String(
        today.getMonth() + 1,
      ).padStart(2, '0')}/${today.getFullYear()}`;
      const numericEus = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(
        2,
        '0',
      )}/${String(today.getDate()).padStart(2, '0')}`;

      expect(updatedDocument).toContain('Persona Plantilla');
      expect(updatedDocument).toContain('Analista EUS');
      expect(updatedDocument).toContain('Puesto Nómina Plantilla');
      expect(updatedDocument).toContain('40');
      expect(updatedDocument).toContain('10 de septiembre de 2026');
      expect(updatedDocument).toContain('11 de septiembre de 2026');
      expect(updatedDocument).toContain(`${numericCast} ${numericCast}`);
      expect(updatedDocument).toContain(`${numericEus} ${numericEus}`);
      expect(updatedDocument).toContain('1 de septiembre de 2026 y el 30 de junio de 2027');
      expect(updatedDocument).toContain('2026ko irailaren 1a');
      expect(updatedDocument).toContain('2027ko ekainaren 30a');
      expect(updatedDocument).not.toMatch(/«[^»]+»|\b(?:D\/M\/A|U\/H\/E|M_[12]ºdata)\b/);
    } finally {
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: previousTraccion,
      });
    }
  });

  it('detecta marcadores originales de la plantilla Word y conserva el DOCX como ZIP válido', async () => {
    const entries: ZipEntry[] = [
      {
        name: 'word/document.xml',
        data: new TextEncoder().encode(
          '<w:document><w:body><w:t>«Nombre_Completo»</w:t><w:t>«Días_Teletrabajo_CAST»</w:t></w:body></w:document>',
        ),
      },
    ];
    const docx = zipDocx(entries);

    await expect(detectTeletrabajoWordMarkers(docx.buffer)).resolves.toEqual([
      '«Días_Teletrabajo_CAST»',
      '«Nombre_Completo»',
    ]);
    await expect(unzipDocx(docx.buffer)).resolves.toHaveLength(1);
  });
});
