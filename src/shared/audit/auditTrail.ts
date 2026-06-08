import { readStorageItem, writeStorageItem } from '../../services/persistence';

export const AUDIT_TRAIL_STORAGE_KEY = 'traccion.v1.auditTrail.events';

export type AuditModule = 'tareas' | 'licencias-sin-sueldo' | 'teletrabajo';
export type AuditAction = 'created' | 'updated' | 'deleted' | 'status_changed';

export interface AuditChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface AuditEvent {
  id: string;
  module: AuditModule;
  entityId: string;
  action: AuditAction;
  summary: string;
  user: string;
  createdAt: string;
  changes: AuditChange[];
}

function createAuditId(): string {
  return `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCurrentUser(): string {
  if (typeof window === 'undefined') {
    return 'Sistema';
  }

  return readStorageItem('traccion.header.username')?.trim() || 'Usuario local';
}

function isAuditChange(value: unknown): value is AuditChange {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuditChange>;
  return (
    typeof candidate.field === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.before === 'string' &&
    typeof candidate.after === 'string'
  );
}

function isAuditEvent(value: unknown): value is AuditEvent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuditEvent>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.module === 'string' &&
    typeof candidate.entityId === 'string' &&
    typeof candidate.action === 'string' &&
    typeof candidate.summary === 'string' &&
    typeof candidate.user === 'string' &&
    typeof candidate.createdAt === 'string' &&
    Array.isArray(candidate.changes) &&
    candidate.changes.every(isAuditChange)
  );
}

function readAuditEvents(): AuditEvent[] {
  const stored = readStorageItem(AUDIT_TRAIL_STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isAuditEvent) : [];
  } catch {
    return [];
  }
}

function persistAuditEvents(events: AuditEvent[]): void {
  writeStorageItem(AUDIT_TRAIL_STORAGE_KEY, JSON.stringify(events));
}

export function addAuditEvent(event: Omit<AuditEvent, 'id' | 'user' | 'createdAt'>): void {
  const nextEvent: AuditEvent = {
    ...event,
    id: createAuditId(),
    user: getCurrentUser(),
    createdAt: new Date().toISOString(),
  };

  persistAuditEvents([nextEvent, ...readAuditEvents()]);
}

export function getAuditEventsForRecord(module: AuditModule, entityId: string): AuditEvent[] {
  return readAuditEvents()
    .filter((event) => event.module === module && event.entityId === entityId)
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

function comparableValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}

export function buildAuditChanges<T extends Record<string, unknown>>(
  before: T,
  after: T,
  labels: Partial<Record<keyof T, string>>,
  fields: Array<keyof T>,
): AuditChange[] {
  return fields.flatMap((field) => {
    if (comparableValue(before[field]) === comparableValue(after[field])) {
      return [];
    }

    return [
      {
        field: String(field),
        label: labels[field] ?? String(field),
        before: formatValue(before[field]),
        after: formatValue(after[field]),
      },
    ];
  });
}

export function buildUpdateSummary(changes: AuditChange[]): string {
  const statusChange = changes.find((change) => change.field === 'estado');
  if (statusChange) {
    return `Estado cambiado: ${statusChange.before} → ${statusChange.after}`;
  }

  const visibleFields = changes.slice(0, 4).map((change) => change.label).join(', ');
  const suffix = changes.length > 4 ? ` y ${changes.length - 4} más` : '';
  return visibleFields ? `Editado: ${visibleFields}${suffix}` : 'Editado sin cambios relevantes';
}
