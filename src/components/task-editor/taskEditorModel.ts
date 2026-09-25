import { readStorageItem } from '../../services/persistence';
import {
  EMPTY_TASK_DRAFT,
  type Task,
  type TaskDocumentLink,
  type TaskDraft,
  type TaskSeguimientoEntry,
} from '../../features/tareas/domain/task';

const TRACKING_META_PREFIX = '[[traccion-seguimiento:';
const TRACKING_META_SUFFIX = ']]';

type TrackingMeta = { fecha: string; usuario: string; id?: string };

function createTrackingId(): string {
  return `tracking-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hashTrackingIdentity(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export type TaskRecoveryValue = {
  draft: TaskDraft;
  trackingText: string;
  trackingDate: string;
  sendToDirection: boolean;
  sendToUnion: boolean;
  selectedAreaTarget: string;
};

export function todayIsoDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function getActiveUser(): string {
  return readStorageItem('traccion.header.username')?.trim() || 'Usuario local';
}

export function encodeTracking(
  text: string,
  date: string,
  user: string,
  trackingId = createTrackingId(),
): string {
  const payload = JSON.stringify({
    fecha: date || todayIsoDate(),
    usuario: user || 'Usuario local',
    id: trackingId,
  });
  return `${TRACKING_META_PREFIX}${payload}${TRACKING_META_SUFFIX}\n${text.trim()}`;
}

export function decodeTracking(
  text: string,
  fallbackDate: string,
): { text: string; date: string; user: string; id: string | null } {
  if (!text.startsWith(TRACKING_META_PREFIX)) {
    return { text, date: fallbackDate, user: '—', id: null };
  }
  const end = text.indexOf(TRACKING_META_SUFFIX);
  if (end < 0) return { text, date: fallbackDate, user: '—', id: null };
  const raw = text.slice(TRACKING_META_PREFIX.length, end);
  try {
    const parsed = JSON.parse(raw) as Partial<TrackingMeta>;
    return {
      text: text.slice(end + TRACKING_META_SUFFIX.length).replace(/^\s*\n?/, ''),
      date: parsed.fecha || fallbackDate,
      user: parsed.usuario || '—',
      id: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : null,
    };
  } catch {
    return { text, date: fallbackDate, user: '—', id: null };
  }
}

export function resolveTrackingId(
  entry: TaskSeguimientoEntry,
  index: number,
  taskId: string,
): string {
  const decoded = decodeTracking(entry.texto, entry.fechaHora);
  if (entry.id?.trim()) return entry.id.trim();
  if (decoded.id) return decoded.id;
  return `tracking-legacy-${hashTrackingIdentity(`${taskId}|${entry.fechaHora}|${entry.texto}|${index}`)}`;
}

export function formatDate(value: string): string {
  if (!value) return '—';
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('es-ES');
}

function getPathBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

export function buildTaskDocumentLink(filePath: string): TaskDocumentLink {
  const route = filePath.trim();
  return {
    id: `task-doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    nombre: getPathBaseName(route),
    ruta: route,
    createdAt: new Date().toISOString(),
  };
}

export function mergeDocumentLinks(current: TaskDocumentLink[], incoming: TaskDocumentLink[]): TaskDocumentLink[] {
  const routes = new Set(current.map((item) => item.ruta.trim().toLowerCase()));
  return [
    ...current,
    ...incoming.filter((item) => {
      const key = item.ruta.trim().toLowerCase();
      if (!key || routes.has(key)) return false;
      routes.add(key);
      return true;
    }),
  ];
}

function toDraft(task: Task | null): TaskDraft {
  if (!task) return { ...EMPTY_TASK_DRAFT, documentLinks: [] };
  return {
    titulo: task.titulo,
    descripcion: task.descripcion,
    tipo: task.tipo,
    fase: task.fase,
    estado: task.estado,
    prioridad: task.prioridad,
    createdAt: task.createdAt,
    fechaLimite: task.fechaLimite,
    responsable: task.responsable,
    origen: task.origen,
    sindicato: task.sindicato,
    observaciones: task.observaciones,
    mail: task.mail ?? '',
    documentLinks: Array.isArray(task.documentLinks) ? task.documentLinks : [],
  };
}

export function createInitialDraft(task: Task | null, initialDraft?: Partial<TaskDraft>): TaskDraft {
  const base = toDraft(task);
  if (task || !initialDraft) return base;
  return {
    ...base,
    ...initialDraft,
    documentLinks: initialDraft.documentLinks ?? base.documentLinks,
  };
}
