// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipDocx, unzipDocx } from '../../features/teletrabajo/domain/zip';
import { generateTeletrabajoWord, detectTeletrabajoWordMarkers } from '../../features/teletrabajo/domain/word';
import { generateLicenciaSinSueldoWord, generateDenegacionLicenciaSinSueldoWord } from '../../features/licencias-sin-sueldo/domain/word';
import { generateExcedenciaWord } from '../../features/licencias-sin-sueldo/domain/excedenciaWord';
import { generateVinculogramaSolicitudWord } from '../../features/vinculograma/domain/word';
import { EMPTY_EMPLOYEE_DRAFT } from '../../features/plantilla/domain/employee';
import { hydrateEmployee } from '../../features/plantilla/domain/derived';
import { EMPTY_TELETRABAJO_DRAFT, type TeletrabajoDraft } from '../../features/teletrabajo/domain/solicitud';
import { EMPTY_LICENCIA_SIN_SUELDO_DRAFT, buildLicenciaSinSueldoRecord } from '../../features/licencias-sin-sueldo/domain/licenciaSinSueldo';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const paragraph = (...runs: string[]) => '<w:p>' + runs.map(text => '<w:r><w:t>' + text + '</w:t></w:r>').join('') + '</w:p>';
const document = (body: string) => '<w:document xmlns:w="' + ns + '"><w:body>' + body + '</w:body></w:document>';
const path = 'fixture.docx';
const stamp = '2026-01-01T00:00:00.000Z';
const employee = hydrateEmployee({ ...EMPTY_EMPLOYEE_DRAFT, empleado: '100', nombreApellidos: 'García López, Ane', nif: '12345678Z', puestoNomina: 'Técnico', puestoEus: 'Teknikaria', residencia: 'Oficinas Centrales', calle: 'Calle A & B', numero: '5', piso: '2', codigoPostal: '48001', poblacion: 'Bilbao', provincia: 'Bizkaia' });
const draft: TeletrabajoDraft = { ...EMPTY_TELETRABAJO_DRAFT, empleado: '100', nombreApellidos: employee.nombreApellidos, periodo: '2026-2027', fechaOrdenador: '2026-09-01', fechaCascos: '2026-09-01', diasTeletrabajo: ['martes', 'jueves'] };
const leave = buildLicenciaSinSueldoRecord({ ...EMPTY_LICENCIA_SIN_SUELDO_DRAFT, numeroEmpleado: '100', nombreCompleto: employee.nombreApellidos, fechaSolicitud: '2026-01-01', fechaInicio: '2026-02-01', fechaFin: '2026-03-01', estado: 'pendiente_firma' }, stamp, 'a');
const reader = vi.fn();
function template(body: string, header = paragraph('Cabecera')) {
  const entries = [
    { name: 'word/document.xml', data: encoder.encode(document(body)) },
    { name: 'word/header1.xml', data: encoder.encode('<w:hdr xmlns:w="' + ns + '">' + header + '</w:hdr>') },
    { name: 'word/media/logo.bin', data: new Uint8Array([1, 2, 3, 255]) },
    { name: '[Content_Types].xml', data: encoder.encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>') },
  ];
  const bytes = zipDocx(entries).buffer as ArrayBuffer;
  reader.mockResolvedValue(bytes);
  return bytes;
}
async function unpack(blob: Blob) {
  const entries = await unzipDocx(await blob.arrayBuffer());
  return { xml: decoder.decode(entries.find(e => e.name === 'word/document.xml')!.data), header: decoder.decode(entries.find(e => e.name === 'word/header1.xml')!.data), media: entries.find(e => e.name === 'word/media/logo.bin')!.data, entries };
}
beforeEach(() => {
  reader.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 27, 12));
  vi.stubGlobal('window', { traccion: { readTeletrabajoTemplate: reader, readLicenciaSinSueldoTemplate: reader, readExcedenciaTemplate: reader, readVinculogramaTemplate: reader } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('T8A: documentos Word generados con datos ficticios', () => {
  it('rellena acuerdo de teletrabajo bilingüe, incluyendo marcadores fragmentados y cabecera', async () => {
    template(paragraph('«Nombre_', 'Completo»') + paragraph('«Días_Teletrabajo_CAST»') + paragraph('«Días_Teletrabajo_EUS»') + paragraph('«Porcentaje»') + paragraph('«Fecha_Inicio_CAST»') + paragraph('«Fecha_Fin_EUS»') + paragraph('«Dirección»'), paragraph('«DNI»'));
    const result = await generateTeletrabajoWord(draft, employee, path);
    const output = await unpack(result.blob);
    expect(result.fileName).toBe('Teletrabajo_Garcia_Lopez_Ane.docx');
    for (const value of ['García López, Ane', 'martes, jueves', 'asteartea, osteguna', '>40<', '1 de septiembre de 2026', '2027ko ekainaren 30a', 'Calle A &amp; B']) expect(output.xml).toContain(value);
    expect(output.header).toContain('12345678Z');
    expect(output.xml).not.toContain('«');
    expect(result.emptyMarkers).toEqual([]);
    expect(output.media).toEqual(new Uint8Array([1, 2, 3, 255]));
    expect(output.entries).toHaveLength(4);
  });
  it('usa traducción auxiliar y porcentaje de un día', async () => {
    template(paragraph('«Puesto_EUS»') + paragraph('«Porcentaje»'));
    const result = await generateTeletrabajoWord({ ...draft, diasTeletrabajo: ['martes'] }, { ...employee, puestoEus: '' }, path, [{ puestoCastellano: ' tecnico ', puestoEuskera: 'Itzulpena' }]);
    expect((await unpack(result.blob)).xml).toContain('Itzulpena');
    expect((await unpack(result.blob)).xml).toContain('>20<');
  });
  it('rechaza acuerdo sin datos obligatorios', async () => {
    template(paragraph('«DNI»'));
    await expect(generateTeletrabajoWord(EMPTY_TELETRABAJO_DRAFT, null, path)).rejects.toThrow(/Faltan datos obligatorios/);
  });
  it('detecta marcadores literales y de plantilla', async () => {
    const bytes = template(paragraph('«DNI»', '{{OTRO}}'));
    expect(await detectTeletrabajoWordMarkers(bytes)).toEqual(expect.arrayContaining(['«DNI»', 'OTRO']));
  });
  it('rechaza rutas no DOCX antes de leer', async () => {
    await expect(generateTeletrabajoWord(draft, employee, 'fixture.pdf')).rejects.toThrow(/DOCX/);
    expect(reader).not.toHaveBeenCalled();
  });
  it('rellena concesión de licencia con nombre corto, fechas y puestos', async () => {
    template(paragraph('«Nombre_', 'Completo»') + paragraph('«Nombre_Corto»') + paragraph('«Fecha_Inicio»') + paragraph('«Fecha_Fin»') + paragraph('«Puesto_CAST»') + paragraph('«Puesto_EUS»'));
    const result = await generateLicenciaSinSueldoWord(leave, employee, path);
    const output = await unpack(result.blob);
    expect(result.fileName).toBe('Licencia_sin_sueldo_Garcia_Lopez_Ane_20260201.docx');
    for (const value of ['García López, Ane', '>Ane<', '01/02/2026', '01/03/2026', 'Técnico', 'Teknikaria']) expect(output.xml).toContain(value);
    expect(result.emptyMarkers).toEqual([]);
  });
  it('genera denegación con nombre de archivo diferenciado', async () => {
    template(paragraph('«Nombre_Completo»'));
    const result = await generateDenegacionLicenciaSinSueldoWord({ ...leave, estado: 'denegada' }, employee, path);
    expect(result.fileName).toContain('Denegacion_licencia_sin_sueldo_');
    expect((await unpack(result.blob)).xml).toContain(employee.nombreApellidos);
  });
  it('no genera concesión o denegación en fase incorrecta', async () => {
    await expect(generateLicenciaSinSueldoWord({ ...leave, estado: 'denegada' }, employee, path)).rejects.toThrow(/pendiente de firma/);
    await expect(generateDenegacionLicenciaSinSueldoWord(leave, employee, path)).rejects.toThrow(/denegada/);
    expect(reader).not.toHaveBeenCalled();
  });
  it('rechaza licencia sin puesto de plantilla', async () => {
    template(paragraph('«Puesto_CAST»'));
    await expect(generateLicenciaSinSueldoWord(leave, null, path)).rejects.toThrow(/Puesto CAST/);
  });
  it('rellena los doce marcadores obligatorios de excedencia y conserva medios', async () => {
    template(paragraph('{{NOMBRE_', 'COMPLETO}}') + ['DIRECCION', 'CODIGO_POSTAL', 'POBLACION', 'PROVINCIA', 'FECHA_CARTA_EU', 'FECHA_CARTA_ES', 'NOMBRE', 'FECHA_INICIO_EU', 'FECHA_FIN_EU', 'FECHA_INICIO_ES', 'FECHA_FIN_ES'].map(key => paragraph('{{' + key + '}}')).join(''));
    const result = await generateExcedenciaWord({ ...leave, tipo: 'Excedencia' }, employee, path);
    const output = await unpack(result.blob);
    expect(result.replacedFields).toHaveLength(12);
    expect(output.xml).not.toContain('{{');
    for (const value of ['Calle A &amp; B 5 2', '48001', '1 de febrero de 2026', '2026ko otsailaren 1tik', '27 de noviembre de 2026']) expect(output.xml).toContain(value);
    expect(output.media).toEqual(new Uint8Array([1, 2, 3, 255]));
  });
  it('rechaza excedencia cuya plantilla omite marcadores requeridos', async () => {
    template(paragraph('{{NOMBRE_COMPLETO}}'));
    await expect(generateExcedenciaWord({ ...leave, tipo: 'Excedencia' }, employee, path)).rejects.toThrow(/marcadores obligatorios/);
  });
  it('rechaza excedencia sin domicilio completo antes de leer plantilla', async () => {
    await expect(generateExcedenciaWord({ ...leave, tipo: 'Excedencia' }, { ...employee, calle: '' }, path)).rejects.toThrow(/Calle/);
    expect(reader).not.toHaveBeenCalled();
  });
  it('genera solicitud de vinculograma con DNI, fecha y nombre de archivo seguro', async () => {
    template(paragraph('«Nombre_', 'Completo»') + paragraph('«DNI»') + paragraph('«D/M/A»'));
    const result = await generateVinculogramaSolicitudWord(employee, path);
    const output = await unpack(result.blob);
    expect(result.fileName).toBe('Solicitud_Vinculograma_Garcia_Lopez_Ane.docx');
    for (const value of [employee.nombreApellidos, '12345678Z', '27/11/2026']) expect(output.xml).toContain(value);
    expect(result.detectedMarkers).toHaveLength(3);
  });
  it('rechaza vinculograma sin DNI', async () => {
    template(paragraph('«DNI»'));
    await expect(generateVinculogramaSolicitudWord({ ...employee, dni: '', nif: '' }, path)).rejects.toThrow(/DNI/);
  });
  it('informa de plantilla inaccesible sin generar documento', async () => {
    reader.mockRejectedValue(new Error('ENOENT'));
    await expect(generateVinculogramaSolicitudWord(employee, path)).rejects.toThrow(/no se encuentra disponible/);
  });
});
