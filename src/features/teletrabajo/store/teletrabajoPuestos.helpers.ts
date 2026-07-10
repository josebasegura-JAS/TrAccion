import {
  normalizeTeletrabajoPuesto,
  normalizeTeletrabajoPuestoDraft,
  type TeletrabajoPuesto,
  type TeletrabajoPuestoDraft,
} from '../domain/puestosTeletrabajo';
import { normalizeGrupoCoberturaNombre, type GrupoCobertura } from '../domain/gruposCobertura';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  createGrupoCoberturaId,
  loadGruposCoberturaFromSqliteOrStorage,
  persistGruposCobertura,
} from './teletrabajoGruposCobertura.helpers';

export const PUESTOS_STORAGE_KEY = 'traccion.v1.teletrabajo.puestos';

/**
 * Registro auxiliar `id -> updatedAt` usado para el guardado condicional
 * (OCC) contra SQLite. Vive aquí porque solo lo necesitan las funciones de
 * lectura/escritura de puestos de este módulo.
 */
let latestPuestosTeletrabajoUpdatedAtById = new Map<string, string>();

export function createPuestoTeletrabajoId(): string {
  return `teletrabajo-puesto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isTeletrabajoPuesto(value: unknown): value is TeletrabajoPuesto {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof TeletrabajoPuesto, unknown>>;
  return typeof candidate.id === 'string' && typeof candidate.puesto === 'string';
}

export function normalizePuestoTeletrabajo(puesto: TeletrabajoPuesto): TeletrabajoPuesto {
  const createdAt = puesto.createdAt ?? new Date().toISOString();
  return {
    id: puesto.id,
    ...normalizeTeletrabajoPuestoDraft({
      puesto: puesto.puesto,
      maxSolicitudes: puesto.maxSolicitudes,
      dotacionComputable: puesto.dotacionComputable ?? 0,
      grupoCoberturaId: puesto.grupoCoberturaId ?? null,
      observaciones: puesto.observaciones ?? '',
    }),
    createdAt,
    updatedAt: puesto.updatedAt ?? createdAt,
    deletedAt: puesto.deletedAt ?? null,
  };
}

/**
 * Lee el campo de texto libre `grupoCobertura` que pudiera venir de un
 * registro legacy guardado antes de la migración a Grupos de cobertura como
 * entidad propia. Los registros nuevos no tienen esta propiedad.
 */
function readLegacyGrupoCoberturaNombre(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }
  const candidate = (value as { grupoCobertura?: unknown }).grupoCobertura;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

/**
 * Migra, una sola vez, los puestos que aún tengan el antiguo campo de texto
 * libre `grupoCobertura` (de instalaciones previas a esta versión) creando un
 * Grupo de cobertura real por cada nombre de texto distinto encontrado, con
 * la presencialidad mínima igual al máximo declarado entre esos puestos
 * (igual que calculaba antes el propio código), y enlazando cada puesto al
 * grupo resultante mediante grupoCoberturaId.
 */
export function migrateLegacyGruposCobertura(
  rawPuestos: unknown[],
  puestos: TeletrabajoPuesto[],
  gruposExistentes: GrupoCobertura[],
): { puestos: TeletrabajoPuesto[]; gruposCobertura: GrupoCobertura[]; migrated: boolean } {
  const legacyNombreById = new Map<string, string>();
  rawPuestos.forEach((raw) => {
    if (!raw || typeof raw !== 'object') {
      return;
    }
    const id = (raw as { id?: unknown }).id;
    const nombre = readLegacyGrupoCoberturaNombre(raw);
    if (typeof id === 'string' && nombre) {
      legacyNombreById.set(id, nombre);
    }
  });

  if (legacyNombreById.size === 0) {
    return { puestos, gruposCobertura: gruposExistentes, migrated: false };
  }

  const now = new Date().toISOString();
  const gruposByNombreKey = new Map<string, GrupoCobertura>(
    gruposExistentes
      .filter((grupo) => !grupo.deletedAt)
      .map((grupo) => [normalizeGrupoCoberturaNombre(grupo.nombre), grupo]),
  );
  const maximaPorNombreKey = new Map<string, number>();

  puestos.forEach((puesto) => {
    const nombre = legacyNombreById.get(puesto.id);
    if (!nombre) {
      return;
    }
    const key = normalizeGrupoCoberturaNombre(nombre);
    maximaPorNombreKey.set(key, Math.max(maximaPorNombreKey.get(key) ?? 0, puesto.maxSolicitudes ?? 0));
  });

  const gruposNuevos: GrupoCobertura[] = [];
  const puestosMigrados = puestos.map((puesto) => {
    const nombre = legacyNombreById.get(puesto.id);
    if (!nombre) {
      return puesto;
    }

    const key = normalizeGrupoCoberturaNombre(nombre);
    let grupo = gruposByNombreKey.get(key);
    if (!grupo) {
      grupo = {
        id: createGrupoCoberturaId(),
        nombre,
        presencialidadMinima: maximaPorNombreKey.get(key) ?? 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      gruposByNombreKey.set(key, grupo);
      gruposNuevos.push(grupo);
    }

    return { ...puesto, grupoCoberturaId: grupo.id };
  });

  return {
    puestos: puestosMigrados,
    gruposCobertura: [...gruposExistentes, ...gruposNuevos],
    migrated: true,
  };
}

export function readPuestosTeletrabajo(): { puestos: TeletrabajoPuesto[]; rawRecords: unknown[] } {
  const stored = readStorageItem(PUESTOS_STORAGE_KEY);
  if (!stored) {
    return { puestos: [], rawRecords: [] };
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return { puestos: [], rawRecords: [] };
  }

  return {
    puestos: parsed.filter(isTeletrabajoPuesto).map(normalizePuestoTeletrabajo),
    rawRecords: parsed,
  };
}

export async function readPuestosTeletrabajoFromSqlite(): Promise<{
  puestos: TeletrabajoPuesto[];
  rawRecords: unknown[];
} | null> {
  const loader = window.traccion?.loadTeletrabajoPuestoRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await loader();
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  latestPuestosTeletrabajoUpdatedAtById = new Map(
    snapshot.records.map((record) => [record.id, record.updatedAt]),
  );

  const rawRecords: unknown[] = [];
  const puestos = snapshot.records
    .map((record): TeletrabajoPuesto | null => {
      try {
        const parsed: unknown = JSON.parse(record.value);
        rawRecords.push(parsed);
        return isTeletrabajoPuesto(parsed) ? normalizePuestoTeletrabajo(parsed) : null;
      } catch {
        return null;
      }
    })
    .filter((puesto): puesto is TeletrabajoPuesto => Boolean(puesto));

  return { puestos, rawRecords };
}

async function persistPuestosTeletrabajoInSqlite(
  puestosTeletrabajo: TeletrabajoPuesto[],
): Promise<boolean> {
  const saver = window.traccion?.saveTeletrabajoPuestoRecordIfUnchanged;
  if (!saver) {
    return false;
  }

  for (const puesto of puestosTeletrabajo) {
    const result = await saver({
      id: puesto.id,
      value: JSON.stringify(puesto),
      expectedUpdatedAt: latestPuestosTeletrabajoUpdatedAtById.get(puesto.id) ?? null,
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    if (result.currentUpdatedAt) {
      latestPuestosTeletrabajoUpdatedAtById.set(puesto.id, result.currentUpdatedAt);
    }
  }

  return true;
}

/**
 * Persiste TODA la lista de puestos en localStorage y, en segundo plano, en
 * SQLite registro a registro. Pensada solo para operaciones que legítimamente
 * tocan muchos puestos a la vez (migración legacy, importación masiva), donde
 * el resultado se ve en el siguiente reload. NO usar para una edición de un
 * solo puesto desde el modal: ahí se debe usar persistPuestoTeletrabajoRecord,
 * que guarda solo ese registro y permite avisar al usuario si hay conflicto.
 */
export function persistPuestosTeletrabajo(puestosTeletrabajo: TeletrabajoPuesto[]): void {
  writeStorageItem(PUESTOS_STORAGE_KEY, JSON.stringify(puestosTeletrabajo));

  void (async () => {
    try {
      await persistPuestosTeletrabajoInSqlite(puestosTeletrabajo);
    } catch (error) {
      console.warn('Puestos teletrabajables no guardados en SQLite.', error);
    }
  })();
}

/**
 * Persiste un único puesto (creación, edición o baja lógica de un registro
 * concreto desde el modal). A diferencia de persistPuestosTeletrabajo, espera
 * el resultado real de SQLite y lo devuelve, para que el caller pueda avisar
 * al usuario si otra persona modificó ese mismo puesto mientras tanto.
 */
export async function persistPuestoTeletrabajoRecord(
  allPuestos: TeletrabajoPuesto[],
  puesto: TeletrabajoPuesto,
): Promise<{ ok: boolean; message: string }> {
  writeStorageItem(PUESTOS_STORAGE_KEY, JSON.stringify(allPuestos));

  const saver = window.traccion?.saveTeletrabajoPuestoRecordIfUnchanged;
  if (!saver) {
    return { ok: true, message: '' };
  }

  try {
    const result = await saver({
      id: puesto.id,
      value: JSON.stringify(puesto),
      expectedUpdatedAt: latestPuestosTeletrabajoUpdatedAtById.get(puesto.id) ?? null,
    });
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.message ||
          'Este puesto ha sido modificado por otra persona. Recarga antes de continuar.',
      };
    }
    if (result.currentUpdatedAt) {
      latestPuestosTeletrabajoUpdatedAtById.set(puesto.id, result.currentUpdatedAt);
    }
    return { ok: true, message: '' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido guardar el puesto.',
    };
  }
}

export function arePuestosTeletrabajoEquivalent(
  left: TeletrabajoPuesto[],
  right: TeletrabajoPuesto[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function upsertPuestosTeletrabajo(
  current: TeletrabajoPuesto[],
  drafts: readonly Partial<TeletrabajoPuestoDraft>[],
): TeletrabajoPuesto[] {
  const now = new Date().toISOString();
  const puestosByKey = new Map(
    current.map((puesto) => [normalizeTeletrabajoPuesto(puesto.puesto), puesto]),
  );

  drafts.forEach((draft) => {
    const normalizedDraft = normalizeTeletrabajoPuestoDraft(draft);
    if (!normalizedDraft.puesto) {
      return;
    }

    const key = normalizeTeletrabajoPuesto(normalizedDraft.puesto);
    const previous = puestosByKey.get(key);
    puestosByKey.set(key, {
      id: previous?.id ?? createPuestoTeletrabajoId(),
      ...normalizedDraft,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    });
  });

  return Array.from(puestosByKey.values()).sort((first, second) =>
    first.puesto.localeCompare(second.puesto, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

/**
 * Resuelve una lista de nombres de grupo de cobertura (tal como vienen del
 * fichero importado) a ids de grupos existentes, creando un grupo nuevo (con
 * presencialidad mínima 0, a completar luego en el modal de grupos) por cada
 * nombre que no coincida con ninguno ya dado de alta.
 */
export function resolveGrupoCoberturaNombresToIds(
  nombres: readonly string[],
  gruposExistentes: GrupoCobertura[],
): { gruposCobertura: GrupoCobertura[]; idByNombreKey: Map<string, string> } {
  const now = new Date().toISOString();
  const gruposByNombreKey = new Map<string, GrupoCobertura>(
    gruposExistentes
      .filter((grupo) => !grupo.deletedAt)
      .map((grupo) => [normalizeGrupoCoberturaNombre(grupo.nombre), grupo]),
  );
  const idByNombreKey = new Map<string, string>();
  const gruposNuevos: GrupoCobertura[] = [];

  nombres.forEach((nombre) => {
    const trimmed = (nombre ?? '').trim();
    if (!trimmed) {
      return;
    }
    const key = normalizeGrupoCoberturaNombre(trimmed);
    let grupo = gruposByNombreKey.get(key);
    if (!grupo) {
      grupo = {
        id: createGrupoCoberturaId(),
        nombre: trimmed,
        presencialidadMinima: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      gruposByNombreKey.set(key, grupo);
      gruposNuevos.push(grupo);
    }
    idByNombreKey.set(key, grupo.id);
  });

  return { gruposCobertura: [...gruposExistentes, ...gruposNuevos], idByNombreKey };
}

/**
 * Carga puestos y grupos de cobertura juntos y, si encuentra puestos con el
 * antiguo campo de texto libre `grupoCobertura` sin migrar todavía, crea los
 * grupos correspondientes y persiste tanto los puestos enlazados como los
 * grupos nuevos. Se ejecuta tanto en el arranque (load) como en cada
 * recarga (reloadFromStorage) pero es una operación idempotente: una vez
 * migrado un puesto, ya no vuelve a tener el campo legacy en el registro guardado.
 */
export async function loadPuestosYGruposConMigracion(): Promise<{
  puestos: TeletrabajoPuesto[];
  gruposCobertura: GrupoCobertura[];
}> {
  const [puestosResult, gruposCobertura] = await Promise.all([
    readPuestosTeletrabajoFromSqlite().then((result) => result ?? readPuestosTeletrabajo()),
    loadGruposCoberturaFromSqliteOrStorage(),
  ]);

  const migrated = migrateLegacyGruposCobertura(
    puestosResult.rawRecords,
    puestosResult.puestos,
    gruposCobertura,
  );

  if (migrated.migrated) {
    const gruposNuevosCount = migrated.gruposCobertura.length - gruposCobertura.length;
    persistGruposCobertura(migrated.gruposCobertura);
    persistPuestosTeletrabajo(migrated.puestos);
    console.warn(
      `Migrados ${gruposNuevosCount} grupo(s) de cobertura desde el campo de texto libre legacy.`,
    );
  }

  return { puestos: migrated.puestos, gruposCobertura: migrated.gruposCobertura };
}
