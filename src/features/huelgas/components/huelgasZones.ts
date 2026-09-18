export type HuelgaZona = {
  id: string;
  nombre: string;
  responsableNombre: string;
  responsableEmail: string;
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
    typeof candidate.active === 'boolean' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

export function isHuelgaZonas(value: unknown): value is HuelgaZona[] {
  return Array.isArray(value) && value.every(isHuelgaZona);
}

export function ensureDefaultZonas(current: HuelgaZona[]): HuelgaZona[] {
  const now = new Date().toISOString();
  const existingNames = new Set(current.map((zona) => normalizeKey(zona.nombre)));
  const missingDefaults = DEFAULT_HUELGA_ZONE_NAMES
    .filter((nombre) => !existingNames.has(normalizeKey(nombre)))
    .map((nombre) => ({
      id: defaultId(nombre),
      nombre,
      responsableNombre: '',
      responsableEmail: '',
      active: true,
      createdAt: now,
      updatedAt: now,
    }));

  return [...current, ...missingDefaults]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
}

export function isZonaCompleta(zona: HuelgaZona): boolean {
  return Boolean(zona.active && normalize(zona.responsableNombre) && normalize(zona.responsableEmail));
}
