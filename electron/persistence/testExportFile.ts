import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveTestOutputDirectory } from './testOutputPaths.js';

type OutputStatus = Parameters<typeof resolveTestOutputDirectory>[0];

export async function saveTestExportFile(status: OutputStatus, payload: unknown): Promise<string> {
  if (!payload || typeof payload !== 'object') throw new Error('Exportación inválida.');
  const { fileName, buffer } = payload as { fileName?: unknown; buffer?: unknown };
  if (typeof fileName !== 'string' || fileName.length > 180 || fileName !== path.win32.basename(fileName) ||
      fileName !== path.posix.basename(fileName) || /[<>:"/\\|?*]/.test(fileName) || Array.from(fileName).some(character => character.charCodeAt(0) < 32) || fileName.startsWith('.') ||
      !/\.(xlsx|csv|docx|pdf|json|txt)$/i.test(fileName) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(fileName) ||
      !(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) throw new Error('Nombre o contenido de exportación inválido.');
  const root = await resolveTestOutputDirectory(status, 'exportaciones');
  const directory = await mkdtemp(path.join(root, 'manual-'));
  const destination = path.join(directory, fileName);
  await writeFile(destination, Buffer.from(buffer), { flag: 'wx' });
  return destination;
}
