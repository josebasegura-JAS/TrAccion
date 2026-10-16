import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { normalizeHuelgaWorkbookForImport } from './huelgasWorkbookCompatibility';

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

async function makeWorkbook(workbookXml: string, worksheetXml: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', workbookXml);
  zip.file('xl/worksheets/sheet1.xml', worksheetXml);
  zip.file('xl/styles.xml', `<?xml version="1.0"?><x:styleSheet xmlns:x="${NS}"><x:fonts count="0"/></x:styleSheet>`);
  zip.file('docProps/core.xml', '<?xml version="1.0"?><coreProperties/>');
  return zip.generateAsync({ type: 'arraybuffer' });
}

describe('normalizeHuelgaWorkbookForImport', () => {
  it('normaliza el namespace SpreadsheetML prefijado que ExcelJS no interpreta', async () => {
    const buffer = await makeWorkbook(
      `<?xml version="1.0"?><x:workbook xmlns:x="${NS}"><x:sheets><x:sheet name="Seguimiento" sheetId="1"/></x:sheets></x:workbook>`,
      `<?xml version="1.0"?><x:worksheet xmlns:x="${NS}"><x:sheetData><x:row r="1"><x:c r="A1"><x:v>1</x:v></x:c></x:row></x:sheetData></x:worksheet>`,
    );

    const normalized = await normalizeHuelgaWorkbookForImport(buffer);
    const zip = await JSZip.loadAsync(normalized);
    const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
    const worksheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
    const stylesXml = await zip.file('xl/styles.xml')?.async('string');

    expect(workbookXml).toContain(`<workbook xmlns="${NS}">`);
    expect(workbookXml).toContain('<sheets><sheet');
    expect(workbookXml).not.toContain('<x:workbook');
    expect(worksheetXml).toContain(`<worksheet xmlns="${NS}">`);
    expect(worksheetXml).toContain('<sheetData><row');
    expect(worksheetXml).not.toContain('<x:worksheet');
    expect(stylesXml).toContain(`<styleSheet xmlns="${NS}">`);
    expect(stylesXml).not.toContain('<x:styleSheet');
  });

  it('no modifica los Excel que ya usan el namespace SpreadsheetML por defecto', async () => {
    const buffer = await makeWorkbook(
      `<?xml version="1.0"?><workbook xmlns="${NS}"><sheets><sheet name="Seguimiento" sheetId="1"/></sheets></workbook>`,
      `<?xml version="1.0"?><worksheet xmlns="${NS}"><sheetData/></worksheet>`,
    );

    const normalized = await normalizeHuelgaWorkbookForImport(buffer);

    expect(normalized).toBe(buffer);
  });

  it('da un error entendible si el fichero no contiene workbook.xml', async () => {
    const zip = new JSZip();
    zip.file('xl/worksheets/sheet1.xml', '<worksheet/>');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    await expect(normalizeHuelgaWorkbookForImport(buffer)).rejects.toThrow(
      'El archivo no contiene un libro Excel válido',
    );
  });
});
