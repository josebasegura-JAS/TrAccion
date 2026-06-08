import { readStorageItem } from './persistence';
import type { AppView } from '../navigation/navigation';

export interface GlobalSearchResult {
  id: string;
  module: string;
  moduleView: AppView;
  title: string;
  subtitle: string;
  date: string;
  year: number;
  recordId: string;
  haystack: string;
}

type SearchableModule = {
  module: string;
  moduleView: AppView;
  storageKey: string;
  mapRecord: (record: UnknownRecord, index: number) => Omit<GlobalSearchResult, 'module' | 'moduleView' | 'haystack'> | null;
};

type UnknownRecord = Record<string, unknown>;

const UNKNOWN_YEAR = 0;
const MODULE_ORDER: AppView[] = [
  'tareas',
  'comite',
  'actas',
  'paritaria',
  'teletrabajo',
  'licencias-sin-sueldo',
  'ticket-restaurante',
  'plantilla',
  'vinculograma',
  'criterios-rrll',
  'sorteos',
  'especiales',
  'ajustes',
  'dashboard',
];

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

function asString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readArray(storageKey: string): UnknownRecord[] {
  const stored = readStorageItem(storageKey);
  if (!stored) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function firstText(record: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const value = asString(record[key]).trim();
    if (value) {
      return value;
    }
  }

  return '';
}

function firstDate(record: UnknownRecord, keys: string[]): string {
  const candidate = firstText(record, keys);
  return candidate ? candidate.slice(0, 10) : '';
}

function getYear(value: string): number {
  const match = /^(\d{4})/.exec(value.trim());
  return match ? Number(match[1]) : UNKNOWN_YEAR;
}

function isDeleted(record: UnknownRecord): boolean {
  return Boolean(asString(record.deletedAt).trim());
}


function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

type LinkedSessionMatch = { module: string; moduleView: AppView; session: UnknownRecord };

function buildLinkedSessionLookup(): Map<string, LinkedSessionMatch> {
  const lookup = new Map<string, LinkedSessionMatch>();
  const sessionModules = [
    {
      module: 'Comité de Empresa',
      moduleView: 'comite' as AppView,
      storageKey: 'traccion.v1.comite.sessions',
    },
    {
      module: 'Comisión Paritaria',
      moduleView: 'paritaria' as AppView,
      storageKey: 'traccion.v1.paritaria.sessions',
    },
  ];

  for (const sessionModule of sessionModules) {
    for (const session of readArray(sessionModule.storageKey)) {
      for (const taskId of asStringArray(session.items)) {
        if (!lookup.has(taskId)) {
          lookup.set(taskId, { module: sessionModule.module, moduleView: sessionModule.moduleView, session });
        }
      }
    }
  }

  return lookup;
}

function makeSessionResultFromLinkedTask(
  task: UnknownRecord,
  taskIndex: number,
  linkedSessionLookup: Map<string, LinkedSessionMatch>,
): GlobalSearchResult | null {
  if (isDeleted(task)) {
    return null;
  }

  const taskId = firstText(task, ['id']);
  if (!taskId) {
    return null;
  }

  const linkedSession = linkedSessionLookup.get(taskId) ?? null;
  if (!linkedSession) {
    return null;
  }

  const sessionResult = makeResult(
    linkedSession.session,
    taskIndex,
    ['title', 'code'],
    ['code', 'status', 'notes'],
    ['date', 'closedAt', 'updatedAt', 'createdAt'],
    linkedSession.moduleView === 'comite' ? 'Sesión de comité' : 'Sesión de paritaria',
  );

  if (!sessionResult) {
    return null;
  }

  const taskTitle = firstText(task, ['titulo']) || 'Punto sin título';
  const taskDetail = firstText(task, ['descripcion', 'observaciones', 'origen', 'sindicato', 'responsable']);
  const result: GlobalSearchResult = {
    ...sessionResult,
    id: `${linkedSession.moduleView}-${sessionResult.recordId}-task-${taskId}`,
    module: linkedSession.module,
    moduleView: linkedSession.moduleView,
    subtitle: [`Contiene punto: ${taskTitle}`, taskDetail].filter(Boolean).join(' · '),
    haystack: normalizeText([
      linkedSession.module,
      sessionResult.title,
      sessionResult.subtitle,
      sessionResult.date,
      sessionResult.year,
      ...Object.values(linkedSession.session).flatMap(extractPrimitiveValues),
      ...Object.values(task).flatMap(extractPrimitiveValues),
    ].join(' ')),
  };

  return result;
}

