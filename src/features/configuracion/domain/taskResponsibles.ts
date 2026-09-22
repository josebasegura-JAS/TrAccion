export interface TaskResponsibleConfig {
  id: string;
  nombre: string;
  windowsUser: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const now = '2026-09-22T00:00:00.000Z';

export const DEFAULT_TASK_RESPONSIBLES: TaskResponsibleConfig[] = [
  { id: 'ahueso', nombre: 'ahueso', windowsUser: 'ahueso', active: true, createdAt: now, updatedAt: now },
  { id: 'acabrera', nombre: 'acabrera', windowsUser: 'acabrera', active: true, createdAt: now, updatedAt: now },
  { id: 'jasegura', nombre: 'jasegura', windowsUser: 'jasegura', active: true, createdAt: now, updatedAt: now },
  { id: 'otros', nombre: 'Otros', windowsUser: '', active: true, createdAt: now, updatedAt: now },
];

export function normalizeTaskResponsibleName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeWindowsUser(value: string): string {
  return value.trim().toLocaleLowerCase('es');
}

export function createTaskResponsibleIdFromName(value: string): string {
  const normalized = normalizeTaskResponsibleName(value)
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'responsable';
}

export function responsibleMatchesWindowsUser(
  responsible: Pick<TaskResponsibleConfig, 'windowsUser'>,
  windowsUser: string,
): boolean {
  const configuredUser = normalizeWindowsUser(responsible.windowsUser);
  return Boolean(configuredUser && configuredUser === normalizeWindowsUser(windowsUser));
}
