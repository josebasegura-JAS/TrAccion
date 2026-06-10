import { EMPTY_TASK_DRAFT, type TaskDraft } from '../../features/tareas/domain/task';
import type { ManagedSessionDraft } from './session';

export type SessionImportKind = 'comite' | 'paritaria';

export interface SessionImportTaskDraft {
  externalKey: string;
  draft: TaskDraft;
}

export interface SessionImportSessionDraft {
  externalKey: string;
  kind: SessionImportKind;
  draft: ManagedSessionDraft;
  taskExternalKeys: string[];
}

export interface SessionImportPreview {
  sessions: SessionImportSessionDraft[];
  tasks: SessionImportTaskDraft[];
  ignoredLines: string[];
}

interface MutableImportedSession {
  externalKey: string;
  kind: SessionImportKind;
  draft: ManagedSessionDraft;
  points: string[];
}

const CODE_PATTERN = /^(?:(?:\d{2}\/\d{2}|\d{2})[-\s]*)?(?:PE|CP|CE)[-.\s]*(?:AR|DC)?[-.\s]*\w{1,4}|^X{5,}$/i;
const DATE_PATTERN = /(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/;
const YEAR_PATTERN = /^(20\d{2}|19\d{2})$/;
const BULLET_PATTERN = /^[·•\-–—*]\s*/;

function normalizeLine(line: string): string {
  return line
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function isCodeLine(line: string): boolean {
  return CODE_PATTERN.test(line.replace(/\s+/g, '-')) || CODE_PATTERN.test(line);
}

function isIgnorableHeading(line: string): boolean {
  const normalized = line.toLowerCase().replace(/[.:]+$/g, '').trim();
  return normalized === 'orden del día' || normalized === 'varios' || normalized === 'anexo' || normalized === 'anexos';
}

function parseDate(line: string, currentYear: string): string | null {
  const match = line.match(DATE_PATTERN);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = match[3] ?? currentYear;
  const year = rawYear.length === 2 ? Number(`20${rawYear}`) : Number(rawYear);
  if (!day || !month || !year || month > 12 || day > 31) {
    return null;
  }

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function normalizeCode(line: string): string {
  return line.replace(/\s+/g, '-').replace(/\.+/g, '-').replace(/--+/g, '-').toUpperCase();
}

function resolveKind(code: string, fallbackKind: SessionImportKind = 'comite'): SessionImportKind {
  if (/(?:^|-)CP(?:-|$)/i.test(code)) {
    return 'paritaria';
  }

  if (/(?:^|-)CE(?:-|$)/i.test(code)) {
    return 'comite';
  }

  if (/(?:^|-)PE(?:-|$)/i.test(code)) {
    return fallbackKind;
  }

  return fallbackKind;
}

function cleanPoint(line: string): string {
  return normalizeLine(line.replace(BULLET_PATTERN, '')).replace(/^[0-9]+[.)]\s*/, '').trim();
}

function isValidPoint(line: string): boolean {
  const cleaned = cleanPoint(line);
  return cleaned.length >= 4 && !YEAR_PATTERN.test(cleaned) && !isCodeLine(cleaned) && !new RegExp(`^${DATE_PATTERN.source}$`).test(cleaned);
}

function buildSessionTitle(kind: SessionImportKind, code: string, date: string): string {
  const label = kind === 'paritaria' ? 'Comisión Paritaria' : 'Comité de Empresa';
  return `${label} ${code}${date ? ` (${date})` : ''}`;
}

function toTaskDraft(title: string, phase: string, session: MutableImportedSession, order: number): TaskDraft {
  return {
    ...EMPTY_TASK_DRAFT,
    titulo: title,
    descripcion: title,
    tipo: 'sindical',
    fase: 'cerrada',
    estado: 'cerrada',
    prioridad: 'media',
    fechaLimite: '',
    responsable: '',
    origen: session.kind === 'paritaria' ? 'Comisión Paritaria' : 'Comité de Empresa',
    sindicato: '',
    observaciones: `Importado de ${session.draft.code}${session.draft.date ? ` · ${session.draft.date}` : ''} · punto ${order}. Histórico ${phase}.`,
  };
}

export function parseSessionImportText(text: string, fallbackKind: SessionImportKind = 'comite'): SessionImportPreview {
  const lines = text
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);
  const sessions: MutableImportedSession[] = [];
  const ignoredLines: string[] = [];
  let currentYear = String(new Date().getFullYear());
  let currentSession: MutableImportedSession | null = null;
  let pendingCode = '';

  lines.forEach((line) => {
    if (YEAR_PATTERN.test(line)) {
      currentYear = line;
      currentSession = null;
      pendingCode = '';
      return;
    }

    if (isCodeLine(line)) {
      pendingCode = normalizeCode(line);
      currentSession = null;
      return;
    }

    const parsedDate = parseDate(line, currentYear);
    if (parsedDate && pendingCode) {
      const kind = resolveKind(pendingCode, fallbackKind);
      currentSession = {
        externalKey: `${kind}:${pendingCode}:${parsedDate}`,
        kind,
        draft: {
          date: parsedDate,
          code: pendingCode,
          title: buildSessionTitle(kind, pendingCode, parsedDate),
          notes: 'Sesión importada desde resumen histórico Word.',
        },
        points: [],
      };
      sessions.push(currentSession);
      pendingCode = '';
      return;
    }

    if (isIgnorableHeading(line)) {
      return;
    }

    if (currentSession && isValidPoint(line)) {
      const point = cleanPoint(line);
      if (!currentSession.points.some((existingPoint) => existingPoint.localeCompare(point, 'es', { sensitivity: 'base' }) === 0)) {
        currentSession.points.push(point);
      }
      return;
    }

    if (line.length > 3) {
      ignoredLines.push(line);
    }
  });

  const taskDrafts: SessionImportTaskDraft[] = [];
  const sessionDrafts: SessionImportSessionDraft[] = sessions
    .filter((session) => session.points.length > 0)
    .map((session) => {
      const taskExternalKeys = session.points.map((point, index) => {
        const externalKey = `${session.externalKey}:point:${index + 1}`;
        taskDrafts.push({ externalKey, draft: toTaskDraft(point, session.kind === 'paritaria' ? 'paritaria' : 'comite', session, index + 1) });
        return externalKey;
      });

      return {
        externalKey: session.externalKey,
        kind: session.kind,
        draft: session.draft,
        taskExternalKeys,
      };
    });

  return { sessions: sessionDrafts, tasks: taskDrafts, ignoredLines };
}
