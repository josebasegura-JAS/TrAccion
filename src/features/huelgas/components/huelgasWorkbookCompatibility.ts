import JSZip from 'jszip';

const SPREADSHEETML_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function prefixedSpreadsheetNamespace(xml: string): string | null {
  const match = xml.match(
    new RegExp(`<([A-Za-z_][\\w.-]*):workbook\\b[\\s\\S]*?xmlns:\\1=["']${escapeRegExp(SPREADSHEETML_NAMESPACE)}["']`),
  );
  return match?.[1] ?? null;
}

function normalizeSpreadsheetNamespace(xml: string, prefix: string): string {
  const escapedPrefix = escapeRegExp(prefix);
  const namespaceDeclaration = new RegExp(
    `\\sxmlns:${escapedPrefix}=(["'])${escapeRegExp(SPREADSHEETML_NAMESPACE)}\\1`,
    'g',
  );
  const elementPrefix = new RegExp(`<(/?)${escapedPrefix}:`, 'g');

  return xml
    .replace(namespaceDeclaration, ` xmlns="${SPREADSHEETML_NAMESPACE}"`)
    .replace(elementPrefix, '<$1');
}

/**
 * ExcelJS 4.x no interpreta correctamente algunos XLSX válidos generados por
 * herramientas que usan un prefijo explícito (por ejemplo <x:workbook>,
 * <x:worksheet>, <x:c>...) para el namespace principal de SpreadsheetML. En ese
 * caso termina fallando durante la carga con errores internos como
 * "Cannot read properties of undefined (reading 'sheets')".
 *
 * Excel utiliza indistintamente namespace por defecto o prefijado. Para que el
 * importador de huelgas acepte ambos formatos, normalizamos únicamente los XML
 * SpreadsheetML afectados antes de entregarlos a ExcelJS. Los libros habituales
 * de Excel no se modifican y se devuelve el ArrayBuffer original.
 */
export async function normalizeHuelgaWorkbookForImport(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookEntry = zip.file('xl/workbook.xml');
  if (!workbookEntry) {
    throw new Error('El archivo no contiene un libro Excel válido (falta xl/workbook.xml).');
  }

  const workbookXml = await workbookEntry.async('string');
  const prefix = prefixedSpreadsheetNamespace(workbookXml);
  if (!prefix) return buffer;

  const candidates = Object.values(zip.files).filter((entry) =>
    !entry.dir && /^xl\/.*\.xml$/i.test(entry.name),
  );

  await Promise.all(candidates.map(async (entry) => {
    const xml = await entry.async('string');
    const declaration = new RegExp(
      `xmlns:${escapeRegExp(prefix)}=["']${escapeRegExp(SPREADSHEETML_NAMESPACE)}["']`,
    );
    if (!declaration.test(xml)) return;
    zip.file(entry.name, normalizeSpreadsheetNamespace(xml, prefix));
  }));

  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
