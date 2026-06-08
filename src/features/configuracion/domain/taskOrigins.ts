export interface TaskOriginConfig {
  id: string;
  nombre: string;
  tipo: 'sindicato' | 'empresa' | 'otro';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_TIMESTAMP = '2026-01-01T00:00:00.000Z';

const DEFAULT_UNION_ORIGIN_NAMES = [
  'ELA',
  'CCOO',
  'LAB',
  'EGIE',
  'SEMAF',
  'USO',
  'CIM',
  'UGT',
  'ESK',
];

const DEFAULT_COMPANY_AND_OTHER_ORIGINS: TaskOriginConfig[] = [
  {
    id: 'operaciones',
    nombre: 'Operaciones',
    tipo: 'empresa',
    active: true,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  },
  {
    id: 'pmc',
    nombre: 'PMC',
    tipo: 'empresa',
    active: true,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  },
  {
    id: 'prevencion',
    nombre: 'Prevención',
    tipo: 'empresa',
    active: true,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  },
  {
    id: 'direccion',
    nombre: 'Dirección',
    tipo: 'empresa',
    active: true,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  },
  {
    id: 'rrhh',
    nombre: 'RRHH',
    tipo: 'empresa',
    active: true,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  },
  {
    id: 'juridico',
    nombre: 'Jurídico',
    tipo: 'empresa',
    active: true,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  },
  {
    id: 'gestion-del-servicio',
    nombre: 'Gestión del Servicio',
    tipo: 'empresa',
    active: true,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  },
  {
    id: 'persona-trabajadora',
    nombre: 'Persona trabajadora',
    tipo: 'otro',
    active: true,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  },
  {
    id: 'inspeccion',
    nombre: 'Inspección',
    tipo: 'otro',
    active: true,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  },
];

export const DEFAULT_TASK_ORIGINS: TaskOriginConfig[] = [
  ...DEFAULT_UNION_ORIGIN_NAMES.map<TaskOriginConfig>((nombre) => ({
    id: createTaskOriginIdFromName(nombre),
    nombre,
    tipo: 'sindicato',
    active: true,
    createdAt: DEFAULT_TIMESTAMP,
    updatedAt: DEFAULT_TIMESTAMP,
  })),
  ...DEFAULT_COMPANY_AND_OTHER_ORIGINS,
];

export function normalizeTaskOriginName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function createTaskOriginIdFromName(value: string): string {
  return normalizeTaskOriginName(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `origen-${Date.now().toString(36)}`;
}
