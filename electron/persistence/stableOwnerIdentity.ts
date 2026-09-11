import { app } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';

const OWNER_ID_FILE_NAME = 'traccion-owner-id.json';

function getOwnerIdFilePath(): string {
  return path.join(app.getPath('userData'), OWNER_ID_FILE_NAME);
}

/**
 * Genera un identificador volátil válido para usar antes de que Electron haya
 * resuelto el ownerId persistente almacenado en userData.
 */
export function createVolatileOwnerId(): string {
  return `${hostname()}-${process.pid}-${Date.now().toString(36)}`;
}

/**
 * Lee o crea un ownerId estable en userData. Reutilizarlo entre reinicios
 * permite limpiar los editing_locks propios al arrancar (crash recovery),
 * en lugar de esperar a que expiren por TTL.
 */
export async function resolveStableOwnerId(): Promise<string> {
  const filePath = getOwnerIdFilePath();
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { id?: unknown }).id === 'string'
    ) {
      return (parsed as { id: string }).id;
    }
  } catch {
    // Fichero no existe o está corrupto: crear uno nuevo.
  }

  const newId = `${hostname()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await writeFile(filePath, JSON.stringify({ id: newId }), 'utf8');
  } catch {
    // Si no se puede escribir, el id volátil sigue siendo válido para esta sesión.
  }
  return newId;
}
