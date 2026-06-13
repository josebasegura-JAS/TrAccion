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
  score: number;
  matchReason: string;
  status?: string;
}

type SearchableResultDraft = Omit<GlobalSearchResult, 'module' | 'moduleView' | 'haystack' | 'score' | 'matchReason'>;

type SearchableModule = {
  module: string;
  moduleView: AppView;
  storageKey: string;
  mapRecord: (record: UnknownRecord, index: number) => SearchableResultDraft | null;
};

type UnknownRecord = Record<string, unknown>;

const UNKNOWN_YEAR = 0;
export const MIN_GLOBAL_SEARCH_FREE_TEXT_LENGTH = 3;


const MODULE_ALIASES: Record<string, AppView> = {
  tarea: 'tareas',
  tareas: 'tareas',
  comite: 'comite',
  comité: 'comite',
  ce: 'comite',
  acta: 'actas',
  actas: 'actas',
  paritaria: 'paritaria',
  cp: 'paritaria',
  criterio: 'criterios-rrll',
  criterios: 'criterios-rrll',
  rrll: 'criterios-rrll',
  teletrabajo: 'teletrabajo',
  telelana: 'teletrabajo',
  licencia: 'licencias-sin-sueldo',
  licencias: 'licencias-sin-sueldo',
  excedencia: 'licencias-sin-sueldo',
  excedencias: 'licencias-sin-sueldo',
  ticket: 'ticket-restaurante',
  tickets: 'ticket-restaurante',
  restaurante: 'ticket-restaurante',
  plantilla: 'plantilla',
  persona: 'plantilla',
  personas: 'plantilla',
  vinculograma: 'vinculograma',
  sorteos: 'sorteos',
  sorteo: 'sorteos',
  especiales: 'especiales',
  especial: 'especiales',
};

type SearchStatusFilter = 'open' | 'closed' | 'overdue';

interface ParsedSearchQuery {
  terms: string[];
  filters: {
    moduleView?: AppView;
    year?: number;
    status?: string;
    code?: string;
    person?: string;
    employeeNumber?: string;
    statusFilter?: SearchStatusFilter;
  };
  activeFilters: string[];
  normalizedFreeText: string;
}

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


