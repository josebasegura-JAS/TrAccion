import path from 'node:path';
import { getSqliteStatus } from '../sqlitePersistence.js';

/**
 * Valida el payload genérico { id, value, expectedUpdatedAt } que comparten
 * varios repositorios "simple JSON module" (puestos teletrabajables, grupos
 * de cobertura, traducciones de puesto). Usado por Teletrabajo y Plantilla.
 */
export function validateJsonRecordPayload(
  payload: unknown,
  invalidMessage: string,
):
  | { ok: true; id: string; value: string; expectedUpdatedAt: string | null }
  | {
      ok: false;
      result: {
        ok: false;
        status: ReturnType<typeof getSqliteStatus>;
        currentUpdatedAt: null;
        message: string;
      };
    } {
  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      result: {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: invalidMessage,
      },
    };
  }

  const candidate = payload as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.value !== 'string' ||
    (typeof candidate.expectedUpdatedAt !== 'string' && candidate.expectedUpdatedAt !== null)
  ) {
    return {
      ok: false,
      result: {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: invalidMessage,
      },
    };
  }

  return {
    ok: true,
    id: candidate.id,
    value: candidate.value,
    expectedUpdatedAt: typeof candidate.expectedUpdatedAt === 'string' ? candidate.expectedUpdatedAt : null,
  };
}

/**
 * Valida que la ruta seleccionada por el usuario para una plantilla Word
 * apunte realmente a un .docx. Usado por los handlers `*:read-template` de
 * Teletrabajo, Vinculograma y Licencias sin sueldo (los tres siguen el mismo
 * patrón: seleccionar plantilla + leerla).
 */
export function assertDocxPath(filePath: string): void {
  if (path.extname(filePath).toLowerCase() !== '.docx') {
    throw new Error('La ruta configurada debe apuntar a un archivo DOCX.');
  }
}
