import { inflateRawSync } from 'node:zlib';

/**
 * Lectura mínima del formato DOCX (un ZIP) para extraer el texto de
 * word/document.xml, sin depender de librerías externas. Extraído de
 * main.ts: es un parser puro, no depende de Electron ni del ciclo de vida
 * de la app.
 */
interface ZipEntryContent {
  fileName: string;
  content: Buffer;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      return index;
    }
  }

  throw new Error('El DOCX no contiene un directorio ZIP válido.');
}

function readZipEntry(buffer: Buffer, targetFileName: string): ZipEntryContent | null {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Estructura ZIP no válida.');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    if (fileName === targetFileName) {
      if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error('Cabecera local ZIP no válida.');
      }

      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        return { fileName, content: compressed };
      }

      if (compressionMethod === 8) {
        return { fileName, content: inflateRawSync(compressed) };
      }

      throw new Error(`Método de compresión DOCX no soportado: ${compressionMethod}.`);
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function extractTextFromDocxBuffer(buffer: Buffer): string {
  const documentEntry = readZipEntry(buffer, 'word/document.xml');
  if (!documentEntry) {
    throw new Error('El DOCX no contiene word/document.xml.');
  }

  const xml = documentEntry.content.toString('utf8');
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\s*\/?>/g, '\t')
      .replace(/<w:br\s*\/?>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n'),
  );
}

export function normalizeDocxTextPayload(payload: unknown): Buffer {
  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload);
  }

  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  }

  throw new Error('Contenido DOCX no válido.');
}