function uniqueResults(results: GlobalSearchResult[]): GlobalSearchResult[] {
  const seen = new Set<string>();
  const unique: GlobalSearchResult[] = [];

  for (const result of results) {
    const key = `${result.moduleView}:${result.recordId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(result);
  }

  return unique;
}

function extractPrimitiveValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(extractPrimitiveValues);
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap(extractPrimitiveValues);
  }

  const text = asString(value);
  return text ? [text] : [];
}

function buildHaystack(
  moduleName: string,
  result: Omit<GlobalSearchResult, 'module' | 'moduleView' | 'haystack'>,
  record: UnknownRecord,
): string {
  const primitiveValues = Object.values(record).flatMap(extractPrimitiveValues);

  return normalizeText([moduleName, result.title, result.subtitle, result.date, result.year, ...primitiveValues].join(' '));
}

function makeResult(
  record: UnknownRecord,
  index: number,
  titleKeys: string[],
  subtitleKeys: string[],
  dateKeys: string[],
  fallbackTitle: string,
): Omit<GlobalSearchResult, 'module' | 'moduleView' | 'haystack'> | null {
  if (isDeleted(record)) {
    return null;
  }

  const recordId = firstText(record, ['id', 'empleado', 'employeeNumber']) || `row-${index}`;
  const title = firstText(record, titleKeys) || fallbackTitle;
  const subtitle = firstText(record, subtitleKeys);
  const date = firstDate(record, dateKeys);

  return {
    id: `${recordId}-${index}`,
    recordId,
    title,
    subtitle,
    date,
    year: getYear(date),
  };
}

const searchableModules: SearchableModule[] = [
  {
    module: 'Tareas',
    moduleView: 'tareas',
    storageKey: 'traccion.v1.tareas.tasks',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['titulo'],
        ['fase', 'estado', 'responsable', 'origen', 'sindicato', 'descripcion', 'observaciones'],
        ['fechaLimite', 'updatedAt', 'createdAt', 'closedAt'],
        'Tarea sin título',
      ),
  },
  {
    module: 'Comité de Empresa',
    moduleView: 'comite',
    storageKey: 'traccion.v1.comite.sessions',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['title', 'code'],
        ['code', 'status', 'notes'],
        ['date', 'closedAt', 'updatedAt', 'createdAt'],
        'Sesión de comité',
      ),
  },
  {
    module: 'Actas',
    moduleView: 'actas',
    storageKey: 'traccion.v1.actas.records',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['titulo'],
        ['tipo', 'estado', 'observaciones'],
        ['fechaSesion', 'fechaCreacion', 'updatedAt', 'createdAt'],
        'Acta sin título',
      ),
  },
  {
    module: 'Comisión Paritaria',
    moduleView: 'paritaria',
    storageKey: 'traccion.v1.paritaria.sessions',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['title', 'code'],
        ['code', 'status', 'notes'],
        ['date', 'closedAt', 'updatedAt', 'createdAt'],
        'Sesión de paritaria',
      ),
  },
  {
    module: 'Criterios RRLL',
    moduleView: 'criterios-rrll',
    storageKey: 'traccion.v1.criterios-rrll.criterios',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['tema'],
        ['criterio', 'estado', 'responsable', 'observaciones'],
        ['fecha', 'updatedAt', 'createdAt'],
        'Criterio RRLL',
      ),
  },
];

export function searchTraccion(query: string): GlobalSearchResult[] {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length < 2) {
    return [];
  }

  const terms = normalizedQuery.split(' ').filter(Boolean);

  const linkedSessionLookup = buildLinkedSessionLookup();
  const rawResults = searchableModules.flatMap((searchableModule) =>
    readArray(searchableModule.storageKey).flatMap((record, index) => {
      const mapped = searchableModule.mapRecord(record, index);
      if (!mapped) {
        return [];
      }

      const standardResult: GlobalSearchResult = {
        ...mapped,
        module: searchableModule.module,
        moduleView: searchableModule.moduleView,
        haystack: buildHaystack(searchableModule.module, mapped, record),
      };

      const result = searchableModule.moduleView === 'tareas'
        ? makeSessionResultFromLinkedTask(record, index, linkedSessionLookup) ?? standardResult
        : standardResult;

      return terms.every((term) => result.haystack.includes(term)) ? [result] : [];
    }),
  );

  return uniqueResults(rawResults)
    .sort((first, second) => {
      if (first.year !== second.year) {
        return second.year - first.year;
      }

      const firstModuleIndex = MODULE_ORDER.indexOf(first.moduleView);
      const secondModuleIndex = MODULE_ORDER.indexOf(second.moduleView);
      if (firstModuleIndex !== secondModuleIndex) {
        return firstModuleIndex - secondModuleIndex;
      }

      return second.date.localeCompare(first.date);
    })
    .slice(0, 100);
}

export function getResultYearLabel(year: number): string {
  return year > 0 ? String(year) : 'Sin fecha';
}
