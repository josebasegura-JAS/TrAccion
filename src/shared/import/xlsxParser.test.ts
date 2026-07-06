import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { zipDocx } from '../../features/teletrabajo/domain/zip';
import { parseXlsxRows } from './xlsxParser';

const textEncoder = new TextEncoder();

function xmlEntry(name: string, xml: string) {
  return { name, data: textEncoder.encode(xml) };
}

function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }

  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

/**
 * Construye a mano un .xlsx mínimo con dos hojas cuyo orden de ficheros internos
 * (sheet1.xml / sheet2.xml) está deliberadamente invertido respecto al orden de las
 * pestañas. Esto reproduce el escenario real que rompía a los importadores antiguos:
 * un libro guardado tras reordenar o borrar pestañas, donde Excel no siempre renumera
 * los ficheros internos empezando en 1.
 */
function buildWorkbookWithSwappedInternalSheetOrder(): ArrayBuffer {
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Primera pestaña" sheetId="1" r:id="rId1"/>
    <sheet name="Segunda pestaña" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

  // rId1 (primera pestaña) apunta a sheet2.xml y rId2 (segunda pestaña) a sheet1.xml:
  // el fichero "sheet1.xml" NO es la primera pestaña en este libro.
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>NO debería leerse</t></is></c></row>
  </sheetData>
</worksheet>`;

  const sheet2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="inlineStr"><is><t>Empleado</t></is></c>
      <c r="B1" t="inlineStr"><is><t>Nombre</t></is></c>
    </row>
    <row r="2">
      <c r="A2" t="inlineStr"><is><t>12345</t></is></c>
      <c r="B2" t="inlineStr"><is><t>Persona de la primera pestaña</t></is></c>
    </row>
  </sheetData>
</worksheet>`;

  return toArrayBuffer(zipDocx([
    xmlEntry('xl/workbook.xml', workbookXml),
    xmlEntry('xl/_rels/workbook.xml.rels', relsXml),
    xmlEntry('xl/worksheets/sheet1.xml', sheet1Xml),
    xmlEntry('xl/worksheets/sheet2.xml', sheet2Xml),
  ]));
}

describe('parseXlsxRows', () => {
  it('lee cabeceras, filas y huecos de columna de un .xlsx real generado con ExcelJS', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Datos');
    worksheet.columns = [
      { header: 'Empleado', key: 'empleado' },
      { header: 'Nombre', key: 'nombre' },
      { header: 'Observaciones', key: 'observaciones' },
    ];
    worksheet.addRow({ empleado: '111', nombre: 'Ana' });
    worksheet.addRow({ empleado: '222', nombre: 'Bea', observaciones: 'Repetida' });
    worksheet.addRow({ empleado: '333', nombre: 'Bea', observaciones: 'Repetida' });

    const buffer = await workbook.xlsx.writeBuffer();
    const rows = await parseXlsxRows(toArrayBuffer(buffer as unknown as Uint8Array));

    expect(rows[0]).toEqual(['Empleado', 'Nombre', 'Observaciones']);
    expect(rows[1]).toEqual(['111', 'Ana']);
    expect(rows[2]).toEqual(['222', 'Bea', 'Repetida']);
    // Dos filas con el mismo texto ejercitan la tabla de shared strings compartidas.
    expect(rows[3]).toEqual(['333', 'Bea', 'Repetida']);
  });

  it('devuelve un array vacío si el libro no tiene datos en la hoja', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Vacía');

    const buffer = await workbook.xlsx.writeBuffer();
    const rows = await parseXlsxRows(toArrayBuffer(buffer as unknown as Uint8Array));

    expect(rows).toEqual([]);
  });

  it('lee la primera pestaña por orden de pestañas, no por el nombre de fichero sheet1.xml', async () => {
    const buffer = buildWorkbookWithSwappedInternalSheetOrder();
    const rows = await parseXlsxRows(buffer);

    expect(rows).toEqual([
      ['Empleado', 'Nombre'],
      ['12345', 'Persona de la primera pestaña'],
    ]);
  });
});