function normalizeToken(value: string): string {
  return normalizeText(value).replace(/^['"]|['"]$/g, '');
}

function parseSearchQuery(query: string): ParsedSearchQuery {
  const rawTokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  const freeTextTokens: string[] = [];
  const activeFilters: string[] = [];
  const filters: ParsedSearchQuery['filters'] = {};

  for (const rawToken of rawTokens) {
    const token = rawToken.trim();
    if (!token) {
      continue;
    }

    const normalizedToken = normalizeToken(token);
    const separatorIndex = normalizedToken.indexOf(':');

    if (separatorIndex > 0) {
      const key = normalizedToken.slice(0, separatorIndex);
      const value = normalizedToken.slice(separatorIndex + 1).trim();
      if (!value) {
        continue;
      }

      if (['modulo', 'módulo', 'module'].includes(key)) {
        const moduleView = MODULE_ALIASES[value] ?? MODULE_ALIASES[normalizeText(value)];
        if (moduleView) {
          filters.moduleView = moduleView;
          activeFilters.push(`módulo:${value}`);
          continue;
        }
      }

      if (['ano', 'año', 'year'].includes(key)) {
        const year = Number(value);
        if (Number.isInteger(year) && year > 1900) {
          filters.year = year;
          activeFilters.push(`año:${year}`);
          continue;
        }
      }

      if (['estado', 'status'].includes(key)) {
        filters.status = value;
        activeFilters.push(`estado:${value}`);
        continue;
      }

      if (['codigo', 'código', 'code', 'cod'].includes(key)) {
        filters.code = value;
        activeFilters.push(`código:${value}`);
        continue;
      }

      if (['persona', 'nombre', 'person'].includes(key)) {
        filters.person = value;
        activeFilters.push(`persona:${value}`);
        continue;
      }

      if (['empleado', 'employee', 'numero', 'n'].includes(key)) {
        filters.employeeNumber = value;
        activeFilters.push(`empleado:${value}`);
        continue;
      }
    }

    if (['abierto', 'abiertos', 'pendiente', 'pendientes'].includes(normalizedToken)) {
      filters.statusFilter = 'open';
      activeFilters.push('abiertos');
      continue;
    }

    if (['cerrado', 'cerrados', 'finalizado', 'finalizados', 'historico', 'histórico'].includes(normalizedToken)) {
      filters.statusFilter = 'closed';
      activeFilters.push('cerrados');
      continue;
    }

    if (['vencido', 'vencidos'].includes(normalizedToken)) {
      filters.statusFilter = 'overdue';
      activeFilters.push('vencidos');
      continue;
    }

    freeTextTokens.push(token.replace(/^"|"$/g, ''));
  }

  const normalizedFreeText = normalizeText(freeTextTokens.join(' '));
  return {
    terms: normalizedFreeText.split(' ').filter(Boolean),
    filters,
    activeFilters,
    normalizedFreeText,
  };
}

function isClosedStatus(value: string | undefined): boolean {
  const normalized = normalizeText(value ?? '');
  return ['cerrad', 'finalizad', 'histor', 'firmad', 'resuelt'].some((closedStatus) => normalized.includes(closedStatus));
}

function isPastDate(value: string): boolean {
  if (!value) {
    return false;
  }

  const date = new Date(`${value.slice(0, 10)}T23:59:59`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function asString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '';
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const parsedArrayCache = new Map<string, { rawValue: string; records: UnknownRecord[] }>();

function readArray(storageKey: string): UnknownRecord[] {
  const stored = readStorageItem(storageKey);
  if (!stored) {
    parsedArrayCache.delete(storageKey);
    return [];
  }

  const cached = parsedArrayCache.get(storageKey);
  if (cached?.rawValue === stored) {
    return cached.records;
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    const records = Array.isArray(parsed) ? parsed.filter(isRecord) : [];
    parsedArrayCache.set(storageKey, { rawValue: stored, records });
    return records;
  } catch {
    parsedArrayCache.delete(storageKey);
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
    score: 0,
    matchReason: 'Coincidencia en punto incluido en sesión',
  };

  return result;
}


function linkedResultMatchesParsedQuery(result: GlobalSearchResult, parsedQuery: ParsedSearchQuery): boolean {
  if (parsedQuery.filters.moduleView && parsedQuery.filters.moduleView !== result.moduleView) {
    return false;
  }

  if (parsedQuery.filters.year && parsedQuery.filters.year !== result.year) {
    return false;
  }

  if (parsedQuery.filters.status && !normalizeText(result.status ?? '').includes(parsedQuery.filters.status)) {
    return false;
  }

  if (parsedQuery.filters.code && !result.haystack.includes(parsedQuery.filters.code)) {
    return false;
  }

  if (parsedQuery.filters.person && !result.haystack.includes(parsedQuery.filters.person)) {
    return false;
  }

  if (parsedQuery.filters.employeeNumber && !result.haystack.includes(parsedQuery.filters.employeeNumber)) {
    return false;
  }

  if (parsedQuery.filters.statusFilter === 'open' && isClosedStatus(result.status)) {
    return false;
  }

  if (parsedQuery.filters.statusFilter === 'closed' && !isClosedStatus(result.status)) {
    return false;
  }

  if (parsedQuery.filters.statusFilter === 'overdue' && (!isPastDate(result.date) || isClosedStatus(result.status))) {
    return false;
  }

  return everyTermMatches(parsedQuery.terms, [result.haystack]);
}

function uniqueResults(results: GlobalSearchResult[]): GlobalSearchResult[] {
  const resultByKey = new Map<string, GlobalSearchResult>();

  for (const result of results) {
    const key = `${result.moduleView}:${result.recordId}`;
    const current = resultByKey.get(key);
    if (!current || result.score > current.score) {
      resultByKey.set(key, result);
    }
  }

  return Array.from(resultByKey.values());
}


function everyTermMatches(terms: string[], values: string[]): boolean {
  return terms.length === 0 || terms.every((term) => values.some((value) => value.includes(term)));
}

function getWeightedMatch(
  parsedQuery: ParsedSearchQuery,
  result: SearchableResultDraft,
  record: UnknownRecord,
  moduleName: string,
  moduleView: AppView,
): { score: number; reason: string } | null {
  const code = firstText(record, ['code', 'codigo', 'id']);
  const person = firstText(record, ['nombreCompleto', 'nombre', 'persona', 'solicitante', 'employeeName']);
  const employeeNumber = firstText(record, ['empleado', 'numeroEmpleado', 'employeeNumber', 'employeeId']);
  const status = result.status ?? firstText(record, ['estado', 'status']);
  const description = firstText(record, ['descripcion', 'description', 'observaciones', 'notes', 'criterio', 'tema']);

  if (parsedQuery.filters.moduleView && parsedQuery.filters.moduleView !== moduleView) {
    return null;
  }

  if (parsedQuery.filters.year && parsedQuery.filters.year !== result.year) {
    return null;
  }

  if (parsedQuery.filters.status && !normalizeText(status).includes(parsedQuery.filters.status)) {
    return null;
  }

  if (parsedQuery.filters.code && !normalizeText(code).includes(parsedQuery.filters.code)) {
    return null;
  }

  if (parsedQuery.filters.person && !normalizeText(person).includes(parsedQuery.filters.person)) {
    return null;
  }

  if (parsedQuery.filters.employeeNumber && !normalizeText(employeeNumber).includes(parsedQuery.filters.employeeNumber)) {
    return null;
  }

  if (parsedQuery.filters.statusFilter === 'open' && isClosedStatus(status)) {
    return null;
  }

  if (parsedQuery.filters.statusFilter === 'closed' && !isClosedStatus(status)) {
    return null;
  }

  if (parsedQuery.filters.statusFilter === 'overdue' && (!isPastDate(result.date) || isClosedStatus(status))) {
    return null;
  }

  const weightedFields = [
    { label: 'título', value: result.title, weight: 100 },
    { label: 'código', value: code, weight: 95 },
    { label: 'nº empleado', value: employeeNumber, weight: 92 },
    { label: 'persona', value: person, weight: 85 },
    { label: 'estado', value: status, weight: 55 },
    { label: 'fecha', value: result.date, weight: 50 },
    { label: 'módulo', value: moduleName, weight: 45 },
    { label: 'detalle', value: result.subtitle, weight: 40 },
    { label: 'descripción', value: description, weight: 35 },
  ]
    .map((field) => ({ ...field, normalizedValue: normalizeText(field.value) }))
    .filter((field) => field.normalizedValue);

  const primitiveValues = Object.values(record).flatMap(extractPrimitiveValues).map(normalizeText).filter(Boolean);
  const allValues = [...weightedFields.map((field) => field.normalizedValue), ...primitiveValues];

  if (!everyTermMatches(parsedQuery.terms, allValues)) {
    return null;
  }

  const normalizedQuery = parsedQuery.normalizedFreeText;
  let bestMatch = normalizedQuery
    ? weightedFields.find((field) => field.normalizedValue === normalizedQuery) ?? null
    : null;
  let exactBonus = bestMatch ? 80 : 0;

  if (!bestMatch && normalizedQuery) {
    bestMatch = weightedFields.find((field) => field.normalizedValue.includes(normalizedQuery)) ?? null;
    exactBonus = bestMatch ? 35 : 0;
  }

  const matchedFields = weightedFields.filter((field) => parsedQuery.terms.some((term) => field.normalizedValue.includes(term)));
  const weightedScore = matchedFields.reduce((score, field) => score + field.weight, 0);
  const filterBonus = parsedQuery.activeFilters.length * 20;
  const completeFieldBonus = matchedFields.some((field) => everyTermMatches(parsedQuery.terms, [field.normalizedValue])) ? 30 : 0;
  const score = weightedScore + exactBonus + completeFieldBonus + filterBonus + Math.min(parsedQuery.terms.length * 5, 25);
  const reasonField = bestMatch ?? matchedFields[0] ?? null;

  return {
    score,
    reason: reasonField
      ? `Coincidencia en ${reasonField.label}: ${reasonField.value}`
      : parsedQuery.activeFilters.length > 0
        ? `Coincidencia por filtros: ${parsedQuery.activeFilters.join(' · ')}`
        : 'Coincidencia en contenido del registro',
  };
}

function addSearchMetadata(
  result: SearchableResultDraft,
  record: UnknownRecord,
  searchableModule: SearchableModule,
  parsedQuery: ParsedSearchQuery,
): GlobalSearchResult | null {
  const match = getWeightedMatch(parsedQuery, result, record, searchableModule.module, searchableModule.moduleView);
  if (!match) {
    return null;
  }

  return {
    ...result,
    module: searchableModule.module,
    moduleView: searchableModule.moduleView,
    haystack: buildHaystack(searchableModule.module, result, record),
    score: match.score,
    matchReason: match.reason,
  };
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
  result: SearchableResultDraft,
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
): SearchableResultDraft | null {
  if (isDeleted(record)) {
    return null;
  }

  const recordId = firstText(record, ['id', 'empleado', 'employeeNumber']) || `row-${index}`;
  const title = firstText(record, titleKeys) || fallbackTitle;
  const subtitle = firstText(record, subtitleKeys);
  const date = firstDate(record, dateKeys);
  const status = firstText(record, ['estado', 'status']);

  return {
    id: `${recordId}-${index}`,
    recordId,
    title,
    subtitle,
    date,
    year: getYear(date),
    status,
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
        ['criterio', 'sentido', 'estado', 'responsable', 'observaciones'],
        ['fecha', 'updatedAt', 'createdAt'],
        'Criterio RRLL',
      ),
  },
];

export function searchTraccion(query: string): GlobalSearchResult[] {
  const parsedQuery = parseSearchQuery(query);
  if (
    parsedQuery.normalizedFreeText.length < MIN_GLOBAL_SEARCH_FREE_TEXT_LENGTH &&
    parsedQuery.activeFilters.length === 0
  ) {
    return [];
  }

  const shouldBuildLinkedSessionLookup =
    !parsedQuery.filters.moduleView || parsedQuery.filters.moduleView === 'tareas';
  const linkedSessionLookup = shouldBuildLinkedSessionLookup
    ? buildLinkedSessionLookup()
    : new Map<string, LinkedSessionMatch>();
  const rawResults = searchableModules.flatMap((searchableModule) =>
    readArray(searchableModule.storageKey).flatMap((record, index) => {
      const mapped = searchableModule.mapRecord(record, index);
      if (!mapped) {
        return [];
      }

      const standardResult = addSearchMetadata(mapped, record, searchableModule, parsedQuery);
      const linkedResult = searchableModule.moduleView === 'tareas'
        ? makeSessionResultFromLinkedTask(record, index, linkedSessionLookup)
        : null;
      const result = linkedResult && linkedResultMatchesParsedQuery(linkedResult, parsedQuery)
        ? { ...linkedResult, score: standardResult?.score ?? 50, matchReason: linkedResult.matchReason }
        : standardResult;

      return result ? [result] : [];
    }),
  );

  return uniqueResults(rawResults)
    .sort((first, second) => {
      if (first.score !== second.score) {
        return second.score - first.score;
      }

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

export function getParsedSearchSummary(query: string): string[] {
  return parseSearchQuery(query).activeFilters;
}
