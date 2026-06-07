import { readStorageItem } from './persistence';
import type { AppView } from '../components/Sidebar';

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
    module: 'Teletrabajo',
    moduleView: 'teletrabajo',
    storageKey: 'traccion.v1.teletrabajo.solicitudes',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['nombreApellidos', 'empleado'],
        ['empleado', 'estado', 'tipoSolicitud', 'periodo', 'puestoNomina', 'puestoOrganizativo', 'observaciones'],
        ['fechaSolicitud', 'updatedAt', 'createdAt'],
        'Solicitud de teletrabajo',
      ),
  },
  {
    module: 'Ticket Restaurante · Ausencias',
    moduleView: 'ticket-restaurante',
    storageKey: 'traccion.v1.ticketRestaurante.absences',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['nombreApellidos', 'empleado'],
        ['empleado', 'motivo', 'desde', 'hasta', 'totalDias', 'afectaTicket'],
        ['desde', 'hasta', 'updatedAt', 'createdAt'],
        'Ausencia ticket restaurante',
      ),
  },
  {
    module: 'Ticket Restaurante · Personas',
    moduleView: 'ticket-restaurante',
    storageKey: 'traccion.v1.ticketRestaurante.people',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['nombreApellidos', 'empleado'],
        ['empleado', 'dni', 'puesto', 'calendarId'],
        ['updatedAt', 'createdAt'],
        'Persona ticket restaurante',
      ),
  },
  {
    module: 'Ticket Restaurante · Calendarios',
    moduleView: 'ticket-restaurante',
    storageKey: 'traccion.v1.ticketRestaurante.calendars',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['nombre'],
        ['activo', 'diasSinTicket', 'ticketIsoWeekdays'],
        ['updatedAt', 'createdAt'],
        'Calendario ticket restaurante',
      ),
  },
  {
    module: 'Plantilla',
    moduleView: 'plantilla',
    storageKey: 'traccion.v1.plantilla.employees',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['nombreApellidos', 'empleado'],
        ['empleado', 'puestoNomina', 'puestoOrganizativo', 'puestoEus', 'residencia', 'nivelRetributivo', 'nif'],
        [],
        'Persona de plantilla',
      ),
  },
  {
    module: 'Vinculograma',
    moduleView: 'vinculograma',
    storageKey: 'traccion.v1.vinculograma.records',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['nombreCompleto', 'employeeNumber'],
        ['employeeNumber', 'linkedPerson', 'requestDate', 'expiryDate'],
        ['requestDate', 'expiryDate', 'updatedAt', 'createdAt'],
        'Registro de vinculograma',
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
  {
    module: 'Sorteos · Histórico',
    moduleView: 'sorteos',
    storageKey: 'traccion.v1.sorteos.draws',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['title'],
        ['date', 'winners'],
        ['date', 'createdAt'],
        'Sorteo',
      ),
  },
  {
    module: 'Sorteos · Exclusiones',
    moduleView: 'sorteos',
    storageKey: 'traccion.v1.sorteos.exclusions',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['nombreApellidos', 'empleado'],
        ['empleado', 'reason', 'drawId'],
        ['excludedAt', 'createdAt'],
        'Exclusión de sorteo',
      ),
  },
  {
    module: 'Especiales · Destinatarios',
    moduleView: 'especiales',
    storageKey: 'rrll_especiales_destinatarios',
    mapRecord: (record, index) =>
      makeResult(
        record,
        index,
        ['name', 'email'],
        ['email', 'type'],
        ['updatedAt', 'createdAt'],
        'Destinatario especial',
      ),
  },
];

export function searchTraccion(query: string): GlobalSearchResult[] {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length < 2) {
    return [];
  }

  const terms = normalizedQuery.split(' ').filter(Boolean);

  return searchableModules
    .flatMap((searchableModule) =>
      readArray(searchableModule.storageKey).flatMap((record, index) => {
        const mapped = searchableModule.mapRecord(record, index);
        if (!mapped) {
          return [];
        }

        const result: GlobalSearchResult = {
          ...mapped,
          module: searchableModule.module,
          moduleView: searchableModule.moduleView,
          haystack: buildHaystack(searchableModule.module, mapped, record),
        };

        return terms.every((term) => result.haystack.includes(term)) ? [result] : [];
      }),
    )
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
