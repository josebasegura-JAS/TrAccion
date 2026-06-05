const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

interface CentralDirectoryEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(0, view.byteLength - 0xffff - 22);

  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error('No se ha podido leer el DOCX: ZIP sin directorio central.');
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (!('DecompressionStream' in globalThis)) {
    throw new Error('Este navegador no permite descomprimir plantillas DOCX.');
  }

  const stream = new Blob([data.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readCentralDirectoryEntry(
  view: DataView,
  zipBytes: Uint8Array,
  offset: number,
): Promise<ZipEntry> {
  if (readUint32(view, offset) !== 0x02014b50) {
    throw new Error('No se ha podido leer el DOCX: entrada ZIP inválida.');
  }

  const entry: CentralDirectoryEntry = {
    compressionMethod: readUint16(view, offset + 10),
    compressedSize: readUint32(view, offset + 20),
    uncompressedSize: readUint32(view, offset + 24),
    name: textDecoder.decode(
      zipBytes.slice(offset + 46, offset + 46 + readUint16(view, offset + 28)),
    ),
    localHeaderOffset: readUint32(view, offset + 42),
  };

  const localOffset = entry.localHeaderOffset;
  if (readUint32(view, localOffset) !== 0x04034b50) {
    throw new Error(`No se ha podido leer ${entry.name}: cabecera local ZIP inválida.`);
  }

  const dataOffset =
    localOffset + 30 + readUint16(view, localOffset + 26) + readUint16(view, localOffset + 28);
  const compressedData = zipBytes.slice(dataOffset, dataOffset + entry.compressedSize);
  const data = entry.compressionMethod === 0 ? compressedData : await inflateRaw(compressedData);

  if (data.byteLength !== entry.uncompressedSize) {
    throw new Error(`No se ha podido leer ${entry.name}: tamaño ZIP inesperado.`);
  }

  return { name: entry.name, data };
}

export async function unzipDocx(buffer: ArrayBuffer): Promise<ZipEntry[]> {
  const zipBytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = readUint16(view, eocdOffset + 10);
  let centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    const nameLength = readUint16(view, centralDirectoryOffset + 28);
    const extraLength = readUint16(view, centralDirectoryOffset + 30);
    const commentLength = readUint16(view, centralDirectoryOffset + 32);
    entries.push(await readCentralDirectoryEntry(view, zipBytes, centralDirectoryOffset));
    centralDirectoryOffset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

const crcTable = Array.from({ length: 256 }, (_, tableIndex) => {
  let value = tableIndex;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

export function zipDocx(entries: readonly ZipEntry[]): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = textEncoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const localHeader = new Uint8Array(30 + name.byteLength);
    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0x0800);
    writeUint16(localHeader, 8, 0);
    writeUint32(localHeader, 14, checksum);
    writeUint32(localHeader, 18, entry.data.byteLength);
    writeUint32(localHeader, 22, entry.data.byteLength);
    writeUint16(localHeader, 26, name.byteLength);
    localHeader.set(name, 30);

    const centralHeader = new Uint8Array(46 + name.byteLength);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0x0800);
    writeUint16(centralHeader, 10, 0);
    writeUint32(centralHeader, 16, checksum);
    writeUint32(centralHeader, 20, entry.data.byteLength);
    writeUint32(centralHeader, 24, entry.data.byteLength);
    writeUint16(centralHeader, 28, name.byteLength);
    writeUint32(centralHeader, 42, offset);
    centralHeader.set(name, 46);

    localChunks.push(localHeader, entry.data);
    centralChunks.push(centralHeader);
    offset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = concat(centralChunks);
  const endOfCentralDirectory = new Uint8Array(22);
  writeUint32(endOfCentralDirectory, 0, 0x06054b50);
  writeUint16(endOfCentralDirectory, 8, entries.length);
  writeUint16(endOfCentralDirectory, 10, entries.length);
  writeUint32(endOfCentralDirectory, 12, centralDirectory.byteLength);
  writeUint32(endOfCentralDirectory, 16, centralDirectoryOffset);

  return concat([...localChunks, centralDirectory, endOfCentralDirectory]);
}
