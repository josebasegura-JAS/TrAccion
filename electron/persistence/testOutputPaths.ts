import path from 'node:path';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { mkdir, realpath, stat } from 'node:fs/promises';

interface OutputStatus { ready: boolean; phase: string; path: string; isDefaultPath: boolean; environment?: string }

// Solo rutas derivadas de una base test activa, nunca de campos del renderer.
export function testOutputRoot(status: OutputStatus): string {
  if (!status.ready || status.phase !== 'active' || status.isDefaultPath ||
      status.environment !== 'test' || !path.isAbsolute(status.path) ||
      path.basename(status.path) !== 'traccion.sqlite') {
    throw new Error('No hay una base de PRUEBAS activa y verificada.');
  }
  return path.dirname(status.path);
}

export function testBackupRoot(status: OutputStatus, profile: string): string {
  const id = createHash('sha256').update(hostname()).update('\0').update(profile).digest('hex').slice(0, 16);
  return path.join(testOutputRoot(status), 'backups-pruebas', id);
}

export async function resolveTestOutputDirectory(status: OutputStatus, ...segments: string[]): Promise<string> {
  const root = await realpath(testOutputRoot(status));
  let directory = root;
  for (const segment of segments) {
    if (!/^[a-zA-Z0-9_-]+$/.test(segment)) throw new Error('Subcarpeta de pruebas inválida.');
    const next = path.join(directory, segment);
    try { await mkdir(next); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const resolved = await realpath(next);
    const relative = path.relative(root, resolved);
    if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative) ||
        !(await stat(resolved)).isDirectory()) throw new Error('La carpeta de pruebas sale de la raíz autorizada.');
    directory = resolved;
  }
  return directory;
}
