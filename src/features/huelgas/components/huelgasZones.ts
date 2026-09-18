import {
  DEFAULT_HUELGA_MAIL_BODY,
  DEFAULT_HUELGA_MAIL_SUBJECT,
  defaultDeadlineForZone,
  defaultMailEnabledForZone,
} from './huelgasMailTemplates';

export type HuelgaZona = {
  id: string;
  nombre: string;
  responsableNombre: string;
  responsableEmail: string;
  correoActivo: boolean;
  correoAsunto: string;
  correoCuerpoHtml: string;
  correoPlazos: string;
  correoInstruccionesHabituales: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_HUELGA_ZONE_NAMES = [
  'MM Ariz',
  'MM Sopela',
  'GMO y Línea',
  'Instalaciones',
  'OACs',
  'PMC',
  'Jefatura de Operaciones',
  'SSCC',
] as const;

function normalize(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return normalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES');
}

function defaultId(name: string): string {
  return `zona-${normalizeKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function createZonaId(): string {
  return `zona-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isHuelgaZona(value: unknown): value is HuelgaZona {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HuelgaZona>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.responsableNombre === 'string' &&
    typeof candidate.responsableEmail === 'string' &&
    (typeof candidate.correoActivo === 'undefined' || typeof candidate.correoActivo === 'boolean') &&
    (typeof candidate.correoAsunto === 'undefined' || typeof candidate.correoAsunto === 'string') &&
    (typeof candidate.correoCuerpoHtml === 'undefined' || typeof candidate.correoCuerpoHtml === 'string') &&
    (typeof candidate.correoPlazos === 'undefined' || typeof candidate.correoPlazos === 'string') &&
    (typeof candidate.correoInstruccionesHabituales === 'undefined' || typeof candidate.correoInstruccionesHabituales === 'string') &&
    typeof candidate.active === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

export function isHuelgaZonas(value: unknown): value is HuelgaZona[] {
  return Array.isArray(value) && value.every(isHuelgaZona);
}

function hydrateMailFields(zona: HuelgaZona): HuelgaZona {
  return {
    ...zona,
    correoActivo: typeof zona.correoActivo === 'boolean' ? zona.correoActivo : defaultMailEnabledForZone(zona.nombre),
    correoAsunto: zona.correoAsunto || DEFAULT_HUELGA_MAIL_SUBJECT,
    correoCuerpoHtml: zona.correoCuerpoHtml || DEFAULT_HUELGA_MAIL_BODY,
    correoPlazos: zona.correoPlazos || defaultDeadlineForZone(zona.nombre),
    correoInstruccionesHabituales: zona.correoInstruccionesHabituales || '',
  };
}

export function ensureDefaultZonas(current: HuelgaZona[]): HuelgaZona[] {
  const now = new Date().toISOString();
  const hydratedCurrent = current.map(hydrateMailFields);
  const existingNames = new Set(hydratedCurrent.map((zona) => normalizeKey(zona.nombre)));
  const missingDefaults = DEFAULT_HUELGA_ZONE_NAMES
    .filter((nombre) => !existingNames.has(normalizeKey(nombre)))
    .map((nombre) => hydrateMailFields({
      id: defaultId(nombre),
      nombre,
      responsableNombre: '',
      responsableEmail: '',
      correoActivo: defaultMailEnabledForZone(nombre),
      correoAsunto: DEFAULT_HUELGA_MAIL_SUBJECT,
      correoCuerpoHtml: DEFAULT_HUELGA_MAIL_BODY,
      correoPlazos: defaultDeadlineForZone(nombre),
      correoInstruccionesHabituales: '',
      active: true,
      createdAt: now,
      updatedAt: now,
    }));

  return [...hydratedCurrent, ...missingDefaults]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
}

export function isZonaCompleta(zona: HuelgaZona): boolean {
  if (!zona.active) return false;
  if (!zona.correoActivo) return true;
  return Boolean(normalize(zona.responsableNombre) && normalize(zona.responsableEmail));
}
