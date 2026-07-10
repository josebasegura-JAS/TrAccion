import {
  isGrupoCobertura,
  normalizeGrupoCoberturaDraft,
  type GrupoCobertura,
} from '../domain/gruposCobertura';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';

export const GRUPOS_COBERTURA_STORAGE_KEY = 'traccion.v1.teletrabajo.gruposCobertura';

/**
 * Registro auxiliar `id -> updatedAt` usado para el guardado condicional
 * (OCC) contra SQLite. Vive aquí porque solo lo necesitan las funciones de
 * lectura/escritura de grupos de este módulo.
 */
let latestGruposCoberturaUpdatedAtById = new Map<string, string>();

export function createGrupoCoberturaId(): string {
  return `teletrabajo-grupo-cobertura-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeGrupoCobertura(grupo: GrupoCobertura): GrupoCobertura {
  const createdAt = grupo.createdAt ?? new Date().toISOString();
  return {
    id: grupo.id,
    ...normalizeGrupoCoberturaDraft({
      nombre: grupo.nombre,
      presencialidadMinima: grupo.presencialidadMinima,
    }),
    createdAt,
    updatedAt: grupo.updatedAt ?? createdAt,
    deletedAt: grupo.deletedAt ?? null,
  };
}

export function readGruposCobertura(): GrupoCobertura[] {
  const stored = readStorageItem(GRUPOS_COBERTURA_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isGrupoCobertura).map(normalizeGrupoCobertura);
}

export async function readGruposCoberturaFromSqlite(): Promise<GrupoCobertura[] | null> {
  const loader = window.traccion?.loadTeletrabajoGrupoCoberturaRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await loader();
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  latestGruposCoberturaUpdatedAtById = new Map(
    snapshot.records.map((record) => [record.id, record.updatedAt]),
  );

  return snapshot.records
    .map((record): GrupoCobertura | null => {
      try {
        const parsed: unknown = JSON.parse(record.value);
        return isGrupoCobertura(parsed) ? normalizeGrupoCobertura(parsed) : null;
      } catch {
        return null;
      }
    })
    .filter((grupo): grupo is GrupoCobertura => Boolean(grupo));
}

async function persistGruposCoberturaInSqlite(gruposCobertura: GrupoCobertura[]): Promise<boolean> {
  const saver = window.traccion?.saveTeletrabajoGrupoCoberturaRecordIfUnchanged;
  if (!saver) {
    return false;
  }

  for (const grupo of gruposCobertura) {
    const result = await saver({
      id: grupo.id,
      value: JSON.stringify(grupo),
      expectedUpdatedAt: latestGruposCoberturaUpdatedAtById.get(grupo.id) ?? null,
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    if (result.currentUpdatedAt) {
      latestGruposCoberturaUpdatedAtById.set(grupo.id, result.currentUpdatedAt);
    }
  }

  return true;
}

/**
 * Persiste TODA la lista de grupos en localStorage y, en segundo plano, en
 * SQLite registro a registro. Pensada solo para operaciones que legítimamente
 * tocan muchos grupos a la vez (migración legacy), donde el resultado se ve
 * en el siguiente reload. NO usar para una edición de un solo grupo desde el
 * modal: ahí se debe usar persistGrupoCoberturaRecord, que guarda solo ese
 * registro y permite avisar al usuario si hay conflicto.
 */
export function persistGruposCobertura(gruposCobertura: GrupoCobertura[]): void {
  writeStorageItem(GRUPOS_COBERTURA_STORAGE_KEY, JSON.stringify(gruposCobertura));

  void (async () => {
    try {
      await persistGruposCoberturaInSqlite(gruposCobertura);
    } catch (error) {
      console.warn('Grupos de cobertura no guardados en SQLite.', error);
    }
  })();
}

/**
 * Persiste un único grupo de cobertura (creación, edición o baja lógica de un
 * registro concreto desde el modal). A diferencia de persistGruposCobertura,
 * espera el resultado real de SQLite y lo devuelve, para que el caller pueda
 * avisar al usuario si otra persona modificó ese mismo grupo mientras tanto.
 */
export async function persistGrupoCoberturaRecord(
  allGrupos: GrupoCobertura[],
  grupo: GrupoCobertura,
): Promise<{ ok: boolean; message: string }> {
  writeStorageItem(GRUPOS_COBERTURA_STORAGE_KEY, JSON.stringify(allGrupos));

  const saver = window.traccion?.saveTeletrabajoGrupoCoberturaRecordIfUnchanged;
  if (!saver) {
    return { ok: true, message: '' };
  }

  try {
    const result = await saver({
      id: grupo.id,
      value: JSON.stringify(grupo),
      expectedUpdatedAt: latestGruposCoberturaUpdatedAtById.get(grupo.id) ?? null,
    });
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.message ||
          'Este grupo de cobertura ha sido modificado por otra persona. Recarga antes de continuar.',
      };
    }
    if (result.currentUpdatedAt) {
      latestGruposCoberturaUpdatedAtById.set(grupo.id, result.currentUpdatedAt);
    }
    return { ok: true, message: '' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido guardar el grupo de cobertura.',
    };
  }
}

export async function loadGruposCoberturaFromSqliteOrStorage(): Promise<GrupoCobertura[]> {
  const sqliteGrupos = await readGruposCoberturaFromSqlite();
  return sqliteGrupos ?? readGruposCobertura();
}

export function areGruposCoberturaEquivalent(left: GrupoCobertura[], right: GrupoCobertura[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
